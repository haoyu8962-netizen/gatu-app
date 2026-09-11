import { expect, type Page, test } from "@playwright/test";

async function geometry(page: Page) {
	return page.evaluate(() => {
		const split = document.querySelector('[data-slot="mobile-trade-order-split"]');
		const book = document.querySelector("[data-fixture-book]");
		const positions = document.querySelector("[data-fixture-positions]");
		const form = document.querySelector("[data-fixture-form]");
		const fields = document.querySelector('[data-slot="mobile-order-entry-scroll"]');
		if (!split || !book || !positions || !form || !fields) throw new Error("Missing mobile layout");
		return {
			height: split.getBoundingClientRect().height,
			bookBottom: book.getBoundingClientRect().bottom,
			formBottom: form.getBoundingClientRect().bottom,
			accountTop: positions.getBoundingClientRect().top,
			fieldsOverflow: fields.scrollHeight - fields.clientHeight,
			formOverflow: form.scrollHeight - form.clientHeight,
			fieldsScroll: fields.scrollTop,
		};
	});
}

for (const viewport of [
	{ width: 320, height: 568 },
	{ width: 393, height: 852 },
	{ width: 768, height: 1024 },
]) {
	test(`grows the mobile split with content using only page scrolling at ${viewport.width}px`, async ({ page }) => {
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.setViewportSize(viewport);
		await page.goto("/mobile-trade-height.html");
		const size = page.getByRole("textbox", { name: "Size", exact: true });
		await expect(size).toBeVisible();
		const input = await size.elementHandle();
		const initial = await geometry(page);
		for (const mode of ["limit", "twap", "tall", "market"]) {
			await page.getByRole("button", { name: mode, exact: true }).click();
			await expect
				.poll(async () => {
					const current = await geometry(page);
					return Math.max(
						Math.abs(current.bookBottom - current.formBottom),
						Math.abs(current.accountTop - current.formBottom),
						current.fieldsOverflow,
						current.formOverflow,
					);
				})
				.toBeLessThanOrEqual(1);
			await expect(size).toHaveValue("0.25");
			expect(await input?.evaluate((node) => node.isConnected)).toBe(true);
			if (mode === "twap") {
				await page.getByRole("checkbox", { name: "Advanced Settings", exact: true }).check();
				await page.getByRole("textbox", { name: "Trigger Price (USDC)", exact: true }).fill("110");
				await page.getByRole("textbox", { name: "Max Price (USDC)", exact: true }).fill("120");
				await expect(page.getByText("Activates when mark ≥ 110", { exact: true })).toBeVisible();
				expect((await geometry(page)).fieldsOverflow).toBeLessThanOrEqual(1);
				const twapHeight = (await geometry(page)).height;
				for (let tick = 0; tick < 3; tick++) {
					await page.getByRole("button", { name: "Quote", exact: true }).click();
					expect((await geometry(page)).height).toBe(twapHeight);
					await expect(page.getByRole("textbox", { name: "Trigger Price (USDC)", exact: true })).toHaveValue("110");
				}
			}
			if (mode === "tall") {
				expect((await geometry(page)).height).toBeGreaterThan(initial.height + 400);
				await size.focus();
				await page.keyboard.press("Tab");
				await expect(page.getByRole("textbox", { name: "Last field" })).toBeFocused();
				await expect(page.getByRole("textbox", { name: "Last field" })).toBeInViewport();
				expect((await geometry(page)).fieldsScroll).toBe(0);
				expect(await page.locator("[data-fixture-page]").evaluate((node) => node.scrollTop)).toBeGreaterThan(400);
			}
		}
		expect((await geometry(page)).height).toBe(initial.height);
		await page.getByRole("button", { name: "Feedback", exact: true }).click();
		expect((await geometry(page)).height).toBeGreaterThan(initial.height + 400);
		await page.getByRole("button", { name: "Connect Wallet", exact: true }).click();
		await expect(page.getByRole("status", { name: "Requests" })).toHaveText("1");
		expect((await geometry(page)).formOverflow).toBeLessThanOrEqual(1);
		await page.getByRole("button", { name: "Feedback", exact: true }).click();
		expect((await geometry(page)).height).toBe(initial.height);
		expect(errors).toEqual([]);
	});
}

test("preserves wrapped TWAP hint height when the mark reaches the trigger", async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 568 });
	await page.goto("/mobile-trade-height.html");
	await page.getByRole("button", { name: "twap", exact: true }).click();
	await page.getByRole("checkbox", { name: "Advanced Settings", exact: true }).check();
	await page.getByRole("textbox", { name: "Trigger Price (USDC)", exact: true }).fill("110000000000000");
	const hint = page.locator('[data-slot="mobile-order-entry-scroll"] p');
	await expect(hint).toContainText("Activates when mark");
	const before = await hint.evaluate((node) => ({
		height: node.getBoundingClientRect().height,
		line: parseFloat(getComputedStyle(node).lineHeight),
	}));
	expect(before.height).toBeGreaterThan(before.line);
	await page.getByRole("button", { name: "Quote", exact: true }).click();
	expect(await hint.evaluate((node) => node.getBoundingClientRect().height)).toBe(before.height);
	await expect(hint.locator("span:visible")).toHaveCount(0);
	await page.getByRole("button", { name: "Quote", exact: true }).click();
	expect(await hint.evaluate((node) => node.getBoundingClientRect().height)).toBe(before.height);
	await expect(hint.locator("span:visible")).toHaveText("Activates when mark ≤ 110000000000000");
	await expect(hint.locator('span[aria-hidden="false"]')).toHaveCount(1);
	await page.getByRole("button", { name: "Quote", exact: true }).click();
	expect(await hint.evaluate((node) => node.getBoundingClientRect().height)).toBe(before.height);
	await expect(hint.locator("span:visible")).toHaveCount(0);
	await expect(hint.locator('span[aria-hidden="false"]')).toHaveCount(0);
	await page.getByRole("textbox", { name: "Trigger Price (USDC)", exact: true }).fill("");
	await expect(hint).toHaveCount(0);
});

for (const width of [320, 393, 768]) {
	test(`keeps TWAP advanced options reachable and independent at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 852 });
		await page.goto("/mobile-trade-height.html");
		await page.getByRole("button", { name: "twap", exact: true }).click();
		const advanced = page.getByRole("checkbox", { name: "Advanced Settings", exact: true });
		const trigger = page.getByRole("textbox", { name: "Trigger Price (USDC)", exact: true });
		await expect(advanced).not.toBeChecked();
		await expect(trigger).toHaveCount(0);
		await page.getByRole("checkbox", { name: "Reduce Only", exact: true }).check();
		await expect(page.getByRole("checkbox", { name: "Randomize timing", exact: true })).toBeChecked();
		await advanced.check();
		await trigger.fill("110");
		await page.getByRole("textbox", { name: "Max Price (USDC)", exact: true }).fill("120");
		const input = await trigger.elementHandle();
		const expanded = await geometry(page);
		await advanced.uncheck();
		await expect(trigger).toHaveCount(0);
		await advanced.press("Tab");
		await expect(page.getByRole("textbox", { name: "Last field", exact: true })).toBeFocused();
		expect((await geometry(page)).height).toBeLessThanOrEqual(expanded.height);
		await page.getByRole("button", { name: "中文", exact: true }).click();
		await page.getByRole("checkbox", { name: "高级设置", exact: true }).check();
		await expect(page.getByRole("textbox", { name: "触发价 (USDC)", exact: true })).toHaveValue("110");
		expect(await input?.evaluate((node) => node.isConnected)).toBe(true);
		await expect(page.getByRole("checkbox", { name: "只减仓", exact: true })).toBeChecked();
		await page.getByRole("button", { name: "Side", exact: true }).click();
		await expect(page.getByRole("textbox", { name: "最低价 (USDC)", exact: true })).toHaveValue("120");
		const labels = page.locator('[data-slot="trade-twap-options"] label');
		const rects = await labels.evaluateAll((nodes) =>
			nodes.map((node) => {
				const rect = node.getBoundingClientRect();
				return {
					x: rect.x,
					y: rect.y,
					right: rect.right,
					bottom: rect.bottom,
					height: rect.height,
					overflow: node.scrollWidth - node.clientWidth,
				};
			}),
		);
		for (const rect of rects) {
			expect(rect.height).toBeGreaterThanOrEqual(32);
			expect(rect.overflow).toBeLessThanOrEqual(1);
		}
		expect(rects[0].right <= rects[1].x || rects[0].bottom <= rects[1].y).toBe(true);
		expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
		const current = await geometry(page);
		expect(current.fieldsOverflow).toBeLessThanOrEqual(1);
		expect(Math.abs(current.bookBottom - current.formBottom)).toBeLessThanOrEqual(1);
		expect(Math.abs(current.accountTop - current.formBottom)).toBeLessThanOrEqual(1);
	});
}
