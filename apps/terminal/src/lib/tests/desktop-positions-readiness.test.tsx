// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PositionsTab } from "@/components/trade/positions/positions-tab";
import { createI18nRoot } from "./harness/react";

const state = vi.hoisted(() => ({
	connected: true,
	status: "active",
	isStale: false,
	data: undefined as { user: string; clearinghouseStates: [] } | undefined,
}));

vi.mock("../../../../../packages/hl-react/src/provider", () => ({
	useHyperliquid: () => ({
		clientKey: state.connected ? "0x1111111111111111111111111111111111111111" : "disconnected",
	}),
}));
vi.mock("../../../../../packages/hl-react/src/hooks/useSubscription", () => ({
	useSubscription: (method: string) => (method === "allDexsClearinghouseState" ? { ...state } : { data: undefined }),
}));
vi.mock("@/lib/hyperliquid", async () => {
	const { useUserPositions } = await import("../../../../../packages/hl-react/src/account/use-user-positions");
	return {
		useHyperliquid: () => ({ clientKey: "0x1111111111111111111111111111111111111111", env: "Mainnet" }),
		useMarkets: () => ({ getMarket: () => undefined, isLoading: false, error: null }),
		useMarketsInfo: () => ({ getMarketInfo: () => undefined }),
		useUserPositions,
		useSubscription: () => ({ data: undefined }),
	};
});
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ isConnected: state.connected, address: "0x1111111111111111111111111111111111111111" }),
}));
vi.mock("@/hooks/trade/use-market-navigation", () => ({ useMarketNavigation: () => vi.fn() }));
vi.mock("@/hooks/trade/use-position-market-close-action", () => ({
	usePositionMarketCloseAction: () => ({ open: vi.fn() }),
}));
vi.mock("@/stores/use-order-entry-store", () => ({ useOrderEntryActions: () => ({ setSide: vi.fn() }) }));
vi.mock("@/components/trade/positions/position-row", () => ({ PositionRow: () => null }));
vi.mock("@/components/trade/positions/position-pnl-share-modal", () => ({ PositionPnlShareModal: () => null }));

describe("desktop positions snapshot presentation", () => {
	let container: HTMLDivElement;
	let root: Root;
	beforeEach(() => {
		Object.assign(state, { connected: true, status: "active", isStale: false, data: undefined });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});
	function render() {
		act(() => root.render(<PositionsTab directionFilter="all" marketFilter={{ type: "all" }} currentMarket={null} />));
	}
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});
	it("keeps a subscription failure quiet and recovers through loading to a confirmed empty snapshot", () => {
		render();
		expect(container.querySelector('[data-slot="passive-data-placeholder"][aria-busy="true"]')).not.toBeNull();
		expect(container.textContent).not.toContain("No active positions.");
		state.status = "error";
		render();
		expect(container.textContent).not.toContain("Failed to load positions.");
		expect(container.querySelector('[data-slot="passive-data-placeholder"][aria-busy="false"]')).not.toBeNull();
		expect(container.textContent).not.toContain("Loading positions...");
		expect(container.textContent).not.toContain("No active positions.");
		state.status = "active";
		render();
		expect(container.querySelector('[data-slot="passive-data-placeholder"][aria-busy="true"]')).not.toBeNull();
		state.data = { user: "0x1111111111111111111111111111111111111111", clearinghouseStates: [] };
		render();
		expect(container.textContent).toContain("No active positions.");
		expect(container.textContent).not.toContain("Loading positions...");
	});
	it("does not show a previous subscription error after disconnecting", () => {
		state.status = "error";
		state.connected = false;
		render();
		expect(container.textContent).toContain("Connect your wallet to view positions.");
		expect(container.textContent).not.toContain("Failed to load positions.");
	});
	it("does not turn a stale empty snapshot into a confirmed empty account", () => {
		state.data = { user: "0x1111111111111111111111111111111111111111", clearinghouseStates: [] };
		state.isStale = true;
		render();
		expect(container.querySelector('[data-slot="passive-data-placeholder"]')).not.toBeNull();
		expect(container.textContent).not.toContain("No active positions.");
		state.isStale = false;
		render();
		expect(container.textContent).toContain("No active positions.");
	});
});
