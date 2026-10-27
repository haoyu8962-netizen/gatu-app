// Renders the Live market posters (src/assets/open-book/btc-{desktop,mobile}.jpg) with the site's own canvas
// code: it serves the built site, replays the stored recording through a stand-in WebSocket at its recorded
// pace, and saves the canvas at the end of the recording. The posters therefore carry the same price scale,
// time scale and mid-price tag as the live view.
//
//   pnpm --filter @sairn/website build
//   node apps/website/scripts/render-open-book-posters.mjs
//   node apps/website/scripts/optimize-images.mjs
//
// Playwright comes from apps/terminal and sharp from the pnpm virtual store. Each viewport replays the
// recording in real time (about 2 min 15 s); both run at once.

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(WEBSITE_ROOT, "../..");
const DIST = resolve(WEBSITE_ROOT, "dist");
const OUT = resolve(WEBSITE_ROOT, "src/assets/open-book");
const POSTER_META = resolve(OUT, "poster.json");
const meta = JSON.parse(readFileSync(POSTER_META, "utf8"));
const RECORDING = resolve(REPO_ROOT, "designs/website-hero-prototype/recorded", meta.recording);
if (!existsSync(resolve(DIST, "index.html"))) throw new Error("dist/index.html is missing: build the website first");

const { chromium } = createRequire(resolve(REPO_ROOT, "apps/terminal/package.json"))("@playwright/test");
const sharp = createRequire(resolve(REPO_ROOT, "node_modules/.pnpm/node_modules/sharp/package.json"))("sharp");

const ORIGIN = "https://site.test";
const TYPES = {
	".html": "text/html; charset=utf-8",
	".css": "text/css",
	".js": "text/javascript",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
	".avif": "image/avif",
	".webp": "image/webp",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".png": "image/png",
	".json": "application/json",
};
const VIEWS = {
	desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.2 },
	mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true },
};

const recording = JSON.parse(readFileSync(RECORDING, "utf8"));
if (recording.coin !== meta.coin) throw new Error(`the recording is for ${recording.coin}, the poster for ${meta.coin}`);
const replayMs = Math.max(...recording.messages.map(([offset]) => offset));
// The recording keeps each level's px and sz only; the live reader also requires the order count `n`, which
// the canvas never uses, so the replay restores it as 1.
const messages = recording.messages.map(([offset, channel, data]) =>
	channel === "l2Book"
		? [offset, channel, { ...data, levels: data.levels.map((side) => side.map((level) => ({ ...level, n: level.n ?? 1 }))) }]
		: [offset, channel, data],
);

function standInWebSocket(messages) {
	class ReplaySocket extends EventTarget {
		static CONNECTING = 0;
		static OPEN = 1;
		static CLOSING = 2;
		static CLOSED = 3;
		readyState = 0;
		subscriptions = 0;
		constructor() {
			super();
			setTimeout(() => {
				this.readyState = 1;
				this.dispatchEvent(new Event("open"));
			}, 50);
		}
		send() {
			this.subscriptions += 1;
			if (this.subscriptions !== 3) return;
			for (const [offset, channel, data] of messages) {
				setTimeout(() => {
					if (this.readyState === 1) this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ channel, data }) }));
				}, offset);
			}
		}
		close() {
			this.readyState = 3;
		}
	}
	window.WebSocket = ReplaySocket;
}

async function render(name) {
	const browser = await chromium.launch();
	try {
		const context = await browser.newContext({ ...VIEWS[name], reducedMotion: "no-preference", colorScheme: "dark" });
		await context.route(`${ORIGIN}/**`, (route) => {
			let file = resolve(DIST, `.${decodeURIComponent(new URL(route.request().url()).pathname)}`);
			if (existsSync(file) && statSync(file).isDirectory()) file = resolve(file, "index.html");
			if (!existsSync(file)) return route.fulfill({ status: 404, body: "" });
			return route.fulfill({ status: 200, body: readFileSync(file), headers: { "content-type": TYPES[extname(file)] ?? "application/octet-stream" } });
		});
		await context.route("https://api.hyperliquid.xyz/**", (route) => route.abort());
		await context.addInitScript(standInWebSocket, messages);
		const page = await context.newPage();
		await page.goto(`${ORIGIN}/`, { waitUntil: "load" });
		await page.locator("#preview-tab-live").click();
		await page.locator("[data-open-book]").scrollIntoViewIfNeeded();
		await page.waitForFunction(() => document.querySelector("[data-open-book]")?.dataset.phase === "live", null, { timeout: 60_000 });
		await page.waitForTimeout(replayMs - 15_000 + 300);
		const phase = await page.evaluate(() => document.querySelector("[data-open-book]")?.dataset.phase);
		if (phase !== "live") throw new Error(`${name}: the view left the live phase (${phase}) before the end of the replay`);
		const png = await page.evaluate(() => document.querySelector("[data-ob-canvas]").toDataURL("image/png"));
		const file = resolve(OUT, meta.posters[name].file);
		const jpeg = await sharp(Buffer.from(png.split(",")[1], "base64")).flatten({ background: "#0f1a1f" }).jpeg({ quality: 90 }).toBuffer();
		writeFileSync(file, jpeg);
		const { width, height } = await sharp(jpeg).metadata();
		console.log(`${name}: ${meta.posters[name].file} ${width}×${height}, ${jpeg.length} B`);
	} finally {
		await browser.close();
	}
}

await Promise.all(Object.keys(VIEWS).map(render));
