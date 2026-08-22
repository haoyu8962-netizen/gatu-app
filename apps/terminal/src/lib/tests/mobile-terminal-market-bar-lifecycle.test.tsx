/** @vitest-environment jsdom */

import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	activeTab: "markets" as "markets" | "trade" | "account",
	bboMidPx: "100.5" as string | undefined,
	bboSnapshot: { revision: 0 } as object | undefined,
	bboSubscriptions: 0,
	bboUnsubscriptions: 0,
	market: {
		kind: "perp",
		name: "BTC",
		pairName: "BTC-USDC",
		markPx: "100.0",
		midPx: "100.25",
		prevDayPx: "99.0",
		dayNtlVlm: "1000000",
		openInterest: "100",
		funding: "0.0001",
		szDecimals: 5,
	},
	perpCtx: {
		markPx: "100.0",
		midPx: "100.25",
		oraclePx: "99.9",
		prevDayPx: "99.0",
		dayNtlVlm: "1000000",
		openInterest: "100",
		funding: "0.0001",
	},
}));

vi.mock("@/hooks/trade/use-orderbook-mid-price", () => ({
	useOrderbookMidPrice: (coin: string | undefined) => {
		useEffect(() => {
			if (!coin) return;
			mocks.bboSubscriptions += 1;
			return () => {
				mocks.bboUnsubscriptions += 1;
			};
		}, [coin]);
		return {
			midPx: coin ? mocks.bboMidPx : undefined,
			isStale: false,
			snapshot: coin ? mocks.bboSnapshot : undefined,
			status: coin ? "active" : "idle",
		};
	},
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: "0x1234", isConnected: true }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	getMarketApiCoin: (market: { name?: string } | undefined) => market?.name ?? "",
	getSpotMarketApiCoin: (market: { name?: string } | undefined) => market?.name ?? "",
	subscribeWsReconnect: () => () => {},
	useHyperliquid: () => ({ env: "Mainnet", isTestnet: false }),
	useSelectedMarketInfo: () => ({ data: mocks.market }),
	useSubscription: (method: string, _params: unknown, options: { enabled?: boolean } = {}) => {
		if (options.enabled === false) return { data: undefined, isStale: false, status: "idle" };
		if (method === "allMids") {
			return { data: { mids: { BTC: "100.25" } }, isStale: false, status: "active" };
		}
		if (method === "activeAssetCtx") {
			return { data: { ctx: mocks.perpCtx }, isStale: false, status: "active" };
		}
		return { data: undefined, isStale: false, status: "idle" };
	},
}));

vi.mock("@/components/trade/mobile/use-mobile-terminal-tab", () => ({
	useMobileTerminalTab: () => ({ activeTab: mocks.activeTab, setActiveTab: vi.fn() }),
}));

vi.mock("@/components/trade/mobile/use-mobile-disclosure-set", () => ({
	useMobilePositionsDisclosureStates: () => ({}),
}));

vi.mock("@/components/trade/mobile/mobile-trade-layout", async () => {
	const { useMobileMarketBarSnapshot } = await vi.importActual<
		typeof import("@/components/trade/mobile/mobile-market-bar-provider")
	>("@/components/trade/mobile/mobile-market-bar-provider");

	function MarketBarProbe({ pane }: { pane: "markets" | "trade" }) {
		const { displayPrice, priceFlash } = useMobileMarketBarSnapshot();
		const initialSequenceRef = useRef(priceFlash.sequence);
		const direction = priceFlash.sequence > initialSequenceRef.current ? priceFlash.direction : null;
		return (
			<output data-pane={pane} data-direction={direction ?? "none"}>
				{displayPrice ?? "—"}
			</output>
		);
	}

	return {
		MobileTradeLayout: ({
			active,
			showMarketBar,
			showOrderForm = true,
		}: {
			active: boolean;
			showMarketBar: boolean;
			showOrderForm?: boolean;
		}) => (active && showMarketBar ? <MarketBarProbe pane={showOrderForm ? "trade" : "markets"} /> : null),
	};
});

vi.mock("@/components/trade/mobile/mobile-account-view", () => ({ MobileAccountView: () => null }));
vi.mock("@/components/trade/mobile/mobile-bottom-nav", () => ({ MobileBottomNav: () => null }));
vi.mock("@/components/trade/mobile/mobile-header", () => ({ MobileHeader: () => null }));
vi.mock("@/components/trade/geo/geo-restriction-banner", () => ({ GeoRestrictionBanner: () => null }));
vi.mock("@/components/trade/mobile/offline-banner", () => ({ OfflineBanner: () => null }));

import { MobileTerminal } from "@/components/trade/mobile/mobile-terminal";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MobileTerminal market bar lifecycle", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.activeTab = "markets";
		mocks.bboMidPx = "100.5";
		mocks.bboSnapshot = { revision: 0 };
		mocks.bboSubscriptions = 0;
		mocks.bboUnsubscriptions = 0;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function render(tab: "markets" | "trade" | "account") {
		mocks.activeTab = tab;
		act(() => root.render(<MobileTerminal />));
		return container.querySelector<HTMLOutputElement>("output");
	}

	it("keeps one controller across Markets and Trade, but releases it on Account", () => {
		let price = render("markets");
		expect(price?.dataset.pane).toBe("markets");
		expect(price?.textContent).toBe("100.5");
		expect(price?.dataset.direction).toBe("none");
		expect(mocks.bboSubscriptions).toBe(1);
		expect(mocks.bboUnsubscriptions).toBe(0);

		price = render("trade");
		expect(price?.dataset.pane).toBe("trade");
		expect(price?.textContent).toBe("100.5");
		expect(price?.dataset.direction).toBe("none");
		expect(mocks.bboSubscriptions).toBe(1);
		expect(mocks.bboUnsubscriptions).toBe(0);

		expect(render("account")).toBeNull();
		expect(mocks.bboSubscriptions).toBe(1);
		expect(mocks.bboUnsubscriptions).toBe(1);

		mocks.bboMidPx = "101.0";
		mocks.bboSnapshot = { revision: 1 };
		price = render("trade");
		expect(price?.textContent).toBe("101.0");
		expect(price?.dataset.direction).toBe("none");
		expect(mocks.bboSubscriptions).toBe(2);
		expect(mocks.bboUnsubscriptions).toBe(1);
	});
});
