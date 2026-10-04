// Proves that the vendored charting library formats chart prices with Hyperliquid's tick bands
// (docs/adr/0035-chart-price-precision-from-market-rules.md). Each market's band count comes from its
// szDecimals, not from the chart. Around every band boundary it formats the band's largest valid
// price, a value just below the five-significant-figure rounding threshold, the threshold itself and
// the next power of ten, plus the latest close, and compares the full text with the value rounded
// half-up to five significant figures (en-US separators, the default number format). The unit tests
// only mirror the library's band lookup, so run this after every library upgrade:
// node apps/terminal/tests/browser/chart-price-format-probe.mjs <origin> [settle-ms]
import { chromium } from "@playwright/test";
import Big from "big.js";

const origin = (process.argv[2] ?? "http://localhost:3005").replace(/\/+$/, "");
const settleMs = Number(process.argv[3] ?? 45000);
// Maximum decimals from Hyperliquid metadata on 2026-10-02: HYPE perp szDecimals 2 (6 - 2),
// BTC perp szDecimals 5 (6 - 5), PURR/USDC spot szDecimals 0 (8 - 0).
const markets = [
	{ route: "/trade/HYPE", ticker: "HYPE", maxDecimals: 4 },
	{ route: "/trade/BTC", ticker: "BTC", maxDecimals: 1 },
	{ route: "/trade/PURR/USDC", ticker: "PURR/USDC", maxDecimals: 8 },
];
const TEN = new Big(10);

function countDecimals(tick) {
	return tick.split(".")[1]?.length ?? 0;
}

function formatExpected(value, maxDecimals) {
	const decimals = Math.min(maxDecimals, Math.max(0, 4 - value.prec(5).e));
	const [integer, fraction] = value.round(decimals, Big.roundHalfUp).toFixed(decimals).split(".");
	const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return fraction ? `${grouped}.${fraction}` : grouped;
}

function getBoundaryValues(maxDecimals) {
	const values = [];
	for (let decimals = maxDecimals; decimals > 0; decimals -= 1) {
		const powerOfTen = TEN.pow(5 - decimals);
		const threshold = powerOfTen.minus(TEN.pow(-decimals).div(2));
		values.push(
			powerOfTen.minus(TEN.pow(-decimals)),
			threshold.minus(TEN.pow(-(decimals + 2))),
			threshold,
			powerOfTen,
		);
	}
	return values;
}

async function readSymbol(page) {
	return page.evaluate(() => {
		const frame = document.querySelector('iframe[id^="tradingview_"]');
		const series = frame?.contentWindow?.tradingViewApi?.activeChart()._chartWidget.model().mainSeries();
		const info = series?.symbolInfo();
		const close = series?.bars().last()?.value[4];
		if (!series || !info || typeof close !== "number") return null;
		return {
			ticker: info.ticker,
			pricescale: info.pricescale,
			variableTickSize: info.variable_tick_size ?? "",
			close,
		};
	});
}

async function formatInChart(page, values) {
	return page.evaluate((numbers) => {
		const frame = document.querySelector('iframe[id^="tradingview_"]');
		const series = frame.contentWindow.tradingViewApi.activeChart()._chartWidget.model().mainSeries();
		return numbers.map((value) => series.formatter().format(value));
	}, values);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const results = [];
for (const market of markets) {
	await page.goto(`${origin}${market.route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
	const deadline = Date.now() + settleMs;
	let symbol = null;
	while (!symbol && Date.now() < deadline) {
		symbol = await readSymbol(page).catch(() => null);
		if (!symbol) await page.waitForTimeout(500);
	}
	const ticks = symbol?.variableTickSize.split(" ") ?? [];
	const bandsMatch =
		ticks.length === 2 * market.maxDecimals + 1 && countDecimals(ticks[0] ?? "") === market.maxDecimals;
	const values = symbol ? [...getBoundaryValues(market.maxDecimals), new Big(String(symbol.close))] : [];
	const formatted = values.length > 0 ? await formatInChart(page, values.map((value) => value.toNumber())) : [];
	const checks = values.map((value, index) => ({
		value: value.toString(),
		formatted: formatted[index],
		expected: formatExpected(value, market.maxDecimals),
	}));
	const failures = checks.filter((check) => check.formatted !== check.expected);
	const ok =
		symbol?.ticker === market.ticker &&
		bandsMatch &&
		checks.length === 4 * market.maxDecimals + 1 &&
		failures.length === 0;
	results.push({ ...market, symbol, bandsMatch, checks: checks.length, failures, ok });
}
await browser.close();
console.log(JSON.stringify({ origin, results }, null, 2));
process.exit(results.every((result) => result.ok) ? 0 : 1);
