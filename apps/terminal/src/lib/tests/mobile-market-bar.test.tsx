// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileMarketBar } from "@/components/trade/mobile/mobile-market-bar";
import { MobileMarketBarProvider } from "@/components/trade/mobile/mobile-market-bar-provider";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import type { SpotAssetSocials } from "@/domain/market/spot-asset-info";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";

const BASE_TOKEN_ID = "0x11111111111111111111111111111111";
const mocks = vi.hoisted(() => ({
	isTestnet: false,
	formatLocale: "en-US",
	copy: vi.fn(),
	copiedValue: null as string | null,
	midPx: undefined as string | undefined,
	midSnapshot: undefined as object | undefined,
	selectedMarket: {
		kind: "spot",
		name: "@999",
		pairName: "TOKEN-USDH",
		markPx: "1.25",
		midPx: undefined as string | undefined,
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

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => mocks.formatLocale,
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
	useOrderbookMidPrice: () => ({ midPx: mocks.midPx, snapshot: mocks.midSnapshot }),
}));

vi.mock("@/hooks/ui/use-copy-to-clipboard", () => ({
	useCopyToClipboard: () => ({
		copied: mocks.copiedValue !== null,
		copiedValue: mocks.copiedValue,
		copy: mocks.copy,
	}),
}));

vi.mock("@/lib/network", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/network")>()),
	isTestnet: () => mocks.isTestnet,
}));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTokenUrl: (address: string, isTestnet: boolean) =>
		`/${isTestnet ? "testnet" : "mainnet"}/explorer/token/${address}`,
	getMarketApiCoin: (market: { name?: string } | undefined) => market?.name ?? "",
	getSpotMarketApiCoin: (market: { name?: string } | undefined) => market?.name ?? "",
	subscribeWsReconnect: () => () => {},
	useHyperliquid: () => ({ env: "Mainnet", isTestnet: false }),
	useSelectedMarketInfo: () => ({ data: mocks.selectedMarket }),
	useSubscription: (method: string, _params: unknown, options: { enabled?: boolean } = {}) => {
		if (options.enabled === false) {
			return { data: undefined, isStale: false, lastMessageAt: undefined, status: "idle" };
		}
		if (method === "activeAssetCtx" || method === "activeSpotAssetCtx") {
			const market = mocks.selectedMarket as unknown as Record<string, string | number | undefined>;
			return {
				data: {
					coin: market.name,
					ctx: {
						markPx: market.markPx,
						midPx: market.midPx ?? null,
						oraclePx: market.oraclePx,
						prevDayPx: market.prevDayPx,
						dayNtlVlm: market.dayNtlVlm,
						openInterest: market.openInterest,
						funding: market.funding,
						circulatingSupply: market.circulatingSupply,
					},
				},
				isStale: false,
				lastMessageAt: Date.now(),
				status: "active",
			};
		}
		return { data: undefined, isStale: false, lastMessageAt: undefined, status: "idle" };
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MobileMarketBar", () => {
	let container: HTMLDivElement;
	let root: Root;

	function renderBar(key = "market-bar") {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileMarketBarProvider enabled>
						<MobileMarketBar key={key} />
					</MobileMarketBarProvider>
				</I18nProvider>,
			),
		);
	}

	function renderExpandedBar() {
		renderBar();

		const expandButton = container.querySelector<HTMLButtonElement>('button[aria-label="Expand market details"]');
		expect(expandButton).not.toBeNull();
		act(() => expandButton?.click());
	}

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		mocks.formatLocale = "en-US";
		mocks.copy.mockReset();
		mocks.copiedValue = null;
		mocks.isTestnet = false;
		mocks.midPx = undefined;
		mocks.midSnapshot = undefined;
		Object.assign(mocks.selectedMarket, {
			kind: "spot",
			name: "@999",
			pairName: "TOKEN-USDH",
			markPx: "1.25",
			midPx: undefined as string | undefined,
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
		document.documentElement.style.removeProperty("--sal");
		document.documentElement.style.removeProperty("--sar");
		vi.restoreAllMocks();
	});

	it("labels expanded spot notionals with the selected quote token", () => {
		renderExpandedBar();

		expect(container.textContent).toContain("24h Volume12,345.67 USDH");
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
		expect(tokenInfo?.className).toContain("items-center");
		expect(tokenInfo?.className).toContain("flex-wrap");
		expect(tokenInfo?.querySelector(`span[title="${BASE_TOKEN_ID}"]`)?.className).toContain("whitespace-nowrap");
		expect(tokenInfo?.querySelector(`span[title="${BASE_TOKEN_ID}"]`)?.textContent).toBe("0x1111...1111");
		const actionGroup = tokenInfo?.querySelector<HTMLElement>('[data-slot="mobile-spot-token-actions"]');
		const explorerLink = tokenInfo?.querySelector<HTMLAnchorElement>('a[aria-label="Open token in explorer"]');
		const copyButton = tokenInfo?.querySelector<HTMLButtonElement>('button[aria-label="Copy token address"]');
		expect(actionGroup?.className).toContain("-my-3");
		expect(actionGroup?.className).not.toContain("flex-wrap");
		expect(explorerLink?.className).toContain("h-11 w-9");
		expect(explorerLink?.className).not.toContain("after:size-11");
		expect(copyButton?.className).toContain("h-11 w-9");
		expect(copyButton?.className).not.toContain("after:size-11");
		expect(tokenInfo?.querySelector('[data-slot="mock-social-links"]')?.getAttribute("data-target-size")).toBe("touch");
	});

	it("opens the token in the explorer of the active network", () => {
		renderExpandedBar();
		const link = () =>
			container.querySelector<HTMLAnchorElement>(
				'[data-slot="mobile-spot-token-info"] a[aria-label="Open token in explorer"]',
			);
		expect(link()?.getAttribute("href")).toBe(`/mainnet/explorer/token/${BASE_TOKEN_ID}`);

		mocks.isTestnet = true;
		renderBar();
		expect(link()?.getAttribute("href")).toBe(`/testnet/explorer/token/${BASE_TOKEN_ID}`);
	});

	it("scopes copied feedback to the current spot address", () => {
		mocks.copiedValue = BASE_TOKEN_ID;
		renderExpandedBar();
		expect(container.querySelector('button[aria-label="Copied"]')).not.toBeNull();

		mocks.selectedMarket.tokensInfo[0].tokenId = "0x33333333333333333333333333333333";
		renderBar();

		expect(container.querySelector('button[aria-label="Copied"]')).toBeNull();
		expect(container.querySelector('button[aria-label="Copy token address"]')).not.toBeNull();
	});

	it("ignores delayed copy feedback from the previous spot address", async () => {
		let finishCopy: (() => void) | undefined;
		const pendingCopy = new Promise<void>((resolve) => {
			finishCopy = resolve;
		});
		mocks.copy.mockImplementation(async (value: string) => {
			await pendingCopy;
			mocks.copiedValue = value;
		});
		renderExpandedBar();

		const oldCopyButton = container.querySelector<HTMLButtonElement>('button[aria-label="Copy token address"]');
		act(() => oldCopyButton?.click());

		mocks.selectedMarket.tokensInfo[0].tokenId = "0x33333333333333333333333333333333";
		renderBar();
		expect(container.querySelector('button[aria-label="Copied"]')).toBeNull();

		await act(async () => finishCopy?.());
		renderBar();
		expect(mocks.copiedValue).toBe(BASE_TOKEN_ID);
		expect(container.querySelector('button[aria-label="Copied"]')).toBeNull();
		expect(container.querySelector('button[aria-label="Copy token address"]')).not.toBeNull();
	});

	it("keeps expanded values complete and associates the disclosure control", () => {
		renderExpandedBar();

		const collapseButton = container.querySelector<HTMLButtonElement>('button[aria-label="Collapse market details"]');
		const detailsId = collapseButton?.getAttribute("aria-controls");
		expect(detailsId).toBeTruthy();
		expect(detailsId ? document.getElementById(detailsId) : null).not.toBeNull();

		const volumeValue = Array.from(container.querySelectorAll<HTMLElement>("div")).find(
			(node) => node.textContent === "12,345.67 USDH",
		);
		expect(volumeValue?.className).toContain("break-words");
		expect(volumeValue?.className).toContain("[overflow-wrap:anywhere]");
		expect(volumeValue?.className).not.toContain("truncate");
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
		expect(expandButton?.getAttribute("aria-controls")).toBeTruthy();

		const tooltipTrigger = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
			button.textContent?.includes("Mark/Oracle"),
		);
		expect(tooltipTrigger?.className).toContain("after:h-11");
		expect(tooltipTrigger?.className).toContain("after:min-w-11");
		expect(tooltipTrigger?.className).toContain("after:w-full");
		expect(tooltipTrigger?.className).not.toContain("after:size-11");
	});

	it("keeps market detail tooltips inside both iOS landscape safe-area edges", () => {
		Object.assign(mocks.selectedMarket, {
			kind: "perp",
			name: "HYPE",
			pairName: "HYPE-USDC",
			maxLeverage: 10,
			funding: "0.0001",
		});
		vi.spyOn(window, "innerWidth", "get").mockReturnValue(844);
		renderExpandedBar();

		const tooltipTrigger = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
			button.textContent?.includes("Mark/Oracle"),
		);
		expect(tooltipTrigger).not.toBeNull();
		vi.spyOn(tooltipTrigger as HTMLButtonElement, "getBoundingClientRect")
			.mockReturnValueOnce({ bottom: 70, left: 0, top: 50 } as DOMRect)
			.mockReturnValueOnce({ bottom: 70, left: 700, top: 50 } as DOMRect);

		document.documentElement.style.setProperty("--sal", "59px");
		document.documentElement.style.setProperty("--sar", "0px");
		act(() => tooltipTrigger?.click());
		let tooltip = document.body.querySelector<HTMLElement>('[role="tooltip"]');
		expect(tooltip?.style.left).toBe("59px");
		expect(tooltip?.style.width).toBe("320px");

		act(() => tooltipTrigger?.click());
		document.documentElement.style.setProperty("--sal", "0px");
		document.documentElement.style.setProperty("--sar", "59px");
		act(() => tooltipTrigger?.click());
		tooltip = document.body.querySelector<HTMLElement>('[role="tooltip"]');
		expect(tooltip?.style.left).toBe("465px");
		expect(Number.parseFloat(tooltip?.style.left ?? "0") + Number.parseFloat(tooltip?.style.width ?? "0")).toBe(
			844 - 59,
		);
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
		expect(tokenInfo?.querySelector('[data-slot="mobile-spot-token-actions"]')?.className).toContain("-my-3");
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

		expect(container.textContent).toContain(`Funding/Resets in${FALLBACK_VALUE_PLACEHOLDER}`);
		expect(container.textContent).not.toMatch(/Funding\/Resets in—\d{2}:/);
	});

	it("keeps the mid price stable without replaying a flash when the tab bar remounts", () => {
		Object.assign(mocks.selectedMarket, {
			kind: "perp",
			name: "BTC",
			pairName: "BTC-USDC",
			markPx: "100.0",
			prevDayPx: "99.0",
			szDecimals: 5,
		});
		mocks.selectedMarket.midPx = "100.5";
		mocks.midSnapshot = { revision: 0 };

		renderBar("markets");
		let price = container.querySelector<HTMLElement>('[data-boneyard="market-price"] span');
		expect(price?.title).toBe("100.5");
		expect(price?.classList.contains("use-color-change")).toBe(false);

		renderBar("trade");
		price = container.querySelector<HTMLElement>('[data-boneyard="market-price"] span');
		expect(price?.title).toBe("100.5");
		expect(price?.classList.contains("use-color-change")).toBe(false);
		expect(price?.dataset.direction).toBeUndefined();

		mocks.selectedMarket.midPx = "101.0";
		mocks.midSnapshot = { revision: 1 };
		renderBar("trade");
		price = container.querySelector<HTMLElement>('[data-boneyard="market-price"] span');
		expect(price?.title).toBe("101.0");
		expect(price?.classList.contains("use-color-change")).toBe(true);
		expect(price?.dataset.direction).toBe("up");
	});

	it("uses the same native headline precision as desktop for HYPE spot midpoints", () => {
		Object.assign(mocks.selectedMarket, {
			kind: "spot",
			name: "@107",
			pairName: "HYPE-USDC",
			markPx: "72.137",
			midPx: "72.1375",
			prevDayPx: "70",
			szDecimals: 2,
		});
		mocks.selectedMarket.midPx = "72.1375";
		mocks.midSnapshot = { revision: 0 };

		renderBar();
		let price = container.querySelector<HTMLElement>('[data-boneyard="market-price"] span');
		expect(price?.title).toBe("72.138");
		expect(price?.textContent).toBe("72.138");

		mocks.selectedMarket.midPx = "72.138";
		mocks.midSnapshot = { revision: 1 };
		renderBar();
		price = container.querySelector<HTMLElement>('[data-boneyard="market-price"] span');
		expect(price?.title).toBe("72.138");
		expect(price?.dataset.direction).toBe("up");
	});

	it("writes the 24h change amount and percent with the number-format separators", () => {
		Object.assign(mocks.selectedMarket, { markPx: "12345", prevDayPx: "10000", dayNtlVlm: "0" });

		renderBar();
		const change = () => container.querySelector<HTMLElement>("[title$='%']");
		const section = change();
		expect(change()?.textContent).toBe("+2,345 / +23.45%");
		expect(change()?.title).toBe("+2,345 / +23.45%");

		mocks.formatLocale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(change()).toBe(section);
		expect(change()?.textContent).toBe("+2.345 / +23,45%");

		Object.assign(mocks.selectedMarket, { markPx: "8765.4", prevDayPx: "10000" });
		renderBar();
		expect(change()?.textContent).toBe("-1.234,6 / -12,35%");

		mocks.formatLocale = "fr-FR";
		act(() => notifyNumberFormatChange());
		expect(change()?.textContent).toBe("-1 234,6 / -12,35%");
	});
});
