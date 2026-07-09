const CACHE_VERSION = "v6";
const CHARTING_CACHE = `charting-${CACHE_VERSION}`;
const FONT_CACHE = `fonts-${CACHE_VERSION}`;
const ICON_CACHE = `icons-${CACHE_VERSION}`;

const MAX_ICON_ENTRIES = 500;
const MAX_ICON_AGE_MS = 7 * 24 * 60 * 60 * 1000;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((k) => ![CHARTING_CACHE, FONT_CACHE, ICON_CACHE].includes(k))
						.map((k) => caches.delete(k)),
				),
			)
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	const url = new URL(request.url);

	if (request.method !== "GET") return;

	if (url.pathname.startsWith("/charting_library/")) {
		event.respondWith(chartingLibraryResponse(request, url));
		return;
	}

	if (request.destination === "font") {
		event.respondWith(cacheFirst(request, FONT_CACHE));
		return;
	}

	if (
		url.hostname === "app.hyperliquid.xyz" &&
		url.pathname.startsWith("/coins/")
	) {
		event.respondWith(staleWhileRevalidate(request, ICON_CACHE));
		return;
	}
});

async function cacheFirst(request, cacheName) {
	const cached = await caches.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) {
		const cache = await caches.open(cacheName);
		cache.put(request, response.clone());
	}
	return response;
}

function chartingLibraryResponse(request, url) {
	if (url.pathname.endsWith("/sameorigin.html") || url.pathname.endsWith("/charting_library.js")) {
		return staleWhileRevalidateDocument(request, CHARTING_CACHE);
	}

	return cacheFirst(request, CHARTING_CACHE);
}

async function staleWhileRevalidateDocument(request, cacheName) {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(request);
	const fetched = fetch(request)
		.then(async (response) => {
			if (response.ok) {
				await cache.put(request, response.clone());
			}
			return response;
		})
		.catch((error) => cached || Promise.reject(error));
	return cached || fetched;
}

async function staleWhileRevalidate(request, cacheName) {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(request);
	const fetched = fetch(request)
		.then(async (response) => {
			if (isCacheableResponse(response)) {
				await cache.put(request, response.clone());
				await evictOldEntries(cache, MAX_ICON_ENTRIES);
			}
			return response;
		})
		.catch((error) => cached || Promise.reject(error));
	return cached || fetched;
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
