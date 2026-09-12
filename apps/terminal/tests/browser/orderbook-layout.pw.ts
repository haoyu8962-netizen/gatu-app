import { expect, test } from "@playwright/test";

const fixtures = [
	{ view: "desktop", width: 280, height: 677, prefix: "orderbook", rowHeight: 23, gap: 2 },
	{ view: "compact", width: 164, height: 425, prefix: "compact-orderbook", rowHeight: 24, gap: 4 },
	{ view: "split", width: 390, height: 425, prefix: "split-orderbook", rowHeight: 23, gap: 2 },
] as const;

for (const fixture of fixtures) {
	test(`${fixture.view} fills resized ladders with complete, selectable price text`, async ({ page }) => {
		await page.goto("/orderbook-layout.html");
		await page.waitForFunction(() => typeof window.setOrderbookLayoutFixture === "function");
		for (const height of [fixture.height, fixture.height - 0.5, fixture.height + 25, 1000, fixture.height - 1]) {
			await page.evaluate((options) => window.setOrderbookLayoutFixture(options), { ...fixture, height });
			for (const mode of fixture.view === "compact" ? ["both", "asks", "bids"] : ["both"]) {
				if (fixture.view === "compact") await page.locator(`button[data-mode="${mode}"]`).click();
				await expect
					.poll(async () =>
						page.evaluate(
							({ prefix, rowHeight, gap, mode }) => {
								const sides = mode === "both" ? ["asks", "bids"] : [mode];
								return sides.flatMap((side) => {
									const ladder = document.querySelector<HTMLElement>(`[data-slot="${prefix}-${side}"]`);
									if (!ladder) return ["missing ladder"];
									const bounds = ladder.getBoundingClientRect();
									const children = [...ladder.children] as HTMLElement[];
									const rects = children.map((child) => child.getBoundingClientRect()).sort((a, b) => a.top - b.top);
									const first = rects[0];
									const last = rects.at(-1);
									if (!first || !last) return ["missing rows"];
									const failures: string[] = [];
									if (bounds.width <= 0) failures.push("invisible ladder");
									if (Math.abs(first.top - bounds.top) > 1 || Math.abs(last.bottom - bounds.bottom) > 1)
										failures.push("unfilled edge");
									if (rects.length !== Math.floor((bounds.height + gap) / (rowHeight + gap)))
										failures.push("incorrect complete-row count");
									if (rects.some((rect) => rect.height < rowHeight - 0.1)) failures.push("unreadable row height");
									if (rects.some((rect) => rect.top < bounds.top - 0.1 || rect.bottom > bounds.bottom + 0.1))
										failures.push("clipped row");
									if (rects.some((rect) => Math.abs(rect.height - first.height) > 0.1))
										failures.push("unequal row heights");
									if (rects.slice(1).some((rect, index) => Math.abs(rect.top - rects[index].bottom - gap) > 0.1))
										failures.push("stretched gap");
									for (const button of ladder.querySelectorAll<HTMLButtonElement>("button")) {
										const rect = button.getBoundingClientRect();
										if (button.disabled || getComputedStyle(button).visibility !== "visible")
											failures.push("complete price unavailable");
										const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
										let node = walker.nextNode();
										while (node) {
											if (node.textContent?.trim()) {
												const range = document.createRange();
												range.selectNodeContents(node);
												const text = range.getBoundingClientRect();
												if (
													text.height <= 0 ||
													text.top < Math.max(bounds.top, rect.top) - 0.1 ||
													text.bottom > Math.min(bounds.bottom, rect.bottom) + 0.1
												)
													failures.push(`clipped text: ${node.textContent}`);
											}
											node = walker.nextNode();
										}
									}
									const anchor =
										prefix !== "split-orderbook" && side === "asks"
											? last.bottom - bounds.bottom
											: first.top - bounds.top;
									if (Math.abs(anchor) > 1) failures.push("best price moved from anchor");
									return failures;
								});
							},
							{ ...fixture, mode },
						),
					)
					.toEqual([]);
			}
		}
		await expect(page.locator(`[data-slot^="${fixture.prefix}-"] button:disabled`)).toHaveCount(0);

		const enabled = page.locator(`[data-slot="${fixture.prefix}-bids"] button:enabled`).first();
		await enabled.click();
		await expect.poll(() => page.evaluate(() => window.getOrderbookLayoutSelectedPrice())).toBe("99");
		const edge = page.locator(`[data-slot="${fixture.prefix}-bids"] button:enabled`).last();
		await edge.focus();
		await edge.press("Enter");
		const selected = await page.evaluate(() => window.getOrderbookLayoutSelectedPrice());
		expect(selected).not.toBeNull();
		const displayedPrice = (await edge.getAttribute("aria-label"))?.match(/Use ([\d.]+) as limit price/u)?.[1];
		expect(displayedPrice).toBeDefined();
		expect(Number(displayedPrice)).toBe(Number(selected));
	});
}

test("desktop refresh and recovery keep pending ladders quiet and stable", async ({ page }) => {
	await page.goto("/orderbook-layout.html");
	await page.waitForFunction(() => typeof window.setOrderbookLayoutFixture === "function");
	await page.evaluate(() =>
		window.setOrderbookLayoutFixture({ view: "desktop", height: 677, width: 280, pending: true }),
	);
	const spread = page.locator('[data-slot="orderbook-spread"]');
	const asks = page.locator('[data-slot="orderbook-asks"]');
	const bids = page.locator('[data-slot="orderbook-bids"]');
	await expect(page.locator('[aria-busy="true"]')).toHaveCount(1);
	await expect(page.locator("output.sr-only")).toHaveCSS("clip-path", "inset(50%)");
	await expect(asks.locator('[data-slot="orderbook-placeholder-row"]')).not.toHaveCount(0);
	const bounds = await spread.boundingBox();
	for (const state of ["pending", "stale", "error"] as const) {
		await page.evaluate((value) => window.setOrderbookHoverUnavailable(value), state);
		await expect(asks).toHaveText("");
		await expect(bids).toHaveText("");
		await expect(page.locator("[data-orderbook-side-container] button")).toHaveCount(0);
		expect(await page.locator(".orderbook-panel-container").innerText()).not.toMatch(
			/Failed to load order book|No orders/,
		);
		expect(await spread.boundingBox()).toEqual(bounds);
		await page.evaluate(() => window.publishOrderbookHoverSnapshot());
		await expect(asks.locator("button:enabled").first()).toBeVisible();
		await expect(bids.locator("button:enabled").first()).toBeVisible();
		expect(await spread.boundingBox()).toEqual(bounds);
	}
});

test("compact pending and sparse books preserve the midpoint and footer", async ({ page }) => {
	await page.goto("/orderbook-layout.html");
	await page.waitForFunction(() => typeof window.setOrderbookLayoutFixture === "function");
	await page.evaluate(() =>
		window.setOrderbookLayoutFixture({ view: "compact", height: 425, width: 164, pending: true }),
	);
	await expect(page.locator('[data-slot="orderbook-skeleton-row"]')).toHaveCount(10);
	const mid = page.locator('[data-slot="compact-orderbook-mid"]');
	const bounds = await mid.boundingBox();
	const footer = page.locator('button[data-mode="both"]');
	const footerBounds = await footer.boundingBox();
	await page.evaluate(() => window.setOrderbookLayoutFixture({ view: "compact", height: 425, width: 164, depth: 2 }));
	await expect(page.locator('[data-slot="orderbook-placeholder-row"]')).toHaveCount(6);
	await expect(page.locator('[data-slot="compact-orderbook-row-position"] button')).toHaveCount(4);
	expect(await mid.boundingBox()).toEqual(bounds);
	expect(await footer.boundingBox()).toEqual(footerBounds);
	await page.evaluate(() => window.setOrderbookLayoutFixture({ view: "compact", height: 425, width: 164, depth: 0 }));
	await expect(page.locator('[data-slot="orderbook-placeholder-row"]')).toHaveCount(10);
	expect(await mid.boundingBox()).toEqual(bounds);
	expect(await footer.boundingBox()).toEqual(footerBounds);
});
