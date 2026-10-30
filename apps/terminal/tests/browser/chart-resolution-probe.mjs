// Proves that weekly and monthly charts receive bars. The datafeed declares
// `has_weekly_and_monthly: false`, so the charting library requests daily bars for those
// resolutions and builds the weekly and monthly bars itself; the datafeed must serve those daily
// requests while the chart target is 1W or 1M (docs/runtime-guardrails.md §4). The script switches
// the BTC chart through the library's own API, as the interval menu does, reads the bars back with
// `exportData` and fails unless each step reaches its resolution with bars one day, one week or one
// calendar month apart:
// node apps/terminal/tests/browser/chart-resolution-probe.mjs <origin>
import { chromium } from "@playwright/test";

const origin = (process.argv[2] ?? "http://localhost:3005").replace(/\/+$/, "");

async function readSeries(page) {
	return page.evaluate(async () => {
		const frame = document.querySelector('iframe[id^="tradingview_"]');
		const chart = frame?.contentWindow?.tradingViewApi?.activeChart();
		if (!chart) return null;
		const exported = await chart.exportData({ includeTime: true, includeSeries: true, includedStudies: [] });
		return { resolution: chart.resolution(), times: exported.data.map((row) => row[0]) };
	});
}

const DAY = 86_400;

/** Whether consecutive bar opens are one period apart: 1 day, 7 days, or one calendar month. */
function hasResolutionSpacing(resolution, times) {
	return times.slice(1).every((time, index) => {
		const previous = new Date(times[index] * 1000);
		if (resolution === "1D") return time - times[index] === DAY;
		if (resolution === "1W") return time - times[index] === 7 * DAY;
		const next = new Date(time * 1000);
		const months = (next.getUTCFullYear() - previous.getUTCFullYear()) * 12 + next.getUTCMonth() - previous.getUTCMonth();
		return months === 1 && next.getUTCDate() === 1;
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
const initial = await waitForSeries(page, (series) => series.times.length > 0, 60000);
results.push({ step: "initial", resolution: initial?.resolution ?? null, size: initial?.times.length ?? 0, ok: Boolean(initial?.times.length) });
for (const resolution of ["1W", "1M", "1D"]) {
	await page.evaluate((next) => {
		const frame = document.querySelector('iframe[id^="tradingview_"]');
		frame.contentWindow.tradingViewApi.activeChart().setResolution(next);
	}, resolution);
	const series = await waitForSeries(page, (state) => state.resolution === resolution && state.times.length > 1, 30000);
	const times = series?.times ?? [];
	const ok = series?.resolution === resolution && times.length > 1 && hasResolutionSpacing(resolution, times);
	results.push({
		step: resolution,
		resolution: series?.resolution ?? null,
		size: times.length,
		first: times[0] ?? null,
		last: times.at(-1) ?? null,
		ok,
	});
}
await browser.close();
const ok = results.every((result) => result.ok);
console.log(JSON.stringify({ ok, results }, null, 2));
process.exitCode = ok ? 0 : 1;
