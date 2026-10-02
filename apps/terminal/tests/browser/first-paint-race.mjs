// Films the first seconds of a cold load on the sairn terminal and the official app: screenshots and
// DOM markers at fixed offsets after navigation start, plus the script waterfall and the HTML tags.
// Usage: node apps/terminal/tests/browser/first-paint-race.mjs <output-dir>
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const targets = [
	{ name: "sairn", url: "https://d2i25dhfjwco8b.cloudfront.net/trade/HYPE" },
	{ name: "official", url: "https://app.hyperliquid.xyz/trade/HYPE" },
];
const TICKS = [250, 500, 750, 1000, 1300, 1600, 2000, 2500, 3000, 4000, 5500];
const outDir = process.argv[2];
const browser = await chromium.launch({ headless: true });
const report = {};
for (const target of targets) {
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	const t0 = Date.now();
	await page.goto(target.url, { waitUntil: "commit", timeout: 60000 }).catch(() => {});
	const samples = [];
	for (const tick of TICKS) {
		const wait = t0 + tick - Date.now();
		if (wait > 0) await page.waitForTimeout(wait);
		const marker = await page
			.evaluate(() => {
				const text = document.body?.innerText ?? "";
				return {
					textChars: text.length,
					priceLike: (text.match(/\d{1,3}(,\d{3})*\.\d{1,4}/g) ?? []).length,
					buttons: document.querySelectorAll("button").length,
					canvases: document.querySelectorAll("canvas").length,
					iframes: document.querySelectorAll("iframe").length,
					gridItems: document.querySelectorAll(".react-grid-item").length,
					hasConnect: /connect/i.test(text),
					hasOrderBookWords: /order ?book|trades/i.test(text),
					title: document.title.slice(0, 40),
				};
			})
			.catch(() => ({ error: true }));
		const elapsed = Date.now() - t0;
		await page.screenshot({ path: `${outDir}/${target.name}-${String(tick).padStart(4, "0")}.png`, scale: "css" }).catch(() => {});
		samples.push({ tick, elapsed, ...marker });
	}
	const network = await page.evaluate(() => {
		const nav = performance.getEntriesByType("navigation")[0];
		const paints = Object.fromEntries(performance.getEntriesByType("paint").map((p) => [p.name, Math.round(p.startTime)]));
		const resources = performance.getEntriesByType("resource").map((r) => ({ name: r.name.replace(location.origin, "").slice(0, 90), type: r.initiatorType, start: Math.round(r.startTime), end: Math.round(r.responseEnd), kb: Math.round((r.encodedBodySize || 0) / 1024) }));
		const scripts = [...document.querySelectorAll("script[src]")].map((s) => ({ src: s.getAttribute("src").slice(-60), async: s.async, defer: s.defer, type: s.type }));
		return { ttfb: Math.round(nav.responseStart), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), paints, htmlKb: Math.round((nav.encodedBodySize || 0) / 1024), resources, scriptTags: scripts.slice(0, 20), preloads: document.querySelectorAll('link[rel="modulepreload"],link[rel="preload"]').length };
	});
	await context.close();
	const js = network.resources.filter((r) => /\.js(\?|$)/.test(r.name));
	report[target.name] = {
		...network,
		samples,
		jsCount: js.length,
		jsKb: js.reduce((s, r) => s + r.kb, 0),
		firstJs: js.slice().sort((a, b) => a.start - b.start).slice(0, 12),
		websockets: network.resources.filter((r) => /ws|socket/i.test(r.name)).length,
		resources: undefined,
	};
	report[target.name].waterfall = network.resources.sort((a, b) => a.start - b.start).slice(0, 40);
}
await browser.close();
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 1));
for (const [name, r] of Object.entries(report)) {
	console.log(`\n=== ${name}: html ${r.htmlKb} KB, ttfb ${r.ttfb}, fcp ${r.paints["first-contentful-paint"]}, dcl ${r.dcl}, load ${r.load}, js ${r.jsCount} files / ${r.jsKb} KB, preload links ${r.preloads}`);
	console.log("script tags:", r.scriptTags.map((s) => `${s.src}${s.async ? " async" : ""}${s.defer ? " defer" : ""}${s.type ? " " + s.type : ""}`).join(" | "));
	console.log("tick  elapsed text priceLike buttons canvas iframes grid connect bookWords");
	for (const s of r.samples) console.log(String(s.tick).padStart(4), String(s.elapsed).padStart(6), String(s.textChars ?? "-").padStart(5), String(s.priceLike ?? "-").padStart(9), String(s.buttons ?? "-").padStart(7), String(s.canvases ?? "-").padStart(6), String(s.iframes ?? "-").padStart(7), String(s.gridItems ?? "-").padStart(4), String(s.hasConnect ?? "-").padStart(7), String(s.hasOrderBookWords ?? "-").padStart(9));
}
