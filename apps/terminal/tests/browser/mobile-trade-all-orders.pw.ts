import { expect, type Page, test } from "@playwright/test";

const orders = [
	"Market",
	"Limit",
	"Stop Market",
	"Stop Limit",
	"Take Profit Market",
	"Take Profit Limit",
	"TWAP",
	"Scale",
];
const chineseOrders = ["市场", "限价", "止损市价", "止损限价", "止盈市价", "止盈限价", "TWAP", "分段订单"];
async function openFixture(page: Page, query = "") {
	await page.goto(`/mobile-trade-all-orders.html${query}`);
	const theme = page.getByRole("button", { name: "Theme", exact: true });
	if ((await theme.getAttribute("aria-pressed")) === "true") await theme.click();
	await expect(page.locator("html")).toHaveClass(/\blight\b/);
}

async function selectOrder(page: Page, label: string) {
	await page.getByRole("button", { name: "Order type", exact: true }).click();
	await page.getByRole("menuitem", { name: label, exact: true }).click();
}

async function expectMobileGeometry(page: Page) {
	await expect
		.poll(() =>
			page.locator("[data-fixture-form]").evaluate((form) => {
				const fields = form.querySelector('[data-slot="mobile-order-entry-scroll"]');
				const book = document.querySelector("[data-fixture-book]");
				const positions = document.querySelector("[data-fixture-positions]");
				if (!fields || !book || !positions) throw new Error("Missing actual mobile regions");
				const bottom = form.getBoundingClientRect().bottom;
				const failures: string[] = [];
				if (Math.abs(book.getBoundingClientRect().bottom - bottom) > 1) failures.push("book bottom");
				if (Math.abs(positions.getBoundingClientRect().top - bottom) > 1) failures.push("account top");
				if (fields.scrollHeight - fields.clientHeight > 1) failures.push("nested scroll");
				for (const control of form.querySelectorAll<HTMLElement>(
					'input:not([type="hidden"]), button, [role="combobox"]',
				)) {
					if (!control.getClientRects().length || getComputedStyle(control).position === "absolute") continue;
					const rect = control.getBoundingClientRect();
					if (rect.width < 2 || rect.height < 2) continue;
					if (control.matches('input:not([type="checkbox"]):not([type="range"])') && rect.width < 24)
						failures.push(`input too narrow ${control.getAttribute("aria-label")}`);
					for (let ancestor: HTMLElement | null = control.parentElement; ancestor; ancestor = ancestor.parentElement) {
						if (ancestor === form || /hidden|clip|auto|scroll/.test(getComputedStyle(ancestor).overflowX)) {
							const bounds = ancestor.getBoundingClientRect();
							if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) {
								failures.push(`clipped ${control.getAttribute("aria-label") ?? control.textContent}`);
								break;
							}
						}
					}
				}
				for (const label of form.querySelectorAll<HTMLElement>('[data-slot="trade-order-options"] label')) {
					if (label.scrollWidth > label.clientWidth + 1) failures.push(`option overflow ${label.textContent}`);
				}
				return failures;
			}),
		)
		.toEqual([]);
}

async function expectHeaderHitTargets(page: Page) {
	const controls = page.locator('[data-fixture-form] [aria-haspopup="dialog"], [data-fixture-form] [role="tab"]');
	const orderType = page.getByRole("button", { name: /^(Order type|订单类型)$/ });
	const headerControls = [orderType, ...(await controls.all())];
	expect(headerControls).toHaveLength(5);
	for (const control of headerControls) {
		const geometry = await control.evaluate((node) => {
			const rect = node.getBoundingClientRect();
			const centerY = rect.top + rect.height / 2;
			return {
				height: rect.height,
				width: rect.width,
				hits: [rect.left + 2, rect.right - 2].flatMap((x) =>
					[centerY - 21, centerY, centerY + 21].map((y) => document.elementFromPoint(x, y)?.closest("button") === node),
				),
			};
		});
		expect(geometry.width).toBeGreaterThanOrEqual(44);
		expect(geometry.height).toBe((await control.getAttribute("role")) === "tab" ? 32 : 36);
		expect(geometry.hits).toEqual([true, true, true, true, true, true]);
	}
	const available = page.getByRole("button", { name: /^(Available|可用)/ });
	expect(
		await available.evaluate((node) => {
			const rect = node.getBoundingClientRect();
			return (
				document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2 - 21)?.closest("button") ===
				node
			);
		}),
	).toBe(true);
	expect(
		await orderType.evaluate((node) => {
			const rect = node.getBoundingClientRect();
			const arrow = node.querySelector("svg")?.getBoundingClientRect();
			return !!arrow && arrow.width >= 12 && arrow.left >= rect.left && arrow.right <= rect.right;
		}),
	).toBe(true);
}

async function expectInputHitTarget(page: Page, name: string) {
	const input = page.getByRole("textbox", { name, exact: true });
	await input.scrollIntoViewIfNeeded();
	expect(
		await input.evaluate((node) => {
			const rect = node.getBoundingClientRect();
			return [rect.left + 2, rect.right - 2].every(
				(x) => document.elementFromPoint(x, rect.top + rect.height / 2) === node,
			);
		}),
	).toBe(true);
	await input.tap();
	await expect(input).toBeFocused();
}

test.beforeEach(async ({ page }) => {
	page.on("pageerror", (error) => {
		throw error;
	});
	await page.route("**/*", (route) =>
		new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
	);
});

for (const viewport of [
	{ width: 320, height: 568 },
	{ width: 375, height: 666 },
	{ width: 393, height: 852 },
]) {
	test(`renders all real mobile order forms at ${viewport.width}px`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await openFixture(page);
		await expect(page.getByRole("textbox", { name: "Size", exact: true })).toBeVisible();
		for (const order of orders) {
			await selectOrder(page, order);
			await expect(page.getByRole("textbox", { name: "Size", exact: true })).toBeVisible();
			await expectMobileGeometry(page);
			await expectHeaderHitTargets(page);
			await expect(page.getByRole("button", { name: "Cross", exact: true })).toBeVisible();
			await expect(page.getByRole("button", { name: "10x", exact: true })).toBeVisible();
		}
		await page.getByRole("button", { name: "中文", exact: true }).click();
		for (const order of chineseOrders) {
			await page.getByRole("button", { name: "订单类型", exact: true }).click();
			await page.getByRole("menuitem", { name: order, exact: true }).click();
			await expectMobileGeometry(page);
			await expectHeaderHitTargets(page);
		}
	});

	test(`activates mobile side controls beyond their visible bounds at ${viewport.width}px`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await openFixture(page);
		await selectOrder(page, "TWAP");
		const size = page.getByRole("textbox", { name: "Size", exact: true });
		await size.fill("1");
		await size.blur();
		const tabs = page.locator('[data-fixture-form] [role="tab"]');
		for (const dark of [false, true]) {
			if (dark) await page.getByRole("button", { name: "Theme", exact: true }).click();
			await expectHeaderHitTargets(page);
			for (const index of [1, 0]) {
				const tab = tabs.nth(index);
				const rect = await tab.boundingBox();
				if (!rect) throw new Error("Missing side control");
				await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2 + (index ? -21 : 21));
				await expect(tab).toHaveAttribute("aria-selected", "true");
				await expect(size).toHaveValue("1");
			}
			await expectMobileGeometry(page);
			await page.screenshot({
				animations: "disabled",
				path: test.info().outputPath(`header-${viewport.width}-${dark ? "dark" : "light"}.png`),
			});
		}
	});

	test(`keeps every TP/SL field labelled and independently selectable at ${viewport.width}px`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await openFixture(page);
		await selectOrder(page, "Limit");
		await page.getByRole("textbox", { name: "Size", exact: true }).fill("1");
		await page.getByRole("checkbox", { name: "Take Profit / Stop Loss", exact: true }).check();
		const frames = page.locator('[data-slot="trade-tpsl-input-frame"]');
		await expect(frames).toHaveCount(4);
		for (const height of await frames.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height)))
			expect(height).toBe(33);
		await page.getByRole("textbox", { name: "Take Profit", exact: true }).fill("110");
		await page.getByRole("textbox", { name: "Stop Loss", exact: true }).fill("95");
		for (const label of ["TP Price", "SL Price", "Profit", "Loss"])
			await expect(page.locator("label").filter({ hasText: new RegExp(`^${label}$`) })).toBeVisible();
		for (const name of ["Take Profit", "Stop Loss", "Take profit return", "Stop loss return"])
			await expectInputHitTarget(page, name);
		const units = frames.getByRole("combobox");
		await expect(units).toHaveCount(2);
		await units.first().click();
		await expect(page.getByRole("option", { name: "$", exact: true })).toBeVisible();
		await page.getByRole("option", { name: "$", exact: true }).click();
		await expect(units.first()).toContainText("$");
		await expect(units.last()).toContainText("%");
		await expect(page.getByRole("textbox", { name: "Take Profit", exact: true })).toHaveValue("110");
		await expectMobileGeometry(page);
		await page.getByRole("button", { name: "中文", exact: true }).click();
		await expect(page.getByRole("textbox", { name: "止盈", exact: true })).toHaveValue("110");
		await expectMobileGeometry(page);
		await page.screenshot({ animations: "disabled", path: test.info().outputPath(`tp-sl-${viewport.width}.png`) });
		await page.getByRole("button", { name: "Theme", exact: true }).click();
		await expect(page.locator("html")).toHaveClass(/\bdark\b/);
		await expectMobileGeometry(page);
		await page.screenshot({ animations: "disabled", path: test.info().outputPath(`tp-sl-dark-${viewport.width}.png`) });
	});

	test(`retains advanced TWAP prices while disabling them and validates real Scale controls at ${viewport.width}px`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await openFixture(page);
		await selectOrder(page, "TWAP");
		await page.getByRole("textbox", { name: "Size", exact: true }).fill("1");
		const advanced = page.getByRole("checkbox", { name: "Advanced Settings", exact: true });
		await expect(advanced).not.toBeChecked();
		await advanced.check();
		await page.getByRole("textbox", { name: "Trigger Price (USDC)", exact: true }).fill("110");
		await page.getByRole("textbox", { name: "Max Price (USDC)", exact: true }).fill("120");
		const summary = page.locator('[data-slot="mobile-order-summary"]');
		await expect(summary).toContainText("Trigger Price");
		await expectMobileGeometry(page);
		await advanced.uncheck();
		await expect(page.getByRole("textbox", { name: "Trigger Price (USDC)", exact: true })).toHaveCount(0);
		await expect(summary).not.toContainText("Trigger Price");
		await advanced.check();
		await expect(page.getByRole("textbox", { name: "Trigger Price (USDC)", exact: true })).toHaveValue("110");
		await page.getByRole("tab", { name: "Sell Short", exact: true }).click();
		await expect(page.getByRole("textbox", { name: "Min Price (USDC)", exact: true })).toHaveValue("120");
		await selectOrder(page, "Scale");
		await expect(page.getByRole("textbox", { name: "Size", exact: true })).toHaveValue("1");
		await page.getByRole("textbox", { name: "Start Price", exact: true }).fill("95");
		await page.getByRole("textbox", { name: "End Price", exact: true }).fill("105");
		const levels = page.getByRole("textbox", { name: "Number of Orders", exact: true });
		const skew = page.getByRole("textbox", { name: "Size Skew", exact: true });
		await levels.fill("20");
		await levels.press("ArrowUp");
		await expect(levels).toHaveValue("20");
		await skew.fill("0.01");
		await skew.press("ArrowDown");
		await expect(skew).toHaveValue("0.01");
		const size = await page.getByRole("textbox", { name: "Size", exact: true }).boundingBox();
		const scale = await page.locator('[data-slot="trade-scale-fields"]').boundingBox();
		expect(size && scale && size.y < scale.y).toBeTruthy();
		await expect(summary).not.toContainText("Number of Orders");
		await expect(summary).not.toContainText("Size Skew");
		await page.getByRole("combobox", { name: "TIF: GTC", exact: true }).click();
		await expect(page.getByRole("option")).toHaveCount(2);
		await page.getByRole("option", { name: "Post Only", exact: true }).click();
		await expect(page.getByRole("combobox", { name: "TIF: Post Only", exact: true })).toBeVisible();
		await expectMobileGeometry(page);
		await page.screenshot({ animations: "disabled", path: test.info().outputPath(`scale-${viewport.width}.png`) });
	});
}

test("preserves quantity, its denomination and reduce-only through real desktop/mobile remounts", async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 666 });
	await openFixture(page);
	await selectOrder(page, "Limit");
	const size = page.getByRole("textbox", { name: "Size", exact: true });
	await size.fill("1");
	await page.getByRole("button", { name: "BTC", exact: true }).click();
	await expect(size).toHaveValue("100.00");
	await page.getByRole("checkbox", { name: "Reduce Only", exact: true }).check();
	for (const width of [1001, 375, 1440, 320]) {
		await page.setViewportSize({ width, height: 900 });
		await expect(size).toHaveValue("100.00");
		await expect(page.getByRole("checkbox", { name: "Reduce Only", exact: true })).toBeChecked();
		if (width > 1000)
			await expect(page.getByRole("button", { name: "Toggle size mode", exact: true })).toHaveText("USDC");
		else await expect(page.getByRole("button", { name: "USDC", exact: true })).toBeVisible();
	}
	await page.getByRole("button", { name: "USDC", exact: true }).click();
	await expect(size).toHaveValue("1");
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.getByRole("checkbox", { name: "Reduce Only", exact: true }).uncheck();
	await page.getByRole("checkbox", { name: "Take Profit / Stop Loss", exact: true }).check();
	await page.getByRole("textbox", { name: "Take Profit", exact: true }).fill("110");
	const frames = page.locator('[data-slot="trade-tpsl-input-frame"]');
	await expect(frames).toHaveCount(4);
	for (const height of await frames.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height)))
		expect(height).toBe(33);
	await page
		.locator("[data-fixture-desktop]")
		.screenshot({ animations: "disabled", path: test.info().outputPath("tp-sl-desktop.png") });
});

test("keeps USDH return inputs usable at 320px in a builder market", async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 568 });
	await openFixture(page, "?market=builder-usdh");
	await expect(page.getByText("BTC-USDH", { exact: true })).toBeVisible();
	await selectOrder(page, "Limit");
	await page.getByRole("textbox", { name: "Size", exact: true }).fill("1");
	await page.getByRole("checkbox", { name: "Take Profit / Stop Loss", exact: true }).check();
	const tpPrice = page.getByRole("textbox", { name: "Take Profit", exact: true });
	const slPrice = page.getByRole("textbox", { name: "Stop Loss", exact: true });
	await tpPrice.fill("110");
	await slPrice.fill("95");
	async function chooseReturnUnit(label: string, value: string) {
		const trigger = page.getByRole("combobox", { name: label, exact: true });
		await trigger.click();
		await expect(trigger).toHaveAttribute("aria-expanded", "true");
		const listboxId = await trigger.getAttribute("aria-controls");
		expect(listboxId).toBeTruthy();
		const listbox = page.locator(`[id="${listboxId}"]`);
		await listbox.getByRole("option", { name: value, exact: true }).click();
		await expect(trigger).toHaveText(value);
		await expect(listbox).not.toBeVisible();
	}
	for (const label of ["Take profit return unit", "Stop loss return unit"]) {
		await chooseReturnUnit(label, "USDH");
	}
	const tpReturn = page.getByRole("textbox", { name: "Take profit return", exact: true });
	await tpReturn.fill("12");
	await expect(tpPrice).toHaveValue(/^112(?:\.0+)?$/);
	await expect(slPrice).toHaveValue("95");
	for (const name of ["Take Profit", "Stop Loss", "Take profit return", "Stop loss return"])
		await expectInputHitTarget(page, name);
	for (const unit of ["%", "USDH"]) {
		await chooseReturnUnit("Take profit return unit", unit);
		await expect(tpPrice).toHaveValue(/^112(?:\.0+)?$/);
		await expect(slPrice).toHaveValue("95");
	}
	await expect(tpReturn).toHaveValue("12");
	const widths: Record<string, number> = {};
	for (const name of ["Take profit return", "Stop loss return"]) {
		const input = page.getByRole("textbox", { name, exact: true });
		widths[name] = await input.evaluate((node) => node.getBoundingClientRect().width);
		expect(widths[name]).toBeGreaterThanOrEqual(24);
		const unitLabel = page.getByRole("combobox", { name: `${name} unit`, exact: true }).locator(".truncate");
		await expect(unitLabel).toHaveText("USDH");
		expect(await unitLabel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
	}
	await test.info().attach("USDH return input widths", {
		body: JSON.stringify(widths),
		contentType: "application/json",
	});
	await expectMobileGeometry(page);
	await page.screenshot({ animations: "disabled", path: test.info().outputPath("tp-sl-usdh-320.png") });
});

test("disables real inputs on missing funding, disconnection and stale data without losing drafts", async ({
	page,
}) => {
	await page.setViewportSize({ width: 375, height: 666 });
	await openFixture(page);
	const size = page.getByRole("textbox", { name: "Size", exact: true });
	await size.fill("1");
	for (const mode of ["Funding", "Connection", "Freshness"]) {
		await page.getByRole("button", { name: mode, exact: true }).click();
		await expect(size).toBeDisabled();
		await expect(size).toHaveValue("1");
		await page.getByRole("button", { name: mode, exact: true }).click();
		await expect(size).toBeEnabled();
	}
	await expect(page.getByRole("status", { name: "Captured orders", exact: true })).toHaveText("[]");
});
