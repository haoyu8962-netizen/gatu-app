import { SCRIPT_LOAD_TIMEOUT_MS } from "@/config/time";

interface LoadScriptOptions {
	async?: boolean;
	timeoutMs?: number;
	isReady?: () => boolean;
}

const scriptPromises = new Map<string, Promise<void>>();

function resolveUrl(src: string): string {
	if (typeof window === "undefined") return src;
	return new URL(src, window.location.href).href;
}

function findScript(src: string): HTMLScriptElement | null {
	const target = resolveUrl(src);
	for (const script of Array.from(document.scripts)) {
		const current = script.src || script.getAttribute("src");
		if (!current) continue;
		if (resolveUrl(current) === target) return script;
	}
	return null;
}

function safeCheckReady(isReady?: () => boolean): boolean {
	if (!isReady) return false;
	try {
		return isReady();
	} catch {
		return false;
	}
}

function isLoadComplete(isReady?: () => boolean): boolean {
	return !isReady || safeCheckReady(isReady);
}

function createNotReadyError(src: string): Error {
	return new Error(`Script loaded but did not initialize: ${src}`);
}

export function loadScript(src: string, options: LoadScriptOptions = {}): Promise<void> {
	if (typeof window === "undefined") return Promise.resolve();
	if (safeCheckReady(options.isReady)) return Promise.resolve();

	const key = resolveUrl(src);
	const existingPromise = scriptPromises.get(key);
	if (existingPromise) {
		return existingPromise.then(() => {
			if (isLoadComplete(options.isReady)) return;
			scriptPromises.delete(key);
			findScript(key)?.remove();
			throw createNotReadyError(src);
		});
	}

	const promise = new Promise<void>((resolve, reject) => {
		if (safeCheckReady(options.isReady)) {
			resolve();
			return;
		}

		let script = findScript(key);
		let timeout: ReturnType<typeof setTimeout> | null = null;

		if (script?.getAttribute("data-load-error") === "true") {
			script.remove();
			script = null;
		}

		if (script?.getAttribute("data-loaded") === "true") {
			if (isLoadComplete(options.isReady)) {
				resolve();
				return;
			}
			script.remove();
			script = null;
		}
		const readyState = (script as (HTMLScriptElement & { readyState?: string }) | null)?.readyState;
		if (readyState === "complete" || readyState === "loaded") {
			if (isLoadComplete(options.isReady)) {
				script?.setAttribute("data-loaded", "true");
				resolve();
				return;
			}
			script?.remove();
			script = null;
		}

		const cleanup = () => {
			if (timeout) {
				clearTimeout(timeout);
				timeout = null;
			}
			if (script) {
				script.removeEventListener("load", onLoad);
				script.removeEventListener("error", onError);
			}
		};

		const onLoad = () => {
			cleanup();
			if (isLoadComplete(options.isReady)) {
				script?.setAttribute("data-loaded", "true");
				script?.removeAttribute("data-load-error");
				resolve();
				return;
			}

			script?.setAttribute("data-load-error", "true");
			script?.remove();
			reject(createNotReadyError(src));
		};

		const onError = () => {
			cleanup();
			script?.setAttribute("data-load-error", "true");
			script?.remove();
			reject(new Error(`Failed to load script: ${src}`));
		};

		let shouldAppend = false;
		if (!script) {
			script = document.createElement("script");
			script.src = key;
			script.async = options.async ?? true;
			script.setAttribute("data-loaded", "false");
			shouldAppend = true;
		}

		// Register handlers before insertion. A cached script can finish synchronously
		// while appendChild is running, especially in mobile WebKit.
		script.addEventListener("load", onLoad);
		script.addEventListener("error", onError);
		if (safeCheckReady(options.isReady)) {
			cleanup();
			script.setAttribute("data-loaded", "true");
			resolve();
			return;
		}

		const timeoutMs = options.timeoutMs ?? SCRIPT_LOAD_TIMEOUT_MS;
		if (timeoutMs > 0) {
			timeout = setTimeout(() => {
				cleanup();
				if (safeCheckReady(options.isReady)) {
					script?.setAttribute("data-loaded", "true");
					resolve();
					return;
				}
				script?.setAttribute("data-load-error", "true");
				script?.remove();
				reject(new Error(`Script load timeout: ${src}`));
			}, timeoutMs);
		}

		if (shouldAppend) {
			try {
				document.head.appendChild(script);
			} catch (error) {
				cleanup();
				script.setAttribute("data-load-error", "true");
				reject(error instanceof Error ? error : new Error(`Failed to append script: ${src}`));
			}
		}
	});

	scriptPromises.set(key, promise);
	void promise.catch(() => {
		if (scriptPromises.get(key) === promise) scriptPromises.delete(key);
	});
	return promise;
}
