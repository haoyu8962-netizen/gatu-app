// @vitest-environment jsdom

import type { HistoricalOrdersResponse, UserFillsResponse, UserTwapSliceFillsResponse } from "@nktkas/hyperliquid";
import { act } from "react";
import type { Root } from "react-dom/client";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHistoricalOrdersCsvExport, useUserFillsCsvExport } from "@/hooks/trade/use-history-csv-export";
import { useTwapFillHistoryCsv } from "@/hooks/trade/use-twap-fill-history-csv";
import { formatDateTimeShort, formatToken, formatUSD } from "@/lib/format";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111" as `0x${string}`,
	downloadCsv: vi.fn(),
	historicalOrders: vi.fn(),
	userFillsByTime: vi.fn(),
	userTwapSliceFillsByTime: vi.fn(),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: mocks.address,
		isConnected: true,
	}),
}));

vi.mock("@/lib/csv", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/csv")>()),
	downloadCsv: mocks.downloadCsv,
}));

vi.mock("@/lib/hyperliquid", () => ({
	getInfoClient: () => ({
		historicalOrders: mocks.historicalOrders,
		userFillsByTime: mocks.userFillsByTime,
		userTwapSliceFillsByTime: mocks.userTwapSliceFillsByTime,
	}),
	useMarkets: () => ({
		getSzDecimals: (coin: string) => (coin === "BTC" ? 5 : 2),
	}),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => "en-US",
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
		mocks.address = "0x1111111111111111111111111111111111111111";
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

	it("walks the full fills range and exports the latest 10000 records", async () => {
		const fills = Array.from({ length: 12_001 }, (_, index) =>
			createFill({ oid: index + 1, tid: index + 1, time: index + 1 }),
		);
		mocks.userFillsByTime.mockImplementation(async ({ endTime, startTime }: { endTime: number; startTime: number }) =>
			fills.filter((fill) => fill.time >= startTime && fill.time <= endTime).slice(0, 2_000),
		);
		let hookValue: ReturnType<typeof useUserFillsCsvExport> | null = null;
		function Probe() {
			hookValue = useUserFillsCsvExport({
				filename: "fills.csv",
				buildRows: (items) => items.map((fill) => [String(fill.tid)]),
			});
			return null;
		}
		act(() => root.render(<Probe />));
		if (!hookValue) throw new Error("Missing fills export hook");

		await act(async () => hookValue?.exportCsv());

		const rows = mocks.downloadCsv.mock.calls[0]?.[1] as string[][];
		expect(mocks.userFillsByTime).toHaveBeenCalledTimes(7);
		expect(rows).toHaveLength(10_000);
		expect(rows.at(0)).toEqual(["2002"]);
		expect(rows.at(-1)).toEqual(["12001"]);
	});

	it("does not count TWAP fills against the latest 10000 ordinary fills", async () => {
		const fills = Array.from({ length: 15_000 }, (_, index) => {
			const id = index + 1;
			return createFill({ oid: id, tid: id, time: id, twapId: id % 5 === 0 ? 7 : null });
		});
		mocks.userFillsByTime.mockImplementation(async ({ endTime, startTime }: { endTime: number; startTime: number }) =>
			fills.filter((fill) => fill.time >= startTime && fill.time <= endTime).slice(0, 2_000),
		);
		let hookValue: ReturnType<typeof useUserFillsCsvExport> | null = null;
		function Probe() {
			hookValue = useUserFillsCsvExport({
				filename: "fills.csv",
				buildRows: (items) => items.map((fill) => [String(fill.tid)]),
			});
			return null;
		}
		act(() => root.render(<Probe />));
		if (!hookValue) throw new Error("Missing fills export hook");

		await act(async () => hookValue?.exportCsv());

		const rows = mocks.downloadCsv.mock.calls[0]?.[1] as string[][];
		expect(rows).toHaveLength(10_000);
		expect(rows.at(0)).toEqual(["2501"]);
		expect(rows.at(-1)).toEqual(["14999"]);
		expect(rows.every(([tid]) => Number(tid) % 5 !== 0)).toBe(true);
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

function createSliceFill(fill: Partial<UserFillsResponse[number]>, twapId = 7): UserTwapSliceFillsResponse[number] {
	return { fill: createFill({ twapId: null, ...fill }), twapId };
}

function serveTwapPages(entries: readonly UserTwapSliceFillsResponse[number][], pageSize = 2_000) {
	mocks.userTwapSliceFillsByTime.mockImplementation(
		async ({ endTime, startTime }: { endTime: number; startTime: number }) =>
			entries.filter((entry) => entry.fill.time >= startTime && entry.fill.time <= endTime).slice(0, pageSize),
	);
}

describe("TWAP fill history CSV export", () => {
	let container: HTMLDivElement;
	let root: Root;
	let hookValue: ReturnType<typeof useTwapFillHistoryCsv> | null;

	function Probe() {
		hookValue = useTwapFillHistoryCsv();
		return null;
	}

	function renderProbe() {
		act(() => root.render(<Probe />));
		if (!hookValue) throw new Error("Missing TWAP fill export hook");
		return hookValue;
	}

	beforeEach(() => {
		mocks.address = "0x1111111111111111111111111111111111111111";
		mocks.downloadCsv.mockReset();
		mocks.userFillsByTime.mockReset();
		mocks.userTwapSliceFillsByTime.mockReset();
		hookValue = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	function startExport(hook: ReturnType<typeof useTwapFillHistoryCsv>) {
		let pendingExport: Promise<void> | undefined;
		act(() => {
			pendingExport = hook.exportCsv();
		});
		return pendingExport;
	}

	async function advancePacedExport(delayMs: number) {
		await act(async () => {
			await vi.advanceTimersByTimeAsync(delayMs);
		});
	}

	it("requests the slice fill endpoint from the epoch without aggregation and never the general fills endpoint", async () => {
		serveTwapPages([createSliceFill({ time: 1_000 })]);
		const hook = renderProbe();

		await act(async () => hook.exportCsv());

		expect(mocks.userFillsByTime).not.toHaveBeenCalled();
		const [params, signal] = mocks.userTwapSliceFillsByTime.mock.calls[0] ?? [];
		expect(Object.keys(params).sort()).toEqual(["endTime", "startTime", "user"]);
		expect(params).toEqual({
			endTime: expect.any(Number),
			startTime: 0,
			user: "0x1111111111111111111111111111111111111111",
		});
		expect(signal).toBeInstanceOf(AbortSignal);
	});

	it("downloads every slice fill in ascending order with the trade history columns", async () => {
		const zeroHashFill = createSliceFill({ closedPnl: "0", hash: `0x${"0".repeat(64)}`, time: 1_000 });
		const closingFill = createSliceFill(
			{
				closedPnl: "-1.5",
				coin: "ETH",
				dir: "Close Long",
				fee: "0.25",
				hash: `0x${"a".repeat(64)}`,
				oid: 50,
				px: "2500.5",
				side: "A",
				sz: "1.5",
				tid: 101,
				time: 2_000,
			},
			8,
		);
		const liquidatedFill = createSliceFill({
			liquidation: { markPx: "62000", method: "market" },
			oid: 51,
			tid: 102,
			time: 3_000,
		});
		serveTwapPages([zeroHashFill, closingFill, liquidatedFill]);
		const hook = renderProbe();

		await act(async () => hook.exportCsv());

		expect(mocks.downloadCsv).toHaveBeenCalledTimes(1);
		const [filename, rows] = mocks.downloadCsv.mock.calls[0] as [string, string[][]];
		expect(filename).toBe("twap_fill_history.csv");
		expect(rows).toEqual([
			["Time", "Asset", "Direction", "Type", "Price", "Size", "Fee", "PNL", "Transaction"],
			[
				formatDateTimeShort(1_000),
				"BTC",
				"Open Long",
				"TWAP",
				formatUSD("63000"),
				"0.01000",
				formatToken("0.01", { symbol: "USDC" }),
				"-",
				"-",
			],
			[
				formatDateTimeShort(2_000),
				"ETH",
				"Close Long",
				"TWAP",
				formatUSD("2500.5"),
				"1.50",
				formatToken("0.25", { symbol: "USDC" }),
				formatUSD("-1.5", { signDisplay: "exceptZero" }),
				`0x${"a".repeat(64)}`,
			],
			[
				formatDateTimeShort(3_000),
				"BTC",
				"Liquidated",
				"TWAP",
				formatUSD("63000"),
				"0.01000",
				formatToken("0.01", { symbol: "USDC" }),
				"-",
				`0x${"1".repeat(64)}`,
			],
		]);
		expect(toast.loading).toHaveBeenCalledWith("Exporting TWAP fill history...");
		expect(toast.success).toHaveBeenCalledWith("CSV exported.", { id: "toast-id" });
		expect(toast.warning).not.toHaveBeenCalled();
	});

	it("paces pages past the export's weight share and warns when it keeps only the latest 10000 slice fills", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
		serveTwapPages(
			Array.from({ length: 12_001 }, (_, index) =>
				createSliceFill({ oid: index + 1, tid: index + 1, time: index + 1 }),
			),
		);
		const hook = renderProbe();

		const pendingExport = startExport(hook);
		await advancePacedExport(59_000);

		expect(mocks.userTwapSliceFillsByTime).toHaveBeenCalledTimes(6);
		expect(mocks.downloadCsv).not.toHaveBeenCalled();
		expect(hookValue?.isExporting).toBe(true);

		await advancePacedExport(1_000);
		await act(async () => pendingExport);

		expect(mocks.userTwapSliceFillsByTime).toHaveBeenCalledTimes(8);
		const rows = mocks.downloadCsv.mock.calls[0]?.[1] as string[][];
		expect(rows).toHaveLength(10_001);
		expect(rows[1]?.[0]).toBe(formatDateTimeShort(2_002));
		expect(rows.at(-1)?.[0]).toBe(formatDateTimeShort(12_001));
		expect(toast.warning).toHaveBeenCalledWith(
			"CSV export reached the history limit. Some records were not included.",
			{
				id: "toast-id",
			},
		);
		expect(toast.success).not.toHaveBeenCalled();
	});

	it("waits a full minute before retrying a rate-limited page that carries no Retry-After", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
		mocks.userTwapSliceFillsByTime
			.mockRejectedValueOnce(
				Object.assign(new Error("rate limited"), { response: { headers: { get: () => null }, status: 429 } }),
			)
			.mockResolvedValueOnce([createSliceFill({ time: 1_000 })])
			.mockResolvedValue([]);
		const hook = renderProbe();

		const pendingExport = startExport(hook);
		await advancePacedExport(59_000);

		expect(mocks.userTwapSliceFillsByTime).toHaveBeenCalledTimes(1);
		expect(toast.error).not.toHaveBeenCalled();

		await advancePacedExport(1_000);
		await act(async () => pendingExport);

		expect(mocks.userTwapSliceFillsByTime).toHaveBeenCalledTimes(3);
		expect(mocks.downloadCsv).toHaveBeenCalledTimes(1);
		expect(toast.success).toHaveBeenCalledWith("CSV exported.", { id: "toast-id" });
	});

	it.each([
		["a malformed page", () => mocks.userTwapSliceFillsByTime.mockResolvedValue([{ fill: createFill(), twapId: -1 }])],
		[
			"a rejected request",
			() => mocks.userTwapSliceFillsByTime.mockRejectedValue(new Error("upstream detail 0xdeadbeef")),
		],
	])("reports %s without raw error text or a download", async (_label, arrange) => {
		arrange();
		const hook = renderProbe();

		await act(async () => hook.exportCsv());

		expect(mocks.downloadCsv).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledExactlyOnceWith("Failed to export TWAP fill history.", { id: "toast-id" });
		expect(toast.success).not.toHaveBeenCalled();
	});

	it("runs a single export at a time", async () => {
		let resolvePage: ((page: UserTwapSliceFillsResponse) => void) | undefined;
		mocks.userTwapSliceFillsByTime.mockImplementationOnce(
			() =>
				new Promise<UserTwapSliceFillsResponse>((resolve) => {
					resolvePage = resolve;
				}),
		);
		mocks.userTwapSliceFillsByTime.mockResolvedValue([]);
		const hook = renderProbe();

		let firstExport: Promise<void> | undefined;
		act(() => {
			firstExport = hook.exportCsv();
		});
		expect(hookValue?.isExporting).toBe(true);
		await act(async () => hookValue?.exportCsv());
		expect(mocks.userTwapSliceFillsByTime).toHaveBeenCalledTimes(1);

		await act(async () => {
			resolvePage?.([createSliceFill({ time: 1_000 })]);
			await firstExport;
		});

		expect(mocks.downloadCsv).toHaveBeenCalledTimes(1);
		expect(hookValue?.isExporting).toBe(false);
	});

	it.each([
		[
			"the owner changes",
			() => {
				mocks.address = "0x2222222222222222222222222222222222222222";
				act(() => root.render(<Probe />));
			},
		],
		[
			"the surface unmounts",
			() => {
				act(() => root.unmount());
				root = createI18nRoot(container);
			},
		],
	])("discards the export silently when %s", async (_label, interrupt) => {
		let requestSignal: AbortSignal | undefined;
		mocks.userTwapSliceFillsByTime.mockImplementation(
			(_params: unknown, signal: AbortSignal) =>
				new Promise((_resolve, reject) => {
					requestSignal = signal;
					signal.addEventListener("abort", () => reject(signal.reason), { once: true });
				}),
		);
		const hook = renderProbe();

		const pendingExport = startExport(hook);
		await act(async () => {});
		expect(requestSignal?.aborted).toBe(false);
		interrupt();
		await act(async () => pendingExport);

		expect(requestSignal?.aborted).toBe(true);
		expect(mocks.downloadCsv).not.toHaveBeenCalled();
		expect(toast.dismiss).toHaveBeenCalledWith("toast-id");
		expect(toast.error).not.toHaveBeenCalled();
	});
});
