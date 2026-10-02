// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEO_DEFAULTS } from "@/config/seo";
import { TabTitleSync } from "@/hooks/use-document-title";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";

const runtime = vi.hoisted(() => ({
	formatLocale: "en-US",
	market: { kind: "perp", pairName: "HYPE-USDC", szDecimals: 2 } as {
		kind: "perp" | "spot";
		pairName: string | undefined;
		szDecimals: number;
	},
	perpPrice: "61.12" as string | undefined,
	spotPrice: "62.23" as string | undefined,
	useSubscription: vi.fn(),
}));

vi.mock("@/lib/hyperliquid", () => ({
	getMarketApiCoin: () => "HYPE",
	getSpotMarketApiCoin: () => "@107",
	useSelectedMarketInfo: () => ({ data: runtime.market }),
	useSubscription: runtime.useSubscription,
}));
vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => runtime.formatLocale,
}));

describe("market document title ownership", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		runtime.formatLocale = "en-US";
		runtime.market = { kind: "perp", pairName: "HYPE-USDC", szDecimals: 2 };
		runtime.perpPrice = "61.12";
		runtime.spotPrice = "62.23";
		runtime.useSubscription.mockReset();
		runtime.useSubscription.mockImplementation((type: string) => ({
			data: { ctx: { markPx: type === "activeAssetCtx" ? runtime.perpPrice : runtime.spotPrice } },
		}));
		document.title = SEO_DEFAULTS.defaultTitle;
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		document.title = "";
	});

	function renderTitle() {
		act(() => root.render(<TabTitleSync />));
	}

	function removeTitle() {
		act(() => root.render(null));
	}

	it.each(["Terms of Service | Sairn", "Privacy Policy | Sairn"])(
		"preserves the destination title %s when its head updates before the trading effect cleans up",
		(title) => {
			renderTitle();
			expect(document.title).toBe("61.12 HYPE/USDC · Sairn");
			document.title = title;
			removeTitle();
			expect(document.title).toBe(title);
		},
	);

	it("restores the default title when the trading hook still owns the current title", () => {
		renderTitle();
		removeTitle();
		expect(document.title).toBe(SEO_DEFAULTS.defaultTitle);
	});

	it.each(["price", "pair"])("does not change another title when no %s was available to publish", (missing) => {
		if (missing === "price") runtime.perpPrice = undefined;
		else runtime.market.pairName = undefined;
		document.title = "Terms of Service | Sairn";
		renderTitle();
		expect(document.title).toBe("Terms of Service | Sairn");
		removeTitle();
		expect(document.title).toBe("Terms of Service | Sairn");
	});

	it("updates the market title and tracks ownership of the latest price", () => {
		renderTitle();
		runtime.perpPrice = "63.45";
		renderTitle();
		expect(document.title).toBe("63.45 HYPE/USDC · Sairn");
		removeTitle();
		expect(document.title).toBe(SEO_DEFAULTS.defaultTitle);
	});

	it("keeps numeric locale changes reactive without requiring a new quote", () => {
		renderTitle();
		runtime.formatLocale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(document.title).toBe("61,12 HYPE/USDC · Sairn");
		removeTitle();
		expect(document.title).toBe(SEO_DEFAULTS.defaultTitle);
	});

	it.each(["perp", "spot"] as const)("preserves %s subscription selection and hidden-tab updates", (kind) => {
		runtime.market.kind = kind;
		renderTitle();
		expect(runtime.useSubscription).toHaveBeenCalledWith(
			"activeAssetCtx",
			{ coin: "HYPE" },
			{ enabled: kind === "perp", pauseWhenHidden: false },
		);
		expect(runtime.useSubscription).toHaveBeenCalledWith(
			"activeSpotAssetCtx",
			{ coin: "@107" },
			{ enabled: kind === "spot", pauseWhenHidden: false },
		);
		expect(document.title).toBe(`${kind === "spot" ? "62.23" : "61.12"} HYPE/USDC · Sairn`);
	});
});
