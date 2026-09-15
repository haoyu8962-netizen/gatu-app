// Browser coverage for the hashed Content-Security-Policy: loads the CloudFront terminal in fresh
// browser contexts, records every securitypolicyviolation event (the listener is installed before
// any page script runs) and console error, and summarizes script-src / inline violations per step.
// The build-time collector and `deploy.mjs verify` share one hashing implementation, so only a
// browser can prove that implementation matches the parser. Run after every publish of the
// response function: node apps/terminal/tests/browser/csp-coverage.mjs <origin>
import { chromium } from "@playwright/test";

const origin = (process.argv[2] ?? "https://d2i25dhfjwco8b.cloudfront.net").replace(/\/+$/, "");
const INIT = `window.__cspViolations = []; document.addEventListener("securitypolicyviolation", (e) => { window.__cspViolations.push({ directive: e.effectiveDirective, blocked: e.blockedURI, disposition: e.disposition, sample: e.sample, source: e.sourceFile ? e.sourceFile.replace(location.origin, "") + ":" + e.lineNumber : "", doc: e.documentURI.replace(location.origin, "") }); });`;
const DOCUMENT_ROUTES = ["/docs", "/support", "/terms", "/privacy", "/risk", "/cookies"];

async function settle(page, ms = 4000) {
	await page.waitForLoadState("load").catch(() => {});
	await page.waitForTimeout(ms);
}

async function collect(page, label, results) {
	const violations = await page.evaluate(() => window.__cspViolations ?? []).catch(() => []);
	results.push({ label, url: page.url().replace(origin, ""), violations });
	await page.evaluate(() => { window.__cspViolations = []; }).catch(() => {});
}

async function tryClick(page, selectors, label, results, wait = 3000) {
	for (const selector of selectors) {
		const locator = page.locator(selector).first();
		if (await locator.count() && await locator.isVisible().catch(() => false)) {
			await locator.click({ timeout: 5000 }).catch(() => {});
			await page.waitForTimeout(wait);
			await collect(page, label, results);
			return true;
		}
	}
	results.push({ label, url: page.url().replace(origin, ""), violations: [], skipped: `none of ${selectors.join(" | ")} visible` });
	return false;
}

const browser = await chromium.launch({ headless: true });
const results = [];
const consoleErrors = [];
const functional = {};
let header = null;

async function run(contextOptions, steps) {
	const context = await browser.newContext(contextOptions);
	await context.addInitScript(INIT);
	const page = await context.newPage();
	page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(`${contextOptions.viewport.width}px ${page.url().replace(origin, "")}: ${message.text().slice(0, 160)}`); });
	page.on("response", (response) => {
		if (header === null && response.url() === `${origin}/trade/BTC`) {
			const value = response.headers()["content-security-policy-report-only"] ?? "";
			header = { present: value.length > 0, hashes: (value.match(/'sha256-/g) ?? []).length, unsafeInline: /script-src [^;]*'unsafe-inline'/.test(value), reportSample: value.includes("'report-sample'") };
		}
	});
	await steps(page);
	await context.close();
}

await run({ viewport: { width: 1440, height: 900 } }, async (page) => {
	await page.goto(`${origin}/trade/BTC`, { waitUntil: "load", timeout: 60000 });
	await settle(page, 8000);
	await collect(page, "desktop trade", results);
	functional.desktopPanels = await page.locator(".react-grid-item").count();
	await tryClick(page, ['button:has-text("Connect")', 'button:has-text("Log in")', 'button:has-text("Login")', 'button:has-text("Sign in")'], "desktop connect modal", results, 6000);
	await tryClick(page, ['text=/more wallets/i', 'text=/other wallets/i', 'text=/all wallets/i', 'text=/WalletConnect/i'], "desktop wallet list", results, 6000);
	await tryClick(page, ['text=/WalletConnect/i', 'text=/scan|QR/i'], "desktop walletconnect", results, 6000);
	await page.keyboard.press("Escape").catch(() => {});
	await page.waitForTimeout(1000);
	await page.keyboard.press("Escape").catch(() => {});
	await tryClick(page, ['button:has-text("Deposit")'], "desktop deposit", results);
	await page.keyboard.press("Escape").catch(() => {});
	await tryClick(page, ['button:has-text("BTC")', '[role="combobox"]', 'button[aria-haspopup]'], "desktop market selector", results, 4000);
	await page.keyboard.press("Escape").catch(() => {});
	await tryClick(page, ['button:has-text("Limit")', '[role="tab"]:has-text("Limit")'], "desktop limit tab", results, 1500);
	await tryClick(page, ['button:has-text("Buy")', 'button:has-text("Long")'], "desktop order button", results, 1500);
	for (const route of ["/portfolio", "/leaderboard", "/vaults", "/staking", "/referrals", "/api-wallet", "/perp", "/spot", "/builders-perp", "/trade/HYPE/USDC", "/join/__gatu_healthcheck__", ...DOCUMENT_ROUTES]) {
		await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 60000 });
		await settle(page, 3500);
		await collect(page, `desktop ${route}`, results);
	}
});

await run({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true }, async (page) => {
	await page.goto(`${origin}/trade/BTC`, { waitUntil: "load", timeout: 60000 });
	await settle(page, 8000);
	await collect(page, "mobile trade", results);
	functional.mobileNavItems = await page.locator("nav button, nav a").count();
	for (const tab of ["Markets", "Account", "Trade"]) {
		await tryClick(page, [`nav button:has-text("${tab}")`, `nav a:has-text("${tab}")`, `button:has-text("${tab}")`, `a:has-text("${tab}")`], `mobile tab ${tab}`, results, 3000);
	}
	await tryClick(page, ['button:has-text("Chart")', '[role="tab"]:has-text("Chart")'], "mobile chart page", results, 6000);
	await tryClick(page, ['button:has-text("Connect")', 'button:has-text("Log in")', 'button:has-text("Login")'], "mobile connect modal", results, 6000);
	await page.goto(`${origin}/docs`, { waitUntil: "load", timeout: 60000 });
	await settle(page, 3000);
	await collect(page, "mobile /docs", results);
});

await browser.close();

const scriptViolations = results.flatMap((step) => step.violations.filter((v) => v.directive.startsWith("script-src")).map((v) => ({ step: step.label, ...v })));
const otherViolations = results.flatMap((step) => step.violations.filter((v) => !v.directive.startsWith("script-src")).map((v) => ({ step: step.label, ...v })));
console.log(JSON.stringify({
	origin,
	reportOnlyHeader: header,
	functional,
	steps: results.map((step) => ({ label: step.label, url: step.url, violations: step.violations.length, skipped: step.skipped })),
	scriptSrcViolations: scriptViolations,
	otherViolations: otherViolations.slice(0, 20),
	consoleErrors: consoleErrors.slice(0, 15),
}, null, 2));
