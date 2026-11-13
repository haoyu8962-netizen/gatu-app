// @vitest-environment jsdom
import { resolve } from "node:path";
import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	BOOTSTRAP_ENTRY_LOAD_GRACE_MS,
	BOOTSTRAP_ENTRY_WATCHDOG_MS,
	getBootstrapEntryWatchdogScript,
	renderBootstrapErrorPage,
	reportBootstrapEntryStarted,
} from "@/lib/bootstrap-error-page";
import { Route } from "@/routes/__root";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-router")>()),
	HeadContent: () => null,
	Scripts: () => null,
}));
vi.mock("@/providers/root", () => ({ ClientRuntimeGate: ({ fallback }: { fallback: ReactNode }) => fallback }));
vi.mock("@/providers/exchange-scope", () => ({
	ExchangeScopeProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/hyperliquid/hooks/MarketsInfoProvider", () => ({
	MarketsInfoProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/i18n", () => ({
	LOCALE_CATALOG_READY_TIMEOUT_MS: 3000,
	getPersistedLocale: () => "en",
	i18nReady: Promise.resolve(),
}));
vi.mock("@/bones/registry", () => ({}));
vi.mock("@/components/app-runtime-overlays", () => ({ AppRuntimeOverlays: () => null }));

const ENTRY_CALLBACK = "__sairnEntryStarted";

interface Harness {
	reload: ReturnType<typeof vi.fn>;
	deleted: string[];
}

function runWatchdog(options: { caches?: "available" | "missing" | "hanging" } = {}): Harness {
	const reload = vi.fn();
	const deleted: string[] = [];
	const keys = ["assets-v1", "shell-v10", "assets-locale"];
	let fakeCaches: unknown;
	if (options.caches === "available") {
		fakeCaches = {
			keys: async () => keys,
			delete: async (key: string) => {
				deleted.push(key);
				return true;
			},
		};
	}
	if (options.caches === "hanging") fakeCaches = { keys: () => new Promise(() => {}), delete: async () => true };
	new Function("location", "caches", getBootstrapEntryWatchdogScript())({ reload }, fakeCaches);
	return { reload, deleted };
}

function appendEntryScript(): HTMLScriptElement {
	const script = document.createElement("script");
	script.type = "module";
	script.src = "/assets/index-entry.js";
	document.body.append(script);
	return script;
}

function failurePage() {
	return document.querySelector("[data-terminal-bootstrap-error]");
}

describe("bootstrap entry watchdog", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		document.body.replaceChildren();
		document.body.innerHTML = '<div aria-busy="true" data-testid="startup-fallback"></div>';
		window.localStorage.clear();
	});

	afterEach(() => {
		reportBootstrapEntryStarted();
		Reflect.deleteProperty(window, ENTRY_CALLBACK);
		vi.useRealTimers();
		document.body.replaceChildren();
		document.documentElement.lang = "en";
		document.documentElement.dir = "ltr";
		window.localStorage.clear();
	});

	it("shows nothing during an ordinary start and stops once the entry reports", () => {
		runWatchdog();
		const entry = appendEntryScript();
		reportBootstrapEntryStarted();
		entry.dispatchEvent(new Event("error"));
		window.dispatchEvent(new Event("load"));
		vi.advanceTimersByTime(BOOTSTRAP_ENTRY_WATCHDOG_MS * 2);
		expect(failurePage()).toBeNull();
		expect(document.querySelector('[data-testid="startup-fallback"]')).not.toBeNull();
	});

	it.each(["en", "ar", "ja"])("renders the client failure page in %s when the entry module fails to load", (locale) => {
		window.localStorage.setItem("locale-v1", locale);
		renderBootstrapErrorPage({ onReload: () => {} });
		const expected = document.body.innerHTML;
		const expectedLang = document.documentElement.lang;
		const expectedDir = document.documentElement.dir;
		document.body.innerHTML = '<div aria-busy="true"></div>';
		document.documentElement.lang = "en";
		document.documentElement.dir = "ltr";

		runWatchdog();
		appendEntryScript().dispatchEvent(new Event("error"));

		expect(document.body.innerHTML).toBe(expected);
		expect(document.documentElement.lang).toBe(expectedLang);
		expect(document.documentElement.dir).toBe(expectedDir);
		expect(document.activeElement).toBe(document.querySelector("button"));
	});

	it("falls back to English for an unknown or inherited stored locale", () => {
		window.localStorage.setItem("locale-v1", "constructor");
		runWatchdog();
		appendEntryScript().dispatchEvent(new Event("error"));
		expect(document.body.textContent).toContain("The terminal could not start safely.");
		expect(document.documentElement.lang).toBe("en");
	});

	it("ignores load errors that do not prove the entry failed", () => {
		runWatchdog();
		const preload = document.createElement("link");
		preload.rel = "modulepreload";
		preload.href = "/assets/lazy.js";
		const classic = document.createElement("script");
		classic.src = "/charting_library/charting_library.js";
		const image = document.createElement("img");
		document.head.append(preload);
		document.body.append(classic, image);
		for (const element of [preload, classic, image]) element.dispatchEvent(new Event("error"));
		expect(failurePage()).toBeNull();
		preload.remove();
	});

	it("fails after the load grace when the document loaded without the entry starting", () => {
		runWatchdog();
		window.dispatchEvent(new Event("load"));
		vi.advanceTimersByTime(BOOTSTRAP_ENTRY_LOAD_GRACE_MS - 1);
		expect(failurePage()).toBeNull();
		vi.advanceTimersByTime(1);
		expect(failurePage()).not.toBeNull();
	});

	it("stays silent when the entry reports within the load grace", () => {
		runWatchdog();
		window.dispatchEvent(new Event("load"));
		vi.advanceTimersByTime(BOOTSTRAP_ENTRY_LOAD_GRACE_MS - 1);
		reportBootstrapEntryStarted();
		vi.advanceTimersByTime(BOOTSTRAP_ENTRY_WATCHDOG_MS);
		expect(failurePage()).toBeNull();
	});

	it("fails at the watchdog limit when neither the entry nor the load event arrives", () => {
		expect(BOOTSTRAP_ENTRY_WATCHDOG_MS).toBeGreaterThanOrEqual(30_000);
		runWatchdog();
		vi.advanceTimersByTime(BOOTSTRAP_ENTRY_WATCHDOG_MS - 1);
		expect(failurePage()).toBeNull();
		vi.advanceTimersByTime(1);
		expect(failurePage()).not.toBeNull();
	});

	it("clears only the startup asset caches before reloading, once", async () => {
		const harness = runWatchdog({ caches: "available" });
		appendEntryScript().dispatchEvent(new Event("error"));
		const button = document.querySelector("button");
		button?.click();
		button?.click();
		await vi.runAllTimersAsync();
		expect(harness.deleted).toEqual(["assets-v1", "assets-locale"]);
		expect(harness.reload).toHaveBeenCalledOnce();
	});

	it("reloads after the cache timeout when Cache Storage does not answer, and at once without it", async () => {
		const hanging = runWatchdog({ caches: "hanging" });
		appendEntryScript().dispatchEvent(new Event("error"));
		document.querySelector("button")?.click();
		await vi.advanceTimersByTimeAsync(999);
		expect(hanging.reload).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(hanging.reload).toHaveBeenCalledOnce();

		document.body.innerHTML = "<div></div>";
		Reflect.deleteProperty(window, ENTRY_CALLBACK);
		const missing = runWatchdog({ caches: "missing" });
		appendEntryScript().dispatchEvent(new Event("error"));
		document.querySelector("button")?.click();
		expect(missing.reload).toHaveBeenCalledOnce();
	});

	it("never renders a second failure page over the client one", () => {
		runWatchdog();
		renderBootstrapErrorPage({ onReload: () => {} });
		const first = failurePage();
		appendEntryScript().dispatchEvent(new Event("error"));
		expect(document.querySelectorAll("[data-terminal-bootstrap-error]")).toHaveLength(1);
		expect(failurePage()).toBe(first);
	});
});

describe("bootstrap entry watchdog in the shell", () => {
	it("is a hashable inline head script after the theme bootstrap, written verbatim", async () => {
		const { collectInlineScripts, findUnhashableMarkup } = await import(
			resolve(process.cwd(), "../../scripts/collect-inline-script-hashes.mjs")
		);
		const script = getBootstrapEntryWatchdogScript();
		expect(script).not.toMatch(/</);
		const RootDocument = (Route.options as { shellComponent?: unknown }).shellComponent as ComponentType<{
			children: ReactNode;
		}>;
		const html = renderToStaticMarkup(
			<RootDocument>
				<div />
			</RootDocument>,
		);
		expect(html).toContain(`<script>${script}</script>`);
		expect(findUnhashableMarkup(html)).toEqual([]);
		const scripts = collectInlineScripts(html);
		expect(scripts).toHaveLength(2);
		expect(html.indexOf(script)).toBeLessThan(html.indexOf("<body>"));
		expect(Buffer.byteLength(script, "utf8")).toBeLessThan(4096);
	});
});
