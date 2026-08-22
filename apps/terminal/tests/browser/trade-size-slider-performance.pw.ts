import { expect, test, type CDPSession, type Page } from "@playwright/test";

interface SliderAuditSnapshot {
	commitCallbacks: number;
	maxParentCommitsPerFrame: number;
	multiCommitFrames: Array<[string, number]>;
	parentCommits: number;
	previewCallbacks: number;
	rawPointerMoveRateHz: number;
	rawPointerMoves: number;
	renderedFrames: number;
}

interface SliderGeometry {
	left: number;
	top: number;
	width: number;
	height: number;
}

type SliderAuditWindow = Window & {
	__gatuSliderPerf: {
		reset: () => void;
		stop: () => SliderAuditSnapshot;
	};
	__gatuSliderPointerId?: number;
};

test.beforeEach(async ({ page }) => {
	await page.goto("/trade-size-slider-performance.html");
	await page.locator('input[type="range"]').waitFor();
});

test("coalesces high-frequency previews without changing the released value", async ({ page }) => {
	const geometry = await getControlGeometry(page);
	const session = await page.context().newCDPSession(page);
	const startX = percentX(geometry, 25);
	const endX = percentX(geometry, 90);
	const y = geometry.top + geometry.height / 2;

	await resetAudit(page);
	await captureNextPointerId(page);
	await session.send("Input.dispatchMouseEvent", {
		button: "left",
		buttons: 1,
		clickCount: 1,
		type: "mousePressed",
		x: startX,
		y,
	});
	const pointerId = await readPointerId(page);
	await dispatchPointerMovesByFrame(page, { endX, groups: 30, movesPerGroup: 4, pointerId, startX, y });

	await session.send("Input.dispatchMouseEvent", {
		button: "left",
		buttons: 0,
		clickCount: 1,
		type: "mouseReleased",
		x: endX,
		y,
	});
	await page.waitForTimeout(100);

	const result = await stopAudit(page);
	const finalValue = await readValue(page);

	expect(result.rawPointerMoves).toBeGreaterThanOrEqual(60);
	expect(result.rawPointerMoveRateHz).toBeGreaterThanOrEqual(40);
	expect(result.previewCallbacks).toBeGreaterThan(0);
	expect(result.previewCallbacks).toBeLessThan(result.rawPointerMoves);
	expect(result.previewCallbacks).toBeLessThanOrEqual(result.renderedFrames + 2);
	// The discrete release commit may follow the final coalesced preview in one frame.
	expect(result.maxParentCommitsPerFrame, JSON.stringify(result)).toBeLessThanOrEqual(2);
	expect(result.multiCommitFrames.length).toBeLessThanOrEqual(1);
	for (const [, commitCount] of result.multiCommitFrames) expect(commitCount).toBe(2);
	expect(result.parentCommits).toBeLessThanOrEqual(result.previewCallbacks + 1);
	expect(result.commitCallbacks).toBe(1);
	expect(finalValue).toBeCloseTo(90, 0);
});

test("commits the final position after a rapid same-frame reversal", async ({ page }) => {
	const geometry = await getControlGeometry(page);
	const session = await page.context().newCDPSession(page);
	const y = geometry.top + geometry.height / 2;

	await resetAudit(page);
	await captureNextPointerId(page);
	await dispatchPointer(session, "mousePressed", percentX(geometry, 25), y, 1);
	const pointerId = await readPointerId(page);
	await dispatchPointerMoves(page, pointerId, [{ x: percentX(geometry, 30), y }]);
	await page.waitForTimeout(20);
	await dispatchPointerMoves(page, pointerId, [
		{ x: percentX(geometry, 35), y },
		{ x: percentX(geometry, 30), y },
	]);
	await dispatchPointer(session, "mouseReleased", percentX(geometry, 30), y, 0);
	await page.waitForTimeout(50);

	const result = await stopAudit(page);
	expect(result.commitCallbacks).toBe(1);
	expect(await readValue(page)).toBeCloseTo(30, 1);
});

test("keeps a second touch from replacing the active pointer session", async ({ page }) => {
	const geometry = await getControlGeometry(page);
	const session = await page.context().newCDPSession(page);
	const y = geometry.top + geometry.height / 2;
	const startX = percentX(geometry, 25);
	const primaryX = percentX(geometry, 60);
	const secondaryX = percentX(geometry, 90);
	const primary = { id: 1, x: startX, y };
	const secondary = { id: 2, x: primaryX, y };

	await resetAudit(page);
	await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [primary] });
	primary.x = primaryX;
	await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [primary] });
	await page.waitForTimeout(30);

	await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [primary, secondary] });
	secondary.x = secondaryX;
	await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [primary, secondary] });
	await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [primary] });
	await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
	await page.waitForTimeout(100);

	const result = await stopAudit(page);
	expect(result.commitCallbacks).toBe(1);
	expect(await readValue(page)).toBeCloseTo(60, 1);
});

test("keeps focus and component identity when the thumb is pressed without moving", async ({ page }) => {
	const thumb = page.locator('input[type="range"]').locator("..");
	const box = await thumb.boundingBox();
	if (!box) throw new Error("Slider thumb geometry is unavailable");

	await page.evaluate(() => {
		Object.assign(window, { __gatuSliderInputBeforeClick: document.querySelector('input[type="range"]') });
	});
	await resetAudit(page);
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await page.waitForTimeout(50);

	const result = await stopAudit(page);
	const retainedIdentity = await page.evaluate(
		() =>
			(window as Window & { __gatuSliderInputBeforeClick?: Element }).__gatuSliderInputBeforeClick ===
			document.querySelector('input[type="range"]'),
	);

	expect(result.previewCallbacks).toBe(0);
	expect(result.commitCallbacks).toBe(0);
	expect(retainedIdentity).toBe(true);
	await expect(page.locator('input[type="range"]')).toBeFocused();
	expect(await readValue(page)).toBe(25);
});

async function getControlGeometry(page: Page): Promise<SliderGeometry> {
	return page.locator('input[type="range"]').evaluate((input) => {
		const control = input.parentElement?.parentElement;
		if (!(control instanceof HTMLElement)) throw new Error("Slider control is missing");
		const rect = control.getBoundingClientRect();
		return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
	});
}

function percentX(geometry: SliderGeometry, percent: number): number {
	return geometry.left + geometry.width * (percent / 100);
}

async function resetAudit(page: Page): Promise<void> {
	await page.evaluate(() => (window as unknown as SliderAuditWindow).__gatuSliderPerf.reset());
}

async function stopAudit(page: Page): Promise<SliderAuditSnapshot> {
	return page.evaluate(() => (window as unknown as SliderAuditWindow).__gatuSliderPerf.stop());
}

async function readValue(page: Page): Promise<number> {
	return page.locator("[data-slider-value]").evaluate((output) => Number.parseFloat(output.textContent ?? ""));
}

async function captureNextPointerId(page: Page): Promise<void> {
	await page.evaluate(() => {
		const auditWindow = window as unknown as SliderAuditWindow;
		Reflect.deleteProperty(auditWindow, "__gatuSliderPointerId");
		document.addEventListener(
			"pointerdown",
			(event) => {
				auditWindow.__gatuSliderPointerId = event.pointerId;
			},
			{ capture: true, once: true },
		);
	});
}

async function readPointerId(page: Page): Promise<number> {
	const pointerId = await page.evaluate(
		() => (window as unknown as SliderAuditWindow).__gatuSliderPointerId,
	);
	if (pointerId === undefined) throw new Error("Slider pointer id was not captured");
	return pointerId;
}

async function dispatchPointerMoves(
	page: Page,
	pointerId: number,
	points: Array<{ x: number; y: number }>,
): Promise<void> {
	await page.evaluate(
		({ activePointerId, movePoints }) => {
			for (const point of movePoints) {
				document.dispatchEvent(
					new PointerEvent("pointermove", {
						bubbles: true,
						buttons: 1,
						clientX: point.x,
						clientY: point.y,
						isPrimary: true,
						pointerId: activePointerId,
						pointerType: "mouse",
					}),
				);
			}
		},
		{ activePointerId: pointerId, movePoints: points },
	);
}

async function dispatchPointerMovesByFrame(
	page: Page,
	options: {
		endX: number;
		groups: number;
		movesPerGroup: number;
		pointerId: number;
		startX: number;
		y: number;
	},
): Promise<void> {
	await page.evaluate(async ({ endX, groups, movesPerGroup, pointerId, startX, y }) => {
		const totalMoves = groups * movesPerGroup;
		for (let group = 0; group < groups; group += 1) {
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			const points = Array.from({ length: movesPerGroup }, (_, offset) => {
				const index = group * movesPerGroup + offset + 1;
				return { x: startX + (endX - startX) * (index / totalMoves), y };
			});
			for (const point of points) {
				document.dispatchEvent(
					new PointerEvent("pointermove", {
						bubbles: true,
						buttons: 1,
						clientX: point.x,
						clientY: point.y,
						isPrimary: true,
						pointerId,
						pointerType: "mouse",
					}),
				);
			}
		}
	}, options);
}

async function dispatchPointer(
	session: CDPSession,
	type: "mouseMoved" | "mousePressed" | "mouseReleased",
	x: number,
	y: number,
	buttons: number,
): Promise<void> {
	await session.send("Input.dispatchMouseEvent", {
		button: type === "mouseMoved" ? "none" : "left",
		buttons,
		clickCount: type === "mouseMoved" ? 0 : 1,
		type,
		x,
		y,
	});
}
