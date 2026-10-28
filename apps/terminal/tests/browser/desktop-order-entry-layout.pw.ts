import { expect, type Locator, type Page, test } from "@playwright/test";

const labels = {
	en: {
		orders: [
			"Market",
			"Limit",
			"Stop Market",
			"Stop Limit",
			"Take Profit Market",
			"Take Profit Limit",
			"TWAP",
			"Scale",
		],
		advanced: "Advanced order types",
		tpSl: "Take Profit / Stop Loss",
		tp: "Take Profit",
		sl: "Stop Loss",
		size: "Size",
		slReturn: "Stop loss return",
		unit: "Stop loss return unit",
		settings: "Advanced Settings",
		trigger: "Trigger Price (USDC)",
		stop: "Max Price (USDC)",
		tpReturn: "Take profit return",
		start: "Start Price",
		end: "End Price",
	},
	zh: {
		orders: ["市价", "限价", "止损市价", "止损限价", "止盈市价", "止盈限价", "TWAP", "分段订单"],
		advanced: "专业委托类型",
		tpSl: "止盈 / 止损",
		tp: "止盈",
		sl: "止损",
		size: "数量",
		slReturn: "止损收益",
		unit: "止损收益单位",
		settings: "高级设置",
		trigger: "触发价 (USDC)",
		stop: "最高价 (USDC)",
		tpReturn: "止盈收益",
		start: "起始价",
		end: "结束价格",
	},
} as const;

async function openFixture(page: Page, locale: keyof typeof labels) {
	await page.goto("/mobile-trade-all-orders.html?quiet-audit");
	const theme = page.getByRole("button", { name: "Theme", exact: true });
	if ((await theme.getAttribute("aria-pressed")) === "true") await theme.click();
	await expect(page.locator("html")).toHaveClass(/\blight\b/);
	await page.getByRole("button", { name: locale === "en" ? "English" : "中文", exact: true }).click();
	await expect(page.locator('[data-slot="trade-panel-header"]')).toBeVisible();
}

async function chooseOrder(page: Page, order: number, locale: keyof typeof labels) {
	const header = page.locator('[data-slot="trade-panel-header"]');
	if (order < 2) await header.getByRole("button", { name: labels[locale].orders[order], exact: true }).click();
	else {
		await header.getByRole("button", { name: labels[locale].advanced, exact: true }).click();
		await page.getByRole("menuitem", { name: labels[locale].orders[order], exact: true }).click();
	}
}

async function panelGeometry(page: Page) {
	return page.locator("[data-panel]").evaluateAll((panels) =>
		panels.map((panel) => {
			const rect = panel.getBoundingClientRect();
			return { id: panel.getAttribute("data-panel"), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
		}),
	);
}

async function expectPanelFits(page: Page) {
	await expect
		.poll(() =>
			page.locator('[data-panel="tradingInterface"]').evaluate((panel) => {
				const body = panel.querySelector('[data-slot="trade-panel-body"]');
				const fields = panel.querySelector('[data-slot="trade-panel-fields"]');
				const footer = panel.querySelector('[data-slot="trade-panel-footer"]');
				const header = panel.querySelector('[data-slot="trade-panel-header"]');
				if (!body || !fields || !footer || !header) throw new Error("Missing actual order-entry regions");
				const bounds = panel.getBoundingClientRect();
				const fieldBounds = fields.getBoundingClientRect();
				const failures: string[] = [];
				for (const [name, region] of [
					["body", body],
					["fields", fields],
				] as const) {
					if (region.scrollHeight > region.clientHeight + 1)
						failures.push(`${name} vertical overflow ${region.scrollHeight - region.clientHeight}`);
					if (region.scrollWidth > region.clientWidth + 1) failures.push(`${name} horizontal overflow`);
				}
				if (header.getBoundingClientRect().bottom > fieldBounds.top + 1) failures.push("header overlaps fields");
				if (fieldBounds.bottom > footer.getBoundingClientRect().top + 1) failures.push("fields overlap footer");
				if (footer.getBoundingClientRect().bottom > bounds.bottom + 1) failures.push("footer below panel");
				for (const control of fields.querySelectorAll<HTMLElement>(
					'input[data-slot="input"], [role="combobox"], label',
				)) {
					const rect = control.getBoundingClientRect();
					if (rect.width < 2 || rect.height < 2 || getComputedStyle(control).position === "absolute") continue;
					if (rect.top < fieldBounds.top - 1 || rect.bottom > fieldBounds.bottom + 1)
						failures.push(`clipped ${control.getAttribute("aria-label") ?? control.textContent}`);
				}
				return failures;
			}),
		)
		.toEqual([]);
}

async function expectHitTarget(control: Locator) {
	await expect(control).toBeInViewport();
	expect(
		await control.evaluate((element) => {
			const rect = element.getBoundingClientRect();
			return [rect.top + 1, rect.bottom - 1].every((y) => {
				const hit = document.elementFromPoint(rect.left + rect.width / 2, y);
				return element === hit || (hit !== null && element.contains(hit));
			});
		}),
	).toBe(true);
}

async function expectOptionSpacing(page: Page, expectedGap: number, expectedHeight: number) {
	await expect
		.poll(() =>
			page.locator('[data-slot="trade-order-options"] label').evaluateAll((labels) => {
				const visible = labels
					.filter((label) => label.getClientRects().length > 0)
					.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
				if (visible.length < 2) return null;
				const first = visible[0].getBoundingClientRect();
				const second = visible[1].getBoundingClientRect();
				return { gap: second.top - first.bottom, height: first.height };
			}),
		)
		.toEqual({ gap: expectedGap, height: expectedHeight });
}

async function expectOptionHitAreasFillTheGap(page: Page, gap: number) {
	await expect
		.poll(() =>
			page.locator('[data-slot="trade-order-options"] label').evaluateAll((labels) => {
				const visible = labels
					.filter((label) => label.getClientRects().length > 0)
					.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
				if (visible.length < 2) return null;
				const misses: string[] = [];
				const heights = visible.map((label, index) => {
					const rect = label.getBoundingClientRect();
					const control = label.querySelector('[role="checkbox"]');
					if (!control) {
						misses.push(`${index}: no control`);
						return null;
					}
					const controlRect = control.getBoundingClientRect();
					const controlX = controlRect.left + controlRect.width / 2;
					const labelX = rect.left + rect.width / 2;
					const probes: Array<[string, number, number, Element]> = [
						["control center", controlX, controlRect.top + controlRect.height / 2, control],
						["control top", controlX, controlRect.top + 1, control],
						["control bottom", controlX, controlRect.bottom - 1, control],
					];
					if (index > 0) {
						probes.push(["label above", labelX, rect.top - 3, label], ["control above", controlX, rect.top - 3, label]);
					}
					if (index < visible.length - 1) {
						probes.push(
							["label below", labelX, rect.bottom + 3, label],
							["control below", controlX, rect.bottom + 3, label],
						);
					}
					for (const [name, x, y, owner] of probes) {
						const hit = document.elementFromPoint(x, y);
						if (!hit || !(hit === owner || owner.contains(hit))) misses.push(`${index}: ${name}`);
					}
					return {
						label: Number.parseFloat(getComputedStyle(label, "::after").height) - rect.height,
						control: Number.parseFloat(getComputedStyle(control, "::after").height),
					};
				});
				return {
					misses,
					labelExtensions: [...new Set(heights.map((height) => height?.label))],
					controlHeights: [...new Set(heights.map((height) => height?.control))],
					rowPitch: visible[1].getBoundingClientRect().top - visible[0].getBoundingClientRect().top,
				};
			}),
		)
		.toEqual({ misses: [], labelExtensions: [gap], controlHeights: [20 + gap], rowPitch: 20 + gap });
}

test.beforeEach(async ({ page }) => {
	page.on("pageerror", (error) => {
		throw error;
	});
	await page.route("**/*", (route) =>
		new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
	);
});

test("keeps shared option spacing aligned with the responsive touch contract", async ({ page }) => {
	await page.setViewportSize({ width: 1400, height: 1330 });
	await openFixture(page, "en");
	await expectOptionSpacing(page, 8, 20);
	await expectOptionHitAreasFillTheGap(page, 8);
	expect((await probeNearestOptionOwner(page, '[data-slot="trade-order-options"]:visible')).violations).toEqual({});

	await page.setViewportSize({ width: 375, height: 666 });
	await expectOptionSpacing(page, 8, 20);
	await expectOptionHitAreasFillTheGap(page, 8);
	expect((await probeNearestOptionOwner(page, '[data-slot="trade-order-options"]:visible')).violations).toEqual({});
});

async function probeNearestOptionOwner(page: Page, container: string) {
	return page.locator(container).evaluate((root) => {
		const labels = [...root.querySelectorAll("label")].filter((label) => label.getClientRects().length > 0);
		const rects = labels.map((label) => label.getBoundingClientRect());
		const distance = (x: number, y: number, rect: DOMRect) =>
			Math.hypot(Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom));
		const left = Math.min(...rects.map((rect) => rect.left)) - 6;
		const right = Math.max(...rects.map((rect) => rect.right)) + 6;
		const top = Math.min(...rects.map((rect) => rect.top)) - 6;
		const bottom = Math.max(...rects.map((rect) => rect.bottom)) + 6;
		const violations: Record<string, number> = {};
		const firstViolations: Record<string, string> = {};
		for (let y = top; y <= bottom; y += 2) {
			for (let x = left; x <= right; x += 2) {
				const hit = document.elementFromPoint(x, y);
				const owner = hit ? labels.findIndex((label) => label.contains(hit)) : -1;
				if (owner < 0) continue;
				const distances = rects.map((rect) => distance(x, y, rect));
				const nearest = Math.min(...distances);
				if (distances[owner] <= nearest + 0.5) continue;
				const pair = `${labels[owner].textContent} takes ${labels[distances.indexOf(nearest)].textContent}`;
				violations[pair] = (violations[pair] ?? 0) + 1;
				firstViolations[pair] ??= `owner+${Math.round((x - rects[owner].left) * 10) / 10},${Math.round((y - rects[owner].top) * 10) / 10} rects ${rects.map((rect) => [rect.left, rect.top, rect.right, rect.bottom].join("/")).join(" ")}`;
			}
		}
		const controlHitHeights = labels.map((label) => {
			const control = label.querySelector('[role="checkbox"]');
			return control ? getComputedStyle(control, "::after").height : null;
		});
		return { labels: labels.length, violations, firstViolations, controlHitHeights: [...new Set(controlHitHeights)] };
	});
}

test("keeps TWAP option hit areas with their nearest option", async ({ page }) => {
	for (const viewport of [
		{ width: 1001, height: 900, hitHeight: "28px" },
		{ width: 1400, height: 1330, hitHeight: "28px" },
		{ width: 1545, height: 900, hitHeight: "28px" },
		{ width: 375, height: 666, hitHeight: "24px" },
	]) {
		await page.setViewportSize({ width: 1400, height: 1330 });
		await openFixture(page, "en");
		for (const locale of ["en", "zh"] as const) {
			await page.setViewportSize({ width: 1400, height: 1330 });
			await page.getByRole("button", { name: locale === "en" ? "English" : "中文", exact: true }).click();
			await chooseOrder(page, 6, locale);
			await page.setViewportSize(viewport);
			const fields = page.locator('[data-slot="trade-twap-fields"]:visible');
			await expect(fields).toHaveCount(1);
			await expect(fields).toBeInViewport();
			expect(await probeNearestOptionOwner(page, '[data-slot="trade-twap-fields"]:visible'), `${viewport.width}px ${locale}`).toEqual({
				labels: 3,
				violations: {},
				firstViolations: {},
				controlHitHeights: [viewport.hitHeight],
			});
		}
	}
});

test("fits the reported 1400x1330 Chinese empty Limit with newly expanded TP/SL", async ({ page }) => {
	await page.setViewportSize({ width: 1400, height: 1330 });
	await openFixture(page, "zh");
	await chooseOrder(page, 1, "zh");
	const geometry = await panelGeometry(page);
	await expect(page.getByRole("textbox", { name: labels.zh.size, exact: true })).toHaveValue("");
	await page.getByRole("checkbox", { name: labels.zh.tpSl, exact: true }).check();
	await expect(page.locator('[data-slot="trade-tpsl-input-frame"]')).toHaveCount(4);
	await expectPanelFits(page);
	await expectHitTarget(page.getByRole("textbox", { name: labels.zh.slReturn, exact: true }));
	expect(await panelGeometry(page)).toEqual(geometry);
	await test.info().attach("empty-limit-tpsl", { body: await page.screenshot(), contentType: "image/png" });
});

for (const viewport of [
	{ width: 1001, height: 900 },
	{ width: 1400, height: 1330 },
	{ width: 1420, height: 900 },
	{ width: 1421, height: 900 },
	{ width: 1545, height: 900 },
]) {
	test(`fits actual forms, TP/SL estimates and field feedback at ${viewport.width}px`, async ({ page }) => {
		test.setTimeout(90_000);
		await page.setViewportSize(viewport);
		await openFixture(page, "en");
		const geometry = await panelGeometry(page);
		for (const locale of ["en", "zh"] as const) {
			await page.getByRole("button", { name: locale === "en" ? "English" : "中文", exact: true }).click();
			for (let order = 0; order < labels[locale].orders.length; order++) {
				await page.getByRole("button", { name: "Reset", exact: true }).click();
				await chooseOrder(page, order, locale);
				await expectPanelFits(page);
				expect(await panelGeometry(page)).toEqual(geometry);
			}
			await chooseOrder(page, 6, locale);
			await page.getByRole("checkbox", { name: labels[locale].settings, exact: true }).check();
			for (const [name, value] of [
				[labels[locale].size, "1"],
				[labels[locale].trigger, "110"],
				[labels[locale].stop, "120"],
			]) {
				await page.getByRole("textbox", { name, exact: true }).fill(value);
			}
			await expectPanelFits(page);
			if (viewport.width === 1400 && locale === "zh") {
				await page.screenshot({ path: test.info().outputPath("desktop-twap-advanced.png"), animations: "disabled" });
			}
			await page.getByRole("button", { name: "Reset", exact: true }).click();
			await chooseOrder(page, 7, locale);
			for (const name of [labels[locale].start, labels[locale].end]) {
				await page.getByRole("textbox", { name, exact: true }).fill("100");
			}
			await page.getByRole("textbox", { name: labels[locale].size, exact: true }).fill("1");
			await expectPanelFits(page);
			await page.getByRole("button", { name: "Reset", exact: true }).click();
			for (const order of [0, 1]) {
				await chooseOrder(page, order, locale);
				await page.getByRole("checkbox", { name: labels[locale].tpSl, exact: true }).check();
				await expectPanelFits(page);
				await page.getByRole("textbox", { name: labels[locale].size, exact: true }).fill("1");
				await page.getByRole("textbox", { name: labels[locale].tp, exact: true }).fill("110");
				await page.getByRole("textbox", { name: labels[locale].sl, exact: true }).fill("95");
				await expect(page.locator('[data-slot="trade-tpsl-pnl"]')).toHaveCount(2);
				for (const pnl of await page.locator('[data-slot="trade-tpsl-pnl"]').all()) {
					await expect(pnl).toContainText(/\$[0-9]+/);
					expect(
						await pnl.evaluate((node) => {
							const bounds = node.getBoundingClientRect();
							const parent = node.parentElement?.getBoundingClientRect();
							const form = node.closest("[data-fixture-form]")?.getBoundingClientRect();
							return (
								!!parent &&
								!!form &&
								node.scrollWidth <= node.clientWidth + 1 &&
								bounds.left >= parent.left - 1 &&
								bounds.right <= parent.right + 1 &&
								bounds.left >= form.left - 1 &&
								bounds.right <= form.right + 1
							);
						}),
					).toBe(true);
				}
				await expectPanelFits(page);
				await expectHitTarget(page.getByRole("textbox", { name: labels[locale].slReturn, exact: true }));
				if (viewport.width === 1400 && locale === "zh" && order === 1) {
					await page.screenshot({ path: test.info().outputPath("desktop-limit-tpsl.png"), animations: "disabled" });
				}
				const returnUnit = page.getByRole("combobox", { name: labels[locale].unit, exact: true });
				await returnUnit.click();
				await expect(returnUnit).toHaveAttribute("aria-expanded", "true");
				await returnUnit.press("Escape");
				await expect(returnUnit).toHaveAttribute("aria-expanded", "false");
				await page.getByRole("textbox", { name: labels[locale].tpReturn, exact: true }).fill("0");
				await page.getByRole("textbox", { name: labels[locale].tpReturn, exact: true }).blur();
				await expectPanelFits(page);
				await page.getByRole("textbox", { name: labels[locale].tp, exact: true }).fill("110");
				await page.getByRole("textbox", { name: labels[locale].size, exact: true }).fill("0.001");
				await page.getByRole("textbox", { name: labels[locale].size, exact: true }).blur();
				await expectPanelFits(page);
				await page.getByRole("textbox", { name: labels[locale].size, exact: true }).fill("20");
				await page.getByRole("textbox", { name: labels[locale].size, exact: true }).blur();
				await expectPanelFits(page);
				await page.getByRole("textbox", { name: labels[locale].size, exact: true }).fill("1");
				await page.getByRole("textbox", { name: labels[locale].tp, exact: true }).fill("90");
				await page.getByRole("textbox", { name: labels[locale].sl, exact: true }).fill("110");
				await expect(page.locator('[data-fixture-form] [role="alert"]')).toHaveCount(2);
				await expectPanelFits(page);
				expect(await panelGeometry(page)).toEqual(geometry);
				await page.getByRole("checkbox", { name: labels[locale].tpSl, exact: true }).uncheck();
				await page.getByRole("textbox", { name: labels[locale].size, exact: true }).fill("");
			}
		}
		await expect(page.getByRole("status", { name: "Captured orders", exact: true })).toHaveText("[]");
	});
}

test("keeps one body scroll owner and reachable fields and action in a shortened desktop grid", async ({ page }) => {
	await page.setViewportSize({ width: 1001, height: 900 });
	await openFixture(page, "en");
	await chooseOrder(page, 1, "en");
	await page.getByRole("checkbox", { name: labels.en.tpSl, exact: true }).check();
	await page.getByRole("textbox", { name: labels.en.size, exact: true }).fill("1");
	await page.getByRole("textbox", { name: labels.en.tp, exact: true }).fill("110");
	await page.getByRole("textbox", { name: labels.en.sl, exact: true }).fill("95");
	const resize = await page.locator('[data-panel="chart"] .react-resizable-handle-s').boundingBox();
	if (!resize) throw new Error("Missing grid resize control");
	await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
	await page.mouse.down();
	await page.mouse.move(resize.x + resize.width / 2, resize.y - 200, { steps: 8 });
	await page.mouse.up();
	const header = page.locator('[data-slot="trade-panel-header"]');
	const before = await header.boundingBox();
	const body = page.locator('[data-slot="trade-panel-body"]');
	expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight + 1)).toBe(true);
	expect(
		await page.locator('[data-slot="trade-panel-fields"]').evaluate((element) => getComputedStyle(element).overflowY),
	).not.toMatch(/auto|scroll/);
	await body.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	await expectHitTarget(page.getByRole("textbox", { name: labels.en.slReturn, exact: true }));
	await expectHitTarget(
		page.locator('[data-slot="trade-panel-footer"]').getByRole("button", { name: "Place Long Order", exact: true }),
	);
	expect(await header.boundingBox()).toEqual(before);
	await chooseOrder(page, 7, "en");
	await expect(header.getByRole("button", { name: "Limit", exact: true })).toBeInViewport();
	await expect(page.getByRole("status", { name: "Captured orders", exact: true })).toHaveText("[]");
});
