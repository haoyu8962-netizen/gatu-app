// Load-order audit of the static terminal: cold browser contexts against the edge, recording resource
// timing, paint milestones, V8 script coverage (used vs unused bytes) and which downloaded scripts
// never ran. Usage: node apps/terminal/tests/browser/load-order-audit.mjs <origin> > audit.json
import { chromium } from "@playwright/test";
const origin = (process.argv[2] ?? "https://d2i25dhfjwco8b.cloudfront.net").replace(/\/+$/, "");
const SCENARIOS = [
	{ name: "desktop /trade/BTC", path: "/trade/BTC", viewport: { width: 1440, height: 900 } },
	{ name: "mobile /trade/BTC", path: "/trade/BTC", viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true },
	{ name: "desktop /portfolio", path: "/portfolio", viewport: { width: 1440, height: 900 } },
	{ name: "desktop /docs", path: "/docs", viewport: { width: 1440, height: 900 } },
];
function usedBytes(entry) {
	const counts = new Uint8Array(entry.source?.length ?? 0);
	for (const fn of entry.functions ?? []) for (const range of fn.ranges) counts.fill(range.count > 0 ? 1 : 0, range.startOffset, Math.min(range.endOffset, counts.length));
	let used = 0;
	for (let i = 0; i < counts.length; i += 1) used += counts[i];
	return { total: counts.length, used };
}
const browser = await chromium.launch({ headless: true });
const report = { origin, scenarios: [] };
for (const scenario of SCENARIOS) {
	const context = await browser.newContext({ viewport: scenario.viewport, isMobile: scenario.isMobile, hasTouch: scenario.hasTouch });
	const page = await context.newPage();
	await page.coverage.startJSCoverage({ resetOnNavigation: false });
	const started = Date.now();
	await page.goto(`${origin}${scenario.path}`, { waitUntil: "load", timeout: 60000 });
	await page.waitForTimeout(9000);
	const timing = await page.evaluate(async () => {
		const rawHtml = await fetch(location.href, { headers: { accept: "text/html" } }).then((response) => response.text());
		const nav = performance.getEntriesByType("navigation")[0];
		const paints = Object.fromEntries(performance.getEntriesByType("paint").map((p) => [p.name, Math.round(p.startTime)]));
		const resources = performance.getEntriesByType("resource").map((r) => ({
			name: r.name.replace(location.origin, ""),
			initiator: r.initiatorType,
			start: Math.round(r.startTime),
			end: Math.round(r.responseEnd),
			bytes: r.encodedBodySize,
			transfer: r.transferSize,
		}));
		return {
			ttfb: Math.round(nav.responseStart), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), paints,
			staticModulepreloads: (rawHtml.match(/<link rel="modulepreload"/g) ?? []).length,
			modulepreloadsNow: document.querySelectorAll('head link[rel="modulepreload"]').length,
			resources,
			panels: document.querySelectorAll(".react-grid-item").length,
			frames: [...document.querySelectorAll("iframe")].map((f) => (f.src || "srcdoc").replace(location.origin, "").slice(0, 60)),
		};
	});
	const coverage = await page.coverage.stopJSCoverage();
	await context.close();
	const executed = new Map();
	for (const entry of coverage) {
		if (!entry.url.startsWith(origin)) continue;
		const { total, used } = usedBytes(entry);
		executed.set(entry.url.replace(origin, ""), { total, used });
	}
	const scripts = timing.resources.filter((r) => r.name.endsWith(".js") || r.name.includes(".js?"));
	const notExecuted = scripts.filter((r) => !executed.has(r.name));
	report.scenarios.push({
		...scenario,
		elapsedMs: Date.now() - started,
		ttfb: timing.ttfb, fcp: timing.paints["first-contentful-paint"], dcl: timing.dcl, load: timing.load,
		staticModulepreloads: timing.staticModulepreloads, panels: timing.panels, frames: timing.frames,
		totals: {
			resources: timing.resources.length,
			bytes: timing.resources.reduce((sum, r) => sum + (r.bytes || 0), 0),
			scripts: scripts.length,
			scriptBytes: scripts.reduce((sum, r) => sum + (r.bytes || 0), 0),
			executedScripts: executed.size,
			notExecuted: notExecuted.length,
			notExecutedBytes: notExecuted.reduce((sum, r) => sum + (r.bytes || 0), 0),
		},
		notExecuted: notExecuted.map((r) => ({ name: r.name, bytes: r.bytes, initiator: r.initiator, start: r.start })),
		leastUsed: [...executed.entries()].map(([name, c]) => ({ name, total: c.total, unusedPct: Math.round((1 - c.used / Math.max(c.total, 1)) * 100) })).sort((a, b) => b.total * b.unusedPct - a.total * a.unusedPct).slice(0, 14),
		timeline: timing.resources.filter((r) => /\/api\/|charting_library|sameorigin|client-hydrate|client-root|early-prefetch|trade-terminal-page|index-|\.css|\.woff2|vendor-/.test(r.name)).sort((a, b) => a.start - b.start).slice(0, 60).map((r) => `${String(r.start).padStart(5)}→${String(r.end).padStart(5)} ${r.initiator.padEnd(6)} ${Math.round((r.bytes || 0) / 1024)}K ${r.name.slice(0, 70)}`),
		allScripts: scripts.map((r) => ({ name: r.name, bytes: r.bytes, start: r.start, initiator: r.initiator, executed: executed.has(r.name.split("?")[0]), used: executed.get(r.name.split("?")[0])?.used })),
	});
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
