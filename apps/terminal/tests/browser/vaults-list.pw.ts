import { expect, type Page, test } from "@playwright/test";

const LONG_NAME = "[ Systemic Strategies ] ♾️ HyperGrowth ♾️";
const LARGE_EQUITY = "$12,345,678.90";
const DETAIL_ADDRESS = "0x0000000000000000000000000000000000000101";

async function waitForFonts(page: Page) {
	await page.evaluate(async () => {
		await document.fonts.ready;
	});
}

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
			panelStartGutter: panelBox.left,
			panelEndGutter: window.innerWidth - panelBox.right,
			cards: cards.map((card) => {
				const box = card.getBoundingClientRect();
				const style = getComputedStyle(card);
				const contentEdge = box.right - Number.parseFloat(style.borderRightWidth) - Number.parseFloat(style.paddingRight);
				const contentRight = Math.max(
					...[...card.querySelectorAll("*")]
						.filter((element) => !element.closest(".sr-only"))
						.map((element) => element.getBoundingClientRect().right),
				);
				const name = card.querySelector("p");
				return {
					name: name?.textContent ?? "",
					nameHidden: !!name && (name.scrollWidth > name.clientWidth || name.scrollHeight > name.clientHeight),
					mark: card.querySelector('[aria-hidden="true"]')?.textContent ?? "",
					leftGap: box.left - panelBox.left,
					rightOverflow: box.right - panelBox.right,
					contentOverflow: contentRight - contentEdge,
					values: [...card.querySelectorAll("dd")].map((value) => value.textContent ?? ""),
					truncatedValues: [...card.querySelectorAll("dd")]
						.filter((value) => value.scrollWidth > value.clientWidth)
						.map((value) => value.textContent ?? ""),
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
		test(`keeps every Vault card and its full values inside the page gutter at ${viewport.width}px in ${locale}`, async ({
			page,
		}) => {
			const errors: string[] = [];
			page.on("pageerror", (error) => errors.push(error.message));
			await page.setViewportSize(viewport);
			await page.goto(`/vaults-list.html?locale=${locale}`);
			await expect(page.getByRole("link", { name: /HyperGrowth/ })).toBeVisible();
			await waitForFonts(page);

			const geometry = await cardGeometry(page);
			expect(geometry.cards).toHaveLength(4);
			expect(geometry.pageOverflow).toBeLessThanOrEqual(0);
			expect(geometry.panelOverflow).toBeLessThanOrEqual(0);
			expect(geometry.panelStartGutter).toBe(16);
			expect(geometry.panelEndGutter).toBe(16);
			for (const card of geometry.cards) {
				expect(card.leftGap, card.name).toBeGreaterThanOrEqual(0);
				expect(card.rightOverflow, card.name).toBeLessThanOrEqual(0);
				expect(card.contentOverflow, card.name).toBeLessThanOrEqual(0.5);
				expect(card.truncatedValues, card.name).toEqual([]);
				expect(card.nameHidden, card.name).toBe(false);
				expect(card.mark, card.name).toMatch(/^[\p{L}\p{N}]{1,2}$/u);
			}
			await expect(page.locator("section[data-vaults-state] h2")).toHaveCount(0);
			const longNameCard = geometry.cards.find((card) => card.name === LONG_NAME);
			expect(longNameCard?.mark).toBe("SY");
			expect(longNameCard?.values).toContain(LARGE_EQUITY);
			expect(errors).toEqual([]);
		});
	}
}

for (const viewport of [
	{ width: 320, height: 640 },
	{ width: 375, height: 812 },
]) {
	test(`shows the whole Vault detail, including its full address, inside the page gutter at ${viewport.width}px`, async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.setViewportSize(viewport);
		await page.goto("/vaults-list.html?view=detail");
		await expect(page.getByText(DETAIL_ADDRESS, { exact: true })).toBeVisible();
		await waitForFonts(page);

		const geometry = await page.evaluate((addressText) => {
			const panel = document.querySelector("article[data-vault-detail-state]");
			if (!panel) throw new Error("Missing Vault detail");
			const box = panel.getBoundingClientRect();
			const hidesContent = (element: Element) => {
				const style = getComputedStyle(element);
				const clips = style.overflowX === "hidden" || style.overflowX === "clip" || style.textOverflow === "ellipsis";
				return clips && element.scrollWidth > element.clientWidth;
			};
			const address = [...panel.querySelectorAll("bdi")].find((element) => element.textContent === addressText);
			if (!address?.parentElement) throw new Error("Missing Vault address");
			const addressBox = address.parentElement.getBoundingClientRect();
			const chart = panel.querySelector("[data-vault-performance-chart]");
			const caption = chart?.querySelector("figcaption")?.getBoundingClientRect();
			const plot = chart?.querySelector("svg")?.getBoundingClientRect();
			if (!caption || !plot) throw new Error("Missing Vault chart");
			return {
				pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
				panelOverflow: panel.scrollWidth - panel.clientWidth,
				panelStartGutter: box.left,
				panelEndGutter: window.innerWidth - box.right,
				addressHidden: hidesContent(address.parentElement),
				addressOutsidePanel: addressBox.right - box.right,
				captionOverPlot: caption.bottom - plot.top,
				hiddenContent: [...panel.querySelectorAll("*")]
					.filter((element) => !element.closest(".sr-only") && hidesContent(element))
					.map((element) => element.textContent?.trim().slice(0, 60) ?? ""),
			};
		}, DETAIL_ADDRESS);
		expect(geometry.pageOverflow).toBeLessThanOrEqual(0);
		expect(geometry.panelOverflow).toBeLessThanOrEqual(0);
		expect(geometry.panelStartGutter).toBe(16);
		expect(geometry.panelEndGutter).toBe(16);
		expect(geometry.addressHidden).toBe(false);
		expect(geometry.addressOutsidePanel).toBeLessThanOrEqual(0);
		expect(geometry.captionOverPlot).toBeLessThanOrEqual(0);
		expect(geometry.hiddenContent).toEqual([]);
		expect(errors).toEqual([]);
	});
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
		await waitForFonts(page);

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
