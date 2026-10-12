// @vitest-environment jsdom
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import { clearAccountModeSetup, publishAccountModeSetup } from "@/stores/use-account-mode-setup-store";
import { createI18nRoot } from "./harness/react";

const OWNER = "0x00000000000000000000000000000000000000aa";

const testState = vi.hoisted(() => ({
	accountAbstraction: "default" as unknown,
	areBalancesLoading: false,
	isConnected: true,
	maxTradeSzs: [0, 0] as [number, number],
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: testState.isConnected ? "0x00000000000000000000000000000000000000aa" : undefined,
		isConnected: testState.isConnected,
	}),
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: (value: unknown) =>
		value === "disabled" || value === "unifiedAccount" || value === "portfolioMargin",
	useDefaultDexBalances: () => ({
		accountAbstraction: testState.accountAbstraction,
		isLoading: testState.areBalancesLoading,
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
		availableToTrade: [testState.maxTradeSzs[0] * 80_000, testState.maxTradeSzs[1] * 80_000],
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
	useOrderEntryActions: () => ({ setSize: vi.fn(), setSizeSelection: vi.fn(), setSizeMode: vi.fn() }),
	useOrderSizeSource: () => null,
	useOrderType: () => "market",
}));

import { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";

const BTC_MARKET = {
	kind: "perp",
	name: "BTC",
	pairName: "BTC-USDC",
	assetId: 0,
	szDecimals: 5,
} as UnifiedMarketInfo;

type OrderEntry = ReturnType<typeof useOrderEntryData>;

describe("order entry availability for a new account (ADR 0041)", () => {
	let root: Root;
	let container: HTMLDivElement;
	let latest: OrderEntry | null;

	function Probe() {
		latest = useOrderEntryData({
			market: BTC_MARKET,
			side: "buy",
			markPx: 80_000,
			sizeMode: "base",
			sizeInput: "",
			marketOrderSizing: null,
		});
		return null;
	}

	function render(): OrderEntry {
		act(() => root.render(createElement(Probe)));
		if (!latest) throw new Error("hook not captured");
		return latest;
	}

	beforeEach(() => {
		latest = null;
		testState.accountAbstraction = "default";
		testState.areBalancesLoading = false;
		testState.isConnected = true;
		testState.maxTradeSzs = [0, 0];
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		clearAccountModeSetup(OWNER);
	});

	it("flags a new account with no funds for the Deposit action while order entry itself stays blocked", () => {
		publishAccountModeSetup(OWNER, "awaiting-funds");
		const entry = render();

		expect(entry.isAwaitingFirstDeposit).toBe(true);
		expect(entry.availabilityStatus).toBe("error");
		expect(entry.isAvailabilityBlocked).toBe(true);
	});

	it("keeps order entry blocked when the trade-size stream reports capacity before the funding snapshot does", () => {
		testState.maxTradeSzs = [0.5, 0.5];
		publishAccountModeSetup(OWNER, "awaiting-funds");
		const entry = render();

		expect(entry.maxSize).toBeGreaterThan(0);
		expect(entry.availabilityStatus).toBe("error");
		expect(entry.isAvailabilityBlocked).toBe(true);
		expect(entry.isAwaitingFirstDeposit).toBe(true);
	});

	it.each(["pending", undefined] as const)("is loading, never an error, while the automatic setup is %s", (setup) => {
		if (setup) publishAccountModeSetup(OWNER, setup);
		const entry = render();

		expect(entry.availabilityStatus).toBe("loading");
		expect(entry.hasAvailabilityError).toBe(false);
		expect(entry.isAvailabilityLoading).toBe(true);
		expect(entry.isAvailabilityBlocked).toBe(true);
		expect(entry.isAwaitingFirstDeposit).toBe(false);
	});

	it("blocks order entry when the protocol default needs a manual choice", () => {
		publishAccountModeSetup(OWNER, "manual");
		const entry = render();

		expect(entry.availabilityStatus).toBe("error");
		expect(entry.hasAvailabilityError).toBe(true);
		expect(entry.isAwaitingFirstDeposit).toBe(false);
	});

	it("follows the host when the setup state changes without a remount", () => {
		publishAccountModeSetup(OWNER, "awaiting-funds");
		expect(render()).toMatchObject({ availabilityStatus: "error", isAwaitingFirstDeposit: true });

		act(() => publishAccountModeSetup(OWNER, "pending"));
		expect(latest).toMatchObject({ availabilityStatus: "loading", isAwaitingFirstDeposit: false });

		act(() => publishAccountModeSetup(OWNER, "manual"));
		expect(latest).toMatchObject({ availabilityStatus: "error", isAwaitingFirstDeposit: false });
	});

	it("keeps blocking the legacy DEX mode whatever the host published for the owner", () => {
		testState.accountAbstraction = "dexAbstraction";
		publishAccountModeSetup(OWNER, "awaiting-funds");

		expect(render()).toMatchObject({ availabilityStatus: "error", isAwaitingFirstDeposit: false });
	});

	it("never flags a supported mode", () => {
		testState.accountAbstraction = "unifiedAccount";
		publishAccountModeSetup(OWNER, "awaiting-funds");

		expect(render()).toMatchObject({ availabilityStatus: "success", isAwaitingFirstDeposit: false });
	});

	it("ignores a state published for another owner", () => {
		publishAccountModeSetup("0x00000000000000000000000000000000000000bb", "awaiting-funds");
		const entry = render();

		expect(entry.availabilityStatus).toBe("loading");
		expect(entry.isAwaitingFirstDeposit).toBe(false);
		clearAccountModeSetup("0x00000000000000000000000000000000000000bb");
	});
});
