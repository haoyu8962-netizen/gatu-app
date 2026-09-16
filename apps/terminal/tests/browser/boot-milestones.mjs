// Boot milestones of a cold load: router and React hydration, the first real surface, the panels, the
// chart iframe and the Privy iframe, plus the chunk waterfall, the market catalog requests and long
// tasks. Usage: node apps/terminal/tests/browser/boot-milestones.mjs <origin>
import { chromium } from "@playwright/test";
const origin = (process.argv[2] ?? "https://d2i25dhfjwco8b.cloudfront.net").replace(/\/+$/, "");
const INIT = `
window.__m = { marks: {}, longTasks: [] };
const seen = {};
let barrierSeen = false;
function mark(key) { if (!seen[key]) { seen[key] = true; window.__m.marks[key] = Math.round(performance.now()); } }
function check() {
  if (!document.body) return;
  if (window.$_TSR !== undefined) barrierSeen = true;
  if (barrierSeen && window.$_TSR === undefined) mark("hydrated");
  const emptyFallback = document.querySelector('[data-testid="startup-fallback"]');
  if (emptyFallback) mark("emptyFallback");
  if (seen.emptyFallback && !emptyFallback) mark("fallbackGone");
  if (document.body && Object.keys(document.body).some((k) => k.startsWith("__reactFiber"))) mark("reactHydrated");
  if (document.querySelector("nav")) mark("nav");
  if (document.querySelector('iframe[src*="auth.privy.io"]')) mark("privyFrame");
  if (document.querySelector('main[aria-busy="true"]')) mark("emptyWorkspace");
  if (document.querySelector('header, footer, .mobile-terminal nav')) mark("chrome");
  if (document.querySelector('.react-grid-item, .mobile-terminal main:not([aria-busy="true"])')) mark("workspace");
  if (document.querySelector('[data-testid="desktop-terminal-surface"]')) mark("surface");
  if (document.querySelector(".react-grid-item")) mark("grid");
  if (document.querySelector('[data-orderbook-side-container] > *')) mark("bookRow");
  if (document.querySelector("[data-orderbook-price]")) mark("bookData");
  if (document.querySelector('iframe[src*="sameorigin"], iframe[srcdoc]')) mark("chartFrame");
  if (/\\d{1,3}(,\\d{3})*\\.\\d{2,}/.test(document.body.innerText.slice(0, 4000))) mark("firstPrice");
}
setInterval(check, 8);
try { new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__m.longTasks.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask", buffered: true }); } catch {}
`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(INIT);
const page = await context.newPage();
await page.goto(`${origin}/trade/HYPE?terminal_perf=1`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(6000);
const result = await page.evaluate(() => {
	const nav = performance.getEntriesByType("navigation")[0];
	const paints = Object.fromEntries(performance.getEntriesByType("paint").map((p) => [p.name, Math.round(p.startTime)]));
	const res = performance.getEntriesByType("resource");
	const pick = (pattern) => { const r = res.find((e) => pattern.test(e.name)); return r ? { start: Math.round(r.startTime), end: Math.round(r.responseEnd) } : null; };
	return {
		ttfb: Math.round(nav.responseStart), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), fcp: paints["first-contentful-paint"],
		marks: Object.fromEntries(Object.entries(window.__m.marks).map(([k, v]) => [k, Math.round(v)])),
		chunks: { bootstrap: pick(/index-[A-Za-z0-9_-]{8}\.js$/), hydrate: pick(/client-hydrate/), clientRoot: pick(/client-root-/), walletSdk: pick(/index-Bs6QSD5q/), vendorRouter: pick(/vendor-tanstack-router/), tradePage: pick(/trade-terminal-page/), geo: pick(/\/api\/geo/), privyApps: pick(/auth\.privy\.io\/api\/v1\/apps/) },
		infoRequests: res.filter((e) => /hyperliquid(-testnet)?\.xyz\/info/.test(e.name)).map((e) => ({ start: Math.round(e.startTime), end: Math.round(e.responseEnd), kb: Math.round((e.encodedBodySize || 0) / 1024) })),
		catalogClient: pick(/market-catalog-info-client/),
		renderCommits: (() => { try { const s = window.__terminal_render_profile?.(); return s ? Object.fromEntries(Object.entries(s.tracks).map(([k, v]) => [k, { first: Math.round(v.firstCommitTime || v.recent[0]?.commitTime || 0), commits: v.commits, total: Math.round(v.totalDuration) }])) : null; } catch { return null; } })(),
		longTasks: window.__m.longTasks.slice(0, 30),
		longTaskTotal: window.__m.longTasks.reduce((s, [, d]) => s + d, 0),
	};
});
await browser.close();
console.log(JSON.stringify(result, null, 1));
