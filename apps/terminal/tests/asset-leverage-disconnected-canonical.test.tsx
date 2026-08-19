/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const leverageState = vi.hoisted(() => ({
	market: {
		kind: "perp" as const,
		name: "ETH",
		assetId: 1,
		maxLeverage: 20,
	},
	resetMutation: vi.fn(),
	setMarginMode: vi.fn(),
}));

vi.mock("@/hooks/trade/use-active-asset-data", () => ({
	useActiveAssetData: () => ({
		data: undefined,
		isConnected: false,
		market: leverageState.market,
		receivedAt: undefined,
		status: "idle",
	}),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useMarginMode: () => "cross",
	useGlobalSettingsActions: () => ({ setMarginMode: leverageState.setMarginMode }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	getMarketCapabilities: () => ({ isOnlyIsolated: false, allowsCrossMargin: true }),
	useExchange: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
		error: null,
		reset: leverageState.resetMutation,
	}),
	useUserPositions: () => ({
		getPosition: () => null,
		isLoading: false,
		hasError: false,
		isStale: false,
		receivedAt: undefined,
	}),
}));

import { useAssetLeverage } from "@/hooks/trade/use-asset-leverage";

let currentHook: ReturnType<typeof useAssetLeverage> | null = null;

function Probe() {
	currentHook = useAssetLeverage();
	return null;
}

function hookValue() {
	if (!currentHook) throw new Error("Expected leverage hook value");
	return currentHook;
}

describe("disconnected leverage canonical state", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		currentHook = null;
		leverageState.market = {
			kind: "perp",
			name: "ETH",
			assetId: 1,
			maxLeverage: 20,
		};
		leverageState.setMarginMode.mockReset();
		leverageState.resetMutation.mockReset();
		act(() => root.render(<Probe />));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		currentHook = null;
	});

	it("writes a reduced market maximum back into the effective disconnected leverage", () => {
		act(() => hookValue().setPendingLeverage(15));
		expect(hookValue().currentLeverage).toBe(15);

		leverageState.market = { ...leverageState.market, maxLeverage: 10 };
		act(() => root.render(<Probe />));

		expect.soft(hookValue().currentLeverage).toBe(10);
		expect.soft(hookValue().displayLeverage).toBe(10);
		expect.soft(hookValue().maxLeverage).toBe(10);
	});

	it("does not carry a disconnected leverage selection into another market", () => {
		act(() => hookValue().setPendingLeverage(15));
		expect(hookValue().currentLeverage).toBe(15);

		leverageState.market = {
			kind: "perp",
			name: "BTC",
			assetId: 0,
			maxLeverage: 50,
		};
		act(() => root.render(<Probe />));

		expect.soft(hookValue().currentLeverage).toBe(10);
		expect.soft(hookValue().displayLeverage).toBe(10);
	});
});
