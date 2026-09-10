import { expect, type Locator, type Page, test } from "@playwright/test";

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

async function openFixture(page: Page, search = "") {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(`/drawer-interactions.html${search}`);
	await expect(page.getByRole("dialog", { name: "Primary drawer", exact: true })).toBeVisible();
}

async function state(page: Page) {
	return page.locator("[data-fixture-state]").evaluate((element) => JSON.parse(element.textContent ?? "{}"));
}

async function swipe(page: Page, target: Locator, deltaX: number, deltaY: number) {
	const bounds = await target.boundingBox();
	if (!bounds) throw new Error("Missing swipe target");
	const viewport = page.viewportSize();
	if (!viewport) throw new Error("Missing viewport");
	const x = Math.max(
		bounds.x + 1,
		Math.min(
			bounds.x + bounds.width - 1,
			Math.max(10 - deltaX, Math.min(viewport.width - 10 - deltaX, bounds.x + bounds.width / 2)),
		),
	);
	const y = Math.max(
		bounds.y + 1,
		Math.min(
			bounds.y + bounds.height - 1,
			Math.max(10 - deltaY, Math.min(viewport.height - 10 - deltaY, bounds.y + bounds.height / 2)),
		),
	);
	const cdp = await page.context().newCDPSession(page);
	try {
		await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
		for (const progress of [0.2, 0.4, 0.6, 0.8, 1]) {
			await cdp.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [{ x: x + deltaX * progress, y: y + deltaY * progress }],
			});
		}
		await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
	} finally {
		await cdp.detach();
	}
}

for (const [side, deltaX, deltaY] of [
	["bottom", 0, 240],
	["top", 0, -240],
	["left", -180, 0],
	["right", 180, 0],
] as const) {
	test(`${side} drawer closes from a native swipe without changing fixed geometry`, async ({ page }, testInfo) => {
		await openFixture(page, `?side=${side}`);
		const popup = page.getByRole("dialog", { name: "Primary drawer", exact: true });
		const geometry = await popup.evaluate((element) => {
			const bounds = element.getBoundingClientRect();
			return {
				x: bounds.x,
				y: bounds.y,
				right: bounds.right,
				bottom: bounds.bottom,
				position: getComputedStyle(element).position,
				background: getComputedStyle(element).backgroundColor,
			};
		});
		expect(geometry.position).toBe("fixed");
		expect(geometry.background).toBe("rgb(15, 26, 31)");
		if (side === "left") expect(geometry.x).toBe(0);
		if (side === "right") expect(geometry.right).toBe(390);
		if (side === "top") expect(geometry.y).toBe(0);
		if (side === "bottom") expect(geometry.bottom).toBe(844);
		await page.screenshot({ path: testInfo.outputPath(`${side}-drawer.png`) });
		await swipe(page, side === "top" ? popup : page.locator('[data-swipe-target="primary"]'), deltaX, deltaY);
		await expect(popup).not.toBeVisible();
		expect((await state(page)).events).toContain("primary:false:swipe");
	});
}

test("blocking adaptive drawers reject swipe, backdrop, Escape, and close actions until unlocked", async ({ page }) => {
	await openFixture(page, "?mode=blocking");
	const popup = page.getByRole("dialog", { name: "Primary drawer", exact: true });
	const before = await popup.boundingBox();
	await swipe(page, page.locator('[data-swipe-target="primary"]'), 0, 240);
	await expect(popup).toBeVisible();
	await expect.poll(() => popup.boundingBox()).toEqual(before);
	await page.mouse.click(20, 100);
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Close primary drawer", exact: true }).click();
	await expect(popup).toBeVisible();
	expect((await state(page)).events).toEqual([]);
	expect(await popup.evaluate((element) => getComputedStyle(element).zIndex)).toBe("1300");
	await page.getByRole("button", { name: "Unlock dismissal" }).click();
	await swipe(page, page.locator('[data-swipe-target="primary"]'), 0, 240);
	await expect(popup).not.toBeVisible();
	expect((await state(page)).events).toEqual(["primary:false"]);
});

test("nested drawer swipes close only the child", async ({ page }) => {
	await openFixture(page, "?mode=nested");
	await page.getByRole("button", { name: "Open nested drawer" }).click();
	const nested = page.getByRole("dialog", { name: "Nested drawer", exact: true });
	await expect(nested).toBeVisible();
	await swipe(page, page.locator('[data-swipe-target="nested"]'), 0, 170);
	await expect(nested).not.toBeVisible();
	await expect(page.getByRole("dialog", { name: "Primary drawer", exact: true })).toBeVisible();
	expect((await state(page)).events).toEqual(["nested:false:swipe"]);
});

test("drawer content scrolls without dismissing or moving its fixed popup", async ({ page }) => {
	await openFixture(page, "?mode=scroll");
	const popup = page.getByRole("dialog", { name: "Primary drawer", exact: true });
	const before = await popup.boundingBox();
	const scroll = page.locator("[data-scroll-content]");
	await swipe(page, scroll, 0, -100);
	await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
	await expect(popup).toBeVisible();
	expect(await popup.boundingBox()).toEqual(before);
	expect((await state(page)).events).toEqual([]);
});

test("quantity slider touch gestures stay owned by the slider inside a side drawer", async ({ page }) => {
	await openFixture(page, "?mode=slider&side=right");
	const popup = page.getByRole("dialog", { name: "Primary drawer", exact: true });
	const before = await popup.boundingBox();
	await swipe(page, page.locator("[data-trade-slider-thumb]"), 160, 0);
	await expect.poll(async () => (await state(page)).value).toBeGreaterThan(25);
	await expect(popup).toBeVisible();
	expect(await popup.boundingBox()).toEqual(before);
	expect((await state(page)).events).toEqual([]);
});

test("keepMounted and overlayless drawers preserve explicit close and reopen", async ({ page }) => {
	await openFixture(page, "?mode=overlayless&keepMounted");
	const popup = page.getByRole("dialog", { name: "Primary drawer", exact: true });
	await page.getByRole("button", { name: "Close primary drawer", exact: true }).click();
	await expect(popup).not.toBeVisible();
	await expect(page.locator('[data-slot="drawer-popup"]')).toHaveCount(1);
	await expect(page.locator('[data-slot="drawer-popup"]')).toBeHidden();
	await page.getByRole("button", { name: "Open primary drawer", exact: true }).click();
	await expect(popup).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(popup).not.toBeVisible();
});
