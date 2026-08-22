const CACHE_VERSION = "v8";
const FONT_CACHE = `fonts-${CACHE_VERSION}`;
const ICON_CACHE = `icons-${CACHE_VERSION}`;
const RETIRED_CACHE_CLEANUP_TIMEOUT_MS = 1_500;

const MAX_ICON_ENTRIES = 500;
const MAX_ICON_AGE_MS = 7 * 24 * 60 * 60 * 1000;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
	const claimClients = Promise.resolve()
		.then(() => self.clients.claim())
		.catch(() => undefined);
	const cleanupRetiredCaches = Promise.resolve()
		.then(() => caches.keys())
		.then((keys) =>
			Promise.allSettled(
				keys.filter(isRetiredManagedCache).map((key) => caches.delete(key)),
			),
		)
		.catch(() => undefined);
	event.waitUntil(settleWithin(Promise.all([claimClients, cleanupRetiredCaches]), RETIRED_CACHE_CLEANUP_TIMEOUT_MS));
});

function isRetiredManagedCache(key) {
	return /^(?:charting|fonts|icons)-/.test(key) && ![FONT_CACHE, ICON_CACHE].includes(key);
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

	if (request.destination === "font") {
		event.respondWith(cacheFirst(request, FONT_CACHE, event));
		return;
	}

	if (
		url.hostname === "app.hyperliquid.xyz" &&
		url.pathname.startsWith("/coins/")
	) {
		event.respondWith(staleWhileRevalidate(request, ICON_CACHE, event));
		return;
	}
});

async function cacheFirst(request, cacheName, event) {
	const cached = await caches.match(request).catch(() => undefined);
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) {
		const write = caches
			.open(cacheName)
			.then((cache) => cache.put(request, response.clone()))
			.catch(() => undefined);
		event.waitUntil(write);
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
				const value = await cache;
				if (value) {
					await value.put(request, response.clone());
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
