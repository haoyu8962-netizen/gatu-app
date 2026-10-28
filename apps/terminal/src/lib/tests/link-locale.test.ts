// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyLinkLocale, LINK_LOCALE_PARAM, parseLinkLocale, withoutLinkLocale } from "@/lib/link-locale";

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

// The real module cannot be evaluated in this test config (the Lingui catalog loader is a Vite plugin), so this
// pins the order that makes the link language reach the first render: the link is applied at module evaluation
// with the same persist function as the language menu, before the boot reads the stored language.
describe("terminal boot order", () => {
	const source = readFileSync(resolve(process.cwd(), "src/lib/i18n.ts"), "utf8");

	it("applies the link language with the menu's persist function before the boot reads the stored language", () => {
		const apply = source.indexOf("applyLinkLocale(window.location, window.history, persistLocale);");
		const boot = source.indexOf("const initialLocale = getPersistedLocale();");
		expect(apply).toBeGreaterThan(-1);
		expect(boot).toBeGreaterThan(apply);
		expect(source.slice(0, apply)).toMatch(/if \(typeof window !== "undefined"\) $/);
		expect(source.slice(source.lastIndexOf("\n", apply), apply)).not.toMatch(/^\s*(?:function|=>)/);
	});
});
