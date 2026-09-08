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

async function expectAligned(page: Page) {
	await expect
		.poll(async () => {
			const rects = await bounds(page);
			return Math.max(
				Math.abs(rects.chart.bottom - rects.marketData.bottom),
				Math.abs(rects.chart.bottom - rects.tradingInterface.bottom),
				Math.abs(rects.accountTable.top - rects.accountInfo.top),
				Math.abs(rects.accountTable.bottom - rects.accountInfo.bottom),
				Math.abs(rects.accountTable.top - rects.chart.bottom - 3),
			);
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

test("keeps paired panel edges aligned during natural content growth, contraction and breakpoint changes", async ({
	page,
}) => {
	await expectAligned(page);
	const initial = await bounds(page);
	const mounts = await page
		.locator("[data-mount-id]")
		.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-mount-id")));
	await page.getByRole("button", { name: "Expand trade" }).click();
	await expect.poll(async () => (await bounds(page)).tradingInterface.height).toBeGreaterThan(849);
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
	await expect.poll(async () => (await bounds(page)).tradingInterface.height).toBeGreaterThan(849);
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
