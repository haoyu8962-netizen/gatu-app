// @vitest-environment jsdom
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	maxTradeSzs: [0.31, 0.31] as [number, number],
	setSize: vi.fn(),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: "0x00000000000000000000000000000000000000aa", isConnected: true }),
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: () => true,
	useDefaultDexBalances: () => ({
		accountAbstraction: "ordinary",
		isLoading: false,
		spotBalances: [],
		spotAvailableAfterMaintenance: null,
		spotStateStatus: "success",
		spotStateReceivedAt: 1,
		perpsAtOpenInterestCap: [],
	}),
}));

vi.mock("@/hooks/trade/use-asset-leverage", () => ({
	useAssetLeverage: () => ({
		transactionIdentity: "Mainnet:0",
		displayLeverage: 10,
		currentLeverage: 10,
		pendingLeverage: null,
		committedLeverage: null,
		maxLeverage: 50,
		setPendingLeverage: vi.fn(),
		resetPending: vi.fn(),
		maxTradeSzs: testState.maxTradeSzs,
		maxTradeSzsRaw: [String(testState.maxTradeSzs[0]), String(testState.maxTradeSzs[1])],
		availableToTrade: [2.69, 2.69],
		marginMode: "cross",
		hasPosition: false,
		positionStateReady: true,
		switchMarginMode: vi.fn(),
		applyMarginAndLeverage: vi.fn(),
		isUpdating: false,
		updateError: null,
		isSwitchingMode: false,
		switchModeError: null,
		isOnlyIsolated: false,
		allowsCrossMargin: true,
		allowsIsolatedMarginRemoval: false,
		subscriptionStatus: "success",
		subscriptionReceivedAt: 1,
	}),
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => ({ setSize: testState.setSize, setSizeSelection: vi.fn(), setSizeMode: vi.fn() }),
	useOrderSizeSource: () => null,
	useOrderType: () => "market",
}));

import { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";

const HYPE_MARKET = {
	kind: "perp",
	name: "HYPE",
	pairName: "HYPE-USDC",
	assetId: 7,
	szDecimals: 2,
} as UnifiedMarketInfo;

type OrderEntry = ReturnType<typeof useOrderEntryData>;

describe("order entry percent basis during a slider gesture", () => {
	let root: Root;
	let container: HTMLDivElement;
	let latest: OrderEntry | null;

	function Probe({ markPx }: { markPx: number }) {
		latest = useOrderEntryData({
			market: HYPE_MARKET,
			side: "buy",
			markPx,
			sizeMode: "base",
			sizeInput: "",
			marketOrderSizing: null,
		});
		return null;
	}

	function render(markPx = 86.88) {
		act(() => root.render(createElement(Probe, { markPx })));
		if (!latest) throw new Error("hook not captured");
		return latest;
	}

	beforeEach(() => {
		latest = null;
		testState.maxTradeSzs = [0.31, 0.31];
		testState.setSize.mockClear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("keeps the same quantity for the same percentage while the maximum ticks during a gesture", () => {
		let entry = render();
		expect(entry.maxSize).toBe(0.31);
		act(() => entry.beginSizePercentGesture());
		act(() => entry.applySizePercent(77));
		expect(testState.setSize).toHaveBeenLastCalledWith("0.23");

		testState.maxTradeSzs = [0.33, 0.33];
		entry = render();
		expect(entry.maxSize).toBe(0.33);
		act(() => entry.applySizePercent(77));
		expect(testState.setSize).toHaveBeenLastCalledWith("0.23");

		act(() => entry.endSizePercentGesture());
		act(() => entry.applySizePercent(77));
		expect(testState.setSize).toHaveBeenLastCalledWith("0.25");
	});

	it("uses the live maximum outside a gesture", () => {
		let entry = render();
		act(() => entry.applySizePercent(77));
		expect(testState.setSize).toHaveBeenLastCalledWith("0.23");

		testState.maxTradeSzs = [0.33, 0.33];
		entry = render();
		act(() => entry.applySizePercent(77));
		expect(testState.setSize).toHaveBeenLastCalledWith("0.25");
	});
});
