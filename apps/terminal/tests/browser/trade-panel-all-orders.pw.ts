import { expect, type Page, test } from "@playwright/test";
import type { OrderType } from "../../src/config/trade";

const orderTypes = [
	"market",
	"limit",
	"stopMarket",
	"stopLimit",
	"takeProfitMarket",
	"takeProfitLimit",
	"twap",
	"scale",
] as const satisfies readonly OrderType[];

const orderLabels: Record<"en" | "zh", Record<OrderType, string>> = {
	en: {
		market: "Market",
		limit: "Limit",
		stopMarket: "Stop Market",
		stopLimit: "Stop Limit",
		takeProfitMarket: "Take Profit Market",
		takeProfitLimit: "Take Profit Limit",
		twap: "TWAP",
		scale: "Scale",
	},
	zh: {
		market: "市价",
		limit: "限价",
		stopMarket: "止损市价",
		stopLimit: "止损限价",
		takeProfitMarket: "止盈市价",
		takeProfitLimit: "止盈限价",
		twap: "TWAP",
		scale: "分段订单",
	},
};

async function selectOrder(page: Page, type: OrderType, locale: "en" | "zh" = "en") {
	const header = page.locator('[data-slot="trade-panel-header"]');
	if (type === "market" || type === "limit") {
		await header.getByRole("button", { name: orderLabels[locale][type], exact: true }).click();
	} else {
		await header.getByRole("button", { name: locale === "en" ? "Advanced order types" : "专业委托类型" }).click();
		await page.getByRole("menuitem", { name: orderLabels[locale][type], exact: true }).click();
	}
	await expect(page.locator("[data-order-type]")).toHaveAttribute("data-order-type", type);
	await page.evaluate(
		() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
	);
}

async function geometry(page: Page) {
	return page.locator("[data-panel]").evaluateAll((panels) => ({
		height: document.documentElement.scrollHeight,
		width: document.documentElement.scrollWidth,
		scrollY,
		panels: panels.map((panel) => {
			const rect = panel.getBoundingClientRect();
			return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
		}),
	}));
}

async function expectPanelFits(page: Page) {
	await expect
		.poll(async () =>
			page.locator('[data-panel="tradingInterface"]').evaluate((panel) => {
				const header = panel.querySelector('[data-slot="trade-panel-header"]');
				const fields = panel.querySelector('[data-slot="trade-panel-fields"]');
				const body = panel.querySelector('[data-slot="trade-panel-body"]');
				const footer = panel.querySelector('[data-slot="trade-panel-footer"]');
				if (!header || !fields || !body || !footer) throw new Error("Missing order-entry regions");
				const fieldsRect = fields.getBoundingClientRect();
				const panelRect = panel.getBoundingClientRect();
				const footerRect = footer.getBoundingClientRect();
				const headerRect = header.getBoundingClientRect();
				const inputs = [...fields.querySelectorAll('input[data-slot="input"]')].filter(
					(element) => element.getClientRects().length > 0,
				);
				const inputClipping = inputs.flatMap((input) => {
					const rect = input.getBoundingClientRect();
					return [
						fieldsRect.top - rect.top,
						rect.bottom - fieldsRect.bottom,
						fieldsRect.left - rect.left,
						rect.right - fieldsRect.right,
					];
				});
				return Object.entries({
					fieldsVerticalOverflow: fields.scrollHeight - fields.clientHeight,
					bodyVerticalOverflow: body.scrollHeight - body.clientHeight,
					fieldsHorizontalOverflow: fields.scrollWidth - fields.clientWidth,
					headerHorizontalOverflow: header.scrollWidth - header.clientWidth,
					headerAbovePanel: panelRect.top - headerRect.top,
					headerOverlapsFields: headerRect.bottom - fieldsRect.top,
					fieldsOverlapFooter: fieldsRect.bottom - footerRect.top,
					footerBelowPanel: footerRect.bottom - panelRect.bottom,
					inputClipping: Math.max(...inputClipping),
				}).filter(([, value]) => value > 1);
			}),
		)
		.toEqual([]);
	await expect(page.getByRole("button", { name: "Fixture order action" })).toBeInViewport();
	await expect(page.locator("[data-fixture-summary]").locator("div").last()).toBeInViewport();
}

test.beforeEach(async ({ page }) => {
	page.on("pageerror", (error) => {
		throw error;
	});
});

for (const viewport of [
	{ width: 2016, height: 1358 },
	{ width: 1545, height: 900 },
	{ width: 1238, height: 900 },
	{ width: 1001, height: 900 },
]) {
	test(`fits all real order forms without scrolling or moving panels at ${viewport.width}x${viewport.height}`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await page.goto("/trade-panel-all-orders.html");
		await expect(page.locator('[data-slot="trade-panel-header"]')).toBeVisible();
		await expectPanelFits(page);
		const initial = await geometry(page);
		const savedLayout = await page.evaluate(() => localStorage.getItem("trade-desktop-grid-layout-v12"));
		const sizeInput = page.getByRole("textbox", { name: "Size", exact: true });
		await sizeInput.fill("0.25");
		const originalSizeInput = await sizeInput.elementHandle();

		for (const locale of ["en", "zh"] as const) {
			const label =
				locale === "en"
					? {
							tpSl: "Take Profit / Stop Loss",
							tpReturn: "Take profit return",
							trigger: "Trigger Price (USDC)",
							stop: "Max Price (USDC)",
							start: "Start Price",
							end: "End Price",
							levels: "Number of Orders",
							skew: "Size Skew",
							size: "Size",
						}
					: {
							tpSl: "止盈 / 止损",
							tpReturn: "止盈收益",
							trigger: "触发价 (USDC)",
							stop: "最高价 (USDC)",
							start: "起始价",
							end: "结束价格",
							levels: "委托数量",
							skew: "数量偏斜",
							size: "数量",
						};
			await page.getByRole("button", { name: locale === "en" ? "English" : "中文", exact: true }).click();
			for (const type of orderTypes) {
				await selectOrder(page, type, locale);
				await expectPanelFits(page);
				expect(await geometry(page)).toEqual(initial);
			}

			for (const type of ["market", "limit"] as const) {
				await selectOrder(page, type, locale);
				const toggle = page.getByRole("checkbox", { name: label.tpSl, exact: true });
				await toggle.check();
				await expect(page.getByRole("textbox", { name: label.tpReturn, exact: true })).toBeVisible();
				await page.getByRole("textbox", { name: locale === "en" ? "Take Profit" : "止盈", exact: true }).fill("110");
				await page.getByRole("textbox", { name: locale === "en" ? "Stop Loss" : "止损", exact: true }).fill("95");
				await expectPanelFits(page);
				expect(await geometry(page)).toEqual(initial);
				await toggle.uncheck();
			}

			await selectOrder(page, "twap", locale);
			await page
				.getByRole("checkbox", { name: locale === "en" ? "Advanced Settings" : "高级设置", exact: true })
				.check();
			await page.getByRole("textbox", { name: label.trigger, exact: true }).fill("110");
			await page.getByRole("textbox", { name: label.stop, exact: true }).fill("120");
			const advanced = page.getByRole("checkbox", {
				name: locale === "en" ? "Advanced Settings" : "高级设置",
				exact: true,
			});
			const summary = page.locator("[data-fixture-summary]");
			await advanced.uncheck();
			await expect(page.getByRole("textbox", { name: label.trigger, exact: true })).toHaveCount(0);
			await expect(summary).not.toContainText(locale === "en" ? "Trigger Price" : "触发价");
			await expect(summary).not.toContainText(locale === "en" ? "Max Price" : "最高价");
			await advanced.check();
			await expect(page.getByRole("textbox", { name: label.trigger, exact: true })).toHaveValue("110");
			await expect(page.getByRole("textbox", { name: label.stop, exact: true })).toHaveValue("120");
			await expect(
				page.getByRole("checkbox", { name: locale === "en" ? "Reduce Only" : "只减仓", exact: true }),
			).toHaveCount(1);

			await expectPanelFits(page);
			expect(await geometry(page)).toEqual(initial);

			await selectOrder(page, "scale", locale);
			await page.getByRole("textbox", { name: label.start, exact: true }).fill("95");
			await page.getByRole("textbox", { name: label.end, exact: true }).fill("105");
			const fields = page.locator('[data-slot="trade-panel-fields"]');
			await expect(fields.getByText("2–20", { exact: true })).toBeVisible();
			await expect(fields.getByText("0.01–100", { exact: true })).toBeVisible();
			const levels = page.getByRole("textbox", { name: label.levels, exact: true });
			await levels.fill("2");
			await levels.press("ArrowDown");
			await expect(levels).toHaveValue("2");
			await levels.fill("20");
			await levels.press("ArrowUp");
			await expect(levels).toHaveValue("20");
			const skew = page.getByRole("textbox", { name: label.skew, exact: true });
			await skew.fill("100");
			await skew.press("ArrowUp");
			await expect(skew).toHaveValue("100");
			await skew.fill("0.01");
			await skew.press("ArrowDown");
			await expect(skew).toHaveValue("0.01");
			await expectPanelFits(page);
			await selectOrder(page, "market", locale);
			await selectOrder(page, "scale", locale);
			await expect(page.getByRole("textbox", { name: label.start, exact: true })).toHaveValue("95");
			await expect(page.getByRole("textbox", { name: label.end, exact: true })).toHaveValue("105");
			await expect(levels).toHaveValue("20");
			await expect(skew).toHaveValue("0.01");
			await expect(page.getByRole("textbox", { name: label.size, exact: true })).toHaveValue("0.25");
			await page.getByRole("button", { name: "Toggle position", exact: true }).click();
			await expectPanelFits(page);
			expect(await geometry(page)).toEqual(initial);
			await page.getByRole("button", { name: "Toggle position", exact: true }).click();
		}
		expect(await originalSizeInput?.evaluate((element) => element.isConnected)).toBe(true);
		expect(await geometry(page)).toEqual(initial);
		expect(await page.evaluate(() => localStorage.getItem("trade-desktop-grid-layout-v12"))).toBe(savedLayout);
		await page.getByRole("button", { name: "Fixture order action" }).click();
		await expect(page.getByRole("status", { name: "Fixture action count" })).toHaveText("1");
	});
}

test("keeps the size slider still while its message row would change during a drag", async ({ page }) => {
	type SizeMessageWindow = Window & { __sairnSetSizeMessage: (message: string) => void };
	const longMessage =
		"The order value is below the ten dollar minimum for this market, so increase the size or choose a larger share of the available balance before submitting.";
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/trade-panel-all-orders.html");
	const panel = page.locator('[data-panel="tradingInterface"]');
	const control = panel.locator("[data-trade-slider-control]").first();
	const row = panel.locator('p[role="alert"]');
	await control.waitFor();

	const resting = await control.boundingBox();
	if (!resting) throw new Error("Expected the size slider");
	const y = resting.y + resting.height / 2;
	await page.mouse.move(resting.x + 30, y);
	await page.mouse.down();
	await page.evaluate((message) => (window as unknown as SizeMessageWindow).__sairnSetSizeMessage(message), longMessage);
	await page.mouse.move(resting.x + 90, y, { steps: 5 });
	await expect(row).toHaveCount(0);
	expect((await control.boundingBox())?.y).toBe(resting.y);
	await page.mouse.up();
	await expect(row).toHaveText(longMessage);

	const rowBox = await row.boundingBox();
	const pushed = await control.boundingBox();
	if (!rowBox || !pushed) throw new Error("Expected the size message row");
	expect(rowBox.height).toBeGreaterThan(20);
	expect(pushed.y).toBeGreaterThan(resting.y);

	const pushedY = pushed.y + pushed.height / 2;
	await page.mouse.move(pushed.x + 90, pushedY);
	await page.mouse.down();
	await page.evaluate(() => (window as unknown as SizeMessageWindow).__sairnSetSizeMessage(""));
	await page.mouse.move(pushed.x + 40, pushedY, { steps: 5 });
	await expect(row).toHaveText("");
	expect((await row.boundingBox())?.height).toBe(rowBox.height);
	expect((await control.boundingBox())?.y).toBe(pushed.y);
	await page.mouse.up();
	await expect(row).toHaveCount(0);
	expect((await control.boundingBox())?.y).toBe(resting.y);
});

test("keeps order tabs pinned and real fields reachable after reducing the grid height", async ({ page }) => {
	await page.setViewportSize({ width: 1001, height: 900 });
	await page.goto("/trade-panel-all-orders.html");
	await expectPanelFits(page);
	const resizeHandle = page.locator('[data-panel="chart"] .react-resizable-handle-s');
	const bounds = await resizeHandle.boundingBox();
	if (!bounds) throw new Error("Missing chart resize handle");
	const x = bounds.x + bounds.width / 2;
	const y = bounds.y + bounds.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x, y - 200, { steps: 8 });
	await page.mouse.up();
	await selectOrder(page, "limit");
	await page.getByRole("checkbox", { name: "Take Profit / Stop Loss", exact: true }).check();
	await page.getByRole("button", { name: "Toggle feedback", exact: true }).click();
	const initial = await geometry(page);
	const header = page.locator('[data-slot="trade-panel-header"]');
	const headerBounds = await header.boundingBox();
	const body = page.locator('[data-slot="trade-panel-body"]');
	await body.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	expect(
		await page.locator('[data-slot="trade-panel-fields"]').evaluate((element) => getComputedStyle(element).overflowY),
	).not.toMatch(/auto|scroll/);
	await expect(page.getByRole("textbox", { name: "Stop loss return", exact: true })).toBeInViewport();
	await page.getByRole("textbox", { name: "Stop loss return", exact: true }).focus();
	await expect(page.getByRole("textbox", { name: "Stop loss return", exact: true })).toBeFocused();
	expect(await header.boundingBox()).toEqual(headerBounds);
	await expect(header.getByRole("button", { name: "Market", exact: true })).toBeInViewport();
	await selectOrder(page, "market");
	await selectOrder(page, "scale");
	await expect(header.getByRole("button", { name: "Limit", exact: true })).toBeInViewport();
	expect(await geometry(page)).toEqual(initial);
	await page.getByRole("button", { name: "Fixture order action" }).click();
	await expect(page.getByRole("status", { name: "Fixture action count" })).toHaveText("1");
});

test("hot-switches every mounted TWAP label and hint without replacing inputs or changing values", async ({ page }) => {
	await page.setViewportSize({ width: 1001, height: 900 });
	await page.goto("/trade-panel-all-orders.html");
	await selectOrder(page, "twap");
	await page.getByRole("checkbox", { name: "Advanced Settings", exact: true }).check();
	const hours = page.getByRole("textbox", { name: "Hour(s)", exact: true });
	const minutes = page.getByRole("textbox", { name: "Minute(s)", exact: true });
	const trigger = page.getByRole("textbox", { name: "Trigger Price (USDC)", exact: true });
	const stop = page.getByRole("textbox", { name: "Max Price (USDC)", exact: true });
	await hours.fill("1");
	await minutes.fill("30");
	await trigger.fill("110");
	await stop.fill("120");
	const inputs = await Promise.all([hours, minutes, trigger, stop].map((input) => input.elementHandle()));
	const initial = await geometry(page);
	const fields = page.locator('[data-slot="trade-panel-fields"]');
	const summary = page.locator("[data-fixture-summary]");

	for (const locale of ["en", "zh", "en"] as const) {
		await page.getByRole("button", { name: locale === "en" ? "English" : "中文", exact: true }).click();
		const labels =
			locale === "en"
				? {
						runningTime: "Running Time (5m - 7d)",
						hours: "Hrs",
						minutes: "Mins",
						randomize: "Randomize timing",
						trigger: "Trigger Price",
						stop: "Max Price",
						frequency: "Frequency",
						runtime: "Runtime",
						interval: "Every 30 seconds",
						fees: "Fees",
						hint: "Activates when mark ≥ 110",
						inputNames: ["Hour(s)", "Minute(s)", "Trigger Price (USDC)", "Max Price (USDC)"],
					}
				: {
						runningTime: "运行时间（5 分钟–7 天）",
						hours: "时",
						minutes: "分",
						randomize: "随机化时间",
						trigger: "触发价",
						stop: "最高价",
						frequency: "频率",
						runtime: "运行时长",
						interval: "每 30 秒",
						fees: "费用",
						hint: "标记价 ≥ 110 时激活",
						inputNames: ["小时", "分钟", "触发价 (USDC)", "最高价 (USDC)"],
					};
		for (const label of [labels.runningTime, labels.hours, labels.minutes, labels.hint]) {
			await expect(fields.getByText(label, { exact: true })).toBeVisible();
		}
		await expect(fields.getByRole("checkbox", { name: labels.randomize, exact: true })).toBeChecked();
		for (const label of [labels.trigger, labels.stop, labels.frequency, labels.runtime, labels.interval, labels.fees]) {
			await expect(summary.getByText(label, { exact: true })).toBeVisible();
		}
		for (const [index, input] of inputs.entries()) {
			const name = labels.inputNames[index];
			expect(
				await input?.evaluate(
					(element, expectedName) => element.isConnected && element.getAttribute("aria-label") === expectedName,
					name,
				),
			).toBe(true);
			await expect(fields.getByRole("textbox", { name, exact: true })).toHaveValue(["1", "30", "110", "120"][index]);
		}
		await expect(page.locator("[data-order-type]")).toHaveAttribute("data-order-type", "twap");
		await expectPanelFits(page);
		expect(await geometry(page)).toEqual(initial);
	}
});
