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
	await expect(page.locator('[data-slot="orderbook-skeleton-row"]')).toHaveCount(12);
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
	const ladderHeight = result.initialGeometry.find((item) => item.slot === "compact-orderbook-asks")?.height;
	if (ladderHeight === undefined) throw new Error("Missing measured ask ladder");
	const rowHeight = (ladderHeight - 5 * 4) / 6;
	expect(rowHeight).toBeGreaterThanOrEqual(24);
	for (const height of [
		...result.rowHeights,
		...result.realRowHeights,
		...result.placeholderRowHeights,
		...result.skeletonRowHeights,
	])
		expect(height).toBeCloseTo(rowHeight, 1);
	for (const stride of [...result.rowGaps, ...result.skeletonRowGaps]) expect(stride).toBeCloseTo(rowHeight + 4, 1);
	expect(result.realRowContentCount).toBe(result.rowHeights.length);
	expect(result.realRowContentsMatchPosition).toBe(true);
	expect(result.placeholderRowHeights.length).toBeGreaterThan(0);
	expect(result.placeholderContentsMatchPosition).toBe(true);
	expect(result.skeletonRowHeights.length).toBeGreaterThan(0);
	expect(result.skeletonRowsMatchPosition).toBe(true);
	expect(result.finalTops).toEqual(result.initialTops);
	expect(result.finalGeometry).toEqual(result.initialGeometry);
	expect(result.domOrderMatchesVisualOrder).toBe(true);
	expect(result.priceNodePreserved).toBe(true);
	expect(result.focusPreserved).toBe(true);
	expect(Number.parseFloat(result.rankTransform.replace("translateY(", ""))).toBeCloseTo(-(rowHeight + 4), 1);
	expect(result.sizeDirection).toBe("up");
	expect(result.interactionPrice).toBe("100.10");

	console.log(
		`Mobile orderbook CLS: control=${result.controlCls.toFixed(6)} initialization=${result.initializationCls.toFixed(6)} size=${result.sizeCls.toFixed(6)} rank=${result.rankCls.toFixed(6)}`,
	);
});
