// Reads what the live terminal renders from the all-market context channels after a cold load: the
// selected market's header statistics, the favorites bar and any console errors.
// Usage: node apps/terminal/tests/browser/market-stats-probe.mjs <origin> [path]
import { chromium } from "@playwright/test";
const origin = (process.argv[2] ?? "https://d2i25dhfjwco8b.cloudfront.net").replace(/\/+$/, "");
const path = process.argv[3] ?? "/trade/HYPE";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text().slice(0, 160)); });
page.on("pageerror", (error) => errors.push(`pageerror: ${String(error).slice(0, 160)}`));
await page.goto(`${origin}${path}`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(6000);
const snapshot = await page.evaluate(() => {
	const text = document.body.innerText.replace(/\s+/g, " ");
	const at = text.indexOf("Mark");
	const numbers = (text.match(/\d{1,3}(,\d{3})*(\.\d+)?/g) ?? []).length;
	const placeholders = (text.match(/(^| )-( |$)/g) ?? []).length;
	return { header: text.slice(Math.max(0, at - 80), at + 320), numbers, placeholders, length: text.length };
});
console.log(JSON.stringify({ ...snapshot, consoleErrors: errors }, null, 1));
await browser.close();
