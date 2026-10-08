// Reproduces the TradingView rebuild failure on WebKit against a deployed origin and prints the
// inner-window handshake order. The vendored loader registers its `innerWindowLoad` listener only
// after `document.write` of the iframe body; when every inner bundle is already in WebKit's memory
// cache (immutable production bundles, second widget of the page), the inner document dispatches
// that event synchronously during the write and the listener comes one tick too late, so
// `onChartReady` never fires and the chart ends in "Something went wrong" after the ready watchdog.
// Chromium executes the cached scripts asynchronously and never hits it.
//
// node apps/terminal/tests/browser/chart-rebuild-webkit-probe.mjs [webkit|chromium] [origin] [route|locale]
//   route  — Markets → drawer → Funding Comparison → drawer → Trade → Markets (second widget)
//   locale — Markets → switch the language to 中文 (new language bundles) → back to English (cached)
// Playwright WebKit cannot launch inside the Claude sandbox; run it from a normal shell.
import { chromium, devices, webkit } from "@playwright/test";

const engine = process.argv[2] ?? "webkit";
const origin = (process.argv[3] ?? "https://app.sairn.ai").replace(/\/+$/, "");
const scenario = process.argv[4] ?? "route";
const browser = await (engine === "chromium" ? chromium : webkit).launch({ headless: true });
const context = await browser.newContext({ ...devices["iPhone 13"], locale: "en-US" });
await context.addInitScript(() => {
	if (window.top !== window) return;
	const t0 = performance.now();
	window.__handshakeLog = [];
	const log = (message) => window.__handshakeLog.push(`${(performance.now() - t0).toFixed(0)} ${message}`);
	const windows = new WeakMap();
	let sequence = 0;
	const track = (frame) => {
		const inner = frame.contentWindow;
		if (!inner || windows.has(inner)) return;
		windows.set(inner, ++sequence);
		const n = sequence;
		const add = inner.addEventListener.bind(inner);
		const dispatch = inner.dispatchEvent.bind(inner);
		inner.addEventListener = (type, ...rest) => {
			if (/innerWindowLoad|sameOriginLoad/.test(type)) log(`${frame.id} window#${n} addEventListener(${type})`);
			return add(type, ...rest);
		};
		inner.dispatchEvent = (event) => {
			if (/innerWindowLoad|sameOriginLoad/.test(event.type)) log(`${frame.id} window#${n} dispatch(${event.type})`);
			return dispatch(event);
		};
	};
	new MutationObserver((mutations) => {
		for (const mutation of mutations)
			for (const node of mutation.addedNodes) {
				if (node.nodeType !== 1) continue;
				const frames = node.matches?.("iframe[id^=tradingview_]")
					? [node]
					: [...(node.querySelectorAll?.("iframe[id^=tradingview_]") ?? [])];
				for (const frame of frames) track(frame);
			}
	}).observe(document, { childList: true, subtree: true });
});
const page = await context.newPage();
const lines = [];
const started = Date.now();
const stamp = (message) => lines.push(`${String(Date.now() - started).padStart(6)} ${message}`);
page.on("frameattached", () => stamp("frameattached"));
page.on("framedetached", (frame) => stamp(`framedetached ${frame.url().slice(0, 80)}`));

async function chartState(label) {
	const state = await page.evaluate(() => ({
		mask: [...document.querySelectorAll("[data-chart-initializing]")].map((el) => el.className.includes("opacity-100")),
		alert: document.querySelector("[role=alert]")?.textContent?.slice(0, 40) ?? null,
		iframes: [...document.querySelectorAll("iframe[id^=tradingview_]")].map((frame) => frame.id),
		handshake: window.__handshakeLog,
	}));
	stamp(`STATE ${label} ${JSON.stringify(state)}`);
}
async function waitForChartReady(label, timeoutMs) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const ready = await page.evaluate(() => {
			const mask = document.querySelector("[data-chart-initializing]");
			return !!mask && !mask.className.includes("opacity-100");
		});
		if (ready) {
			stamp(`chart ready (${label}) after ${Date.now() - start}ms`);
			return;
		}
		await page.waitForTimeout(500);
	}
	stamp(`chart NOT ready (${label}) within ${timeoutMs}ms`);
}
async function openDrawerLink(name) {
	await page.getByRole("button", { name: "Open navigation" }).click();
	await page.getByRole("link", { name, exact: true }).click();
	stamp(`navigated via drawer: ${name}`);
}
async function switchLanguage(label) {
	await page.getByRole("button", { name: /Language|语言/ }).click();
	await page.waitForTimeout(800);
	await page.getByText(label, { exact: false }).first().click({ timeout: 5000 });
	stamp(`switched language: ${label}`);
}

await page.goto(`${origin}/trade/BTC`, { waitUntil: "load", timeout: 60000 });
await page.getByRole("button", { name: "Markets" }).click({ timeout: 30000 });
await waitForChartReady("first widget", 25000);
await chartState("first widget");
if (scenario === "locale") {
	await switchLanguage("中文");
	await waitForChartReady("after switching to zh", 25000);
	await switchLanguage("English");
	await waitForChartReady("after switching back to en", 25000);
} else {
	await openDrawerLink("Funding Comparison");
	await page.waitForTimeout(4000);
	await openDrawerLink("Trade");
	await page.waitForTimeout(3000);
	await page.getByRole("button", { name: "Markets" }).click();
	await waitForChartReady("second widget", 25000);
}
await page.waitForTimeout(15000);
await chartState("final");
console.log(lines.join("\n"));
await browser.close();
