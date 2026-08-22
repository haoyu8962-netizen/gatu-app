// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTradingViewOverlayLines } from "@/components/trade/chart/use-tradingview-overlay-lines";
import type { TradingViewOverlayLine } from "@/lib/chart/tradingview-overlays";
import type { Position, UnifiedMarketInfo } from "@/lib/hyperliquid";
import type { OpenOrder } from "@/lib/trade/open-orders";
import { createI18nRoot } from "./harness/react";

const OWNER = "0x1111111111111111111111111111111111111111";

const mocks = vi.hoisted(() => ({
	clientKey: "0x1111111111111111111111111111111111111111",
	isConnected: true,
	isOnline: true,
	openOrders: {
		data: undefined as { orders: OpenOrder[] } | undefined,
		isStale: false,
		status: "active" as "idle" | "subscribing" | "active" | "error",
	},
	owner: "0x1111111111111111111111111111111111111111" as string | undefined,
	positions: {
		hasError: false,
		isLoading: false,
		isStale: false,
		positions: [] as Position[],
	},
}));

vi.mock("@/hooks/use-mobile", () => ({
	useOnlineStatus: () => mocks.isOnline,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: mocks.owner, isConnected: mocks.isConnected }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ clientKey: mocks.clientKey }),
	useSubscription: () => ({ ...mocks.openOrders, error: undefined, unsubscribe: undefined }),
	useUserPositions: () => ({
		...mocks.positions,
		getPosition: () => null,
		hasPosition: () => false,
		withdrawable: "0",
	}),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const MARKET = {
	kind: "perp",
	name: "BTC",
} as UnifiedMarketInfo;

let hookValue: TradingViewOverlayLine[] = [];

function createPosition(): Position {
	return {
		coin: "BTC",
		cumFunding: { allTime: "0", sinceChange: "0", sinceOpen: "0" },
		dex: "",
		entryPx: "100",
		leverage: { type: "cross", value: 10 },
		liquidationPx: "50",
		marginUsed: "10",
		maxLeverage: 50,
		positionValue: "100",
		returnOnEquity: "0.125",
		szi: "1",
		unrealizedPnl: "12.5",
	};
}

function createOrder(): OpenOrder {
	return {
		children: [],
		coin: "BTC",
		isTrigger: false,
		limitPx: "105",
		oid: 1,
		orderType: "Limit",
		side: "B",
		triggerPx: "0",
	} as unknown as OpenOrder;
}

function Probe() {
	hookValue = useTradingViewOverlayLines(MARKET, "BTC");
	return null;
}

describe("TradingView account overlay readiness", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.clientKey = OWNER;
		mocks.isConnected = true;
		mocks.isOnline = true;
		mocks.owner = OWNER;
		mocks.openOrders = { data: { orders: [createOrder()] }, isStale: false, status: "active" };
		mocks.positions = { hasError: false, isLoading: false, isStale: false, positions: [createPosition()] };
		hookValue = [];
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderHook(): TradingViewOverlayLine[] {
		act(() => root.render(<Probe />));
		return hookValue;
	}

	it("renders fresh order, position, and liquidation snapshots for the matching owner", () => {
		expect(renderHook().map((line) => line.kind)).toEqual(["order", "position", "liquidation"]);
		expect(hookValue.find((line) => line.kind === "position")?.label).toBe("Long · PNL +12.50 USDC (+12.5%) · 1");
	});

	it("fails each account stream closed without hiding the other fresh stream", () => {
		mocks.positions.hasError = true;
		expect(renderHook().map((line) => line.kind)).toEqual(["order"]);

		mocks.positions.hasError = false;
		mocks.openOrders.status = "error";
		mocks.openOrders.isStale = true;
		expect(renderHook().map((line) => line.kind)).toEqual(["position", "liquidation"]);

		mocks.openOrders.status = "active";
		expect(renderHook().map((line) => line.kind)).toEqual(["position", "liquidation"]);

		mocks.openOrders = { data: { orders: [createOrder()] }, isStale: false, status: "active" };
		expect(renderHook().map((line) => line.kind)).toEqual(["order", "position", "liquidation"]);
	});

	it.each(["idle", "subscribing", "error"] as const)(
		"does not render retained orders while their subscription is %s",
		(status) => {
			mocks.openOrders.status = status;
			expect(renderHook().map((line) => line.kind)).toEqual(["position", "liquidation"]);
		},
	);

	it("clears every account overlay immediately when offline, disconnected, or owner-mismatched", () => {
		mocks.isOnline = false;
		expect(renderHook()).toEqual([]);

		mocks.isOnline = true;
		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		expect(renderHook()).toEqual([]);

		mocks.clientKey = OWNER;
		mocks.isConnected = false;
		mocks.owner = undefined;
		expect(renderHook()).toEqual([]);
	});
});
