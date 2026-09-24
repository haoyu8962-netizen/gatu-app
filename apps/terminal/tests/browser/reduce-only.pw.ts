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
	test(`review regression: Max names follow reduce-only and locale at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 1000 });
		await page.goto("/mobile-trade-all-orders.html?quiet-audit&position=7.15");
		const form = page.locator("[data-fixture-form]");
		await chooseOrder(page, width, "Market");
		await form.getByRole("tab", { name: "Sell Short", exact: true }).click();
		await form.getByRole("checkbox", { name: "Reduce Only", exact: true }).check();
		await page.getByRole("button", { name: "Funding", exact: true }).click();
		const max = form.getByRole("button", { name: "Use max reducible size", exact: true });
		await expect(max).toBeEnabled();
		await expect(max).toContainText("0.00");
		await max.click();
		await expect(form.getByRole("textbox", { name: "Size", exact: true })).toHaveValue("7.15");
		await max.evaluate((node) => node.setAttribute("data-max-identity", "preserved"));
		await page.getByRole("button", { name: "中文", exact: true }).click();
		const chineseMax = form.getByRole("button", { name: "使用最大可减仓数量", exact: true });
		await expect(chineseMax).toHaveAttribute("data-max-identity", "preserved");
		await expect(form.getByRole("textbox", { name: "数量", exact: true })).toHaveValue("7.15");
		await page.getByRole("button", { name: "English", exact: true }).click();
		await form.getByRole("checkbox", { name: "Reduce Only", exact: true }).uncheck();
		await expect(form.getByRole("button", { name: "Use max available balance", exact: true })).toBeDisabled();
	});

	test(`review regression: healthy balance survives unavailable positions at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 1000 });
		await page.goto("/mobile-trade-all-orders.html?quiet-audit&position=7.15");
		const form = page.locator("[data-fixture-form]");
		await chooseOrder(page, width, "Market");
		await form.getByRole("tab", { name: "Sell Short", exact: true }).click();
		await form.getByRole("checkbox", { name: "Reduce Only", exact: true }).check();
		const size = form.getByRole("textbox", { name: "Size", exact: true });
		await size.fill("1");
		await size.blur();
		const max = form.getByRole("button", { name: /Use max|Available/ });
		const submit = form.getByRole("button", { name: width <= 1000 ? "Short" : "Place Short Order", exact: true });
		await expect(max).toContainText("1,000.00");
		await expect(submit).toBeEnabled();
		for (const status of ["loading", "error", "stale"]) {
			await page.getByRole("button", { name: `Positions ${status}`, exact: true }).click();
			await expect(max).toContainText("1,000.00");
			await expect(max).toBeDisabled();
			await expect(submit).toBeDisabled();
			await expect(size).toHaveValue("1");
			await expect(form).not.toContainText("Reduce Only requires an open position");
			await page.getByRole("button", { name: "Positions success", exact: true }).click();
			await expect(submit).toBeEnabled();
		}
		await page.getByRole("button", { name: "Account stale", exact: true }).click();
		await expect(max).not.toContainText("1,000.00");
		await expect(submit).toBeDisabled();
		await expect(page.getByRole("status", { name: "Captured orders", exact: true })).toHaveText("[]");
	});

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

test("review regression: ordinary mobile margin keeps its original price basis", async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 1000 });
	await page.goto("/mobile-trade-all-orders.html?quiet-audit&position=7.15");
	const form = page.locator("[data-fixture-form]");
	for (const type of [
		"Market",
		"Limit",
		"Stop Market",
		"Stop Limit",
		"Take Profit Market",
		"Take Profit Limit",
		"Scale",
	]) {
		await chooseOrder(page, 375, type);
		await form.getByRole("checkbox", { name: "Reduce Only", exact: true }).uncheck();
		await form.getByRole("textbox", { name: "Size", exact: true }).fill("1");
		if (type.startsWith("Stop") || type.startsWith("Take Profit")) {
			await form.getByRole("textbox", { name: "Trigger Price (USDC)", exact: true }).fill("80");
		}
		if (type.includes("Limit")) await form.getByRole("textbox", { name: "Price (USDC)", exact: true }).fill("90");
		if (type === "Scale") {
			await form.getByRole("textbox", { name: "Start Price", exact: true }).fill("70");
			await form.getByRole("textbox", { name: "End Price", exact: true }).fill("90");
		}
		const margin = form.getByText("Margin Req.", { exact: true }).locator("..");
		await expect(margin).toContainText(type.includes("Limit") ? "$9.00" : "$10.00");
		await form.getByRole("checkbox", { name: "Reduce Only", exact: true }).check();
		await expect(margin.locator("span").last()).toHaveText("-");
	}
	await chooseOrder(page, 375, "TWAP");
	await expect(form.getByText("Margin Req.", { exact: true })).toHaveCount(0);
});
