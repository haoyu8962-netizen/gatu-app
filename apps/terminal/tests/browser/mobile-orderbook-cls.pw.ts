import { expect, test } from "@playwright/test";

test.use({
	locale: "en-US",
	viewport: { height: 823, width: 412 },
});

test("keeps compact orderbook rank updates below the CLS budget", async ({ page }) => {
	const externalRequests: string[] = [];
	await page.route("**/*", async (route) => {
		const url = new URL(route.request().url());
		if (url.origin !== "http://127.0.0.1:4179") {
			externalRequests.push(url.href);
			await route.abort("blockedbyclient");
			return;
		}
		await route.continue();
	});

	await page.goto("/mobile-orderbook-cls.html");
	await page.waitForFunction(() => typeof window.runMobileOrderbookClsFixture === "function");
	await expect(page.locator('[data-slot="orderbook-skeleton-row"]')).toHaveCount(14);
	const result = await page.evaluate(() => window.runMobileOrderbookClsFixture());

	expect(externalRequests).toEqual([]);
	expect(result.controlCls, JSON.stringify(result.controlSamples)).toBeGreaterThan(result.rankClsBudget);
	expect(result.controlSamples.some((sample) => sample.source === "mobile-orderbook-cls-control-row")).toBe(true);
	expect(result.controlSamples.every((sample) => !sample.hadRecentInput)).toBe(true);
	expect(result.initializationCls, JSON.stringify(result.initializationSamples)).toBeLessThanOrEqual(
		result.rankClsBudget,
	);
	expect(result.initializationSamples.every((sample) => !sample.hadRecentInput)).toBe(true);
	expect(result.hiddenChromeDisplay).toBe("none");
	expect(result.sizeCls, JSON.stringify(result.sizeSamples)).toBeLessThanOrEqual(0.0005);
	expect(result.sizeSamples.every((sample) => !sample.hadRecentInput)).toBe(true);
	expect(result.rankCls, JSON.stringify(result.rankSamples)).toBeLessThanOrEqual(result.rankClsBudget);
	expect(result.rankSamples.every((sample) => !sample.hadRecentInput)).toBe(true);
	expect(result.rowHeights).toHaveLength(10);
	expect(result.rowHeights.every((height) => height === 24)).toBe(true);
	expect(result.rowGaps.every((gap) => gap === 28)).toBe(true);
	expect(result.realRowContentCount).toBe(result.rowHeights.length);
	expect(result.realRowHeights.every((height) => height === 24)).toBe(true);
	expect(result.realRowContentsMatchPosition).toBe(true);
	expect(result.placeholderRowHeights.length).toBeGreaterThan(0);
	expect(
		result.placeholderRowHeights.every((height) => height === 24),
		JSON.stringify(result.placeholderRowHeights),
	).toBe(true);
	expect(result.placeholderContentsMatchPosition).toBe(true);
	expect(result.skeletonRowHeights.length).toBeGreaterThan(0);
	expect(result.skeletonRowHeights.every((height) => height === 24)).toBe(true);
	expect(result.skeletonRowGaps.every((gap) => gap === 28)).toBe(true);
	expect(result.skeletonRowsMatchPosition).toBe(true);
	expect(result.finalTops).toEqual(result.initialTops);
	expect(result.finalGeometry).toEqual(result.initialGeometry);
	expect(result.domOrderMatchesVisualOrder).toBe(true);
	expect(result.priceNodePreserved).toBe(true);
	expect(result.focusPreserved).toBe(true);
	expect(result.rankTransform).toBe("translateY(-28px)");
	expect(result.sizeDirection).toBe("up");
	expect(result.interactionPrice).toBe("100.10");

	console.log(
		`Mobile orderbook CLS: control=${result.controlCls.toFixed(6)} initialization=${result.initializationCls.toFixed(6)} size=${result.sizeCls.toFixed(6)} rank=${result.rankCls.toFixed(6)}`,
	);
});
