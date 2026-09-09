import { expect, type Page, test } from "@playwright/test";

async function panelHeight(page: Page) {
	return page.locator('[data-panel="tradingInterface"]').evaluate((element) => element.getBoundingClientRect().height);
}

async function geometry(page: Page) {
	return page.locator("[data-panel]").evaluateAll((panels) => ({
		height: document.documentElement.scrollHeight,
		panels: panels.map((panel) => {
			const rect = panel.getBoundingClientRect();
			return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
		}),
	}));
}

async function settleLayout(page: Page) {
	await page.evaluate(
		() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
	);
}

async function expectFooterAtBottom(page: Page) {
	await expect
		.poll(async () =>
			page.locator('[data-panel="tradingInterface"]').evaluate((panel) => {
				const top = panel.querySelector('[data-slot="trade-panel-fields"]')?.getBoundingClientRect();
				const footer = panel.querySelector('[data-slot="trade-panel-footer"]');
				const lastRow = footer?.lastElementChild?.lastElementChild?.lastElementChild;
				if (!top || !footer || !lastRow) throw new Error("Missing trade panel sections");
				const fees = lastRow.getBoundingClientRect();
				const bounds = panel.getBoundingClientRect();
				const footerBounds = footer.getBoundingClientRect();
				return Math.max(
					Math.abs(bounds.bottom - fees.bottom - 12),
					Math.abs(footerBounds.bottom - bounds.bottom),
					Math.max(0, top.bottom - footerBounds.top),
				);
			}),
		)
		.toBeLessThanOrEqual(1);
}

async function expectFieldsReachable(page: Page) {
	const fields = page.locator('[data-slot="trade-panel-fields"]');
	const outerScroll = await page.evaluate(() => scrollY);
	await fields.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	await expect(page.getByRole("textbox", { name: "Last field", exact: true })).toBeInViewport();
	await page.getByRole("textbox", { name: "Last field", exact: true }).focus();
	await expect(page.getByRole("textbox", { name: "Last field", exact: true })).toBeFocused();
	await page.getByRole("textbox", { name: "Last field", exact: true }).press("Tab");
	await expect(page.getByRole("button", { name: "Connect Wallet", exact: true })).toBeFocused();
	expect(await page.evaluate(() => scrollY)).toBe(outerScroll);
}

const runtimeErrors: string[] = [];

test.beforeEach(async ({ page }) => {
	runtimeErrors.length = 0;
	page.on("pageerror", (error) => runtimeErrors.push(error.message));
});

test.afterEach(() => expect(runtimeErrors).toEqual([]));

for (const width of [1001, 1238, 1740]) {
	test(`keeps every panel stable through order-type and feedback changes at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 1305 });
		await page.goto("/trade-panel-layout.html");
		await expect(page.getByText("Fees", { exact: true })).toBeVisible();
		await expectFooterAtBottom(page);
		const initial = await geometry(page);
		const savedLayout = await page.evaluate(() => localStorage.getItem("trade-desktop-grid-layout-v11"));
		const lastField = await page.getByRole("textbox", { name: "Last field", exact: true }).elementHandle();
		for (const mode of ["limit", "market", "limit", "tall", "market", "limit"]) {
			await page.getByRole("button", { name: mode, exact: true }).click();
			await settleLayout(page);
			expect(await geometry(page)).toEqual(initial);
			await expectFooterAtBottom(page);
			await expectFieldsReachable(page);
			if (mode === "limit") await page.getByRole("textbox", { name: "Limit price", exact: true }).fill("100");
		}
		expect(await lastField?.evaluate((element) => element.isConnected)).toBe(true);
		await expect(page.getByRole("textbox", { name: "Limit price", exact: true })).toHaveValue("100");
		await page.getByRole("button", { name: "Toggle feedback", exact: true }).click();
		await settleLayout(page);
		expect(await geometry(page)).toEqual(initial);
		await expectFooterAtBottom(page);
		await page.getByRole("button", { name: "Connect Wallet", exact: true }).click();
		await expect(page.getByRole("status", { name: "Connection requests" })).toHaveText("1");
		expect(await page.evaluate(() => localStorage.getItem("trade-desktop-grid-layout-v11"))).toBe(savedLayout);
	});
}

test("keeps all controls reachable when requested-action feedback exceeds the panel height", async ({ page }) => {
	await page.setViewportSize({ width: 1238, height: 1305 });
	await page.goto("/trade-panel-layout.html");
	await expectFooterAtBottom(page);
	const initial = await geometry(page);
	await page.getByRole("button", { name: "tall", exact: true }).click();
	await page.getByRole("button", { name: "Toggle long feedback", exact: true }).click();
	await settleLayout(page);
	expect(await geometry(page)).toEqual(initial);
	await expectFieldsReachable(page);
	const body = page.locator('[data-slot="trade-panel-body"]');
	await body.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	await expect(page.getByText("Fees", { exact: true })).toBeInViewport();
	await page.getByRole("button", { name: "Connect Wallet", exact: true }).click();
	await expect(page.getByRole("status", { name: "Connection requests" })).toHaveText("1");
	expect(await geometry(page)).toEqual(initial);
	await page.getByRole("button", { name: "Toggle long feedback", exact: true }).click();
	await page.getByRole("button", { name: "market", exact: true }).click();
	await expectFooterAtBottom(page);
	expect(await geometry(page)).toEqual(initial);
});

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
	const userGeometry = await geometry(page);
	await page.getByRole("button", { name: "tall", exact: true }).click();
	await settleLayout(page);
	expect(await geometry(page)).toEqual(userGeometry);
	await expectFieldsReachable(page);
	await page.reload();
	await expect.poll(() => panelHeight(page)).toBe(userHeight);
	await expectFooterAtBottom(page);
});
