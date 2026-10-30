// Proves that weekly and monthly charts receive bars. The datafeed declares
// `has_weekly_and_monthly: false`, so the charting library requests daily bars for those
// resolutions and builds the weekly and monthly bars itself; the datafeed must serve those daily
// requests while the chart target is 1W or 1M (docs/runtime-guardrails.md §4). The script switches
// the BTC chart through the library's own API, as the interval menu does, and prints the bar count
// and average spacing for each resolution:
// node apps/terminal/tests/browser/chart-resolution-probe.mjs <origin>
import { chromium } from "@playwright/test";

const origin = (process.argv[2] ?? "http://localhost:3005").replace(/\/+$/, "");

async function readSeries(page) {
	return page.evaluate(() => {
		const frame = document.querySelector('iframe[id^="tradingview_"]');
		const chart = frame?.contentWindow?.tradingViewApi?.activeChart();
		const series = chart?._chartWidget.model().mainSeries();
		if (!chart || !series) return null;
		const bars = series.bars();
		const size = bars.size();
		return {
			resolution: chart.resolution(),
			size,
			firstTime: size > 0 ? bars.first()?.value[0] : null,
			lastTime: size > 0 ? bars.last()?.value[0] : null,
		};
	});
}

async function waitForSeries(page, predicate, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	let latest = null;
	while (Date.now() < deadline) {
		latest = await readSeries(page).catch(() => null);
		if (latest && predicate(latest)) return latest;
		await page.waitForTimeout(500);
	}
	return latest;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const results = [];
await page.goto(`${origin}/trade/BTC`, { waitUntil: "domcontentloaded", timeout: 60000 });
results.push({ step: "initial", ...(await waitForSeries(page, (series) => series.size > 0, 60000)) });
for (const resolution of ["1W", "1M", "1D"]) {
	await page.evaluate((next) => {
		const frame = document.querySelector('iframe[id^="tradingview_"]');
		frame.contentWindow.tradingViewApi.activeChart().setResolution(next);
	}, resolution);
	const series = await waitForSeries(page, (state) => state.resolution === resolution && state.size > 0, 30000);
	const spacingDays =
		series?.size > 1 ? (series.lastTime - series.firstTime) / 86_400 / (series.size - 1) : null;
	results.push({ step: resolution, ...series, averageSpacingDays: spacingDays === null ? null : Number(spacingDays.toFixed(2)) });
}
await browser.close();
const ok = results.slice(1).every((result) => result.size > 0);
console.log(JSON.stringify({ ok, results }, null, 2));
process.exitCode = ok ? 0 : 1;
