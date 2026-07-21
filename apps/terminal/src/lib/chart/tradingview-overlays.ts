import type { Position } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import { isStopOrder, isTakeProfitOrder, type OpenOrder } from "@/lib/trade/open-orders";
import type { EntityId, HorzlineLineToolOverrides, IChartWidgetApi } from "@/types/charting_library";

export interface TradingViewOverlayLabels {
	limitBuy: string;
	limitSell: string;
	long: string;
	short: string;
}

export interface TradingViewOverlayLine {
	key: string;
	kind: "order" | "position" | "liquidation";
	price: number;
	label: string;
	side: "buy" | "sell";
}

export interface TradingViewOverlayPalette {
	buy: { lineColor: string; textColor: string };
	sell: { lineColor: string; textColor: string };
	liquidation: { lineColor: string; textColor: string };
}

export type TradingViewOverlayChart = Pick<IChartWidgetApi, "createShape" | "removeEntity">;

interface BuildParams {
	coin: string;
	positionDex: string | null;
	orders: readonly OpenOrder[];
	positions: readonly Position[];
	labels: TradingViewOverlayLabels;
}

interface OverlayEntry {
	id: EntityId;
	fingerprint: string;
}

const DASHED_LINE_STYLE = 2;

export function buildTradingViewOverlayLines({ coin, positionDex, orders, positions, labels }: BuildParams) {
	const lines: TradingViewOverlayLine[] = [];

	for (const order of orders) {
		if (order.coin !== coin) continue;
		const price = toPositiveNumber(order.isTrigger ? order.triggerPx : order.limitPx);
		if (price === null) continue;

		let label = order.side === "B" ? labels.limitBuy : labels.limitSell;
		if (isTakeProfitOrder(order)) label = "TP";
		else if (isStopOrder(order)) label = "SL";

		lines.push({
			key: `order:${coin}:${order.oid}`,
			kind: "order",
			price,
			label,
			side: order.side === "B" ? "buy" : "sell",
		});
	}

	if (positionDex === null) return lines;
	const position = positions.find((candidate) => isPositionForMarket(candidate, coin, positionDex));
	if (!position) return lines;

	const size = toBig(position.szi);
	const entryPrice = toPositiveNumber(position.entryPx);
	if (!size || size.eq(0) || entryPrice === null) return lines;

	const side = size.gt(0) ? "buy" : "sell";
	const positionKey = `${position.dex}:${position.coin}`;
	lines.push({
		key: `position:${positionKey}`,
		kind: "position",
		price: entryPrice,
		label: side === "buy" ? labels.long : labels.short,
		side,
	});

	const liquidationPrice = toPositiveNumber(position.liquidationPx);
	if (liquidationPrice !== null) {
		lines.push({
			key: `liquidation:${positionKey}`,
			kind: "liquidation",
			price: liquidationPrice,
			label: "Liq.",
			side: "sell",
		});
	}

	return lines;
}

export class TradingViewOverlayController {
	private chart: TradingViewOverlayChart | null = null;
	private symbol: string | null = null;
	private readonly entries = new Map<string, OverlayEntry>();

	sync(
		chart: TradingViewOverlayChart,
		symbol: string,
		lines: readonly TradingViewOverlayLine[],
		palette: TradingViewOverlayPalette,
	) {
		if (this.chart !== chart || this.symbol !== symbol) {
			this.clear();
			this.chart = chart;
			this.symbol = symbol;
		}

		const desiredKeys = new Set(lines.map((line) => line.key));
		for (const [key, entry] of this.entries) {
			if (desiredKeys.has(key)) continue;
			this.removeEntry(entry);
			this.entries.delete(key);
		}

		for (const line of lines) {
			const colors = line.kind === "liquidation" ? palette.liquidation : palette[line.side];
			const fingerprint = [line.price, line.label, colors.lineColor, colors.textColor].join(":");
			const existing = this.entries.get(line.key);
			if (existing?.fingerprint === fingerprint) continue;
			if (existing) this.removeEntry(existing);

			const id = this.createLine(chart, line, colors);
			if (id) this.entries.set(line.key, { id, fingerprint });
			else this.entries.delete(line.key);
		}
	}

	clear() {
		for (const entry of this.entries.values()) this.removeEntry(entry);
		this.entries.clear();
		this.chart = null;
		this.symbol = null;
	}

	private createLine(
		chart: TradingViewOverlayChart,
		line: TradingViewOverlayLine,
		colors: TradingViewOverlayPalette["buy"],
	): EntityId | null {
		try {
			return chart.createShape<HorzlineLineToolOverrides>(
				{ time: Math.floor(Date.now() / 1000), price: line.price },
				{
					shape: "horizontal_line",
					text: line.label,
					lock: true,
					disableSelection: true,
					disableSave: true,
					disableUndo: true,
					showInObjectsTree: false,
					zOrder: "bottom",
					overrides: {
						"linetoolhorzline.bold": false,
						"linetoolhorzline.fontsize": 10,
						"linetoolhorzline.horzLabelsAlign": "right",
						"linetoolhorzline.italic": false,
						"linetoolhorzline.linecolor": colors.lineColor,
						"linetoolhorzline.linestyle": DASHED_LINE_STYLE,
						"linetoolhorzline.linewidth": 1,
						"linetoolhorzline.showLabel": true,
						"linetoolhorzline.showPrice": true,
						"linetoolhorzline.textcolor": colors.textColor,
						"linetoolhorzline.vertLabelsAlign": "middle",
					},
				},
			);
		} catch {
			return null;
		}
	}

	private removeEntry(entry: OverlayEntry) {
		try {
			this.chart?.removeEntity(entry.id, { disableUndo: true });
		} catch {}
	}
}

function isPositionForMarket(position: Position, coin: string, dex: string): boolean {
	if (position.dex !== dex) return false;
	if (position.coin === coin) return true;
	const prefix = `${dex}:`;
	return dex.length > 0 && coin.startsWith(prefix) && position.coin === coin.slice(prefix.length);
}

function toPositiveNumber(value: string | number | null | undefined): number | null {
	const parsed = toBig(value);
	if (!parsed || parsed.lte(0)) return null;
	const number = parsed.toNumber();
	return Number.isFinite(number) ? number : null;
}
