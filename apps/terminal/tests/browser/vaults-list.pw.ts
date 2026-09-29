import { expect, type Page, test } from "@playwright/test";

const LONG_NAME = "[ Systemic Strategies ] ♾️ HyperGrowth ♾️";

async function cardGeometry(page: Page) {
	return page.evaluate(() => {
		const panel = document.querySelector("section[data-vaults-state]");
		if (!panel) throw new Error("Missing Vault list");
		const panelBox = panel.getBoundingClientRect();
		const cards = [...panel.querySelectorAll<HTMLAnchorElement>('a[href^="/vaults/0x"]')].filter(
			(card) => card.getBoundingClientRect().width > 0,
		);
		return {
			pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
			panelOverflow: panel.scrollWidth - panel.clientWidth,
			cards: cards.map((card) => {
				const box = card.getBoundingClientRect();
				const style = getComputedStyle(card);
				const contentEdge = box.right - Number.parseFloat(style.borderRightWidth) - Number.parseFloat(style.paddingRight);
				const contentRight = Math.max(
					...[...card.querySelectorAll("*")]
						.filter((element) => !element.closest(".sr-only"))
						.map((element) => element.getBoundingClientRect().right),
				);
				return {
					name: card.querySelector("p")?.textContent ?? "",
					mark: card.querySelector('[aria-hidden="true"]')?.textContent ?? "",
					leftGap: box.left - panelBox.left,
					rightOverflow: box.right - panelBox.right,
					contentOverflow: contentRight - contentEdge,
				};
			}),
		};
	});
}

async function headerAlignment(page: Page) {
	return page.evaluate(() =>
		[...document.querySelectorAll<HTMLTableCellElement>("section[data-vaults-state] thead th")].map((header) => {
			const range = document.createRange();
			range.selectNodeContents(header);
			const text = range.getBoundingClientRect();
			const cell = header.getBoundingClientRect();
			const style = getComputedStyle(header);
			return {
				label: header.textContent?.trim() ?? "",
				startGap: text.left - cell.left - Number.parseFloat(style.paddingLeft),
				endGap: cell.right - Number.parseFloat(style.paddingRight) - text.right,
			};
		}),
	);
}

for (const locale of ["en", "zh"]) {
	for (const viewport of [
		{ width: 320, height: 640 },
		{ width: 375, height: 812 },
	]) {
		test(`keeps every Vault card and its values inside the list at ${viewport.width}px in ${locale}`, async ({
			page,
		}) => {
			const errors: string[] = [];
			page.on("pageerror", (error) => errors.push(error.message));
			await page.setViewportSize(viewport);
			await page.goto(`/vaults-list.html?locale=${locale}`);
			await expect(page.getByRole("link", { name: /HyperGrowth/ })).toBeVisible();

			const geometry = await cardGeometry(page);
			expect(geometry.cards).toHaveLength(4);
			expect(geometry.pageOverflow).toBeLessThanOrEqual(0);
			expect(geometry.panelOverflow).toBeLessThanOrEqual(0);
			for (const card of geometry.cards) {
				expect(card.leftGap, card.name).toBeGreaterThanOrEqual(0);
				expect(card.rightOverflow, card.name).toBeLessThanOrEqual(0);
				expect(card.contentOverflow, card.name).toBeLessThanOrEqual(0.5);
				expect(card.mark, card.name).toMatch(/^[\p{L}\p{N}]{1,2}$/u);
			}
			expect(geometry.cards.find((card) => card.name === LONG_NAME)?.mark).toBe("SY");
			expect(errors).toEqual([]);
		});
	}
}

for (const viewport of [
	{ width: 1001, height: 800 },
	{ width: 1440, height: 900 },
]) {
	test(`aligns each Vault table header with its column at ${viewport.width}px`, async ({ page }) => {
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.setViewportSize(viewport);
		await page.goto("/vaults-list.html");
		await expect(page.getByRole("link", { name: /HyperGrowth/ })).toBeVisible();

		const headers = await headerAlignment(page);
		expect(headers.map((header) => header.label)).toEqual([
			"Vault",
			"Leader",
			"APR",
			"TVL",
			"Your equity",
			"Performance",
			"Age",
		]);
		for (const header of headers.slice(0, 2)) expect(Math.abs(header.startGap), header.label).toBeLessThanOrEqual(1);
		for (const header of headers.slice(2)) expect(Math.abs(header.endGap), header.label).toBeLessThanOrEqual(1);
		expect(errors).toEqual([]);
	});
}
