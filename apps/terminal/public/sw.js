const CACHE_VERSION = "v10";
const FONT_CACHE = `fonts-${CACHE_VERSION}`;
const ICON_CACHE = `icons-${CACHE_VERSION}`;
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
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
		.then((keys) => Promise.allSettled(keys.filter(isRetiredManagedCache).map((key) => caches.delete(key))))
		.catch(() => undefined);
	// A language link answered by the previous worker booted a shell from an older release that ignores and keeps
	// `?lang=`; once this worker controls the page, load it again so the current shell applies the language.
	const reloadLanguageLinks = claimClients
		.then(() => self.clients.matchAll({ type: "window" }))
		.then((clients) =>
			Promise.allSettled(
				clients
					.filter((client) => hasLanguageParam(client.url))
					.map((client) => client.navigate(client.url)),
			),
		)
		.catch(() => undefined);
	event.waitUntil(
		settleWithin(Promise.all([claimClients, cleanupRetiredCaches, reloadLanguageLinks]), RETIRED_CACHE_CLEANUP_TIMEOUT_MS),
	);
});

// Application routes answered with the shared shell; /join, the pairing page, server endpoints and files are left
// to the network.
function isShellNavigation(url) {
	const pathname = url.pathname.replace(/\/+$/, "") || "/";
	const segment = pathname.slice(pathname.lastIndexOf("/") + 1);
	const dot = segment.lastIndexOf(".");
	return !(
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
	);
}

function hasLanguageParam(href) {
	try {
		const url = new URL(href);
		return url.origin === self.location.origin && isShellNavigation(url) && url.searchParams.has("lang");
	} catch {
		return false;
	}
}

function isRetiredManagedCache(key) {
	return (
		/^(?:charting|fonts|icons|shell|documents)-/.test(key) &&
		![FONT_CACHE, ICON_CACHE, SHELL_CACHE].includes(key)
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
		if (!isShellNavigation(url)) return;
		const cacheKey = new URL(SHELL_CACHE, self.location.origin).href;
		// A link that names a language (`?lang=`, lib/link-locale.ts) is often the first visit after a release, and a
		// cached shell from an older release would boot an entry that ignores the parameter: fetch the current shell.
		if (hasLanguageParam(url.href)) {
			event.respondWith(navigationNetworkFirst(request, SHELL_CACHE, cacheKey, event));
			return;
		}
		event.respondWith(navigationStaleWhileRevalidate(request, SHELL_CACHE, cacheKey, event));
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
			const value = await cache;
			if (value) await value.put(cacheKey, copy);
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
			event.waitUntil(cache.then((value) => value?.put(cacheKey, copy)).catch(() => undefined));
		}
		return response;
	} catch (error) {
		const cached = await cache.then((value) => value?.match(cacheKey)).catch(() => undefined);
		if (cached) return cached;
		throw error;
	}
}

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
