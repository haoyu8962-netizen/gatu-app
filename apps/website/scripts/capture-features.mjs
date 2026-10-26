// Captures the six Features visuals from the live, signed-out terminal and writes them to
// src/assets/features/ with a capture record (features-capture.json). Same guards as capture-hero.mjs:
// every capture is refused when the page shows a signed-in session, a wallet address, a test/dev marker,
// an open HIP-3 deployer disclaimer or any other open dialog.
//
//   node apps/website/scripts/capture-features.mjs [view ...]
//
// Playwright comes from apps/terminal. Headless Chromium may need an unsandboxed shell on macOS.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(WEBSITE_ROOT, "../..");
const OUT = resolve(WEBSITE_ROOT, "src/assets/features");
const RECORD = resolve(OUT, "features-capture.json");

const brand = JSON.parse(readFileSync(resolve(REPO_ROOT, "brand/brand.json"), "utf8"));
const APP_HOST = brand.domains.primary.app;
const APP_URL = `https://${APP_HOST}`;

const require = createRequire(resolve(REPO_ROOT, "apps/terminal/package.json"));
const { chromium } = require("@playwright/test");

const ADDRESS = /0x[0-9a-fA-F]{40}/;
const TEST_MARKERS = /\btestnet\b|\blocalhost\b|\bstaging\b|\bdev build\b|127\.0\.0\.1/i;
const JPEG_QUALITY = 84;
// The terminal reads its interface language from this storage key before the first render.
const LOCALE_STORAGE_KEY = "locale-v1";

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/** Each view: the page, how to prepare it, and the part of the viewport to keep (CSS pixels). */
const VIEWS = {
	language: {
		path: "/trade/BTC",
		context: PHONE,
		locale: "ar",
		clip: null,
		alt: "The terminal on a phone in Arabic with a right-to-left layout, signed out, on BTC",
	},
	email: {
		path: "/trade/BTC",
		context: DESKTOP,
		clip: { x: 1000, y: 0, width: 440, height: 660 },
		alt: "The signed-out order form on BTC with the Connect control, where you choose email or your own wallet",
	},
	tpsl: {
		path: "/trade/BTC",
		context: DESKTOP,
		prepare: async (page) => {
			await page.locator("button:visible, [role=tab]:visible", { hasText: /^Limit$/ }).first().click();
			await page.waitForTimeout(800);
		},
		clip: { x: 1000, y: 56, width: 440, height: 660 },
		alt: "The order form on BTC, signed out, on the Limit tab, with Reduce Only and TP/SL options",
	},
	workspace: {
		path: "/trade/HYPE/USDC",
		context: DESKTOP,
		clip: { x: 0, y: 0, width: 1440, height: 900 },
		alt: "The terminal signed out on the HYPE/USDC spot market: chart, order book and order form",
	},
	phone: {
		path: "/trade/ETH",
		context: PHONE,
		clip: null,
		alt: "The terminal on a phone, signed out, on ETH",
	},
	more: {
		path: "/earn",
		context: DESKTOP,
		clip: { x: 0, y: 0, width: 1440, height: 470 },
		alt: "The top of the terminal's Earn page, signed out, with the navigation to Portfolio, Earn, Vaults, Staking, Referrals and Leaderboard",
		waitFor: null,
	},
};

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

async function guard(page, name) {
	const problems = [];
	if (new URL(page.url()).host !== APP_HOST) problems.push(`left ${APP_HOST}: ${page.url()}`);
	const connect = page.locator("button").filter({ hasText: /Connect|اتصال|ربط|توصيل/ });
	if ((await connect.count()) === 0) problems.push("no Connect control: the session may be signed in");
	const text = await page.evaluate(() => document.body.innerText);
	if (ADDRESS.test(text)) problems.push("a wallet address is visible");
	const marker = TEST_MARKERS.exec(text);
	if (marker) problems.push(`test or dev marker "${marker[0]}"`);
	if ((await page.getByRole("dialog").count()) > 0 && (await page.getByRole("dialog").first().isVisible())) {
		problems.push("a dialog is open");
	}
	if (problems.length > 0) throw new Error(`${name} capture refused:\n  - ${problems.join("\n  - ")}`);
}

const requested = process.argv.slice(2);
const names = requested.length > 0 ? requested : Object.keys(VIEWS);
for (const name of names) if (!VIEWS[name]) throw new Error(`unknown view ${name}`);

mkdirSync(OUT, { recursive: true });
const build = await readBuild();
const previous = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, "utf8")) : { captures: {} };
const captures = { ...previous.captures };
const browser = await chromium.launch();
try {
	for (const name of names) {
		const view = VIEWS[name];
		const context = await browser.newContext({ ...view.context, colorScheme: "dark", locale: "en-US" });
		if (view.locale) {
			await context.addInitScript(
				([key, value]) => {
					try {
						window.localStorage.setItem(key, value);
					} catch {}
				},
				[LOCALE_STORAGE_KEY, view.locale],
			);
		}
		const page = await context.newPage();
		const url = `${APP_URL}${view.path}`;
		await page.goto(url, { waitUntil: "load" });
		if (view.path.startsWith("/trade/") && !view.locale) {
			await page.locator('[aria-label^="Ask, Price"]').first().waitFor({ state: "attached", timeout: 60_000 });
		}
		await page.evaluate(() => document.fonts.ready);
		await page.waitForTimeout(view.locale ? 30_000 : 5_000);
		await guard(page, name);
		if (view.prepare) await view.prepare(page);
		await page.mouse.move(0, 0);
		await page.waitForTimeout(800);
		await guard(page, name);
		const file = `${name}.jpeg`;
		await page.screenshot({
			path: resolve(OUT, file),
			type: "jpeg",
			quality: JPEG_QUALITY,
			...(view.clip ? { clip: view.clip } : {}),
		});
		captures[name] = {
			file,
			url,
			capturedAt: new Date().toISOString(),
			locale: view.locale ?? "en",
			viewport: view.context.viewport,
			deviceScaleFactor: view.context.deviceScaleFactor,
			clip: view.clip,
			alt: view.alt,
		};
		await context.close();
		console.log(`captured ${name} from ${url}`);
	}
} finally {
	await browser.close();
}

writeFileSync(RECORD, `${JSON.stringify({ build, captures }, null, "\t")}\n`);
