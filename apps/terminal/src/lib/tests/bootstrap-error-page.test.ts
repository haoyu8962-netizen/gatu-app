// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAssetCachesThenReload, renderBootstrapErrorPage } from "@/lib/bootstrap-error-page";

describe("bootstrap error page", () => {
	beforeEach(() => {
		document.body.replaceChildren();
		window.localStorage.clear();
	});

	afterEach(() => {
		document.body.replaceChildren();
		document.documentElement.lang = "en";
		document.documentElement.dir = "ltr";
		vi.restoreAllMocks();
		window.localStorage.clear();
	});

	it("renders once and reloads only after one explicit button activation", () => {
		const onReload = vi.fn();

		renderBootstrapErrorPage({ onReload });
		const firstFallback = document.querySelector("[data-terminal-bootstrap-error]");
		renderBootstrapErrorPage({ onReload });

		expect(document.querySelectorAll("[data-terminal-bootstrap-error]")).toHaveLength(1);
		expect(document.querySelectorAll("main")).toHaveLength(1);
		expect(document.querySelector("main")?.getAttribute("role")).toBeNull();
		expect(document.querySelector("main")?.querySelector('[role="alert"]')).not.toBeNull();
		expect(document.querySelector("[data-terminal-bootstrap-error]")).toBe(firstFallback);
		expect(onReload).not.toHaveBeenCalled();

		const reloadButton = document.querySelector<HTMLButtonElement>("button");
		expect(reloadButton).not.toBeNull();
		expect(document.activeElement).toBe(reloadButton);
		expect(reloadButton?.style.backgroundColor).toBe("rgb(134, 229, 211)");
		expect(reloadButton?.style.color).toBe("rgb(8, 9, 13)");
		expect(getContrastRatio("#86e5d3", "#08090d")).toBeGreaterThanOrEqual(4.5);
		reloadButton?.click();
		reloadButton?.click();

		expect(onReload).toHaveBeenCalledOnce();
	});

	it("uses the persisted locale and direction without waiting for the application catalog", () => {
		window.localStorage.setItem("locale-v1", "ar");

		renderBootstrapErrorPage();

		const fallback = document.querySelector<HTMLElement>("[data-terminal-bootstrap-error]");
		expect(document.documentElement.lang).toBe("ar");
		expect(document.documentElement.dir).toBe("rtl");
		expect(fallback?.lang).toBe("ar");
		expect(fallback?.dir).toBe("rtl");
		expect(fallback?.textContent).toContain("حدث خطأ ما");
		expect(fallback?.textContent).toContain("إعادة تحميل المنصة");
	});

	it("renders the persisted Japanese fallback without loading a catalog", () => {
		window.localStorage.setItem("locale-v1", "ja");
		renderBootstrapErrorPage();
		expect(document.documentElement.lang).toBe("ja");
		expect(document.documentElement.dir).toBe("ltr");
		expect(document.body.textContent).toContain(
			"取引ターミナルを安全に起動できませんでした。取引する前に再読み込みしてください。",
		);
		expect(document.querySelector("button")?.textContent).toBe("ターミナルを再読み込み");
	});

	it("fails closed to English when persisted locale storage cannot be read", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("storage unavailable");
		});

		renderBootstrapErrorPage();

		expect(document.documentElement.lang).toBe("en");
		expect(document.documentElement.dir).toBe("ltr");
		expect(document.body.textContent).toContain("The terminal could not start safely.");
	});

	it("stays on system fonts so the recovery text never waits for a blocked webfont", () => {
		renderBootstrapErrorPage();

		const fallback = document.querySelector<HTMLElement>("[data-terminal-bootstrap-error]");
		expect(fallback?.style.fontFamily).toBe("system-ui, sans-serif");
	});
});

describe("bootstrap error page reload", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("deletes only the Service Worker asset caches before reloading", async () => {
		const deleted: string[] = [];
		vi.stubGlobal("caches", {
			keys: async () => ["assets-v11", "assets-v12", "shell-v11", "fonts-v11"],
			delete: async (key: string) => {
				deleted.push(key);
				return true;
			},
		});
		const reload = vi.fn();
		await clearAssetCachesThenReload(reload);
		expect(deleted).toEqual(["assets-v11", "assets-v12"]);
		expect(reload).toHaveBeenCalledOnce();
	});

	it("still reloads when Cache Storage throws, is missing or never answers", async () => {
		const reload = vi.fn();
		vi.stubGlobal("caches", {
			keys: () => {
				throw new Error("storage unavailable");
			},
		});
		await clearAssetCachesThenReload(reload);
		vi.stubGlobal("caches", undefined);
		await clearAssetCachesThenReload(reload);
		vi.useFakeTimers();
		vi.stubGlobal("caches", { keys: () => new Promise(() => {}) });
		const stalled = clearAssetCachesThenReload(reload);
		await vi.advanceTimersByTimeAsync(1_000);
		await stalled;
		expect(reload).toHaveBeenCalledTimes(3);
	});
});

function getContrastRatio(foreground: string, background: string): number {
	const foregroundLuminance = getRelativeLuminance(foreground);
	const backgroundLuminance = getRelativeLuminance(background);
	return (
		(Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
		(Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
	);
}

function getRelativeLuminance(hex: string): number {
	const channels = hex
		.slice(1)
		.match(/.{2}/g)
		?.map((channel) => Number.parseInt(channel, 16) / 255);
	if (!channels || channels.length !== 3) throw new Error(`Invalid color: ${hex}`);
	const [red, green, blue] = channels.map((channel) =>
		channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
	);
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
