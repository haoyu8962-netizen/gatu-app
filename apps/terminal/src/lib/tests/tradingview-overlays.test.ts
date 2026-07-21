import { describe, expect, it, vi } from "vitest";
import {
	buildTradingViewOverlayLines,
	type TradingViewOverlayChart,
	TradingViewOverlayController,
	type TradingViewOverlayLine,
	type TradingViewOverlayPalette,
} from "@/lib/chart/tradingview-overlays";
import type { Position } from "@/lib/hyperliquid";
import type { OpenOrder } from "@/lib/trade/open-orders";

const labels = {
	limitBuy: "Limit Buy",
	limitSell: "Limit Sell",
	long: "Long",
	short: "Short",
};

const palette: TradingViewOverlayPalette = {
	buy: { lineColor: "buy-line", textColor: "buy-text" },
	sell: { lineColor: "sell-line", textColor: "sell-text" },
	liquidation: { lineColor: "liq-line", textColor: "liq-text" },
};

function createOrder(overrides: Partial<OpenOrder>): OpenOrder {
	return {
		coin: "BTC",
		oid: 1,
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
		...overrides,
	} as Position;
}

describe("buildTradingViewOverlayLines", () => {
	it("derives limit, trigger, position, and liquidation lines for the selected market", () => {
		const lines = buildTradingViewOverlayLines({
			coin: "BTC",
			positionDex: "",
			orders: [
				createOrder({ oid: 1, side: "B", limitPx: "101" }),
				createOrder({ oid: 2, side: "A", isTrigger: true, triggerPx: "95", orderType: "Stop Market" }),
				createOrder({ oid: 3, coin: "ETH", limitPx: "200" }),
			],
			positions: [createPosition({ szi: "-2", entryPx: "99", liquidationPx: "140" })],
			labels,
		});

		expect(lines).toEqual([
			{ key: "order:BTC:1", kind: "order", price: 101, label: "Limit Buy", side: "buy" },
			{ key: "order:BTC:2", kind: "order", price: 95, label: "SL", side: "sell" },
			{ key: "position::BTC", kind: "position", price: 99, label: "Short", side: "sell" },
			{ key: "liquidation::BTC", kind: "liquidation", price: 140, label: "Liq.", side: "sell" },
		]);
	});

	it("matches a short HIP-3 position coin only within the selected dex", () => {
		const lines = buildTradingViewOverlayLines({
			coin: "xyz:GOLD",
			positionDex: "xyz",
			orders: [],
			positions: [
				createPosition({ dex: "cash", coin: "GOLD", entryPx: "2000" }),
				createPosition({ dex: "xyz", coin: "GOLD", entryPx: "2100", liquidationPx: null }),
			],
			labels,
		});

		expect(lines).toEqual([{ key: "position:xyz:GOLD", kind: "position", price: 2100, label: "Long", side: "buy" }]);
	});

	it("does not create position lines for spot markets", () => {
		const lines = buildTradingViewOverlayLines({
			coin: "@107",
			positionDex: null,
			orders: [],
			positions: [createPosition({ coin: "@107" })],
			labels,
		});

		expect(lines).toEqual([]);
	});
});

describe("TradingViewOverlayController", () => {
	it("keeps unchanged lines and replaces changed or stale lines", () => {
		let nextId = 0;
		const createShape = vi.fn(() => `shape-${++nextId}`);
		const removeEntity = vi.fn();
		const chart = { createShape, removeEntity } as unknown as TradingViewOverlayChart;
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
		const createShape = vi.fn(() => "shape-1");
		const chart = { createShape, removeEntity: vi.fn() } as unknown as TradingViewOverlayChart;
		const controller = new TradingViewOverlayController();

		controller.sync(
			chart,
			"BTC",
			[{ key: "position::BTC", kind: "position", price: 100, label: "Long", side: "buy" }],
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
	});
});
