// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/config/app";
import {
	applyLinkLocale,
	applyWindowLinkLocale,
	LINK_LOCALE_PARAM,
	parseLinkLocale,
	storeLocale,
	withoutLinkLocale,
} from "@/lib/link-locale";

describe("parseLinkLocale", () => {
	it("reads a maintained interface language from ?lang=", () => {
		expect(parseLinkLocale("?lang=ja")).toBe("ja");
		expect(parseLinkLocale("?utm_source=newsletter&lang=zh&utm_content=cta")).toBe("zh");
		expect(parseLinkLocale("?lang=en")).toBe("en");
	});

	it("ignores case and falls back from a region tag to its language", () => {
		expect(parseLinkLocale("?lang=JA")).toBe("ja");
		expect(parseLinkLocale("?lang=ja-JP")).toBe("ja");
		expect(parseLinkLocale("?lang=pt_BR")).toBeNull();
	});

	it("ignores a missing, empty or unknown language", () => {
		expect(parseLinkLocale("")).toBeNull();
		expect(parseLinkLocale("?lang=")).toBeNull();
		expect(parseLinkLocale("?lang=de")).toBeNull();
		expect(parseLinkLocale("?lang=__proto__")).toBeNull();
		expect(parseLinkLocale("?language=ja")).toBeNull();
	});
});

describe("withoutLinkLocale", () => {
	it("removes only the language parameter and keeps the route, the other parameters and the hash", () => {
		expect(
			withoutLinkLocale(
				"/trade/xyz:ANT",
				"?lang=ja&utm_source=newsletter&utm_medium=email&utm_campaign=anthropic_ipo_jp&utm_content=preipo_trade_cta",
				"",
			),
		).toBe(
			"/trade/xyz:ANT?utm_source=newsletter&utm_medium=email&utm_campaign=anthropic_ipo_jp&utm_content=preipo_trade_cta",
		);
		expect(withoutLinkLocale("/trade/BTC", "?lang=ja", "#book")).toBe("/trade/BTC#book");
		expect(withoutLinkLocale("/trade/BTC", "?lang=de&scope=all", "")).toBe("/trade/BTC?scope=all");
	});

	it("removes every repeated language parameter; the first one decides", () => {
		expect(parseLinkLocale("?lang=ja&lang=zh")).toBe("ja");
		expect(parseLinkLocale("?lang=de&lang=ja")).toBeNull();
		expect(withoutLinkLocale("/trade/BTC", "?lang=de&utm_source=x&lang=ja", "")).toBe("/trade/BTC?utm_source=x");
		expect(withoutLinkLocale("/trade/BTC", "", "#lang=ja")).toBeNull();
	});

	it("leaves a URL without the parameter alone", () => {
		expect(LINK_LOCALE_PARAM).toBe("lang");
		expect(withoutLinkLocale("/trade/BTC", "?utm_source=newsletter", "")).toBeNull();
		expect(withoutLinkLocale("/", "", "")).toBeNull();
	});
});

describe("applyLinkLocale", () => {
	afterEach(() => {
		window.history.replaceState(null, "", "/");
	});

	function openAt(url: string) {
		window.history.replaceState({ key: "kept" }, "", url);
		return vi.fn(() => true);
	}

	function address() {
		return `${window.location.pathname}${window.location.search}${window.location.hash}`;
	}

	it("stores the linked language and cleans the address without losing the route, UTM, hash or history state", () => {
		const persist = openAt("/trade/xyz:ANT?lang=ja&utm_source=newsletter&utm_content=preipo_trade_cta#chart");
		expect(applyLinkLocale(window.location, window.history, persist)).toBe("ja");
		expect(persist).toHaveBeenCalledExactlyOnceWith("ja");
		expect(address()).toBe("/trade/xyz:ANT?utm_source=newsletter&utm_content=preipo_trade_cta#chart");
		expect(window.history.state).toEqual({ key: "kept" });
	});

	it("can name English, which clears an earlier stored language through the same persist path", () => {
		const persist = openAt("/trade/BTC?lang=en");
		expect(applyLinkLocale(window.location, window.history, persist)).toBe("en");
		expect(persist).toHaveBeenCalledExactlyOnceWith("en");
		expect(address()).toBe("/trade/BTC");
	});

	it("stores nothing for an unknown language but still removes the parameter", () => {
		const persist = openAt("/trade/BTC?lang=de&utm_source=newsletter");
		expect(applyLinkLocale(window.location, window.history, persist)).toBeNull();
		expect(persist).not.toHaveBeenCalled();
		expect(address()).toBe("/trade/BTC?utm_source=newsletter");
	});

	it("changes nothing without the parameter", () => {
		const persist = openAt("/trade/BTC?utm_source=newsletter");
		const replaceState = vi.spyOn(window.history, "replaceState");
		expect(applyLinkLocale(window.location, window.history, persist)).toBeNull();
		expect(persist).not.toHaveBeenCalled();
		expect(replaceState).not.toHaveBeenCalled();
		replaceState.mockRestore();
	});

	it("reports that nothing was stored when storage is unavailable, and survives a history that refuses", () => {
		window.history.replaceState(null, "", "/trade/BTC?lang=ja");
		const history = {
			state: null,
			replaceState: () => {
				throw new Error("SecurityError");
			},
		};
		expect(applyLinkLocale(window.location, history, () => false)).toBeNull();
	});
});

// The client entry is executed for real (its dynamic imports mocked, as in client-bootstrap-error.test.ts): the link
// language must be stored and the address cleaned before hydration starts, and the bootstrap error page shown when
// the runtime fails to load must already use it. lib/i18n.ts cannot be evaluated in this config (the Lingui catalog
// loader is a Vite plugin), so its second, top-level call is pinned by source: an unindented statement (Biome
// formatting indents anything inside a function) placed before the boot reads the stored language.
describe("client entry", () => {
	beforeEach(() => {
		vi.resetModules();
		window.localStorage.clear();
		document.body.replaceChildren();
	});
	afterEach(() => {
		vi.doUnmock("../error-reporting/client");
		vi.doUnmock("../../client-hydrate");
		vi.doUnmock("../bootstrap/early-prefetch");
		vi.restoreAllMocks();
		window.history.replaceState(null, "", "/");
		window.localStorage.clear();
		document.body.replaceChildren();
	});

	function mockEntryImports(hydrate: () => Record<string, never>) {
		vi.doMock("../bootstrap/early-prefetch", () => ({ startEarlyPrefetches: vi.fn() }));
		vi.doMock("../error-reporting/client", () => ({
			installGlobalErrorReporting: vi.fn(() => () => {}),
			reportClientError: vi.fn(),
		}));
		vi.doMock("../../client-hydrate", hydrate);
	}

	it("stores the link language and cleans the address before hydration starts", async () => {
		window.history.replaceState({ key: "kept" }, "", "/trade/xyz:ANT?lang=ja&utm_source=newsletter#chart");
		let atHydration: { stored: string | null; address: string; state: unknown } | undefined;
		mockEntryImports(() => {
			atHydration = {
				stored: window.localStorage.getItem(STORAGE_KEYS.LOCALE),
				address: `${window.location.pathname}${window.location.search}${window.location.hash}`,
				state: window.history.state,
			};
			return {};
		});
		await import("../../client");
		await vi.waitFor(() => expect(atHydration).toBeDefined());
		expect(atHydration).toEqual({
			stored: "ja",
			address: "/trade/xyz:ANT?utm_source=newsletter#chart",
			state: { key: "kept" },
		});
	});

	it("shows the bootstrap error page in the link language when the runtime cannot load", async () => {
		window.history.replaceState(null, "", "/trade/BTC?lang=ja");
		mockEntryImports(() => {
			throw new Error("chunk failed");
		});
		await import("../../client");
		await vi.waitFor(() => expect(document.querySelector('[role="alert"]')).not.toBeNull());
		expect(document.body.textContent).toContain("エラーが発生しました");
		expect(document.documentElement.lang).toBe("ja");
	});
});

describe("lib/i18n.ts", () => {
	const i18nSource = readFileSync(resolve(process.cwd(), "src/lib/i18n.ts"), "utf8");

	it("applies the link language again as a top-level statement before the boot reads the stored language", () => {
		const apply = i18nSource.search(/^applyWindowLinkLocale\(\);$/m);
		const boot = i18nSource.indexOf("const initialLocale = getPersistedLocale();");
		expect(apply).toBeGreaterThan(-1);
		expect(boot).toBeGreaterThan(apply);
		expect(i18nSource).toContain("if (!storeLocale(locale))");
		expect(i18nSource).not.toMatch(/localStorage\.(?:setItem|removeItem)/);
	});
});

describe("storeLocale", () => {
	afterEach(() => {
		window.localStorage.clear();
	});

	it("stores a language and removes the key for English, like the language menu", () => {
		expect(storeLocale("ja")).toBe(true);
		expect(window.localStorage.getItem(STORAGE_KEYS.LOCALE)).toBe("ja");
		expect(storeLocale("en")).toBe(true);
		expect(window.localStorage.getItem(STORAGE_KEYS.LOCALE)).toBeNull();
	});

	it("reports a failure when storage refuses the write", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("QuotaExceededError");
		});
		expect(storeLocale("ja")).toBe(false);
		vi.restoreAllMocks();
	});

	it("applies a link language from the window through storage", () => {
		window.history.replaceState(null, "", "/trade/BTC?lang=ja&utm_source=newsletter");
		expect(applyWindowLinkLocale()).toBe("ja");
		expect(window.localStorage.getItem(STORAGE_KEYS.LOCALE)).toBe("ja");
		expect(window.location.search).toBe("?utm_source=newsletter");
		window.history.replaceState(null, "", "/");
	});
});
