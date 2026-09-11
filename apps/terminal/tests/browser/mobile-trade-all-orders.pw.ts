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
				hits: [
					[rect.left + rect.width / 2, rect.top + 1],
					[rect.left + rect.width / 2, rect.bottom - 1],
					[rect.left + 2, centerY],
					[rect.right - 2, centerY],
				].map(([x, y]) => document.elementFromPoint(x, y)?.closest("button") === node),
			};
		});
		expect(geometry.width).toBeGreaterThanOrEqual(24);
		expect(geometry.height).toBe((await control.getAttribute("role")) === "tab" ? 31 : 35);
		expect(geometry.hits).toEqual([true, true, true, true]);
	}
	const headerGeometry = await orderType.evaluate((node) => {
		const header = node.parentElement?.parentElement?.parentElement;
		const grid = node.parentElement?.parentElement;
		const sideList = header?.querySelector('[role="tablist"]');
		const available = header?.nextElementSibling;
		if (!header || !grid || !sideList || !available) throw new Error("Missing header regions");
		const first = node.getBoundingClientRect();
		const side = sideList.getBoundingClientRect();
		const balance = available.getBoundingClientRect();
		return {
			columnDifference: Math.abs(first.width - grid.children[1].getBoundingClientRect().width),
			sideGap: side.top - first.bottom,
			sideHeight: side.height,
			balanceGap: balance.top - side.bottom,
			balanceHeight: balance.height,
			totalHeight: balance.bottom - first.top,
		};
	});
	expect(headerGeometry.columnDifference).toBeLessThan(1);
	expect(headerGeometry).toMatchObject({
		sideGap: 2,
		sideHeight: 33,
		balanceGap: 8,
		balanceHeight: 15,
		totalHeight: 93,
	});
	const available = page.getByRole("button", { name: /^(Available|可用)/ });
	expect(
		await available.evaluate((node) => {
			const rect = node.getBoundingClientRect();
			return [-11, 11].every(
				(offset) =>
					document
						.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2 + offset)
						?.closest("button") === node,
			);
		}),
	).toBe(true);
	expect(
		await orderType.evaluate((node) => {
			const rect = node.getBoundingClientRect();
			const arrow = node.querySelector("svg")?.getBoundingClientRect();
			return !!arrow && arrow.width >= 9 && arrow.left >= rect.left && arrow.right <= rect.right;
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

	test(`keeps compact header controls independent at ${viewport.width}px`, async ({ page }) => {
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
				await page.touchscreen.tap(rect.x + rect.width / 2, index ? rect.y + 1 : rect.y + rect.height - 1);
				await expect(tab).toHaveAttribute("aria-selected", "true");
				await expect(size).toHaveValue("1");
			}
			const available = page.getByRole("button", { name: /^Available/ });
			const bounds = await available.boundingBox();
			if (!bounds) throw new Error("Missing available balance");
			await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 - 11);
			await expect(size).not.toHaveValue("1");
			await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
			await size.fill("1");
			await size.blur();
			await expectMobileGeometry(page);
			await page.screenshot({
				animations: "disabled",
				path: test.info().outputPath(`header-${viewport.width}-${dark ? "dark" : "light"}.png`),
			});
		}
	});

	test(`aligns TWAP options and isolates every touch target at ${viewport.width}px`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await openFixture(page);
		await selectOrder(page, "TWAP");
		const group = page.locator('[data-slot="trade-twap-options"]');
		const checks = group.getByRole("checkbox");
		await expect(checks).toHaveCount(3);
		for (const locale of ["English", "中文"]) {
			await page.getByRole("button", { name: locale, exact: true }).click();
			if (locale === "中文") await page.getByRole("button", { name: "Theme", exact: true }).click();
			await group.scrollIntoViewIfNeeded();
			const metrics = await group.evaluate((node) => {
				const labels = [...node.querySelectorAll("label")];
				return {
					height: node.getBoundingClientRect().height,
					rows: labels.map((label) => {
						const box = label.querySelector('[role="checkbox"]');
						if (!box) throw new Error("Missing checkbox");
						const row = label.getBoundingClientRect();
						const rect = box.getBoundingClientRect();
						return {
							x: rect.x,
							y: row.y,
							height: row.height,
							boxWidth: rect.width,
							boxHeight: rect.height,
							gap: getComputedStyle(label).columnGap,
							hits: [rect.x + rect.width / 2, row.x + row.width / 2].flatMap((x) =>
								[row.top + 1, row.bottom - 1].map((y) => document.elementFromPoint(x, y)?.closest("label") === label),
							),
						};
					}),
				};
			});
			expect(metrics.height).toBe(72);
			for (const [index, row] of metrics.rows.entries()) {
				expect(row).toMatchObject({
					x: metrics.rows[0].x,
					y: metrics.rows[0].y + 24 * index,
					height: 24,
					boxWidth: 16,
					boxHeight: 16,
					gap: "8px",
					hits: [true, true, true, true],
				});
			}
			for (let index = 0; index < 3; index++) {
				const before = await checks.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-checked")));
				const checkbox = checks.nth(index);
				for (const edge of ["top", "bottom"]) {
					await checkbox.scrollIntoViewIfNeeded();
					const rect = await checkbox.boundingBox();
					if (!rect) throw new Error("Missing checkbox bounds");
					await page.touchscreen.tap(rect.x + rect.width / 2, edge === "top" ? rect.y - 3 : rect.y + rect.height + 3);
					const expected = before.map((value, other) =>
						other === index && edge === "top" ? String(value !== "true") : value,
					);
					await expect
						.poll(() => checks.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-checked"))))
						.toEqual(expected);
				}
			}
			await expectMobileGeometry(page);
			await page.screenshot({
				animations: "disabled",
				path: test.info().outputPath(`twap-options-${viewport.width}-${locale}.png`),
			});
		}
		await page.getByRole("button", { name: "Funding", exact: true }).click();
		await expect(checks.nth(0)).toBeDisabled();
		await expect(checks.nth(1)).toBeDisabled();
		await expect(checks.nth(2)).toBeEnabled();
		await expect(page.getByRole("status", { name: "Captured orders", exact: true })).toHaveText("[]");
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

for (const desktop of [false, true]) {
	test(`preserves ${desktop ? "desktop" : "mobile"} prefill intent across recovery and shows zero TWAP minutes`, async ({ page }) => {
		await page.setViewportSize(desktop ? { width: 1440, height: 1000 } : { width: 393, height: 852 });
		await openFixture(page, "?quiet-audit");
		const form = page.locator("[data-fixture-form]");
		async function chooseOrder(order: string) {
			if (!desktop) return selectOrder(page, order);
			if (order === "Market" || order === "Limit") return form.getByRole("button", { name: order, exact: true }).click();
			await form.getByRole("button", { name: "Advanced order types", exact: true }).click();
			await page.getByRole("menuitem", { name: order, exact: true }).click();
		}
		await chooseOrder("Market");
		await page.getByRole("button", { name: "Market stale", exact: true }).click();
		await page.getByRole("button", { name: "Reset", exact: true }).click();
		await chooseOrder("Limit");
		const price = form.getByRole("textbox", { name: /^Price(?: \(USDC\))?$/ });
		const mid = form.getByRole("button", { name: desktop ? "Mid" : /^Use mid price/ });
		await expect(price).toHaveValue("");
		await expect(mid).toBeDisabled();
		const waitingPriceBounds = await price.boundingBox();
		await page.getByRole("button", { name: "Market success", exact: true }).click();
		await expect(price).toHaveValue("100");
		expect((await price.boundingBox())?.width).toBeCloseTo(waitingPriceBounds?.width ?? 0, 1);
		await price.fill("99");
		await page.getByRole("button", { name: "Market stale", exact: true }).click();
		await page.getByRole("button", { name: "Market success", exact: true }).click();
		await expect(price).toHaveValue("99");
		await price.fill("");
		await page.getByRole("button", { name: "Market stale", exact: true }).click();
		await page.getByRole("button", { name: "Market success", exact: true }).click();
		await expect(price).toHaveValue("");
		await mid.click();
		await expect(price).toHaveValue("100");
		await chooseOrder("TWAP");
		await form.getByRole("textbox", { name: "Hour(s)", exact: true }).fill("1");
		await form.getByRole("textbox", { name: "Minute(s)", exact: true }).fill("0");
		await expect(form.getByRole("textbox", { name: "Minute(s)", exact: true })).toHaveValue("0");
		await expect(form).toContainText("1h");
		await expect(page.getByRole("status", { name: "Captured orders", exact: true })).toHaveText("[]");
		await page.screenshot({ path: test.info().outputPath(`fields-${desktop ? "desktop" : "mobile"}.png`) });
		await chooseOrder("Scale");
		const start = form.getByRole("textbox", { name: "Start Price", exact: true });
		await start.fill("90");
		const startBounds = await start.boundingBox();
		await page.getByRole("button", { name: "Market stale", exact: true }).click();
		for (const button of await form.getByRole("button", { name: /^Use mid price/ }).all()) {
			await expect(button).toBeDisabled();
		}
		await expect(form.getByRole("button", { name: /^Use mid price/ })).toHaveCount(2);
		await expect(start).toHaveValue("90");
		expect((await start.boundingBox())?.width).toBeCloseTo(startBounds?.width ?? 0, 1);
		await page.getByRole("button", { name: "Market success", exact: true }).click();
		await expect(start).toHaveValue("90");
		await form.getByRole("button", { name: /^Use mid price/ }).first().click();
		await expect(start).toHaveValue("100");
	});

	test(`keeps ${desktop ? "desktop" : "mobile"} order forms quiet while market data recovers`, async ({ page }) => {
		await page.setViewportSize(desktop ? { width: 1440, height: 1000 } : { width: 375, height: 666 });
		await openFixture(page, "?quiet-audit");
		const form = page.locator("[data-fixture-form]");
		const passive =
			/Mark price is unavailable|No mark price|No market|Market not ready|Loading wallet|Signer not ready|Checking regional|Failed to load balances/;
		await form.evaluate((element, pattern) => {
			const failures: string[] = [];
			const expression = new RegExp(pattern);
			const observer = new MutationObserver(() => {
				if (expression.test(element.textContent ?? "")) failures.push(element.textContent ?? "");
			});
			observer.observe(element, { subtree: true, characterData: true, childList: true });
			Object.assign(window, { quietAudit: { failures, observer } });
		}, passive.source);
		for (const order of orders) {
			if (!desktop) await selectOrder(page, order);
			else if (order === "Market" || order === "Limit")
				await form.getByRole("button", { name: order, exact: true }).click();
			else {
				await form.getByRole("button", { name: "Advanced order types", exact: true }).click();
				await page.getByRole("menuitem", { name: order, exact: true }).click();
			}
			const size = page.getByRole("textbox", { name: "Size", exact: true });
			await size.fill("1");
			await size.blur();
			for (const status of ["loading", "stale", "error"]) {
				await page.getByRole("button", { name: `Market ${status}`, exact: true }).click();
				await expect(form).not.toContainText(passive);
				await expect(size).toHaveValue("1");
				if (
					["Market", "Stop Market", "Stop Limit", "Take Profit Market", "Take Profit Limit", "TWAP"].includes(order)
				) {
					const submit = form.getByRole("button", { name: desktop ? "Place Long Order" : "Long", exact: true });
					await expect(submit).toBeDisabled();
				}
				await page.getByRole("button", { name: "Market success", exact: true }).click();
				await expect(form).not.toContainText(passive);
				await expect(size).toHaveValue("1");
			}
		}
		if (desktop) {
			await form.getByRole("button", { name: "Advanced order types", exact: true }).click();
			await page.getByRole("menuitem", { name: "Stop Market", exact: true }).click();
		} else await selectOrder(page, "Stop Market");
		const reduceOnly = form.getByRole("checkbox", { name: "Reduce Only", exact: true });
		await reduceOnly.check();
		await expect(form).toContainText("Open a position before placing a trigger order");
		await page.getByRole("button", { name: "Positions pending", exact: true }).click();
		await expect(form).not.toContainText("Open a position before placing a trigger order", { timeout: 500 });
		await expect(form.getByRole("button", { name: desktop ? "Place Long Order" : "Long", exact: true })).toBeDisabled();
		await page.getByRole("button", { name: "Positions pending", exact: true }).click();
		await expect(form).toContainText("Open a position before placing a trigger order");
		await reduceOnly.uncheck();
		if (desktop) await form.getByRole("button", { name: "Market", exact: true }).click();
		else await selectOrder(page, "Market");
		const size = form.getByRole("textbox", { name: "Size", exact: true });
		await size.fill("");
		await size.blur();
		await expect(form).toContainText("Enter size");
		await expect(form.getByText("Enter size", { exact: true })).toHaveCount(1);
		await page.getByRole("button", { name: "Market stale", exact: true }).click();
		await expect(form).not.toContainText("Enter size", { timeout: 500 });
		await page.getByRole("button", { name: "Market success", exact: true }).click();
		await expect(form).toContainText("Enter size");
		await size.fill("1");
		await size.blur();
		await expect(form).not.toContainText("Enter size", { timeout: 500 });
		for (const status of ["loading", "stale", "error"]) {
			await page.getByRole("button", { name: `Account ${status}`, exact: true }).click();
			await expect(form.getByRole("textbox", { name: "Size", exact: true })).toBeDisabled();
			await expect(form).not.toContainText(passive);
			await expect(
				form.getByRole("button", { name: desktop ? "Place Long Order" : "Long", exact: true }),
			).toBeDisabled();
			await page.getByRole("button", { name: "Account success", exact: true }).click();
		}
		const violations = await page.evaluate(() => {
			const audit = (window as unknown as { quietAudit: { failures: string[]; observer: MutationObserver } })
				.quietAudit;
			audit.observer.disconnect();
			return audit.failures;
		});
		expect(violations).toEqual([]);
		await expect(page.getByRole("status", { name: "Captured orders", exact: true })).toHaveText("[]");
		await page.screenshot({ path: test.info().outputPath(`quiet-${desktop ? "desktop" : "mobile"}.png`) });
	});
}
