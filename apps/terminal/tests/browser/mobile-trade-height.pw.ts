import { expect, type Page, test } from "@playwright/test";

async function outerGeometry(page: Page) {
	return page.evaluate(() => ({
		documentHeight: document.documentElement.scrollHeight,
		pageHeight: document.querySelector("[data-fixture-page]")?.scrollHeight,
		panels: ["[data-slot=mobile-trade-order-split]", "[data-fixture-book]", "[data-fixture-positions]"].map(
			(selector) => {
				const element = document.querySelector(selector);
				if (!element) throw new Error(`Missing ${selector}`);
				return { top: (element as HTMLElement).offsetTop, height: element.clientHeight };
			},
		),
	}));
}

for (const viewport of [
	{ width: 320, height: 568 },
	{ width: 390, height: 844 },
	{ width: 768, height: 1024 },
]) {
	test(`contains order-type changes inside the mobile form at ${viewport.width}px`, async ({ page }) => {
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.setViewportSize(viewport);
		await page.goto("/mobile-trade-height.html");
		await expect(page.getByRole("textbox", { name: "Size", exact: true })).toBeVisible();
		const initial = await outerGeometry(page);
		const input = await page.getByRole("textbox", { name: "Size", exact: true }).elementHandle();
		const scroll = page.locator('[data-slot="mobile-order-entry-scroll"]');
		const outerPage = page.locator("[data-fixture-page]");
		for (const mode of ["limit", "market", "limit", "tall", "market"]) {
			const pageScroll = await outerPage.evaluate((node) => node.scrollTop);
			await page.getByRole("button", { name: mode, exact: true }).click();
			await expect.poll(() => outerGeometry(page)).toEqual(initial);
			expect(await outerPage.evaluate((node) => node.scrollTop)).toBe(pageScroll);
			await expect(page.getByRole("textbox", { name: "Size", exact: true })).toHaveValue("0.25");
			expect(await input?.evaluate((node) => node.isConnected)).toBe(true);
			if (mode === "tall") {
				expect(await scroll.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(500);
				await page.getByRole("textbox", { name: "Size", exact: true }).focus();
				await page.keyboard.press("Tab");
				await expect(page.getByRole("textbox", { name: "Last field" })).toBeFocused();
				expect(await scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(500);
				await expect(page.getByRole("textbox", { name: "Last field" })).toBeInViewport();
			}
		}
		await page.getByRole("button", { name: "Connect Wallet", exact: true }).click();
		await expect(page.getByRole("status", { name: "Requests" })).toHaveText("1");
		await page.getByRole("button", { name: "Feedback", exact: true }).click();
		await expect.poll(() => outerGeometry(page)).toEqual(initial);
		await page.getByRole("button", { name: "Connect Wallet", exact: true }).click();
		await expect(page.getByRole("status", { name: "Requests" })).toHaveText("2");
		await page.getByRole("textbox", { name: "Size", exact: true }).focus();
		await expect(page.getByRole("textbox", { name: "Size", exact: true })).toBeInViewport();
		await expect.poll(() => outerGeometry(page)).toEqual(initial);
		expect(errors).toEqual([]);
	});
}
