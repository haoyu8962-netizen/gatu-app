const CACHE_VERSION = "v11";
const ASSET_CACHE = `assets-${CACHE_VERSION}`;
const FONT_CACHE = `fonts-${CACHE_VERSION}`;
const ICON_CACHE = `icons-${CACHE_VERSION}`;
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const RETIRED_CACHE_CLEANUP_TIMEOUT_MS = 1_500;

const MAX_ICON_ENTRIES = 500;
const MAX_ICON_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ADR 0052: the shell is written exactly as in v10. After each write, a serial, best-effort sync reconciles the asset
// cache with the shell actually cached; it never decides whether the shell is updated.
const ASSET_SYNC_CONCURRENCY = 6;
const ASSET_SYNC_TIMEOUT_MS = 60_000;
const ASSET_LOOKUP_TIMEOUT_MS = 1_500;
// The asset cache entry, outside /assets/, listing the startup assets this asset cache was last reconciled with.
const ASSET_MANIFEST = `asset-manifest-${CACHE_VERSION}`;
const RELOAD_REQUEST_MODES = new Set(["reload", "no-cache", "no-store"]);
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

let assetSyncQueue = Promise.resolve();
let shellWrites = 0;

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
			const spare = response.clone();
			const value = await cache;
			if (value) await afterShellPut(value.put(cacheKey, copy), value, cacheKey, spare);
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
			const spare = response.clone();
			event.waitUntil(
				cache.then((value) => value && afterShellPut(value.put(cacheKey, copy), value, cacheKey, spare)).catch(() => undefined),
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

// Runs after the v10 shell write. A write refused for quota empties the asset cache, which is rebuildable and shares
// the origin's quota with the shell, and tries once more with the spare copy, unless another shell was stored in the
// meantime; any other failure is swallowed as in v10. A stored shell queues the asset sync.
function afterShellPut(put, cache, cacheKey, spare) {
	return put.then(
		() => {
			shellWrites += 1;
			return queueAssetSync();
		},
		async (error) => {
			if (error?.name !== "QuotaExceededError") return;
			const writes = shellWrites;
			await Promise.resolve()
				.then(() => caches.delete(ASSET_CACHE))
				.catch(() => undefined);
			if (shellWrites !== writes) return;
			await cache.put(cacheKey, spare);
			shellWrites += 1;
			return queueAssetSync();
		},
	);
}

function assetManifestKey() {
	return new URL(ASSET_MANIFEST, self.location.origin).href;
}

function queueAssetSync() {
	const run = assetSyncQueue.then(syncAssets).catch(() => undefined);
	assetSyncQueue = run;
	return run;
}

// One sync at a time; every failure is ignored. The time limit aborts only the requests the sync makes: the sync then
// waits for its Cache API operations to finish on their own, so a late delete can never land after the next sync. A
// Cache API operation that never returns therefore holds back every later sync of this worker (never a shell write).
async function syncAssets() {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ASSET_SYNC_TIMEOUT_MS);
	try {
		await reconcileAssets(controller.signal);
	} finally {
		clearTimeout(timer);
		controller.abort();
	}
}

// Reconciles the asset cache with the shell actually in the cache, never with a shell some navigation fetched. The
// manifest lives in the asset cache itself, so it disappears with it: it lists the startup assets of the shell this
// asset cache was last reconciled with. On first takeover it is just the first list seen, whose assets the page's own
// loads store (the other layout's list is not guaranteed to be cached). It moves only after every listed asset is in
// the cache, so an interrupted sync is simply done again by the next one.
async function reconcileAssets(signal) {
	const shellCache = await openCache(SHELL_CACHE);
	if (!shellCache || signal.aborted) return;
	const cache = await openCache(ASSET_CACHE);
	if (!cache || signal.aborted) return;
	let state = await readAssetState(shellCache, cache);
	if (!state || signal.aborted || sameAssets(state.recorded, state.wanted)) return;
	if (!state.recorded) {
		await writeAssetManifest(cache, state.wanted);
		return;
	}
	const keys = await cache.keys();
	if (signal.aborted) return;
	state = await readAssetState(shellCache, cache);
	if (!state?.recorded || signal.aborted || sameAssets(state.recorded, state.wanted)) return;
	const { wanted, recorded } = state;
	const keep = new Set([...wanted, ...recorded, assetManifestKey()]);
	await Promise.allSettled(keys.filter((key) => !keep.has(key.url)).map((key) => cache.delete(key)));
	const queue = [...wanted];
	async function work() {
		while (queue.length > 0 && !signal.aborted) {
			const href = queue.shift();
			if (await matchAsset(cache, href)) continue;
			if (signal.aborted) return;
			await storeAsset(cache, href, signal);
		}
	}
	await Promise.all(Array.from({ length: ASSET_SYNC_CONCURRENCY }, work));
	if (signal.aborted) return;
	for (const href of wanted) {
		if (!(await matchAsset(cache, href))) return;
	}
	if (signal.aborted) return;
	await writeAssetManifest(cache, wanted);
}

async function readAssetState(shellCache, cache) {
	const html = await readCachedText(shellCache, new URL(SHELL_CACHE, self.location.origin).href);
	if (html === undefined) return undefined;
	const manifest = await readCachedText(cache, assetManifestKey());
	let recorded;
	try {
		recorded = manifest === undefined ? undefined : JSON.parse(manifest);
	} catch {
		recorded = undefined;
	}
	return { wanted: shellAssetUrls(html), recorded: Array.isArray(recorded) ? recorded : undefined };
}

function readCachedText(cache, key) {
	return Promise.resolve()
		.then(() => cache.match(key))
		.then((value) => value?.text())
		.catch(() => undefined);
}

function writeAssetManifest(cache, hrefs) {
	const body = JSON.stringify([...hrefs].sort());
	return cache.put(assetManifestKey(), new Response(body, { headers: { "content-type": "application/json" } }));
}

function sameAssets(recorded, wanted) {
	if (!recorded || recorded.length !== wanted.length) return false;
	const set = new Set(recorded);
	return wanted.every((href) => set.has(href));
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

function cacheDirectives(response) {
	return new Set(
		(response.headers.get("cache-control") ?? "")
			.split(",")
			.map((directive) => directive.split("=")[0].trim().toLowerCase())
			.filter(Boolean),
	);
}

// Only what the origin itself declares immutable, and does not forbid or ask to revalidate, is stored. Dropping
// `immutable` from /assets/ stops new writes; entries already stored keep answering until CACHE_VERSION changes.
function isStorableAsset(href, response) {
	if (response.status !== 200 || response.redirected) return false;
	const directives = cacheDirectives(response);
	if (!directives.has("immutable") || directives.has("no-store") || directives.has("no-cache")) return false;
	const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
	const pathname = new URL(href).pathname;
	if (/\.m?js$/i.test(pathname)) return JAVASCRIPT_TYPES.has(type);
	if (/\.css$/i.test(pathname)) return type === "text/css";
	return type !== "text/html";
}

function withinTimeout(promise, timeoutMs) {
	return new Promise((resolve) => {
		const timeout = setTimeout(() => resolve(undefined), timeoutMs);
		promise.then(
			(value) => {
				clearTimeout(timeout);
				resolve(value);
			},
			() => {
				clearTimeout(timeout);
				resolve(undefined);
			},
		);
	});
}

async function lookupAsset(href) {
	const cache = await openCache(ASSET_CACHE);
	return { cache, cached: await matchAsset(cache, href) };
}

function storeAfterResponse(event, cache, href, response) {
	if (!isStorableAsset(href, response)) return;
	const copy = response.clone();
	event.waitUntil(
		Promise.resolve(cache)
			.then((value) => value?.put(href, copy))
			.catch(() => undefined),
	);
}

// The cache lookup is bounded: past ASSET_LOOKUP_TIMEOUT_MS the request goes to the network and nothing is written. A
// reload-type request goes to the network at once and is written afterwards, best effort.
async function assetCacheFirst(request, event) {
	if (RELOAD_REQUEST_MODES.has(request.cache)) {
		const response = await fetch(request);
		storeAfterResponse(event, openCache(ASSET_CACHE), request.url, response);
		return response;
	}
	const lookup = await withinTimeout(lookupAsset(request.url), ASSET_LOOKUP_TIMEOUT_MS);
	if (lookup?.cached) return lookup.cached;
	const response = await fetch(request);
	if (lookup?.cache) storeAfterResponse(event, lookup.cache, request.url, response);
	return response;
}

// A small scanner instead of global replacements. Every tag is read whole, honouring quoted attribute values, before
// its name is looked at, so markup inside another tag's attribute never counts; comments are skipped (`<!-->` and
// `<!--->` end at once, and `-->` or `--!>` ends one, as in HTML); a script's body is skipped up to `</script` followed
// by whitespace, `/` or `>`; a repeated attribute keeps its first value. It only guarantees to read in full the forms
// scripts/inject-shell-preloads.mjs writes. `<noscript>`, CDATA and character references in attribute values (`&#46;`)
// are not handled; reading them wrongly can only make a prefetch incomplete or larger, never affect a shell update.
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
			index = commentEnd(html, open);
			if (index < 0) break;
			continue;
		}
		if (!/[A-Za-z/]/.test(html[open + 1] ?? "")) {
			index = open + 1;
			continue;
		}
		const end = tagEnd(html, open + 1);
		if (end < 0) break;
		index = end + 1;
		const source = html.slice(open + 1, end);
		const name = /^[A-Za-z][^\s/>]*/.exec(source)?.[0];
		if (!name) continue;
		const tag = name.toLowerCase();
		const attributes = readAttributes(source.slice(name.length));
		if (tag === "link") {
			const rels = (attributes.get("rel") ?? "").toLowerCase().split(/\s+/);
			if (rels.some((rel) => SHELL_ASSET_LINK_RELS.has(rel))) add(attributes.get("href"));
		} else if (tag === "script") {
			add(attributes.get("src"));
			index = scriptEnd(lower, index);
			if (index < 0) break;
		} else if (tag === "meta" && SURFACE_PRELOAD_META_NAMES.has(attributes.get("name"))) {
			for (const href of (attributes.get("content") ?? "").split(/\s+/)) add(href);
		}
	}
	return [...hrefs];
}

function commentEnd(html, open) {
	if (html.startsWith("<!-->", open)) return open + 5;
	if (html.startsWith("<!--->", open)) return open + 6;
	const ends = [html.indexOf("-->", open + 4), html.indexOf("--!>", open + 4)].filter((index) => index >= 0);
	if (ends.length === 0) return -1;
	const close = Math.min(...ends);
	return close + (html.startsWith("--!>", close) ? 4 : 3);
}

function scriptEnd(lower, from) {
	let close = lower.indexOf("</script", from);
	while (close >= 0 && !/[\s/>]/.test(lower[close + 8] ?? "")) close = lower.indexOf("</script", close + 1);
	return close < 0 ? -1 : close + 8;
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
		const key = name.toLowerCase();
		if (!attributes.has(key)) attributes.set(key, double ?? single ?? bare ?? "");
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
