import { expect, type Page, test } from "@playwright/test";

async function panelHeight(page: Page) {
	return page.locator('[data-panel="tradingInterface"]').evaluate((element) => element.getBoundingClientRect().height);
}

async function expectFooterAtBottom(page: Page) {
	await expect
		.poll(async () =>
			page.locator('[data-panel="tradingInterface"]').evaluate((panel) => {
				const sections = panel.querySelectorAll("[data-grid-content-part]");
				const top = sections[0].getBoundingClientRect();
				const footer = sections[1].getBoundingClientRect();
				const lastRow = sections[1].lastElementChild?.lastElementChild?.lastElementChild;
				if (!lastRow) throw new Error("Missing final summary row");
				const fees = lastRow.getBoundingClientRect();
				const bounds = panel.getBoundingClientRect();
				return Math.max(
					Math.abs(bounds.bottom - fees.bottom - 16),
					Math.abs(footer.bottom - bounds.bottom),
					Math.max(0, top.bottom - footer.top),
				);
			}),
		)
		.toBeLessThanOrEqual(1);
}

const runtimeErrors: string[] = [];

test.beforeEach(async ({ page }) => {
	runtimeErrors.length = 0;
	page.on("pageerror", (error) => runtimeErrors.push(error.message));
});

test.afterEach(() => expect(runtimeErrors).toEqual([]));

for (const width of [1001, 1238, 1740]) {
	test(`anchors Market and Limit summaries at ${width}px and shrinks after taller content`, async ({ page }) => {
		await page.setViewportSize({ width, height: 1305 });
		await page.goto("/trade-panel-layout.html");
		await expect(page.getByText("Fees", { exact: true })).toBeVisible();
		await expectFooterAtBottom(page);
		const initial = await panelHeight(page);
		await page.getByRole("button", { name: "limit", exact: true }).click();
		await expectFooterAtBottom(page);
		await page.getByRole("textbox", { name: "Limit price" }).fill("100");
		await page.getByRole("button", { name: "Connect Wallet", exact: true }).click();
		await expect(page.getByRole("status", { name: "Connection requests" })).toHaveText("1");
		await page.getByRole("button", { name: "Toggle feedback" }).click();
		await expectFooterAtBottom(page);
		await page.getByRole("button", { name: "tall", exact: true }).click();
		await expect.poll(() => panelHeight(page)).toBeGreaterThan(1100);
		await expectFooterAtBottom(page);
		await page.getByRole("button", { name: "Toggle feedback" }).click();
		await page.getByRole("button", { name: "market", exact: true }).click();
		await expect.poll(() => panelHeight(page)).toBe(initial);
		await expectFooterAtBottom(page);
		await page.getByRole("button", { name: "limit", exact: true }).click();
		await expect(page.getByRole("textbox", { name: "Limit price" })).toHaveValue("100");
	});
}

test("keeps fees at the bottom through manual grid expansion, contraction and reload", async ({ page }) => {
	await page.setViewportSize({ width: 1740, height: 1305 });
	await page.goto("/trade-panel-layout.html");
	await expectFooterAtBottom(page);
	const initial = await panelHeight(page);
	async function resize(dy: number) {
		const handle = page.locator('[data-panel="chart"] .react-resizable-handle-s');
		await handle.scrollIntoViewIfNeeded();
		const rect = await handle.boundingBox();
		if (!rect) throw new Error("Missing resize handle");
		const x = rect.x + rect.width / 2;
		const y = rect.y + rect.height / 2;
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x, y + dy, { steps: 8 });
		await page.mouse.up();
	}
	await resize(165);
	await expect.poll(() => panelHeight(page)).toBeGreaterThan(initial + 100);
	await expectFooterAtBottom(page);
	const expanded = await panelHeight(page);
	await resize(-99);
	await expect.poll(() => panelHeight(page)).toBeLessThan(expanded - 60);
	await expectFooterAtBottom(page);
	const userHeight = await panelHeight(page);
	await page.getByRole("button", { name: "tall", exact: true }).click();
	await expect.poll(() => panelHeight(page)).toBeGreaterThan(1100);
	await page.reload();
	await expect.poll(() => panelHeight(page)).toBe(userHeight);
	await expectFooterAtBottom(page);
});
