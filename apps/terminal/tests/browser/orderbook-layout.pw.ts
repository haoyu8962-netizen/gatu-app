import { expect, test } from "@playwright/test";

const fixtures = [
	{ view: "desktop", width: 280, height: 677, prefix: "orderbook", rowHeight: 23, gap: 2 },
	{ view: "compact", width: 164, height: 425, prefix: "compact-orderbook", rowHeight: 24, gap: 4 },
	{ view: "split", width: 390, height: 425, prefix: "split-orderbook", rowHeight: 23, gap: 2 },
] as const;

for (const fixture of fixtures) {
	test(`${fixture.view} covers resized ladders and only allows fully visible prices`, async ({ page }) => {
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
									if (first.top > bounds.top + gap || last.bottom < bounds.bottom - gap) failures.push("unfilled edge");
									if (rects.some((rect) => Math.abs(rect.height - rowHeight) > 0.01)) failures.push("stretched row");
									if (rects.slice(1).some((rect, index) => Math.abs(rect.top - rects[index].bottom - gap) > 0.01))
										failures.push("stretched gap");
									for (const button of ladder.querySelectorAll<HTMLButtonElement>("button")) {
										const rect = button.getBoundingClientRect();
										const clipped = rect.top < bounds.top - 0.01 || rect.bottom > bounds.bottom + 0.01;
										if (button.disabled !== clipped) failures.push("incorrect interaction boundary");
									}
									const anchor =
										prefix !== "split-orderbook" && side === "asks"
											? last.bottom - bounds.bottom
											: first.top - bounds.top;
									if (Math.abs(anchor) > 0.01) failures.push("best price moved from anchor");
									return failures;
								});
							},
							{ ...fixture, mode },
						),
					)
					.toEqual([]);
			}
		}
		const disabled = page.locator(`[data-slot^="${fixture.prefix}-"] button:disabled`);
		const clippedCanFocus = await disabled.evaluateAll((buttons) =>
			buttons.some((element) => {
				const button = element as HTMLButtonElement;
				button.click();
				button.focus();
				return document.activeElement === button;
			}),
		);
		expect(clippedCanFocus).toBe(false);
		await expect.poll(() => page.evaluate(() => window.getOrderbookLayoutSelectedPrice())).toBeNull();
		const enabled = page.locator(`[data-slot="${fixture.prefix}-bids"] button:enabled`).first();
		await enabled.click();
		await expect.poll(() => page.evaluate(() => window.getOrderbookLayoutSelectedPrice())).toBe("99");
	});
}

test("compact pending and sparse books preserve the midpoint and footer", async ({ page }) => {
	await page.goto("/orderbook-layout.html");
	await page.waitForFunction(() => typeof window.setOrderbookLayoutFixture === "function");
	await page.evaluate(() =>
		window.setOrderbookLayoutFixture({ view: "compact", height: 425, width: 164, pending: true }),
	);
	await expect(page.locator('[data-slot="orderbook-skeleton-row"]')).toHaveCount(12);
	const mid = page.locator('[data-slot="compact-orderbook-mid"]');
	const bounds = await mid.boundingBox();
	const footer = page.locator('button[data-mode="both"]');
	const footerBounds = await footer.boundingBox();
	await page.evaluate(() => window.setOrderbookLayoutFixture({ view: "compact", height: 425, width: 164, depth: 2 }));
	await expect(page.locator('[data-slot="orderbook-placeholder-row"]')).toHaveCount(8);
	await expect(page.locator('[data-slot="compact-orderbook-row-position"] button')).toHaveCount(4);
	expect(await mid.boundingBox()).toEqual(bounds);
	expect(await footer.boundingBox()).toEqual(footerBounds);
	await page.evaluate(() => window.setOrderbookLayoutFixture({ view: "compact", height: 425, width: 164, depth: 0 }));
	await expect(page.locator('[data-slot="orderbook-placeholder-row"]')).toHaveCount(12);
	expect(await mid.boundingBox()).toEqual(bounds);
	expect(await footer.boundingBox()).toEqual(footerBounds);
});
