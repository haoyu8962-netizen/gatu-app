// Proves that the vendored charting library formats chart prices with Hyperliquid's tick bands
// (docs/adr/0035-chart-price-precision-from-market-rules.md): for every band in the resolved
// `variable_tick_size`, the band's limit keeps the band's decimals and the next power of ten takes the
// next band's. The unit tests only mirror the library's lookup, so run this after every library upgrade:
// node apps/terminal/tests/browser/chart-price-format-probe.mjs <origin> [settle-ms]
import { chromium } from "@playwright/test";

const origin = (process.argv[2] ?? "http://localhost:3005").replace(/\/+$/, "");
const settleMs = Number(process.argv[3] ?? 45000);
const routes = ["/trade/HYPE", "/trade/BTC", "/trade/PURR/USDC"];

function countDecimals(value) {
	const fraction = value.replace(/[^\d.]/g, "").split(".")[1];
	return fraction?.length ?? 0;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const results = [];
for (const route of routes) {
	await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
	const deadline = Date.now() + settleMs;
	let reading = null;
	while (Date.now() < deadline) {
		reading = await page
			.evaluate(() => {
				const frame = document.querySelector('iframe[id^="tradingview_"]');
				const series = frame?.contentWindow?.tradingViewApi?.activeChart()._chartWidget.model().mainSeries();
				const info = series?.symbolInfo();
				if (!series || !info || series.bars().size() === 0) return null;
				const parts = String(info.variable_tick_size ?? "").split(" ");
				const checks = [];
				for (let index = 0; index + 2 < parts.length; index += 2) {
					const limit = Number(parts[index + 1]);
					const nextPowerOfTen = Number((limit + Number(parts[index])).toPrecision(12));
					checks.push({ value: limit, formatted: series.formatter().format(limit), tick: parts[index] });
					checks.push({ value: nextPowerOfTen, formatted: series.formatter().format(nextPowerOfTen), tick: parts[index + 2] });
				}
				return { ticker: info.ticker, pricescale: info.pricescale, variableTickSize: info.variable_tick_size, checks };
			})
			.catch(() => null);
		if (reading) break;
		await page.waitForTimeout(500);
	}
	const failures = (reading?.checks ?? []).filter(
		(check) => countDecimals(check.formatted) !== countDecimals(check.tick),
	);
	results.push({ route, reading, failures, ok: Boolean(reading?.variableTickSize) && failures.length === 0 });
}
await browser.close();
console.log(JSON.stringify({ origin, results }, null, 2));
process.exit(results.every((result) => result.ok) ? 0 : 1);
