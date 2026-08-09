// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileMarketBar } from "@/components/trade/mobile/mobile-market-bar";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import type { SpotAssetSocials } from "@/domain/market/spot-asset-info";

const BASE_TOKEN_ID = "0x11111111111111111111111111111111";
const mocks = vi.hoisted(() => ({
	copy: vi.fn(),
	selectedMarket: {
		kind: "spot",
		name: "@999",
		pairName: "TOKEN-USDH",
		markPx: "1.25",
		prevDayPx: "1.0",
		dayNtlVlm: "12345.67",
		circulatingSupply: "1000",
		szDecimals: 2,
		tokensInfo: [
			{
				name: "TOKEN",
				displayName: "TOKEN",
				tokenId: "0x11111111111111111111111111111111" as string | undefined,
			},
			{
				name: "USDH",
				displayName: "USDH",
				tokenId: "0x22222222222222222222222222222222",
			},
		],
	},
	socials: null as SpotAssetSocials | null,
}));

vi.mock("@/components/trade/chart/token-selector", () => ({
	TokenSelector: () => <span>Token selector</span>,
}));

vi.mock("@/components/trade/components/market-asset-info", () => ({
	MarketAssetInfo: () => <span>Asset</span>,
}));

vi.mock("@/components/trade/components/spot-market-social-links", () => ({
	SpotMarketSocialIconLinks: ({ socials, targetSize }: { socials: SpotAssetSocials | null; targetSize?: string }) =>
		socials ? (
			<span data-slot="mock-social-links" data-target-size={targetSize}>
				Social links
			</span>
		) : null,
}));

vi.mock("@/domain/market/spot-asset-info", () => ({
	getSpotAssetSocials: () => mocks.socials,
	hasSpotSocialLinks: (socials: SpotAssetSocials | null | undefined) =>
		Boolean(socials?.x || socials?.telegram || socials?.website),
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => vi.fn(),
}));

vi.mock("@/hooks/trade/use-orderbook-mid-price", () => ({
	useOrderbookMidPrice: () => ({ midPx: undefined }),
}));

vi.mock("@/hooks/ui/use-copy-to-clipboard", () => ({
	useCopyToClipboard: () => ({ copied: false, copy: mocks.copy }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTokenUrl: (address: string) => `/explorer/token/${address}`,
	getMarketApiCoin: (market: { name?: string } | undefined) => market?.name ?? "",
	getSpotMarketApiCoin: (market: { name?: string } | undefined) => market?.name ?? "",
	useSelectedMarketInfo: () => ({ data: mocks.selectedMarket }),
	useSubscription: () => ({ data: undefined, status: "idle" }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MobileMarketBar", () => {
	let container: HTMLDivElement;
	let root: Root;

	function renderExpandedBar() {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileMarketBar />
				</I18nProvider>,
			),
		);

		const expandButton = container.querySelector<HTMLButtonElement>('button[aria-label="Expand market details"]');
		expect(expandButton).not.toBeNull();
		act(() => expandButton?.click());
	}

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		mocks.copy.mockReset();
		Object.assign(mocks.selectedMarket, {
			kind: "spot",
			name: "@999",
			pairName: "TOKEN-USDH",
			markPx: "1.25",
			prevDayPx: "1.0",
			dayNtlVlm: "12345.67",
			circulatingSupply: "1000",
		});
		delete (mocks.selectedMarket as Record<string, unknown>).funding;
		delete (mocks.selectedMarket as Record<string, unknown>).maxLeverage;
		mocks.selectedMarket.tokensInfo[0].tokenId = BASE_TOKEN_ID;
		mocks.socials = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("labels expanded spot notionals with the selected quote token", () => {
		renderExpandedBar();

		expect(container.textContent).toContain("24H VOL12,345.67 USDH");
		expect(container.textContent).toContain("Market Cap1,250 USDH");
		expect(container.textContent).not.toContain("$12,345.67");
	});

	it("keeps the address and non-overlapping touch actions in the mobile detail row", () => {
		mocks.socials = {
			displayName: "Token",
			x: "https://x.com/example",
			telegram: "https://t.me/example",
			website: "https://example.com/",
		};

		renderExpandedBar();

		const tokenInfo = container.querySelector<HTMLElement>('[data-slot="mobile-spot-token-info"]');
		expect(tokenInfo?.className).toContain("flex-col");
		expect(tokenInfo?.className).toContain("items-start");
		expect(tokenInfo?.querySelector(`span[title="${BASE_TOKEN_ID}"]`)?.textContent).toBe("0x1111...1111");
		const actionGroup = tokenInfo?.querySelector<HTMLElement>('[data-slot="mobile-spot-token-actions"]');
		const explorerLink = tokenInfo?.querySelector<HTMLAnchorElement>('a[aria-label="Open token in explorer"]');
		const copyButton = tokenInfo?.querySelector<HTMLButtonElement>('button[aria-label="Copy token address"]');
		expect(actionGroup?.className).toContain("flex-wrap");
		expect(explorerLink?.className).toContain("size-11");
		expect(explorerLink?.className).not.toContain("after:size-11");
		expect(copyButton?.className).toContain("size-11");
		expect(copyButton?.className).not.toContain("after:size-11");
		expect(tokenInfo?.querySelector('[data-slot="mock-social-links"]')?.getAttribute("data-target-size")).toBe("touch");
	});

	it("keeps compact controls visually small with 44px mobile hit targets", () => {
		Object.assign(mocks.selectedMarket, {
			kind: "perp",
			name: "HYPE",
			pairName: "HYPE-USDC",
			maxLeverage: 10,
			funding: "0.0001",
		});

		renderExpandedBar();

		const expandButton = container.querySelector<HTMLButtonElement>('button[aria-label="Collapse market details"]');
		expect(expandButton?.className).toContain("h-[30px]");
		expect(expandButton?.className).toContain("w-9");
		expect(expandButton?.className).toContain("after:size-11");

		const tooltipTrigger = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
			button.textContent?.includes("Mark/ORACLE"),
		);
		expect(tooltipTrigger?.className).toContain("after:h-11");
		expect(tooltipTrigger?.className).toContain("after:min-w-11");
		expect(tooltipTrigger?.className).toContain("after:w-full");
		expect(tooltipTrigger?.className).not.toContain("after:size-11");
	});

	it("renders address actions without a social row dependency", () => {
		renderExpandedBar();

		const tokenInfo = container.querySelector<HTMLElement>('[data-slot="mobile-spot-token-info"]');
		expect(tokenInfo?.querySelector('a[aria-label="Open token in explorer"]')).not.toBeNull();
		expect(tokenInfo?.querySelector('button[aria-label="Copy token address"]')).not.toBeNull();
		expect(tokenInfo?.querySelector('[data-slot="mock-social-links"]')).toBeNull();
	});

	it("renders social actions when no token address is available", () => {
		mocks.selectedMarket.tokensInfo[0].tokenId = undefined;
		mocks.socials = { displayName: "Token", website: "https://example.com/" };

		renderExpandedBar();

		const tokenInfo = container.querySelector<HTMLElement>('[data-slot="mobile-spot-token-info"]');
		expect(tokenInfo?.querySelector("[title]")).toBeNull();
		expect(tokenInfo?.querySelector('[data-slot="mobile-spot-token-actions"]')?.className).toContain("flex-wrap");
		expect(tokenInfo?.querySelector('a[aria-label="Open token in explorer"]')).toBeNull();
		expect(tokenInfo?.querySelector('button[aria-label="Copy token address"]')).toBeNull();
		expect(tokenInfo?.querySelector('[data-slot="mock-social-links"]')).not.toBeNull();
	});

	it("renders a placeholder when neither address nor social actions exist", () => {
		mocks.selectedMarket.tokensInfo[0].tokenId = undefined;

		renderExpandedBar();

		expect(container.querySelector('[data-slot="mobile-spot-token-info"]')).toBeNull();
		expect(container.textContent).toContain(`More Info${FALLBACK_VALUE_PLACEHOLDER}`);
	});

	it("does not append a countdown when perpetual funding is unavailable", () => {
		Object.assign(mocks.selectedMarket, {
			kind: "perp",
			name: "HYPE",
			pairName: "HYPE-USDC",
			maxLeverage: 10,
			funding: undefined,
		});

		renderExpandedBar();

		expect(container.textContent).toContain(`FUNDING/Resets in${FALLBACK_VALUE_PLACEHOLDER}`);
		expect(container.textContent).not.toMatch(/FUNDING\/Resets in—\d{2}:/);
	});
});
