// Proves the vendored charting library never inserts its Google Analytics loader: `Math.random`
// is forced to 0 in every frame, so the library's 2% sampling branch (behind its internal feature
// flag 14851) would run on every load if the flag were enabled. Run after every library upgrade:
// node apps/terminal/tests/browser/chart-analytics-probe.mjs <origin> [settle-ms]
import { chromium } from "@playwright/test";

const origin = (process.argv[2] ?? "https://d2i25dhfjwco8b.cloudfront.net").replace(/\/+$/, "");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript("Math.random = () => 0;");
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
	if (message.type() === "error") consoleErrors.push(message.text().slice(0, 160));
});
await page.goto(`${origin}/trade/BTC`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(Number(process.argv[3] ?? 15000));
const chartFrames = [];
for (const frame of page.frames()) {
	if (frame === page.mainFrame()) continue;
	const info = await frame
		.evaluate(() => {
			const context = Object.getOwnPropertyNames(window)
				.map((key) => {
					try {
						return window[key];
					} catch {
						return undefined;
					}
				})
				.find((value) => value && typeof value === "object" && "urlParams" in value);
			const disabledFeatures = String(context?.urlParams?.disabledFeatures ?? "");
			return {
				canvases: document.querySelectorAll("canvas").length,
				analyticsScript: document.querySelector('script[src*="google-analytics"]') !== null,
				analyticsObject: typeof window.GoogleAnalyticsObject === "string",
				flagDisabled: disabledFeatures.includes('"14851"'),
				isChart: disabledFeatures.length > 0,
			};
		})
		.catch(() => null);
	if (info?.isChart) chartFrames.push(info);
}
await browser.close();
const result = {
	origin,
	chartFrames,
	analyticsConsoleErrors: consoleErrors.filter((entry) => entry.includes("google-analytics")).length,
	otherConsoleErrors: consoleErrors.filter((entry) => !entry.includes("google-analytics")).slice(0, 3),
};
console.log(JSON.stringify(result, null, 2));
const clean = chartFrames.length > 0 && chartFrames.every((frame) => frame.flagDisabled && !frame.analyticsScript && !frame.analyticsObject && frame.canvases > 0);
process.exit(clean ? 0 : 1);
