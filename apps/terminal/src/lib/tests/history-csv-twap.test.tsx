// @vitest-environment jsdom

import type { HistoricalOrdersResponse, UserFillsResponse } from "@nktkas/hyperliquid";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHistoricalOrdersCsvExport, useUserFillsCsvExport } from "@/hooks/trade/use-history-csv-export";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	downloadCsv: vi.fn(),
	historicalOrders: vi.fn(),
	userFillsByTime: vi.fn(),
	userTwapSliceFillsByTime: vi.fn(),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: "0x1111111111111111111111111111111111111111",
		isConnected: true,
	}),
}));

vi.mock("@/lib/csv", () => ({
	downloadCsv: mocks.downloadCsv,
}));

vi.mock("@/lib/hyperliquid", () => ({
	getInfoClient: () => ({
		historicalOrders: mocks.historicalOrders,
		userFillsByTime: mocks.userFillsByTime,
		userTwapSliceFillsByTime: mocks.userTwapSliceFillsByTime,
	}),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useIsTestnet: () => false,
}));

vi.mock("sonner", () => ({
	toast: {
		dismiss: vi.fn(),
		error: vi.fn(),
		loading: vi.fn(() => "toast-id"),
		success: vi.fn(),
		warning: vi.fn(),
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function createFill(overrides: Partial<UserFillsResponse[number]> = {}): UserFillsResponse[number] {
	return {
		closedPnl: "0",
		coin: "BTC",
		crossed: true,
		dir: "Open Long",
		fee: "0.01",
		feeToken: "USDC",
		hash: `0x${"1".repeat(64)}`,
		oid: 42,
		px: "63000",
		side: "B",
		startPosition: "0",
		sz: "0.01",
		tid: 100,
		time: 1000,
		twapId: null,
		...overrides,
	};
}

function createOrder(): HistoricalOrdersResponse[number] {
	return {
		order: {
			children: [],
			cloid: null,
			coin: "BTC",
			isPositionTpsl: false,
			isTrigger: false,
			limitPx: "63000",
			oid: 42,
			orderType: "Limit",
			origSz: "0.01",
			reduceOnly: false,
			side: "B",
			sz: "0",
			tif: "Gtc",
			timestamp: 1000,
			triggerCondition: "N/A",
			triggerPx: "0",
		},
		status: "filled",
		statusTimestamp: 2000,
	};
}

describe("account history CSV exports", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.historicalOrders.mockReset();
		mocks.userFillsByTime.mockReset();
		mocks.userTwapSliceFillsByTime.mockReset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("exports only non-TWAP fills from the general fills endpoint", async () => {
		const ordinaryFill = createFill();
		const zeroIdTwapFill = createFill({ oid: 43, tid: 101, time: 2000, twapId: 0 });
		const twapFill = createFill({ oid: 44, tid: 102, time: 3000, twapId: 7 });
		mocks.userFillsByTime.mockResolvedValueOnce([ordinaryFill, zeroIdTwapFill, twapFill]);
		let hookValue: ReturnType<typeof useUserFillsCsvExport> | null = null;
		function Probe() {
			hookValue = useUserFillsCsvExport({
				filename: "fills.csv",
				buildRows: (fills) => fills.map((fill) => [fill.coin, String(fill.twapId)]),
			});
			return null;
		}
		act(() => root.render(<Probe />));
		if (!hookValue) throw new Error("Missing fills export hook");

		await act(async () => hookValue?.exportCsv());

		expect(mocks.userFillsByTime).toHaveBeenCalled();
		expect(mocks.userTwapSliceFillsByTime).not.toHaveBeenCalled();
		expect(mocks.downloadCsv).toHaveBeenCalledWith("fills.csv", [["BTC", "null"]]);
	});

	it("keeps ordinary order export separate from TWAP lifecycle history", async () => {
		mocks.historicalOrders.mockResolvedValue([createOrder()]);
		let hookValue: ReturnType<typeof useHistoricalOrdersCsvExport> | null = null;
		function Probe() {
			hookValue = useHistoricalOrdersCsvExport({
				filename: "orders.csv",
				buildRows: (entries) => entries.map((entry) => [entry.kind, entry.coin]),
			});
			return null;
		}
		act(() => root.render(<Probe />));
		if (!hookValue) throw new Error("Missing orders export hook");

		await act(async () => hookValue?.exportCsv());

		expect(mocks.historicalOrders).toHaveBeenCalled();
		expect(mocks.downloadCsv).toHaveBeenCalledWith("orders.csv", [["order", "BTC"]]);
	});

	it("fails closed when a fills export page exceeds the 2000-item API boundary", async () => {
		mocks.userFillsByTime.mockResolvedValueOnce(
			Array.from({ length: 2_001 }, (_, index) => createFill({ oid: index + 1, tid: index + 1, time: index + 1 })),
		);
		let hookValue: ReturnType<typeof useUserFillsCsvExport> | null = null;
		function Probe() {
			hookValue = useUserFillsCsvExport({
				filename: "fills.csv",
				buildRows: (fills) => fills.map((fill) => [fill.coin]),
			});
			return null;
		}
		act(() => root.render(<Probe />));
		if (!hookValue) throw new Error("Missing fills export hook");

		await act(async () => hookValue?.exportCsv());

		expect(mocks.downloadCsv).not.toHaveBeenCalled();
	});

	it("fails closed when the order export response exceeds the 2000-item API boundary", async () => {
		mocks.historicalOrders.mockResolvedValueOnce(Array.from({ length: 2_001 }, () => createOrder()));
		let hookValue: ReturnType<typeof useHistoricalOrdersCsvExport> | null = null;
		function Probe() {
			hookValue = useHistoricalOrdersCsvExport({
				filename: "orders.csv",
				buildRows: (entries) => entries.map((entry) => [entry.kind]),
			});
			return null;
		}
		act(() => root.render(<Probe />));
		if (!hookValue) throw new Error("Missing order export hook");

		await act(async () => hookValue?.exportCsv());

		expect(mocks.downloadCsv).not.toHaveBeenCalled();
	});
});
