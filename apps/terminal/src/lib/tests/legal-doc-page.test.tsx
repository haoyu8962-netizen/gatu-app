// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LegalDocPage } from "@/components/legal/legal-doc-page";

const testState = vi.hoisted(() => ({
	isMobile: false,
	isTestnet: false,
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@/lib/lazy", () => ({
	createLazyComponent: (_loader: unknown, exportName: string) => () => <div data-testid={exportName} />,
}));

vi.mock("@/lib/markdown", () => ({
	renderMarkdown: (content: string) => <p data-testid="document-content">{content}</p>,
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useIsTestnet: () => testState.isTestnet,
}));

vi.mock("@/components/trade/header/top-nav", () => ({
	TopNav: () => <header data-testid="top-nav" />,
}));

vi.mock("@/components/trade/mobile/mobile-header", () => ({
	MobileHeader: () => <header data-testid="mobile-header" />,
}));

vi.mock("@/components/trade/testnet-banner", () => ({
	TestnetBanner: () => <div data-testid="testnet-banner" />,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("LegalDocPage", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.isMobile = false;
		testState.isTestnet = false;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderPage() {
		act(() => root.render(<LegalDocPage content="Legal document" />));
	}

	it("keeps the desktop application chrome around the document", () => {
		renderPage();

		expect(container.querySelector('[data-testid="top-nav"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="testnet-banner"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="FooterBar"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="GlobalModals"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="mobile-header"]')).toBeNull();
		expect(container.querySelector("main")?.parentElement?.classList).toContain("pt-11");
		expect(container.querySelector('[data-testid="document-content"]')?.textContent).toBe("Legal document");
	});

	it("reserves space for the testnet banner above the desktop header", () => {
		testState.isTestnet = true;
		renderPage();

		expect(container.querySelector("main")?.parentElement?.classList).toContain("pt-[4.75rem]");
	});

	it("uses the mobile header without mounting the desktop footer", () => {
		testState.isMobile = true;
		renderPage();

		expect(container.querySelector('[data-testid="mobile-header"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="top-nav"]')).toBeNull();
		expect(container.querySelector('[data-testid="testnet-banner"]')).toBeNull();
		expect(container.querySelector('[data-testid="FooterBar"]')).toBeNull();
	});
});
