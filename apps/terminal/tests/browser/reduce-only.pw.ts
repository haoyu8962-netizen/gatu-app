import { expect, type Page, test } from "@playwright/test";

async function chooseOrder(page: Page, width: number, name: string) {
	const form = page.locator("[data-fixture-form]");
	if (width <= 1000) await form.getByRole("button", { name: "Order type", exact: true }).click();
	else if (name === "Market" || name === "Limit") {
		await form.getByRole("button", { name, exact: true }).click();
		return;
	} else await form.getByRole("button", { name: "Advanced order types", exact: true }).click();
	await page.getByRole("menuitem", { name, exact: true }).click();
}
for (const width of [1440, 1108, 375]) {
	for (const position of ["7.15", "-7.15"]) {
		test(`reduce-only ${position} at ${width}px: zero opening balance, sizing, feedback and locale`, async ({
			page,
		}) => {
			page.on("pageerror", (error) => {
				throw error;
			});
			await page.setViewportSize({ width, height: 1000 });
			await page.goto(`/mobile-trade-all-orders.html?quiet-audit&position=${position}`);
			const form = page.locator("[data-fixture-form]");
			await chooseOrder(page, width, "Market");
			await page.getByRole("button", { name: "Funding", exact: true }).click();
			const toggle = form.getByRole("checkbox", { name: "Reduce Only", exact: true });
			await expect(toggle).toBeEnabled();
			await toggle.check();
			await form.getByRole("tab", { name: position.startsWith("-") ? "Buy Long" : "Sell Short", exact: true }).click();
			const size = form.getByRole("textbox", { name: "Size", exact: true });
			const pct = form.getByRole("textbox", { name: "Size (%)", exact: true });
			await expect(size).toBeEnabled();
			await pct.fill("50");
			await pct.blur();
			await expect(size).toHaveValue("3.575");
			await pct.fill("");
			await pct.fill("100");
			await pct.blur();
			await expect(size).toHaveValue("7.15");
			const label = position.startsWith("-") ? "Long" : "Short";
			const submit = form.getByRole("button", { name: width <= 1000 ? label : `Place ${label} Order`, exact: true });
			await expect(submit).toBeEnabled();
			await expect(form.getByRole("button", { name: "Deposit", exact: true })).toHaveCount(0);
			await size.fill("7.151");
			await size.blur();
			await expect(form).toContainText("Reduce Only size exceeds position size");
			await expect(submit).toBeDisabled();
			await page.getByRole("button", { name: "中文", exact: true }).click();
			await expect(form).toContainText("只减仓数量超过持仓数量");
			await expect(form.getByRole("textbox", { name: "数量", exact: true })).toHaveValue("7.151");
			await page.getByRole("button", { name: "English", exact: true }).click();
			await pct.fill("");
			await pct.fill("100");
			await pct.blur();
			await form.getByRole("button", { name: width <= 1000 ? "BTC" : "Toggle size mode", exact: true }).click();
			await expect(size).toHaveValue("715.00");
			await expect(submit).toBeEnabled();
			await page.getByRole("button", { name: "Positions pending", exact: true }).click();
			await expect(submit).toBeDisabled();
			await expect(form).not.toContainText("Reduce Only requires an open position");
			await expect(toggle).toBeEnabled();
			await page.getByRole("button", { name: "Positions pending", exact: true }).click();
			await expect(submit).toBeEnabled();
			await page.screenshot({ path: test.info().outputPath(`reduce-only-${width}.png`) });
			await expect(page.getByRole("status", { name: "Captured orders", exact: true })).toHaveText("[]");
		});
	}
	test(`all reduce-only order types reject oversized inputs at ${width}px`, async ({ page }) => {
		page.on("pageerror", (error) => {
			throw error;
		});
		await page.setViewportSize({ width, height: 1000 });
		await page.goto("/mobile-trade-all-orders.html?quiet-audit&position=7.15");
		const form = page.locator("[data-fixture-form]");
		await form.getByRole("tab", { name: "Sell Short", exact: true }).click();
		for (const type of [
			"Market",
			"Limit",
			"Stop Market",
			"Stop Limit",
			"Take Profit Market",
			"Take Profit Limit",
			"TWAP",
			"Scale",
		]) {
			await chooseOrder(page, width, type);
			await form.getByRole("checkbox", { name: "Reduce Only", exact: true }).check();
			const size = form.getByRole("textbox", { name: "Size", exact: true });
			await size.fill("7.151");
			await size.blur();
			await expect(form).toContainText("Reduce Only size exceeds position size");
			await expect(
				form.getByRole("button", { name: width <= 1000 ? "Short" : "Place Short Order", exact: true }),
			).toBeDisabled();
		}
	});
}
