// Captures the hero screenshots from the live, signed-out terminal: BTC with the market selector open at
// Traditional Finance › Pre-IPO. Writes src/assets/terminal-desktop.jpeg (1600 × 900),
// src/assets/terminal-mobile.jpeg (390 × 844 viewport at 2×) and src/assets/terminal-capture.json.
//
//   node apps/website/scripts/capture-hero.mjs
//
// Playwright comes from apps/terminal. Headless Chromium needs an unsandboxed shell on macOS.
// Every capture is refused when the page shows a signed-in session, a wallet address, an open HIP-3
// deployer disclaimer or a test/dev marker.

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(WEBSITE_ROOT, "../..");
const ASSETS = resolve(WEBSITE_ROOT, "src/assets");

const brand = JSON.parse(readFileSync(resolve(REPO_ROOT, "brand/brand.json"), "utf8"));
const APP_HOST = brand.domains.primary.app;
const APP_URL = `https://${APP_HOST}`;
const CAPTURE_URL = `${APP_URL}/trade/BTC`;

const require = createRequire(resolve(REPO_ROOT, "apps/terminal/package.json"));
const { chromium } = require("@playwright/test");

const ADDRESS = /0x[0-9a-fA-F]{40}/;
const TEST_MARKERS = /\btestnet\b|\blocalhost\b|\bstaging\b|\bdev build\b|127\.0\.0\.1/i;
const JPEG_QUALITY = 82;

const SURFACES = [
	{
		name: "desktop",
		file: "terminal-desktop.jpeg",
		context: { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 },
	},
	{
		name: "mobile",
		file: "terminal-mobile.jpeg",
		context: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
	},
];

async function readBuild() {
	const response = await fetch(`${APP_URL}/build-meta.json`, { cache: "no-store" });
	if (!response.ok) throw new Error(`build-meta.json answered HTTP ${response.status}`);
	const meta = await response.json();
	const build = {};
	for (const key of ["name", "version", "commit", "release", "builtAt"]) {
		if (typeof meta[key] !== "string" || meta[key] === "") throw new Error(`build-meta.json has no ${key}`);
		build[key] = meta[key];
	}
	return build;
}

async function waitForTerminal(page) {
	await page.goto(CAPTURE_URL, { waitUntil: "load" });
	await page.locator('[aria-label="Select token"]:visible').first().waitFor({ state: "visible", timeout: 60_000 });
	await page.locator('[aria-label^="Ask, Price"]').first().waitFor({ state: "attached", timeout: 60_000 });
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(4_000);
}

async function openPreIpo(page) {
	await page.locator('[aria-label="Select token"]:visible').first().click();
	const selector = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Select market" }) });
	await selector.waitFor({ state: "visible" });
	await selector.locator("button", { hasText: /^Traditional Finance$/ }).first().click();
	await selector.locator("button", { hasText: /^Pre-IPO$/ }).first().click();
	for (const name of [/^OPENAI\b/, /^ANTH\b/]) {
		await selector.getByText(name).first().waitFor({ state: "visible", timeout: 30_000 });
	}
	await page.mouse.move(0, 0);
	await page.waitForTimeout(1_500);
}

// Before the selector opens the Connect control must be visible; a modal phone sheet then hides it from
// the accessibility tree, so afterwards it only has to remain in the page.
async function guard(page, surface, { connectVisible }) {
	const problems = [];
	if (new URL(page.url()).host !== APP_HOST) problems.push(`left ${APP_HOST}: ${page.url()}`);
	const connect = page.locator("button").filter({ hasText: /^Connect( Wallet)?$/ });
	const signedOut = connectVisible ? await connect.first().isVisible() : (await connect.count()) > 0;
	if (!signedOut) problems.push("no Connect control: the session may be signed in");
	const text = await page.evaluate(() => document.body.innerText);
	if (ADDRESS.test(text)) problems.push("a wallet address is visible");
	const marker = TEST_MARKERS.exec(text);
	if (marker) problems.push(`test or dev marker "${marker[0]}"`);
	if (await page.getByText("HIP-3 Deployer Disclaimer").isVisible()) problems.push("the HIP-3 deployer disclaimer is open");
	if (problems.length > 0) throw new Error(`${surface.name} capture refused:\n  - ${problems.join("\n  - ")}`);
}

const build = await readBuild();
const browser = await chromium.launch();
const captures = {};
try {
	for (const surface of SURFACES) {
		const context = await browser.newContext({ ...surface.context, colorScheme: "dark", locale: "en-US" });
		const page = await context.newPage();
		await waitForTerminal(page);
		await guard(page, surface, { connectVisible: true });
		await openPreIpo(page);
		await guard(page, surface, { connectVisible: false });
		const path = resolve(ASSETS, surface.file);
		await page.screenshot({ path, type: "jpeg", quality: JPEG_QUALITY });
		captures[surface.name] = {
			file: surface.file,
			viewport: surface.context.viewport,
			deviceScaleFactor: surface.context.deviceScaleFactor,
		};
		await context.close();
	}
} finally {
	await browser.close();
}

const record = { url: CAPTURE_URL, capturedAt: new Date().toISOString(), build, captures };
writeFileSync(resolve(ASSETS, "terminal-capture.json"), `${JSON.stringify(record, null, "\t")}\n`);
console.log(`captured ${CAPTURE_URL} at ${record.capturedAt} (${build.release}, ${build.commit.slice(0, 8)})`);
