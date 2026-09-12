// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccountOverview } from "@/hooks/trade/use-account-overview";

const state = vi.hoisted(() => ({
	connected: true,
	mode: "portfolioMargin",
	query: { data: [], dataUpdatedAt: 100_000, isSuccess: true, isPlaceholderData: false, isFetchedAfterMount: true },
	info: vi.fn(),
	derive: vi.fn(),
}));
vi.mock("@/hooks/trade/use-default-account-snapshot", () => ({
	useDefaultAccountSnapshot: () => ({
		isConnected: state.connected,
		defaultBalances: {},
		collaterals: [],
		tokenUsdPrices: {},
		tokenUsdPriceStatus: "success",
	}),
}));
vi.mock("@/hooks/trade/use-account-balances", () => ({
	useSelectedDexBalances: () => ({ accountAbstraction: state.mode }),
}));
vi.mock("@/domain/trade/account-overview", () => ({ deriveAccountOverview: state.derive }));
vi.mock("@/lib/hyperliquid", () => ({
	useInfo: (...args: unknown[]) => {
		state.info(...args);
		return state.query;
	},
}));

function Probe() {
	useAccountOverview();
	return null;
}

describe("overview reserve snapshot boundary", () => {
	let root: Root;
	let container: HTMLDivElement;
	function render() {
		act(() => root.render(<Probe />));
	}
	beforeEach(() => {
		Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
		vi.spyOn(Date, "now").mockReturnValue(110_000);
		state.connected = true;
		state.mode = "portfolioMargin";
		state.query = {
			data: [],
			dataUpdatedAt: 100_000,
			isSuccess: true,
			isPlaceholderData: false,
			isFetchedAfterMount: true,
		};
		state.info.mockClear();
		state.derive.mockClear();
		container = document.createElement("div");
		root = createRoot(container);
	});
	afterEach(() => {
		act(() => root.unmount());
		vi.restoreAllMocks();
	});
	it("shares the public SDK query only for connected portfolio mode", () => {
		render();
		expect(state.info).toHaveBeenLastCalledWith(
			"allBorrowLendReserveStates",
			undefined,
			expect.objectContaining({ enabled: true, refetchInterval: 30_000 }),
		);
		expect(state.derive.mock.lastCall?.[0].leverageReserves).toBe(state.query.data);
		for (const mode of ["unifiedAccount", "disabled", "unknown"]) {
			state.mode = mode;
			render();
			expect(state.info.mock.lastCall?.[2].enabled).toBe(false);
			expect(state.derive.mock.lastCall?.[0].leverageReserves).toBeUndefined();
		}
		state.mode = "portfolioMargin";
		state.connected = false;
		render();
		expect(state.info.mock.lastCall?.[2].enabled).toBe(false);
	});
	it.each([
		{ isSuccess: false },
		{ isPlaceholderData: true },
		{ isFetchedAfterMount: false },
		{ dataUpdatedAt: 50_000 },
		{ dataUpdatedAt: 111_000 },
		{ dataUpdatedAt: Number.NaN },
	])("rejects unavailable, previous-mount and expired reserve snapshots: %j", (patch) => {
		Object.assign(state.query, patch);
		render();
		expect(state.derive.mock.lastCall?.[0].leverageReserves).toBeUndefined();
	});
});
