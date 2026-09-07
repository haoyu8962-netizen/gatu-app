// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { type AnchorHTMLAttributes, act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LegalDocPage } from "@/components/legal/legal-doc-page";

const testState = vi.hoisted(() => ({
	hydrated: false,
	listeners: new Set<() => void>(),
	pathname: "/docs",
	persistedLocale: "en",
}));

vi.mock("@tanstack/react-router", async () => {
	const { forwardRef, useSyncExternalStore } = await import("react");
	return {
		Link: forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; search?: unknown }>(
			({ children, to, search: _search, ...props }, ref) => (
				<a ref={ref} href={to} {...props}>
					{children}
				</a>
			),
		),
		useHydrated: () =>
			useSyncExternalStore(
				(listener) => {
					testState.listeners.add(listener);
					return () => testState.listeners.delete(listener);
				},
				() => testState.hydrated,
				() => false,
			),
		useLocation: () => ({
			pathname: useSyncExternalStore(
				(listener) => {
					testState.listeners.add(listener);
					return () => testState.listeners.delete(listener);
				},
				() => testState.pathname,
				() => "/docs",
			),
		}),
	};
});

vi.mock("@/components/trade/header/language-switcher", () => ({
	LanguageSwitcher: ({ className }: { className?: string }) => (
		<button type="button" className={className} aria-label="Language and number format" />
	),
}));

vi.mock("@/components/trade/header/theme-toggle", () => ({
	ThemeToggle: ({ className }: { className?: string }) => (
		<button type="button" className={className} aria-label="Switch to light mode" />
	),
}));

vi.mock("@/lib/markdown", () => ({
	renderMarkdown: (content: string) => <p data-testid="document-content">{content}</p>,
}));

vi.mock("@/lib/i18n", () => ({
	getPersistedLocale: () => testState.persistedLocale,
	i18nReady: new Promise<void>(() => {}),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const legalPageSource = readFileSync(resolve(process.cwd(), "src/components/legal/legal-doc-page.tsx"), "utf8");
const documentChromeSource = readFileSync(resolve(process.cwd(), "src/components/legal/document-chrome.tsx"), "utf8");
const arabicMessages: Messages = {
	[createHash("sha256").update("Docs\x1f").digest("base64").slice(0, 6)]: "المستندات",
	[createHash("sha256").update("Cookie Policy\x1f").digest("base64").slice(0, 6)]: "سياسة ملفات تعريف الارتباط",
	[createHash("sha256").update("Documentation and legal\x1f").digest("base64").slice(0, 6)]:
		"الوثائق والمعلومات القانونية",
};
function TestDocument({ content = "Legal document" }: { content?: string }) {
	return (
		<I18nProvider i18n={i18n}>
			<LegalDocPage content={content} />
		</I18nProvider>
	);
}

function setHydrated(hydrated: boolean) {
	testState.hydrated = hydrated;
	for (const listener of testState.listeners) listener();
}

describe("LegalDocPage", () => {
	let container: HTMLDivElement;
	let root: Root | undefined;
	let scrollIntoView: ReturnType<typeof vi.fn>;
	let scrollIntoViewDescriptor: PropertyDescriptor | undefined;

	beforeEach(() => {
		setHydrated(false);
		testState.pathname = "/docs";
		testState.persistedLocale = "en";
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
		scrollIntoView = vi.fn();
		Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
			configurable: true,
			value: scrollIntoView,
		});
	});

	afterEach(() => {
		if (root) {
			act(() => root?.unmount());
			root = undefined;
		}
		container.remove();
		if (scrollIntoViewDescriptor) {
			Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollIntoViewDescriptor);
		} else {
			Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
		}
	});

	it("renders one document landmark inside provider-independent chrome", () => {
		setHydrated(true);
		root = createRoot(container);
		act(() => root?.render(<TestDocument />));

		expect(container.querySelectorAll("main")).toHaveLength(1);
		expect(container.querySelector("header")).not.toBeNull();
		expect(container.querySelector("footer")).not.toBeNull();
		expect(container.querySelector('[aria-current="page"]')?.textContent).toBe("Docs");
		expect(container.querySelector('[data-testid="document-content"]')?.textContent).toBe("Legal document");
		expect(container.querySelector("article")?.getAttribute("lang")).toBe("en");
		expect(container.querySelector("article")?.getAttribute("dir")).toBe("ltr");
		expect(container.textContent).toContain("Cookie Policy");
		expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
		const mobileNavigation = [...container.querySelectorAll("header nav")].find((nav) =>
			nav.className.includes("overflow-x-auto"),
		);
		expect(mobileNavigation?.querySelector('[aria-current="page"]')?.className).toContain(
			"focus-visible:outline-offset-[-2px]",
		);

		scrollIntoView.mockClear();
		act(() => root?.render(<TestDocument />));
		expect(scrollIntoView).not.toHaveBeenCalled();

		act(() => {
			testState.pathname = "/risk";
			for (const listener of testState.listeners) listener();
		});
		expect(scrollIntoView).toHaveBeenCalledTimes(1);
		expect(container.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe("/risk");
	});

	it("keeps the mobile document chrome clear of device safe areas", () => {
		setHydrated(true);
		root = createRoot(container);
		act(() => root?.render(<TestDocument />));

		const header = container.querySelector("header");
		const headerInner = header?.firstElementChild;
		const footer = container.querySelector("footer");
		expect(header?.className).toContain("pt-[env(safe-area-inset-top)]");
		expect(headerInner?.className).toContain("pl-[max(1rem,var(--sal))]");
		expect(headerInner?.className).toContain("pr-[max(1rem,var(--sar))]");
		expect(footer?.className).toContain("pb-[calc(env(safe-area-inset-bottom)+0.75rem)]");
		expect(footer?.className).toContain("pl-[max(1rem,var(--sal))]");
		expect(footer?.className).toContain("pr-[max(1rem,var(--sar))]");
	});

	it("hydrates the server document without replacing its landmarks", async () => {
		container.innerHTML = renderToString(<TestDocument />);
		const serverHeader = container.querySelector("header");
		const serverMain = container.querySelector("main");
		const serverFooter = container.querySelector("footer");
		const recoverableErrors: unknown[] = [];
		testState.persistedLocale = "ar";
		i18n.loadAndActivate({ locale: "ar", messages: arabicMessages });

		await act(async () => {
			root = hydrateRoot(container, <TestDocument />, {
				onRecoverableError: (error) => recoverableErrors.push(error),
			});
		});

		expect(recoverableErrors).toHaveLength(0);
		expect(container.querySelector("header")).toBe(serverHeader);
		expect(container.querySelector("main")).toBe(serverMain);
		expect(container.querySelector("footer")).toBe(serverFooter);
		expect(container.querySelector('[aria-current="page"]')?.textContent).toBe("Docs");

		await act(async () => setHydrated(true));
		expect(container.querySelectorAll("header button")).toHaveLength(2);
		expect(container.querySelector('[aria-current="page"]')?.textContent).toBe("المستندات");
		expect(container.querySelector("footer nav")?.getAttribute("aria-label")).toBe("الوثائق والمعلومات القانونية");
		expect(container.querySelector("footer nav")?.textContent).toContain("سياسة ملفات تعريف الارتباط");
		expect(container.querySelector("header")).toBe(serverHeader);
		expect(container.querySelector("main")).toBe(serverMain);
		expect(container.querySelector("footer")).toBe(serverFooter);
	});

	it("hides stale server-language chrome after hydration until the persisted catalog is ready", async () => {
		testState.persistedLocale = "ar";
		root = createRoot(container);
		act(() => root?.render(<TestDocument />));

		expect(container.querySelector("output")).toBeNull();
		expect(container.querySelector('[aria-current="page"]')?.textContent).toBe("Docs");

		await act(async () => setHydrated(true));
		const chrome = container.querySelector('[aria-hidden="true"].invisible');
		expect(container.querySelector("output")?.textContent).toBe("Loading GATU...");
		expect(chrome).not.toBeNull();
		expect(chrome?.querySelector("header")).not.toBeNull();
		expect(chrome?.querySelector("main")).not.toBeNull();
	});

	it("keeps wallet, exchange and terminal overlay modules out of the document tree", () => {
		const documentSources = `${legalPageSource}\n${documentChromeSource}`;
		for (const forbiddenDependency of [
			"@privy-io",
			"wagmi",
			"GlobalModals",
			"UserMenu",
			"useWallet",
			"useHyperliquid",
			"TopNav",
			"MobileHeader",
			"FooterBar",
		]) {
			expect(documentSources, forbiddenDependency).not.toContain(forbiddenDependency);
		}
		expect(documentChromeSource).not.toContain("<main");
		expect(legalPageSource.match(/<main\b/g)).toHaveLength(1);
	});
});
