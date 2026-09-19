/** @vitest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	activeTab: "markets" as "markets" | "trade" | "account",
	marketsMounts: 0,
	marketsCleanups: 0,
	tradeMounts: 0,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: "0x1234", isConnected: true }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ env: "Mainnet", isTestnet: false }),
}));

vi.mock("@/components/trade/mobile/use-mobile-terminal-tab", () => ({
	useMobileTerminalTab: () => ({ activeTab: mocks.activeTab, setActiveTab: vi.fn() }),
}));

vi.mock("@/components/trade/mobile/use-mobile-disclosure-set", () => ({
	useMobilePositionsDisclosureStates: () => ({}),
}));

vi.mock("@/components/trade/mobile/mobile-market-bar-provider", () => ({
	MobileMarketBarProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/trade/mobile/mobile-trade-layout", () => ({
	MobileTradeLayout: ({ showOrderForm = true }: { showOrderForm?: boolean }) => {
		useEffect(() => {
			if (showOrderForm) {
				mocks.tradeMounts += 1;
				return;
			}
			mocks.marketsMounts += 1;
			return () => {
				mocks.marketsCleanups += 1;
			};
		}, [showOrderForm]);
		return <output data-pane={showOrderForm ? "trade" : "markets"} />;
	},
}));

vi.mock("@/components/trade/mobile/mobile-account-view", () => ({ MobileAccountView: () => null }));
vi.mock("@/components/trade/mobile/mobile-bottom-nav", () => ({ MobileBottomNav: () => null }));
vi.mock("@/components/trade/mobile/mobile-header", () => ({ MobileHeader: () => null }));
vi.mock("@/components/trade/geo/geo-restriction-banner", () => ({ GeoRestrictionBanner: () => null }));
vi.mock("@/components/trade/mobile/offline-banner", () => ({ OfflineBanner: () => null }));

import { MobileTerminal } from "@/components/trade/mobile/mobile-terminal";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MobileTerminal Markets retention", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.marketsMounts = 0;
		mocks.marketsCleanups = 0;
		mocks.tradeMounts = 0;
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
	}

	it("defers the Markets view until it is first shown", () => {
		render("trade");
		expect(mocks.tradeMounts).toBe(1);
		expect(mocks.marketsMounts).toBe(0);

		render("markets");
		expect(mocks.marketsMounts).toBe(1);
		expect(mocks.marketsCleanups).toBe(0);
	});

	it("keeps the Markets view effects alive across Trade and Account once shown", () => {
		render("markets");
		expect(mocks.marketsMounts).toBe(1);

		render("trade");
		render("markets");
		render("account");
		render("markets");
		render("trade");

		expect(mocks.marketsMounts).toBe(1);
		expect(mocks.marketsCleanups).toBe(0);
		expect(container.querySelector('output[data-pane="markets"]')).not.toBeNull();
	});
});
