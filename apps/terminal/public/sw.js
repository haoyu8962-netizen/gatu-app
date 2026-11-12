const CACHE_VERSION = "v11";
const ASSET_CACHE = `assets-${CACHE_VERSION}`;
const FONT_CACHE = `fonts-${CACHE_VERSION}`;
const ICON_CACHE = `icons-${CACHE_VERSION}`;
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const RETIRED_CACHE_CLEANUP_TIMEOUT_MS = 1_500;

const MAX_ICON_ENTRIES = 500;
const MAX_ICON_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ADR 0051: a new shell replaces the cached one only after every startup asset it references is in ASSET_CACHE.
const SHELL_ASSET_PREFETCH_CONCURRENCY = 6;
const SHELL_ASSET_PREFETCH_TIMEOUT_MS = 60_000;
const SHELL_ASSET_LINK_RELS = new Set(["modulepreload", "preload", "stylesheet"]);
// The surface-specific startup lists written by scripts/inject-shell-preloads.mjs (SURFACE_PRELOAD_META).
const SURFACE_PRELOAD_META_NAMES = new Set(["sairn-preload-desktop", "sairn-preload-mobile"]);
const PRECOMPRESSED_ASSET = /\.(?:br|gz|zst)$/;

const assetDownloads = new Map();
const shellJobs = new Map();
let shellRefreshSequence = 0;
let committedShellSequence = 0;
let shellCommitQueue = Promise.resolve();

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

function settleWithin(promise, timeoutMs, fallback) {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (value) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			resolve(value);
		};
		const timeout = setTimeout(() => finish(fallback), timeoutMs);
		promise.then(finish, () => finish(fallback));
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
			event.respondWith(navigationNetworkFirst(request, cacheKey, event));
			return;
		}
		event.respondWith(navigationStaleWhileRevalidate(request, cacheKey, event));
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

function isCacheableAsset(response) {
	const contentType = response.headers.get("content-type") ?? "";
	return (
		response.status === 200 &&
		!response.redirected &&
		contentType.split(";")[0].trim().toLowerCase() !== "text/html"
	);
}

// One network request per asset at a time, shared by the page and the shell prefetch. The first response is never read:
// every consumer and the cache write take their own clone, so no clone is attempted on a body already handed out.
function downloadAsset(href, request, cache) {
	const existing = assetDownloads.get(href);
	if (existing) return existing;
	const response = request ? fetch(request) : fetch(href, { credentials: "same-origin" });
	const stored = response
		.then((value) => {
			if (!cache || !isCacheableAsset(value)) return false;
			return cache.put(href, value.clone()).then(() => true);
		})
		.catch(() => false);
	const download = { response, stored };
	assetDownloads.set(href, download);
	stored.then(() => {
		if (assetDownloads.get(href) === download) assetDownloads.delete(href);
	});
	return download;
}

async function assetCacheFirst(request, event) {
	const cache = await openCache(ASSET_CACHE);
	const cached = await matchAsset(cache, request.url);
	if (cached) return cached;
	const download = downloadAsset(request.url, request, cache);
	event.waitUntil(download.stored);
	return (await download.response).clone();
}

function navigationStaleWhileRevalidate(request, cacheKey, event) {
	const cache = openCache(SHELL_CACHE);
	const cached = cache.then((value) => value?.match(cacheKey)).catch(() => undefined);
	const fetched = fetch(request);
	const sequence = ++shellRefreshSequence;
	const refresh = fetched
		.then((response) => {
			if (!isCacheableShell(response)) return;
			return refreshShell(response.clone(), cacheKey, sequence);
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

async function navigationNetworkFirst(request, cacheKey, event) {
	const cache = openCache(SHELL_CACHE);
	const sequence = ++shellRefreshSequence;
	try {
		const response = await fetch(request);
		if (isCacheableShell(response)) {
			event.waitUntil(refreshShell(response.clone(), cacheKey, sequence).catch(() => undefined));
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

// `response` is a private copy of a cacheable shell. It replaces the cached shell only after every startup asset it
// references is stored; on any failure, timeout or storage error the previous shell stays and the next navigation
// tries again. Navigations that fetch the same shell share one job, and an older shell never replaces a newer one.
async function refreshShell(response, cacheKey, sequence) {
	const copy = response.clone();
	const html = await response.text();
	const existing = shellJobs.get(html);
	if (existing) {
		existing.sequence = Math.max(existing.sequence, sequence);
		return existing.done;
	}
	const job = { sequence, assets: shellAssetUrls(html), done: undefined };
	shellJobs.set(html, job);
	job.done = runShellJob(job, html, copy, cacheKey)
		.catch(() => undefined)
		.finally(() => shellJobs.delete(html));
	return job.done;
}

async function runShellJob(job, html, copy, cacheKey) {
	const shellCache = await openCache(SHELL_CACHE);
	if (!shellCache) return;
	const prefetch = { stopped: false };
	const complete = await settleWithin(prefetchAssets(job.assets, prefetch), SHELL_ASSET_PREFETCH_TIMEOUT_MS, false);
	prefetch.stopped = true;
	if (!complete) return;
	await queueShellCommit(async () => {
		if (job.sequence < committedShellSequence) return;
		const previous = await readCachedShell(shellCache, cacheKey);
		const switched = previous !== undefined && previous !== html;
		const assetCache = job.assets.length > 0 || switched ? await openCache(ASSET_CACHE) : undefined;
		for (const href of job.assets) {
			if (!(await matchAsset(assetCache, href))) return;
		}
		await shellCache.put(cacheKey, copy);
		committedShellSequence = job.sequence;
		if (assetCache && switched) await pruneAssets(assetCache, html, previous);
	});
}

function queueShellCommit(commit) {
	const next = shellCommitQueue.then(commit);
	shellCommitQueue = next.catch(() => undefined);
	return next;
}

async function readCachedShell(shellCache, cacheKey) {
	const cached = await Promise.resolve()
		.then(() => shellCache.match(cacheKey))
		.catch(() => undefined);
	if (!cached) return undefined;
	return cached.text().catch(() => undefined);
}

async function prefetchAssets(hrefs, prefetch) {
	if (hrefs.length === 0) return true;
	const cache = await openCache(ASSET_CACHE);
	if (!cache) return false;
	const queue = [...hrefs];
	let failed = false;
	async function work() {
		while (!prefetch.stopped && queue.length > 0) {
			const href = queue.shift();
			if (await matchAsset(cache, href)) continue;
			if (await downloadAsset(href, undefined, cache).stored) continue;
			failed = true;
			prefetch.stopped = true;
		}
	}
	await Promise.all(Array.from({ length: SHELL_ASSET_PREFETCH_CONCURRENCY }, work));
	return !failed && queue.length === 0;
}

// After a release switch the cache keeps what the new and the previous shell reference and what another shell being
// prefetched needs; lazily loaded chunks of the previous release go, and an unchanged one is fetched again on use.
async function pruneAssets(cache, html, previous) {
	const keep = new Set([...shellAssetUrls(html), ...shellAssetUrls(previous)]);
	for (const job of shellJobs.values()) for (const href of job.assets) keep.add(href);
	const keys = await cache.keys();
	await Promise.allSettled(keys.filter((key) => !keep.has(key.url)).map((key) => cache.delete(key)));
}

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
	const markup = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script\s*>/gi, "$1");
	for (const [, name, source] of markup.matchAll(/<(link|script|meta)\b([^>]*)>/gi)) {
		const attributes = readAttributes(source);
		const tag = name.toLowerCase();
		if (tag === "link") {
			const rels = (attributes.get("rel") ?? "").toLowerCase().split(/\s+/);
			if (rels.some((rel) => SHELL_ASSET_LINK_RELS.has(rel))) add(attributes.get("href"));
		} else if (tag === "script") {
			add(attributes.get("src"));
		} else if (SURFACE_PRELOAD_META_NAMES.has(attributes.get("name"))) {
			for (const href of (attributes.get("content") ?? "").split(/\s+/)) add(href);
		}
	}
	return [...hrefs];
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
	const cache = openCache(cacheName);
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
