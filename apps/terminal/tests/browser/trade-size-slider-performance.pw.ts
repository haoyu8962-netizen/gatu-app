import { type CDPSession, expect, type Page, test } from "@playwright/test";

interface SliderAuditSnapshot {
	previewIntervals: number[];
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
		snapshot: () => SliderAuditSnapshot;
		stop: () => SliderAuditSnapshot;
	};
	__gatuSliderPointerId?: number;
};

test.beforeEach(async ({ page }) => {
	await page.goto("/trade-size-slider-performance.html");
	await page.locator('input[type="range"]').waitFor();
});

test("throttles high-frequency previews without changing the released value", async ({ page }, testInfo) => {
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
	await testInfo.attach("slider-performance", {
		body: JSON.stringify(result, null, 2),
		contentType: "application/json",
	});

	expect(result.rawPointerMoves).toBeGreaterThanOrEqual(60);
	expect(result.rawPointerMoveRateHz).toBeGreaterThanOrEqual(40);
	expect(result.previewCallbacks).toBeGreaterThanOrEqual(0);
	expect(result.previewCallbacks).toBeLessThan(result.rawPointerMoves);
	expect(result.previewCallbacks).toBeLessThanOrEqual(result.renderedFrames + 2);
	expect(result.maxParentCommitsPerFrame, JSON.stringify(result)).toBeLessThanOrEqual(2);
	for (const interval of result.previewIntervals) expect(interval).toBeGreaterThanOrEqual(14);
	for (const [, commitCount] of result.multiCommitFrames) expect(commitCount).toBe(2);
	expect(result.parentCommits).toBeLessThanOrEqual(result.previewCallbacks + 1);
	expect(result.commitCallbacks).toBe(1);
	expect(finalValue).toBeCloseTo(90, 0);
});

test("keeps publishing previews while the pointer moves faster than the preview interval", async ({ page }) => {
	const geometry = await getControlGeometry(page);
	const session = await page.context().newCDPSession(page);
	const y = geometry.top + geometry.height / 2;
	await resetAudit(page);
	await captureNextPointerId(page);
	await dispatchPointer(session, "mousePressed", percentX(geometry, 25), y, 1);
	const pointerId = await readPointerId(page);

	const during = await page.evaluate(
		async ({ activePointerId, fromX, toX, y }) => {
			const control = document.querySelector("[data-trade-slider-control]");
			const audit = (window as unknown as SliderAuditWindow).__gatuSliderPerf;
			const startedAt = performance.now();
			let moves = 0;
			while (performance.now() - startedAt < 400) {
				const progress = (performance.now() - startedAt) / 400;
				control?.dispatchEvent(
					new PointerEvent("pointermove", {
						bubbles: true,
						buttons: 1,
						clientX: fromX + (toX - fromX) * progress,
						clientY: y,
						isPrimary: true,
						pointerId: activePointerId,
						pointerType: "mouse",
					}),
				);
				moves++;
				await new Promise<void>((resolve) => setTimeout(resolve, 5));
			}
			return { moves, snapshot: audit.snapshot() };
		},
		{ activePointerId: pointerId, fromX: percentX(geometry, 25), toX: percentX(geometry, 90), y },
	);

	expect(during.moves).toBeGreaterThanOrEqual(40);
	expect(during.snapshot.previewCallbacks).toBeGreaterThanOrEqual(8);
	expect(during.snapshot.previewCallbacks).toBeLessThanOrEqual(28);
	for (const interval of during.snapshot.previewIntervals) expect(interval).toBeGreaterThanOrEqual(14);
	expect(during.snapshot.commitCallbacks).toBe(0);

	await dispatchPointer(session, "mouseReleased", percentX(geometry, 90), y, 0);
	expect(await readValue(page)).toBeCloseTo(90, 0);
	expect((await stopAudit(page)).commitCallbacks).toBe(1);
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

for (const requested of [63, 66]) {
	test(`holds a ${requested}% track press through quantity rounding and releases to the actual percent`, async ({
		page,
	}) => {
		await page.goto("/trade-size-slider-performance.html?precision=1");
		const input = page.getByRole("slider", { name: "Size percentage", exact: true });
		const quantity = page.locator("[data-slider-size]");
		await expect(quantity).toHaveText("0.001");
		const geometry = await getControlGeometry(page);
		const x = percentX(geometry, requested);
		const y = geometry.top + geometry.height / 2;

		await resetAudit(page);
		await page.mouse.move(x, y);
		await page.mouse.down();
		await expect
			.poll(() =>
				page.evaluate(() => (window as unknown as SliderAuditWindow).__gatuSliderPerf.snapshot().previewCallbacks),
			)
			.toBe(1);
		await expect(quantity).toHaveAttribute("data-slider-interacting", "true");
		await expect(quantity).toHaveText("0.001");
		await expect(input).toHaveValue(String(requested));
		expect(await readThumbPercent(page)).toBeCloseTo(requested, 0);

		await page.mouse.up();
		await expect(quantity).toHaveAttribute("data-slider-interacting", "false");
		await expect(quantity).toHaveText("0.001");
		await expect(input).toHaveValue("33");
		expect(await readValue(page)).toBeCloseTo(100 / 3, 5);
		expect(await readThumbPercent(page)).toBeCloseTo(100 / 3, 1);
		expect((await stopAudit(page)).commitCallbacks).toBe(1);
	});
}

test("commits a quick 20% track click to zero without restoring the previous quantity", async ({ page }) => {
	await page.goto("/trade-size-slider-performance.html?precision=1");
	const input = page.getByRole("slider", { name: "Size percentage", exact: true });
	const quantity = page.locator("[data-slider-size]");
	await expect(quantity).toHaveText("0.001");
	const geometry = await getControlGeometry(page);
	await resetAudit(page);
	await page.mouse.click(percentX(geometry, 20), geometry.top + geometry.height / 2);
	await expect(quantity).toHaveAttribute("data-slider-interacting", "false");
	await expect(quantity).toHaveText("0");
	await expect(input).toHaveValue("0");
	await page.waitForTimeout(50);
	await expect(quantity).toHaveText("0");
	expect(await readValue(page)).toBe(0);
	expect(await readThumbPercent(page)).toBeCloseTo((9 / geometry.width) * 100, 1);
	expect((await stopAudit(page)).commitCallbacks).toBe(1);
});

test("restores the exact quantity when a held track press is canceled", async ({ page }) => {
	await page.goto("/trade-size-slider-performance.html?precision=1");
	const input = page.getByRole("slider", { name: "Size percentage", exact: true });
	const quantity = page.locator("[data-slider-size]");
	await expect(quantity).toHaveText("0.001");
	const geometry = await getControlGeometry(page);
	const x = percentX(geometry, 90);
	const y = geometry.top + geometry.height / 2;

	await resetAudit(page);
	await page.mouse.move(x, y);
	await page.mouse.down();
	await expect(quantity).toHaveText("0.002");
	await expect(input).toHaveValue("90");
	expect(await readThumbPercent(page)).toBeCloseTo(90, 0);
	await page.keyboard.press("Escape");
	await expect(quantity).toHaveAttribute("data-slider-interacting", "false");
	await expect(quantity).toHaveText("0.001");
	await expect(input).toHaveValue("33");
	expect(await readThumbPercent(page)).toBeCloseTo(100 / 3, 1);
	await page.mouse.up();
	expect((await stopAudit(page)).commitCallbacks).toBe(0);
});

async function readThumbPercent(page: Page): Promise<number> {
	return page.locator("[data-trade-slider-control]").evaluate((control) => {
		const thumb = control.querySelector("[data-trade-slider-thumb]");
		if (!(thumb instanceof HTMLElement)) throw new Error("Slider thumb is missing");
		const controlRect = control.getBoundingClientRect();
		const thumbRect = thumb.getBoundingClientRect();
		return ((thumbRect.left + thumbRect.width / 2 - controlRect.left) / controlRect.width) * 100;
	});
}

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
	const pointerId = await page.evaluate(() => (window as unknown as SliderAuditWindow).__gatuSliderPointerId);
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
				document.querySelector("[data-trade-slider-control]")?.dispatchEvent(
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
				document.querySelector("[data-trade-slider-control]")?.dispatchEvent(
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

for (const width of [390, 1000, 1001, 1333, 1920]) {
	for (const theme of ["dark", "light"]) {
		test(`retains readable slider geometry at ${width}px in ${theme}`, async ({ page }, testInfo) => {
			await page.setViewportSize({ width, height: 950 });
			await page.goto("/trade-size-slider-performance.html?gallery=1");
			await page.evaluate((theme) => document.documentElement.classList.toggle("dark", theme === "dark"), theme);
			await expect(page.locator("[data-gallery]")).toBeVisible();
			const geometry = await page.locator("[data-trade-slider-control]").evaluateAll((controls) =>
				controls.map((control) => {
					const thumb = control.querySelector("[data-trade-slider-thumb]") as HTMLElement;
					const input = thumb.querySelector("input")!;
					const rect = control.getBoundingClientRect();
					const thumbRect = thumb.getBoundingClientRect();
					return {
						height: rect.height,
						track: control.firstElementChild!.getBoundingClientRect().height,
						thumb: thumbRect.width,
						inputOpacity: getComputedStyle(input).opacity,
						contained: thumbRect.left >= rect.left - 1 && thumbRect.right <= rect.right + 1,
						ticks: control.querySelectorAll("[data-percent]").length,
					};
				}),
			);
			expect(geometry).toHaveLength(4);
			for (const item of geometry)
				expect(item).toMatchObject({ height: 33, track: 8, thumb: 18, inputOpacity: "0", contained: true });
			expect(geometry.map((item) => item.ticks)).toEqual([5, 0, 5, 5]);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
			const leverage = page.getByRole("slider", { name: "Leverage", exact: true });
			await leverage.press("End");
			await expect(leverage).toHaveValue("10");
			await leverage.press("Home");
			await expect(leverage).toHaveValue("1");
			await page.screenshot({ path: testInfo.outputPath(`sliders-${width}-${theme}.png`) });
		});
	}
}

test("paints a same-task burst without a business preview and flushes the last value on release", async ({ page }) => {
	const geometry = await getControlGeometry(page);
	const session = await page.context().newCDPSession(page);
	const y = geometry.top + geometry.height / 2;
	await resetAudit(page);
	await captureNextPointerId(page);
	await dispatchPointer(session, "mousePressed", percentX(geometry, 25), y, 1);
	const pointerId = await readPointerId(page);
	const result = await page.evaluate(
		async ({ pointerId, x, y }) => {
			const control = document.querySelector("[data-trade-slider-control]")!;
			const audit = (window as unknown as SliderAuditWindow).__gatuSliderPerf;
			for (let i = 0; i < 100; i++)
				control.dispatchEvent(
					new PointerEvent("pointermove", {
						bubbles: true,
						pointerId,
						pointerType: "mouse",
						isPrimary: true,
						buttons: 1,
						clientX: x,
						clientY: y,
					}),
				);
			const before = audit.snapshot();
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			const transform = (control.querySelector("[data-trade-slider-thumb]") as HTMLElement).style.transform;
			control.dispatchEvent(
				new PointerEvent("pointerup", {
					bubbles: true,
					pointerId,
					pointerType: "mouse",
					isPrimary: true,
					buttons: 0,
					clientX: x,
					clientY: y,
				}),
			);
			return { before, transform };
		},
		{ pointerId, x: percentX(geometry, 63), y },
	);
	expect(result.before.previewCallbacks).toBe(0);
	expect(result.transform).toContain("translate3d(");
	await dispatchPointer(session, "mouseReleased", percentX(geometry, 63), y, 0);
	expect(await readValue(page)).toBe(63);
	expect((await stopAudit(page)).commitCallbacks).toBe(1);
});
