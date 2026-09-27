// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LegalDocPage } from "@/components/legal/legal-doc-page";

const testState = vi.hoisted(() => ({ isMobile: false, isTestnet: false }));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => testState.isMobile }));
vi.mock("@/stores/use-global-settings-store", () => ({ useIsTestnet: () => testState.isTestnet }));
vi.mock("@/components/trade/header/top-nav", () => ({
	TopNav: () => <header data-testid="top-nav">Top navigation</header>,
}));
vi.mock("@/components/trade/mobile/mobile-header", () => ({
	MobileHeader: () => <header data-testid="mobile-header">Mobile header</header>,
}));
vi.mock("@/components/trade/testnet-banner", () => ({
	TestnetBanner: () => <div data-testid="testnet-banner" />,
}));
vi.mock("@/components/trade/footer/footer-bar", () => ({
	FooterBar: () => <footer data-testid="footer-bar">Footer</footer>,
}));
vi.mock("@/components/trade/components/global-modals", () => ({
	GlobalModals: () => <div data-testid="global-modals" />,
}));
vi.mock("@/lib/markdown", () => ({
	renderMarkdown: (content: string) => <p data-testid="document-content">{content}</p>,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const legalPageSource = readFileSync(resolve(process.cwd(), "src/components/legal/legal-doc-page.tsx"), "utf8");
const LEGAL_ROUTE_FILES = ["cookies", "docs", "privacy", "risk", "support", "terms"] as const;

describe("LegalDocPage", () => {
	let container: HTMLDivElement;
	let root: Root | undefined;

	beforeEach(() => {
		testState.isMobile = false;
		testState.isTestnet = false;
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		if (root) {
			act(() => root?.unmount());
			root = undefined;
		}
		container.remove();
	});

	async function renderPage() {
		root = createRoot(container);
		await act(async () => root?.render(<LegalDocPage content="Legal document" />));
		await vi.dynamicImportSettled();
		await act(async () => {});
	}

	it("renders the document inside the application desktop chrome", async () => {
		await renderPage();
		await vi.waitFor(async () => {
			await act(async () => {});
			expect(container.querySelector('[data-testid="footer-bar"]')).not.toBeNull();
			expect(container.querySelector('[data-testid="global-modals"]')).not.toBeNull();
		});

		expect(container.querySelector('[data-testid="top-nav"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="mobile-header"]')).toBeNull();
		expect(container.querySelectorAll("main")).toHaveLength(1);
		expect(container.querySelector("main article")?.getAttribute("lang")).toBe("en");
		expect(container.querySelector("main article")?.getAttribute("dir")).toBe("ltr");
		expect(container.querySelector('[data-testid="document-content"]')?.textContent).toBe("Legal document");
	});

	it("uses the application mobile header and no footer on the phone layout", async () => {
		testState.isMobile = true;
		await renderPage();

		expect(container.querySelector('[data-testid="mobile-header"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="top-nav"]')).toBeNull();
		expect(container.querySelector('[data-testid="footer-bar"]')).toBeNull();
		expect(container.querySelectorAll("main")).toHaveLength(1);
	});

	it("shows the testnet banner above the desktop navigation on testnet", async () => {
		testState.isTestnet = true;
		await renderPage();

		expect(container.querySelector('[data-testid="testnet-banner"]')).not.toBeNull();
	});

	it("has no document-specific navigation of its own", () => {
		expect(legalPageSource).not.toContain("DocumentChrome");
		expect(legalPageSource).not.toContain("<nav");
		expect(legalPageSource).not.toContain("<header");
		expect(legalPageSource).not.toContain("<footer");
		expect(legalPageSource).toContain("DASHBOARD_FRAMES.legal");
	});

	it.each(LEGAL_ROUTE_FILES)("boots /%s like every other dashboard route", (name) => {
		const routeSource = readFileSync(resolve(process.cwd(), `src/routes/${name}.tsx`), "utf8");
		expect(routeSource).toContain("beforeLoad: () => bootDashboardRoute()");
		expect(routeSource).toContain("ssr: false");
		expect(routeSource).not.toContain("ssr: true");
		expect(routeSource).toContain("<LegalDocPage content={content} />");
	});
});
