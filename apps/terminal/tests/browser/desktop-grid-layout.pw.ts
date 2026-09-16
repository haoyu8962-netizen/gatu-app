import { expect, type Page, test } from "@playwright/test";

type PanelBounds = { top: number; bottom: number; left: number; right: number; height: number; width: number };

async function bounds(page: Page): Promise<Record<string, PanelBounds>> {
	return page.locator("[data-panel]").evaluateAll((panels) =>
		Object.fromEntries(
			panels.map((panel) => {
				const rect = panel.getBoundingClientRect();
				return [
					panel.getAttribute("data-panel"),
					{
						top: rect.top,
						bottom: rect.bottom,
						left: rect.left,
						right: rect.right,
						height: rect.height,
						width: rect.width,
					},
				];
			}),
		),
	);
}

function stackedGaps(rects: Record<string, PanelBounds>) {
	return [
		rects.chart.bottom - rects.tradingInterface.bottom,
		rects.accountTable.top - rects.chart.bottom - 3,
		rects.marketData.top - rects.chart.bottom - 3,
		rects.accountInfo.top - rects.marketData.bottom - 3,
		rects.tradingInterface.left - rects.chart.right - 3,
		rects.marketData.left - rects.tradingInterface.left,
		rects.accountInfo.left - rects.tradingInterface.left,
		rects.accountTable.right - rects.chart.right,
	];
}

function sideBySideGaps(rects: Record<string, PanelBounds>) {
	return [
		rects.chart.bottom - rects.marketData.bottom,
		rects.chart.bottom - rects.tradingInterface.bottom,
		rects.accountTable.top - rects.accountInfo.top,
		rects.accountTable.bottom - rects.accountInfo.bottom,
		rects.accountTable.top - rects.chart.bottom - 3,
	];
}

async function expectAligned(page: Page) {
	const stacked = (page.viewportSize()?.width ?? 0) <= 1420;
	await expect
		.poll(async () => {
			const rects = await bounds(page);
			const gaps = stacked ? stackedGaps(rects) : sideBySideGaps(rects);
			return Math.max(...gaps.map((gap) => Math.abs(gap)));
		})
		.toBeLessThanOrEqual(1);
	const rects = Object.values(await bounds(page));
	for (let index = 0; index < rects.length; index++) {
		for (const second of rects.slice(index + 1)) {
			const first = rects[index];
			expect(
				first.right <= second.left ||
					second.right <= first.left ||
					first.bottom <= second.top ||
					second.bottom <= first.top,
			).toBe(true);
		}
	}
}

async function dragHandle(page: Page, panel: string, handle: string, dx: number, dy: number) {
	const target = page.locator(`[data-panel="${panel}"] .react-resizable-handle-${handle}`);
	await target.scrollIntoViewIfNeeded();
	const rect = await target.boundingBox();
	if (!rect) throw new Error("Missing resize handle");
	const x = rect.x + rect.width / 2;
	const y = rect.y + rect.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + dx, y + dy, { steps: 8 });
	await page.mouse.up();
}

const runtimeErrors: string[] = [];

test.beforeEach(async ({ page }) => {
	runtimeErrors.length = 0;
	page.on("pageerror", (error) => runtimeErrors.push(error.message));
	await page.setViewportSize({ width: 1545, height: 1391 });
	await page.goto("/desktop-grid-layout.html");
	await expect(page.locator('[data-panel="chart"]')).toBeVisible();
});

test.afterEach(() => expect(runtimeErrors).toEqual([]));

test("keeps trading geometry fixed while account content adapts across breakpoints", async ({ page }) => {
	await expectAligned(page);
	const initial = await bounds(page);
	const mounts = await page
		.locator("[data-mount-id]")
		.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-mount-id")));
	await page.getByRole("button", { name: "Expand trade" }).click();
	await expect
		.poll(() => page.locator('[data-slot="fixture-trade-scroll"]').evaluate((element) => element.scrollHeight))
		.toBe(850);
	expect(await bounds(page)).toEqual(initial);
	await expectAligned(page);
	await page.getByRole("button", { name: "Expand account" }).click();
	await expect.poll(async () => (await bounds(page)).accountInfo.height).toBeGreaterThan(729);
	await expectAligned(page);
	await page.getByRole("button", { name: "Contract content" }).click();
	await expect.poll(async () => (await bounds(page)).accountInfo.height).toBe(initial.accountInfo.height);
	await expect.poll(async () => (await bounds(page)).tradingInterface.height).toBe(initial.tradingInterface.height);
	for (const width of [1001, 1280, 1420, 1421, 1545]) {
		await page.setViewportSize({ width, height: 1391 });
		await expectAligned(page);
	}
	expect(
		await page
			.locator("[data-mount-id]")
			.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-mount-id"))),
	).toEqual(mounts);
});

test("resizes the shared area in both directions and restores user geometry without saving stretched content", async ({
	page,
}) => {
	const initial = await bounds(page);
	await dragHandle(page, "chart", "s", 0, 132);
	await expect.poll(async () => (await bounds(page)).chart.height).toBeGreaterThan(initial.chart.height + 90);
	await expectAligned(page);
	const expanded = await bounds(page);
	await dragHandle(page, "chart", "s", 0, -99);
	await expect.poll(async () => (await bounds(page)).chart.height).toBeLessThan(expanded.chart.height - 60);
	await expectAligned(page);
	const resized = await bounds(page);
	await page.getByRole("button", { name: "Expand trade" }).click();
	await expect
		.poll(() => page.locator('[data-slot="fixture-trade-scroll"]').evaluate((element) => element.scrollHeight))
		.toBe(850);
	expect(await bounds(page)).toEqual(resized);
	await page.reload();
	await expectAligned(page);
	await expect.poll(async () => (await bounds(page)).chart.height).toBe(resized.chart.height);
	await dragHandle(page, "chart", "e", -97, 0);
	await expect.poll(async () => (await bounds(page)).chart.width).toBeLessThan(resized.chart.width - 60);
	await expectAligned(page);
	const narrowed = await bounds(page);
	await page.reload();
	await expectAligned(page);
	await expect.poll(async () => (await bounds(page)).chart.width).toBe(narrowed.chart.width);
	await dragHandle(page, "chart", "e", 97, 0);
	await expectAligned(page);
	await expect.poll(async () => (await bounds(page)).chart.width).toBe(resized.chart.width);
});

test("stacks the right column at the medium breakpoint and resizes its boundaries independently", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1316, height: 1391 });
	await expectAligned(page);
	const initial = await bounds(page);
	expect(initial.tradingInterface.top).toBeLessThan(initial.marketData.top);
	expect(initial.marketData.top).toBeLessThan(initial.accountInfo.top);
	expect(Math.abs(initial.tradingInterface.height - 676.8)).toBeLessThanOrEqual(1);
	expect(Math.abs(initial.marketData.height - 670.2)).toBeLessThanOrEqual(1);
	expect(Math.abs(initial.accountTable.height - 459)).toBeLessThanOrEqual(1);
	expect(Math.abs(initial.tradingInterface.width - initial.marketData.width)).toBeLessThanOrEqual(1);
	expect(Math.abs(initial.chart.width - initial.accountTable.width)).toBeLessThanOrEqual(1);
	expect(initial.chart.width / initial.tradingInterface.width).toBeGreaterThan(2.4);
	await page.getByRole("button", { name: "Expand account" }).click();
	await expect.poll(async () => (await bounds(page)).accountInfo.height).toBeGreaterThan(729);
	await expectAligned(page);
	expect(Math.abs((await bounds(page)).accountTable.height - initial.accountTable.height)).toBeLessThanOrEqual(1);
	await page.getByRole("button", { name: "Contract content" }).click();
	await expect.poll(async () => (await bounds(page)).accountInfo.height).toBe(initial.accountInfo.height);
	await dragHandle(page, "chart", "s", 0, 66);
	await expect.poll(async () => (await bounds(page)).chart.height).toBeGreaterThan(initial.chart.height + 40);
	await expectAligned(page);
	const taller = await bounds(page);
	const initialOffset = initial.tradingInterface.height - initial.chart.height;
	expect(Math.abs(taller.tradingInterface.height - taller.chart.height - initialOffset)).toBeLessThanOrEqual(1);
	expect(Math.abs(taller.marketData.height - initial.marketData.height)).toBeLessThanOrEqual(1);
	await dragHandle(page, "marketData", "s", 0, 66);
	await expect.poll(async () => (await bounds(page)).marketData.height).toBeGreaterThan(taller.marketData.height + 40);
	await expectAligned(page);
	const deeperBook = await bounds(page);
	expect(Math.abs(deeperBook.chart.height - taller.chart.height)).toBeLessThanOrEqual(1);
	expect(Math.abs(deeperBook.accountTable.height - taller.accountTable.height)).toBeLessThanOrEqual(1);
	await dragHandle(page, "chart", "e", -95, 0);
	await expect.poll(async () => (await bounds(page)).chart.width).toBeLessThan(deeperBook.chart.width - 60);
	await expectAligned(page);
	const narrowed = await bounds(page);
	expect(narrowed.tradingInterface.width).toBeGreaterThan(deeperBook.tradingInterface.width + 60);
	await page.reload();
	await expectAligned(page);
	const restored = await bounds(page);
	expect(Math.abs(restored.chart.width - narrowed.chart.width)).toBeLessThanOrEqual(1);
	expect(Math.abs(restored.chart.height - narrowed.chart.height)).toBeLessThanOrEqual(1);
	expect(Math.abs(restored.marketData.height - narrowed.marketData.height)).toBeLessThanOrEqual(1);
	await page.setViewportSize({ width: 1545, height: 1391 });
	await expectAligned(page);
	expect((await bounds(page)).marketData.top).toBeLessThan((await bounds(page)).accountTable.top);
});
