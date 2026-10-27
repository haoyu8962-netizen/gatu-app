// Serves the built dist/ to headless Chromium under a fixed origin, for the dist tests that need real layout and
// script loading (no-JavaScript fallback, narrow screens). Every other origin is refused, so the pages never reach
// Hyperliquid's API and the checks do not depend on the network. Chromium comes from the root @playwright/test;
// CI installs it before `test:dist`.

import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

export const ORIGIN = "https://site.test";
const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist");
const TYPES = {
	".html": "text/html",
	".css": "text/css",
	".js": "text/javascript",
	".json": "application/json",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".png": "image/png",
	".webp": "image/webp",
	".avif": "image/avif",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
	".ico": "image/x-icon",
	".xml": "application/xml",
};

export async function launch() {
	return chromium.launch();
}

/**
 * A page on the built site. `block` aborts same-origin paths that match; `delay` holds matching responses back
 * for `delayMs` (a slow module), so a test can look at the page before that script runs.
 */
export async function openPage(
	browser,
	path,
	{ viewport, javaScriptEnabled = true, block = [], delay = [], delayMs = 0, reducedMotion = "reduce" } = {},
) {
	const context = await browser.newContext({ viewport, javaScriptEnabled, deviceScaleFactor: 1, reducedMotion });
	await context.route("**/*", async (route) => {
		const url = new URL(route.request().url());
		if (url.origin !== ORIGIN) return route.abort();
		if (block.some((pattern) => pattern.test(url.pathname))) return route.abort();
		if (delay.some((pattern) => pattern.test(url.pathname))) await new Promise((wait) => setTimeout(wait, delayMs));
		let file = url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname;
		if (!extname(file)) file = `${file}/index.html`;
		const source = join(DIST, file);
		if (!source.startsWith(DIST) || !existsSync(source)) return route.fulfill({ status: 404, body: "" });
		return route.fulfill({ status: 200, contentType: TYPES[extname(source)] ?? "application/octet-stream", body: readFileSync(source) });
	});
	const page = await context.newPage();
	return { context, page };
}
