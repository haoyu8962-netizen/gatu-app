import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildTradingViewOverlayLines,
	type TradingViewOverlayChart,
	TradingViewOverlayController,
	type TradingViewOverlayLine,
	type TradingViewOverlayPalette,
} from "@/lib/chart/tradingview-overlays";
import { getNumberFormatters } from "@/lib/format";
import type { Position } from "@/lib/hyperliquid";
import type { OpenOrder } from "@/lib/trade/open-orders";
import type { EntityId } from "@/types/charting_library";

const numberFormat = getNumberFormatters();

const labels = {
	limitBuy: "Limit Buy",
	limitSell: "Limit Sell",
	long: "Long",
	pnl: "PNL",
	roe: "ROE",
	short: "Short",
};

const palette: TradingViewOverlayPalette = {
	buy: { line: "buy-line", text: "buy-text" },
	sell: { line: "sell-line", text: "sell-text" },
	liquidation: { line: "liq-line", text: "liq-text" },
	neutral: { text: "neutral-text" },
};

afterEach(() => vi.useRealTimers());

function createOrder(overrides: Partial<OpenOrder>): OpenOrder {
	return {
		coin: "BTC",
		oid: 1,
		children: [],
		isTrigger: false,
		limitPx: "100",
		triggerPx: "0",
		side: "B",
		orderType: "Limit",
		...overrides,
	} as OpenOrder;
}

function createPosition(overrides: Partial<Position>): Position {
	return {
		dex: "",
		coin: "BTC",
		szi: "1",
		entryPx: "100",
		liquidationPx: "50",
		returnOnEquity: "0.125",
		unrealizedPnl: "12.5",
		...overrides,
	} as Position;
}

describe("buildTradingViewOverlayLines", () => {
	it("derives limit, trigger, position, and liquidation lines for the selected market", () => {
		const lines = buildTradingViewOverlayLines({
			coin: "BTC",
			positionDex: "",
			quoteSymbol: "USDC",
			orders: [
				createOrder({ oid: 1, side: "B", limitPx: "101" }),
				createOrder({ oid: 2, side: "A", isTrigger: true, triggerPx: "95", orderType: "Stop Market" }),
				createOrder({ oid: 3, coin: "ETH", limitPx: "200" }),
			],
			positions: [
				createPosition({
					szi: "-2",
					entryPx: "99",
					liquidationPx: "140",
					unrealizedPnl: "-1.25",
					returnOnEquity: "-0.1234",
				}),
			],
			labels,
			numberFormat,
		});

		expect(lines).toEqual([
			{ key: "order:BTC:1", kind: "order", price: 101, label: "Limit Buy", side: "buy" },
			{ key: "order:BTC:2", kind: "order", price: 95, label: "SL", side: "sell" },
			{
				key: "position::BTC",
				kind: "position",
				price: 99,
				label: "Short · PNL -1.25 USDC (-12.3%) · 2",
				tone: -1,
				side: "sell",
			},
			{ key: "liquidation::BTC", kind: "liquidation", price: 140, label: "Liq.", side: "sell" },
		]);
	});

	it("matches a short HIP-3 position coin only within the selected dex", () => {
		const lines = buildTradingViewOverlayLines({
			coin: "xyz:GOLD",
			positionDex: "xyz",
			quoteSymbol: "USDE",
			orders: [],
			positions: [
				createPosition({ dex: "cash", coin: "GOLD", entryPx: "2000" }),
				createPosition({ dex: "xyz", coin: "GOLD", entryPx: "2100", liquidationPx: null }),
			],
			labels,
			numberFormat,
		});

		expect(lines).toEqual([
			{
				key: "position:xyz:GOLD",
				kind: "position",
				price: 2100,
				label: "Long · PNL +12.50 USDE (+12.5%) · 1",
				tone: 1,
				side: "buy",
			},
		]);
	});

	it("does not expose dormant bracket children as active TP/SL orders", () => {
		const takeProfit = createOrder({
			oid: 2,
			side: "A",
			isTrigger: true,
			triggerPx: "120",
			orderType: "Take Profit Market",
		});
		const parent = createOrder({ oid: 1, limitPx: "100", children: [takeProfit] });

		const lines = buildTradingViewOverlayLines({
			coin: "BTC",
			positionDex: null,
			quoteSymbol: "USDC",
			orders: [parent],
			positions: [],
			labels,
			numberFormat,
		});

		expect(lines).toEqual([{ key: "order:BTC:1", kind: "order", price: 100, label: "Limit Buy", side: "buy" }]);
	});

	it("keeps quantity and any valid performance value when position metrics are partially unavailable", () => {
		const lines = buildTradingViewOverlayLines({
			coin: "BTC",
			positionDex: "",
			quoteSymbol: "USDC",
			orders: [],
			positions: [createPosition({ szi: "-0.004300", unrealizedPnl: "invalid", returnOnEquity: "-0.015" })],
			labels: { ...labels, roe: "Return" },
			numberFormat,
		});

		expect(lines[0]).toMatchObject({ label: "Short · Return -1.5% · 0.0043", tone: -1 });
	});

	it("does not create position lines for spot markets", () => {
		const lines = buildTradingViewOverlayLines({
			coin: "@107",
			positionDex: null,
			quoteSymbol: "USDC",
			orders: [],
			positions: [createPosition({ coin: "@107" })],
			labels,
			numberFormat,
		});

		expect(lines).toEqual([]);
	});
});

describe("TradingViewOverlayController", () => {
	it("keeps unchanged lines and replaces changed or stale lines", () => {
		let nextId = 0;
		const createShape = vi.fn(() => `shape-${++nextId}`);
		const removeEntity = vi.fn();
		const chart = { createShape, getShapeById: vi.fn(), removeEntity } as unknown as TradingViewOverlayChart;
		const controller = new TradingViewOverlayController();
		const line: TradingViewOverlayLine = {
			key: "order:BTC:1",
			kind: "order",
			price: 100,
			label: "Limit Buy",
			side: "buy",
		};

		controller.sync(chart, "BTC", [line], palette);
		controller.sync(chart, "BTC", [line], palette);
		expect(createShape).toHaveBeenCalledOnce();
		expect(removeEntity).not.toHaveBeenCalled();

		controller.sync(chart, "BTC", [{ ...line, price: 101 }], palette);
		expect(createShape).toHaveBeenCalledTimes(2);
		expect(removeEntity).toHaveBeenCalledWith("shape-1", { disableUndo: true });

		controller.sync(chart, "ETH", [{ ...line, key: "order:ETH:1" }], palette);
		expect(createShape).toHaveBeenCalledTimes(3);
		expect(removeEntity).toHaveBeenCalledWith("shape-2", { disableUndo: true });

		controller.sync(chart, "ETH", [], palette);
		expect(removeEntity).toHaveBeenCalledWith("shape-3", { disableUndo: true });
	});

	it("creates locked, non-persistent horizontal lines", () => {
		const createShape = vi.fn((_point: unknown, _options: { overrides?: Record<string, unknown> }) => "shape-1");
		const chart = { createShape, getShapeById: vi.fn(), removeEntity: vi.fn() } as unknown as TradingViewOverlayChart;
		const controller = new TradingViewOverlayController();

		controller.sync(
			chart,
			"BTC",
			[
				{
					key: "position::BTC",
					kind: "position",
					price: 100,
					label: "Long",
					tone: 1,
					side: "buy",
				},
			],
			palette,
		);

		expect(createShape).toHaveBeenCalledWith(
			expect.objectContaining({ price: 100 }),
			expect.objectContaining({
				shape: "horizontal_line",
				text: "Long",
				lock: true,
				disableSelection: true,
				disableSave: true,
				disableUndo: true,
				showInObjectsTree: false,
			}),
		);

		const options = createShape.mock.calls[0]?.[1];
		expect(options?.overrides).toEqual({
			bold: false,
			fontsize: 10,
			horzLabelsAlign: "right",
			italic: false,
			linecolor: "buy-line",
			linestyle: 2,
			linewidth: 1,
			showLabel: true,
			showPrice: true,
			textcolor: "buy-text",
			vertLabelsAlign: "middle",
		});
		expect(options?.overrides).not.toHaveProperty("linetoolhorzline.linecolor");
	});

	it("updates PNL text and tone in place without replacing the position entity", () => {
		const setProperties = vi.fn();
		const createShape = vi.fn((_point: unknown, _options: { overrides?: Record<string, unknown> }) => "shape-1");
		const getShapeById = vi.fn(() => ({ setProperties }));
		const removeEntity = vi.fn();
		const chart = { createShape, getShapeById, removeEntity } as unknown as TradingViewOverlayChart;
		const controller = new TradingViewOverlayController();
		const profitableShort: TradingViewOverlayLine = {
			key: "position::BTC",
			kind: "position",
			price: 100,
			label: "Short · PNL +1.00 USDC (+1.0%) · 1",
			tone: 1,
			side: "sell",
		};

		controller.sync(chart, "BTC", [profitableShort], palette);
		const createOptions = createShape.mock.calls[0]?.[1];
		expect(createOptions?.overrides).toMatchObject({ linecolor: "sell-line", textcolor: "buy-text" });

		const losingShort = {
			...profitableShort,
			label: "Short · PNL -2.00 USDC (-2.0%) · 1",
			tone: -1 as const,
		};
		controller.sync(chart, "BTC", [losingShort], palette);
		controller.sync(chart, "BTC", [losingShort], palette);

		expect(createShape).toHaveBeenCalledOnce();
		expect(removeEntity).not.toHaveBeenCalled();
		expect(getShapeById).toHaveBeenCalledWith("shape-1");
		expect(setProperties).toHaveBeenCalledOnce();
		expect(setProperties).toHaveBeenCalledWith(
			{
				linecolor: "sell-line",
				text: losingShort.label,
				textcolor: "sell-text",
			},
			false,
		);
	});

	it("uses neutral label color for zero or invalid position PNL", () => {
		const createShape = vi.fn((_point: unknown, _options: { overrides?: Record<string, unknown> }) => "shape-1");
		const chart = { createShape, getShapeById: vi.fn(), removeEntity: vi.fn() } as unknown as TradingViewOverlayChart;
		const controller = new TradingViewOverlayController();

		controller.sync(
			chart,
			"BTC",
			[
				{
					key: "position::BTC",
					kind: "position",
					price: 100,
					label: "Long · PNL 0.00 USDC (0.0%) · 1",
					tone: 0,
					side: "buy",
				},
			],
			palette,
		);

		expect(createShape.mock.calls[0]?.[1]?.overrides).toMatchObject({
			linecolor: "buy-line",
			textcolor: "neutral-text",
		});
	});

	it("removes stale presentation after an in-place update failure and retries creation with backoff", () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		let createAttempt = 0;
		const createShape = vi.fn(() => {
			createAttempt += 1;
			if (createAttempt === 1) return "shape-1";
			if (createAttempt === 2) return null;
			return "shape-2";
		});
		const setProperties = vi.fn(() => {
			throw new Error("shape update failed");
		});
		const removeEntity = vi.fn();
		const chart = {
			createShape,
			getShapeById: vi.fn(() => ({ setProperties })),
			removeEntity,
		} as unknown as TradingViewOverlayChart;
		const controller = new TradingViewOverlayController();
		const initial: TradingViewOverlayLine = {
			key: "position::BTC",
			kind: "position",
			price: 100,
			label: "Long · PNL +1.00 USDC (+1.0%) · 1",
			tone: 1,
			side: "buy",
		};
		const updated = { ...initial, label: "Long · PNL +2.00 USDC (+2.0%) · 1" };

		controller.sync(chart, "BTC", [initial], palette);
		controller.sync(chart, "BTC", [updated], palette);

		expect(setProperties).toHaveBeenCalledOnce();
		expect(removeEntity).toHaveBeenCalledWith("shape-1", { disableUndo: true });
		expect(createShape).toHaveBeenCalledTimes(2);

		vi.advanceTimersByTime(1_000);
		controller.sync(chart, "BTC", [updated], palette);

		expect(createShape).toHaveBeenCalledTimes(3);
	});

	it("bounds repeated create failures while preserving an eventual retry", () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		const createShape = vi.fn(() => null);
		const chart = { createShape, getShapeById: vi.fn(), removeEntity: vi.fn() } as unknown as TradingViewOverlayChart;
		const controller = new TradingViewOverlayController();
		const line: TradingViewOverlayLine = {
			key: "order:BTC:1",
			kind: "order",
			price: 100,
			label: "Limit Buy",
			side: "buy",
		};

		const firstResult = controller.sync(chart, "BTC", [line], palette);
		const deferredResult = controller.sync(chart, "BTC", [line], palette);
		expect(createShape).toHaveBeenCalledOnce();
		expect(firstResult).toBe(2_000);
		expect(deferredResult).toEqual(firstResult);

		vi.advanceTimersByTime(1_000);
		const secondResult = controller.sync(chart, "BTC", [line], palette);
		expect(createShape).toHaveBeenCalledTimes(2);
		expect(secondResult).toBe(4_000);
	});

	it("caps each creation retry delay at 30 seconds without abandoning the overlay", () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		const createShape = vi.fn(() => null);
		const chart = { createShape, getShapeById: vi.fn(), removeEntity: vi.fn() } as unknown as TradingViewOverlayChart;
		const controller = new TradingViewOverlayController();
		const line: TradingViewOverlayLine = {
			key: "order:BTC:1",
			kind: "order",
			price: 100,
			label: "Limit Buy",
			side: "buy",
		};

		let retryAt = controller.sync(chart, "BTC", [line], palette);
		for (let attempt = 1; attempt < 8; attempt += 1) {
			expect(typeof retryAt).toBe("number");
			vi.setSystemTime(retryAt as number);
			retryAt = controller.sync(chart, "BTC", [line], palette);
		}

		expect(retryAt).not.toBe(false);
		expect((retryAt as number) - Date.now()).toBe(30_000);
		expect(createShape).toHaveBeenCalledTimes(8);
	});

	it("propagates createShape exceptions without converting them into a null retry", () => {
		const createShape = vi
			.fn()
			.mockImplementationOnce(() => {
				throw new Error("TradingView drawing API failed");
			})
			.mockReturnValue("shape-1");
		const chart = { createShape, getShapeById: vi.fn(), removeEntity: vi.fn() } as unknown as TradingViewOverlayChart;
		const controller = new TradingViewOverlayController();
		const line: TradingViewOverlayLine = {
			key: "order:BTC:1",
			kind: "order",
			price: 100,
			label: "Limit Buy",
			side: "buy",
		};

		expect(() => controller.sync(chart, "BTC", [line], palette)).toThrow("TradingView drawing API failed");
		expect(controller.sync(chart, "BTC", [line], palette)).toBeNull();
		expect(createShape).toHaveBeenCalledTimes(2);
	});

	it("evicts a user-removed drawing so the next sync recreates it", () => {
		let nextId = 0;
		const createShape = vi.fn(() => `shape-${++nextId}`);
		const chart = { createShape, getShapeById: vi.fn(), removeEntity: vi.fn() } as unknown as TradingViewOverlayChart;
		const controller = new TradingViewOverlayController();
		const line: TradingViewOverlayLine = {
			key: "position::BTC",
			kind: "position",
			price: 100,
			label: "Long · 1",
			side: "buy",
		};

		controller.sync(chart, "BTC", [line], palette);
		expect(controller.handleDrawingRemoved("shape-1" as EntityId)).toBe(true);
		expect(controller.handleDrawingRemoved("unmanaged-shape" as EntityId)).toBe(false);
		controller.sync(chart, "BTC", [line], palette);

		expect(createShape).toHaveBeenCalledTimes(2);
		expect(chart.removeEntity).not.toHaveBeenCalled();
	});

	it("ignores the drawing removal event emitted by its own replacement", () => {
		let nextId = 0;
		const controller = new TradingViewOverlayController();
		const internalRemovalResults: boolean[] = [];
		const createShape = vi.fn(() => `shape-${++nextId}`);
		const removeEntity = vi.fn((id: EntityId) => {
			internalRemovalResults.push(controller.handleDrawingRemoved(id));
		});
		const chart = { createShape, getShapeById: vi.fn(), removeEntity } as unknown as TradingViewOverlayChart;
		const line: TradingViewOverlayLine = {
			key: "order:BTC:1",
			kind: "order",
			price: 100,
			label: "Limit Buy",
			side: "buy",
		};

		controller.sync(chart, "BTC", [line], palette);
		controller.sync(chart, "BTC", [{ ...line, price: 101 }], palette);
		controller.sync(chart, "BTC", [{ ...line, price: 101 }], palette);

		expect(internalRemovalResults).toEqual([false]);
		expect(createShape).toHaveBeenCalledTimes(2);
	});

	it("reports a failed removal without replacing the retained entry", () => {
		let nextId = 0;
		const createShape = vi.fn(() => `shape-${++nextId}`);
		const removeEntity = vi.fn().mockImplementationOnce(() => {
			throw new Error("temporary remove failure");
		});
		const chart = { createShape, getShapeById: vi.fn(), removeEntity } as unknown as TradingViewOverlayChart;
		const controller = new TradingViewOverlayController();
		const line: TradingViewOverlayLine = {
			key: "position::BTC",
			kind: "position",
			price: 100,
			label: "Long · PNL +1.00 USDC (+1.0%) · 1",
			side: "buy",
		};

		controller.sync(chart, "BTC", [line], palette);
		const failedResult = controller.sync(chart, "BTC", [{ ...line, price: 101 }], palette);

		expect(removeEntity).toHaveBeenCalledTimes(1);
		expect(createShape).toHaveBeenCalledOnce();
		expect(failedResult).toBe(false);
	});

	it("force-disposes failed entries so a rebuilt widget can render fresh overlays", () => {
		const firstChart = {
			createShape: vi.fn(() => "shape-1"),
			removeEntity: vi.fn(() => {
				throw new Error("destroyed chart");
			}),
			getShapeById: vi.fn(),
		} as unknown as TradingViewOverlayChart;
		const secondChart = {
			createShape: vi.fn(() => "shape-2"),
			getShapeById: vi.fn(),
			removeEntity: vi.fn(),
		} as unknown as TradingViewOverlayChart;
		const controller = new TradingViewOverlayController();
		const line: TradingViewOverlayLine = {
			key: "position::BTC",
			kind: "position",
			price: 100,
			label: "Long · 1",
			side: "buy",
		};

		controller.sync(firstChart, "BTC", [line], palette);
		controller.dispose();
		controller.sync(secondChart, "BTC", [line], palette);

		expect(secondChart.createShape).toHaveBeenCalledOnce();
	});
});
