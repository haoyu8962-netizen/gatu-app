const CACHE_VERSION = "v11";
const ASSET_CACHE = `assets-${CACHE_VERSION}`;
const FONT_CACHE = `fonts-${CACHE_VERSION}`;
const ICON_CACHE = `icons-${CACHE_VERSION}`;
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const RETIRED_CACHE_CLEANUP_TIMEOUT_MS = 1_500;

const MAX_ICON_ENTRIES = 500;
const MAX_ICON_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ADR 0051: the shell is updated exactly as in v10; when it changes, the assets it references are refreshed in the
// background on a best-effort basis, and that refresh never decides whether the shell is updated.
const ASSET_REFRESH_CONCURRENCY = 6;
const ASSET_REFRESH_TIMEOUT_MS = 60_000;
const SHELL_ASSET_LINK_RELS = new Set(["modulepreload", "preload", "stylesheet"]);
// The surface-specific startup lists written by scripts/inject-shell-preloads.mjs (SURFACE_PRELOAD_META).
const SURFACE_PRELOAD_META_NAMES = new Set(["sairn-preload-desktop", "sairn-preload-mobile"]);
const PRECOMPRESSED_ASSET = /\.(?:br|gz|zst)$/;
// The JavaScript MIME type essence matches of the HTML standard.
const JAVASCRIPT_TYPES = new Set([
	"application/ecmascript",
	"application/javascript",
	"application/x-ecmascript",
	"application/x-javascript",
	"text/ecmascript",
	"text/javascript",
	"text/javascript1.0",
	"text/javascript1.1",
	"text/javascript1.2",
	"text/javascript1.3",
	"text/javascript1.4",
	"text/javascript1.5",
	"text/jscript",
	"text/livescript",
	"text/x-ecmascript",
	"text/x-javascript",
]);

let latestShellHtml;
let assetRefreshQueue = Promise.resolve();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
	const claimClients = Promise.resolve()
		.then(() => self.clients.claim())
		.catch(() => undefined);
	const cleanupRetiredCaches = Promise.resolve()
		.then(() => caches.keys())
		.then((keys) => Promise.allSettled(keys.filter(isRetiredManagedCache).map((key) => caches.delete(key))))
		.catch(() => undefined);
	event.waitUntil(settleWithin(Promise.all([claimClients, cleanupRetiredCaches]), RETIRED_CACHE_CLEANUP_TIMEOUT_MS));
});

function isRetiredManagedCache(key) {
	return (
		/^(?:assets|charting|fonts|icons|shell|documents)-/.test(key) &&
		![ASSET_CACHE, FONT_CACHE, ICON_CACHE, SHELL_CACHE].includes(key)
	);
}

function settleWithin(promise, timeoutMs) {
	return new Promise((resolve) => {
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			resolve();
		};
		const timeout = setTimeout(finish, timeoutMs);
		promise.then(finish, finish);
	});
}

self.addEventListener("fetch", (event) => {
	const { request } = event;
	const url = new URL(request.url);

	if (request.method !== "GET") return;

	if (request.mode === "navigate") {
		if (url.origin !== self.location.origin) return;
		const pathname = url.pathname.replace(/\/+$/, "") || "/";
		const segment = pathname.slice(pathname.lastIndexOf("/") + 1);
		const dot = segment.lastIndexOf(".");
		if (
			pathname === "/join" ||
			pathname.startsWith("/join/") ||
			pathname === "/api" ||
			pathname.startsWith("/api/") ||
			pathname === "/client-error-report" ||
			pathname === "/mobile-agent-sync-ticket" ||
			pathname.startsWith("/mobile-agent-sync-ticket/") ||
			/^\/mobile-agent-sync(\/|$)/i.test(pathname) ||
			pathname.startsWith("/_serverFn/") ||
			(dot >= 0 && /^[A-Za-z0-9]{1,16}$/.test(segment.slice(dot + 1)))
		)
			return;
		const cacheKey = new URL(SHELL_CACHE, self.location.origin).href;
		// A link that names a language (`?lang=`, lib/link-locale.ts) is often the first visit after a release, and a
		// cached shell from an older release would boot an entry that ignores the parameter: fetch the current shell.
		if (url.searchParams.has("lang")) {
			event.respondWith(navigationNetworkFirst(request, SHELL_CACHE, cacheKey, event));
			return;
		}
		event.respondWith(navigationStaleWhileRevalidate(request, SHELL_CACHE, cacheKey, event));
		return;
	}

	if (isImmutableAsset(url) && !request.headers.has("range")) {
		event.respondWith(assetCacheFirst(request, event));
		return;
	}

	if (request.destination === "font") {
		event.respondWith(cacheFirst(request, FONT_CACHE, event));
		return;
	}

	if (url.hostname === "app.hyperliquid.xyz" && url.pathname.startsWith("/coins/")) {
		event.respondWith(staleWhileRevalidate(request, ICON_CACHE, event));
		return;
	}
});

function navigationStaleWhileRevalidate(request, cacheName, cacheKey, event) {
	const cache = caches.open(cacheName).catch(() => undefined);
	const cached = cache.then((value) => value?.match(cacheKey)).catch(() => undefined);
	const fetched = fetch(request);
	const refresh = fetched
		.then(async (response) => {
			if (!isCacheableShell(response)) return;
			const copy = response.clone();
			const html = readText(response);
			const value = await cache;
			if (value) await putShell(value, cacheKey, copy, html, { prefetch: true });
		})
		.catch(() => undefined);
	event.waitUntil(refresh);
	return cached.then((value) => value || fetched);
}

function isCacheableShell(response) {
	const contentType = response.headers.get("content-type") ?? "";
	return (
		response.status === 200 &&
		!response.redirected &&
		contentType.split(";")[0].trim().toLowerCase() === "text/html"
	);
}

async function navigationNetworkFirst(request, cacheName, cacheKey, event) {
	const cache = caches.open(cacheName).catch(() => undefined);
	try {
		const response = await fetch(request);
		if (isCacheableShell(response)) {
			const copy = response.clone();
			const html = readText(response);
			// The page is loading this shell's assets itself, so the background refresh only removes old ones.
			event.waitUntil(
				cache.then((value) => value && putShell(value, cacheKey, copy, html, { prefetch: false })).catch(() => undefined),
			);
			return response;
		}
		if (response.status < 500) return response;
		const cached = await cache.then((value) => value?.match(cacheKey)).catch(() => undefined);
		return cached || response;
	} catch (error) {
		const cached = await cache.then((value) => value?.match(cacheKey)).catch(() => undefined);
		if (cached) return cached;
		throw error;
	}
}

function readText(response) {
	return response
		.clone()
		.text()
		.catch(() => undefined);
}

// Stores the shell as v10 did; reading the previous shell and refreshing assets only follow the write.
async function putShell(cache, cacheKey, copy, html, options) {
	const previous = await Promise.resolve()
		.then(() => cache.match(cacheKey))
		.then((value) => value?.text())
		.catch(() => undefined);
	await cache.put(cacheKey, copy);
	const next = await html;
	if (next === undefined) return;
	latestShellHtml = next;
	if (previous === undefined || previous === next) return;
	await queueAssetRefresh(previous, next, options);
}

function queueAssetRefresh(previousHtml, html, options) {
	const run = assetRefreshQueue.then(() => refreshAssets(previousHtml, html, options)).catch(() => undefined);
	assetRefreshQueue = run;
	return run;
}

// One refresh at a time, skipped when a newer shell has been stored since it was queued. It keeps only what the new
// and the previous shell reference, then fetches what the new shell references and the cache lacks. It is capped at
// ASSET_REFRESH_TIMEOUT_MS and ignores every failure.
async function refreshAssets(previousHtml, html, { prefetch }) {
	if (html !== latestShellHtml) return;
	const controller = new AbortController();
	const { signal } = controller;
	const stopped = new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
	const timer = setTimeout(() => controller.abort(), ASSET_REFRESH_TIMEOUT_MS);
	try {
		await Promise.race([updateAssets(previousHtml, html, prefetch, signal), stopped]);
	} finally {
		clearTimeout(timer);
		controller.abort();
	}
}

async function updateAssets(previousHtml, html, prefetch, signal) {
	const cache = await openCache(ASSET_CACHE);
	if (!cache || signal.aborted) return;
	const wanted = shellAssetUrls(html);
	const keep = new Set([...wanted, ...shellAssetUrls(previousHtml)]);
	const keys = await cache.keys();
	if (signal.aborted) return;
	await Promise.allSettled(keys.filter((key) => !keep.has(key.url)).map((key) => cache.delete(key)));
	if (!prefetch || signal.aborted) return;
	const queue = [...wanted];
	async function work() {
		while (queue.length > 0 && !signal.aborted) {
			const href = queue.shift();
			if (await matchAsset(cache, href)) continue;
			if (signal.aborted) return;
			await storeAsset(cache, href, signal);
		}
	}
	await Promise.all(Array.from({ length: ASSET_REFRESH_CONCURRENCY }, work));
}

async function storeAsset(cache, href, signal) {
	try {
		const response = await fetch(href, { credentials: "same-origin", signal });
		if (signal.aborted || !isStorableAsset(href, response)) return;
		await cache.put(href, response);
	} catch {
		return;
	}
}

// Same scope as the immutable `assets/` rule of deploy/cloudfront/deploy.mjs objectCacheControl; the content-hashed
// TradingView files stay with the HTTP cache (chart-asset-cache-policy.test.ts).
function isImmutableAsset(url) {
	return (
		url.origin === self.location.origin &&
		url.pathname.startsWith("/assets/") &&
		url.search === "" &&
		!PRECOMPRESSED_ASSET.test(url.pathname)
	);
}

function openCache(cacheName) {
	return Promise.resolve()
		.then(() => caches.open(cacheName))
		.catch(() => undefined);
}

function matchAsset(cache, href) {
	if (!cache) return Promise.resolve(undefined);
	return Promise.resolve()
		.then(() => cache.match(href, { ignoreVary: true }))
		.catch(() => undefined);
}

function isStorableAsset(href, response) {
	if (response.status !== 200 || response.redirected) return false;
	if (/(?:^|[\s,])no-store(?:$|[\s,;])/i.test(response.headers.get("cache-control") ?? "")) return false;
	const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
	const pathname = new URL(href).pathname;
	if (/\.m?js$/i.test(pathname)) return JAVASCRIPT_TYPES.has(type);
	if (/\.css$/i.test(pathname)) return type === "text/css";
	return type !== "text/html";
}

async function assetCacheFirst(request, event) {
	const cache = await openCache(ASSET_CACHE);
	const cached = await matchAsset(cache, request.url);
	if (cached) return cached;
	const response = await fetch(request);
	if (cache && isStorableAsset(request.url, response)) {
		const copy = response.clone();
		event.waitUntil(
			Promise.resolve()
				.then(() => cache.put(request.url, copy))
				.catch(() => undefined),
		);
	}
	return response;
}

// A small scanner instead of global replacements: comments are skipped, a tag is read up to a `>` outside quotes, and
// the body of a script is skipped up to its closing tag, so markup inside comments or inline scripts never counts.
function shellAssetUrls(html) {
	const hrefs = new Set();
	function add(value) {
		if (!value) return;
		let url;
		try {
			url = new URL(value, self.location.origin);
		} catch {
			return;
		}
		if (isImmutableAsset(url)) hrefs.add(url.href);
	}
	const lower = html.toLowerCase();
	let index = 0;
	while (index < html.length) {
		const open = html.indexOf("<", index);
		if (open < 0) break;
		if (html.startsWith("<!--", open)) {
			const close = html.indexOf("-->", open + 4);
			if (close < 0) break;
			index = close + 3;
			continue;
		}
		const name = /^<(script|link|meta)(?=[\s/>])/i.exec(html.slice(open, open + 8));
		if (!name) {
			index = open + 1;
			continue;
		}
		const tag = name[1].toLowerCase();
		const start = open + name[0].length;
		const end = tagEnd(html, start);
		if (end < 0) break;
		const attributes = readAttributes(html.slice(start, end));
		if (tag === "link") {
			const rels = (attributes.get("rel") ?? "").toLowerCase().split(/\s+/);
			if (rels.some((rel) => SHELL_ASSET_LINK_RELS.has(rel))) add(attributes.get("href"));
		} else if (tag === "script") {
			add(attributes.get("src"));
		} else if (SURFACE_PRELOAD_META_NAMES.has(attributes.get("name"))) {
			for (const href of (attributes.get("content") ?? "").split(/\s+/)) add(href);
		}
		index = end + 1;
		if (tag === "script") {
			const close = lower.indexOf("</script", index);
			if (close < 0) break;
			index = close + "</script".length;
		}
	}
	return [...hrefs];
}

function tagEnd(html, from) {
	let quote = "";
	let previous = "";
	for (let index = from; index < html.length; index += 1) {
		const character = html[index];
		if (quote) {
			if (character === quote) quote = "";
		} else if ((character === '"' || character === "'") && previous === "=") {
			quote = character;
		} else if (character === ">") {
			return index;
		}
		if (!/\s/.test(character)) previous = character;
	}
	return -1;
}

function readAttributes(source) {
	const attributes = new Map();
	for (const [, name, double, single, bare] of source.matchAll(
		/([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
	)) {
		attributes.set(name.toLowerCase(), double ?? single ?? bare ?? "");
	}
	return attributes;
}

async function cacheFirst(request, cacheName, event) {
	const cache = await openCache(cacheName);
	const cached = await Promise.resolve()
		.then(() => cache?.match(request))
		.catch(() => undefined);
	if (cached) return cached;
	const response = await fetch(request);
	if (cache && response.ok) {
		const copy = response.clone();
		event.waitUntil(
			Promise.resolve()
				.then(() => cache.put(request, copy))
				.catch(() => undefined),
		);
	}
	return response;
}

function staleWhileRevalidate(request, cacheName, event) {
	const cache = caches.open(cacheName).catch(() => undefined);
	const cached = cache.then((value) => value?.match(request)).catch(() => undefined);
	const fetched = fetch(request);
	const refresh = fetched
		.then(async (response) => {
			if (isCacheableResponse(response)) {
				const copy = response.clone();
				const value = await cache;
				if (value) {
					await value.put(request, copy);
					await evictOldEntries(value, MAX_ICON_ENTRIES);
				}
			}
		})
		.catch(() => undefined);
	event.waitUntil(refresh);
	return cached.then((value) => value || fetched);
}

function isCacheableResponse(response) {
	if (response.type === "opaque") return true;
	const contentType = response.headers.get("content-type") ?? "";
	return response.ok && contentType.toLowerCase().startsWith("image/");
}

async function evictOldEntries(cache, maxEntries) {
	const keys = await cache.keys();
	if (keys.length > maxEntries) {
		await cache.delete(keys[0]);
	}
}
