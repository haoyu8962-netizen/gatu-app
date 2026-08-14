import { formatPercent, formatQuoteAmount } from "@/lib/format";
import type { Position } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import { isStopOrder, isTakeProfitOrder, type OpenOrder } from "@/lib/trade/open-orders";
import type { EntityId, HorzlineLineToolOverrides, IChartWidgetApi } from "@/types/charting_library";

export interface TradingViewOverlayLabels {
	limitBuy: string;
	limitSell: string;
	long: string;
	pnl: string;
	roe: string;
	short: string;
}

export interface TradingViewOverlayLine {
	key: string;
	kind: "order" | "position" | "liquidation";
	price: number;
	label: string;
	tone?: -1 | 0 | 1;
	side: "buy" | "sell";
}

export interface TradingViewOverlayPalette {
	buy: { line: string; text: string };
	sell: { line: string; text: string };
	liquidation: { line: string; text: string };
	neutral: { text: string };
}

export type TradingViewOverlayChart = Pick<IChartWidgetApi, "createShape" | "getShapeById" | "removeEntity">;

interface BuildParams {
	coin: string;
	positionDex: string | null;
	quoteSymbol: string;
	orders: readonly OpenOrder[];
	positions: readonly Position[];
	labels: TradingViewOverlayLabels;
}

interface OverlayEntry {
	id: EntityId;
	price: number;
	style: string;
}

interface CreationRetry {
	attempt: number;
	at: number;
}

type ShapeOverrides<T extends object, TPrefix extends string> = Partial<{
	[TKey in keyof T as TKey extends `${TPrefix}${infer TShortKey}` ? TShortKey : never]: T[TKey];
}>;

type HorzlineShapeOverrides = ShapeOverrides<HorzlineLineToolOverrides, "linetoolhorzline.">;

const DASHED_LINE_STYLE = 2;
const CREATION_RETRY_BASE_MS = 1_000;
const CREATION_RETRY_MAX_MS = 30_000;

export function buildTradingViewOverlayLines({
	coin,
	positionDex,
	quoteSymbol,
	orders,
	positions,
	labels,
}: BuildParams) {
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
	const pnl = toBig(position.unrealizedPnl);
	lines.push({
		key: `position:${positionKey}`,
		kind: "position",
		price: entryPrice,
		label: buildPositionLabel(side === "buy" ? labels.long : labels.short, position, size, pnl, quoteSymbol, labels),
		tone: getPositionTone(pnl ?? toBig(position.returnOnEquity)),
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
	private readonly creationRetries = new Map<string, CreationRetry>();
	private readonly removalsInFlight = new Set<EntityId>();

	sync(
		chart: TradingViewOverlayChart,
		symbol: string,
		lines: readonly TradingViewOverlayLine[],
		palette: TradingViewOverlayPalette,
	): false | number | null {
		if (this.chart !== chart || this.symbol !== symbol) {
			if (!this.clear()) return false;
			this.chart = chart;
			this.symbol = symbol;
		}

		const desiredKeys = new Set(lines.map((line) => line.key));
		for (const key of this.creationRetries.keys()) {
			if (!desiredKeys.has(key)) this.creationRetries.delete(key);
		}
		for (const [key, entry] of this.entries) {
			if (desiredKeys.has(key)) continue;
			if (this.removeEntry(entry)) this.entries.delete(key);
			else return false;
		}

		for (const line of lines) {
			const colors = resolveOverlayColors(line, palette);
			const style = [line.label, colors.line, colors.text].join(":");
			const existing = this.entries.get(line.key);
			if (existing?.price === line.price) {
				if (existing.style === style) continue;
				if (this.updateLine(chart, existing, line, colors)) {
					existing.style = style;
					continue;
				}
				if (!this.removeEntry(existing)) {
					return false;
				}
				this.entries.delete(line.key);
			} else if (existing) {
				if (!this.removeEntry(existing)) {
					return false;
				}
				this.entries.delete(line.key);
			}

			const retry = this.creationRetries.get(line.key);
			if (retry && Date.now() < retry.at) continue;
			const id = this.createLine(chart, line, colors);
			if (id) {
				this.creationRetries.delete(line.key);
				this.entries.set(line.key, { id, price: line.price, style });
			} else {
				this.entries.delete(line.key);
				this.deferCreationRetry(line.key, retry?.attempt ?? 0);
			}
		}

		let retryAt: number | null = null;
		for (const retry of this.creationRetries.values()) {
			retryAt = retryAt === null ? retry.at : Math.min(retryAt, retry.at);
		}
		return retryAt;
	}

	handleDrawingRemoved(id: EntityId): boolean {
		if (this.removalsInFlight.has(id)) return false;
		for (const [key, entry] of this.entries) {
			if (entry.id !== id) continue;
			this.entries.delete(key);
			this.creationRetries.delete(key);
			return true;
		}
		return false;
	}

	clear(): boolean {
		for (const [key, entry] of this.entries) {
			if (this.removeEntry(entry)) this.entries.delete(key);
		}
		if (this.entries.size > 0) return false;
		this.creationRetries.clear();
		this.chart = null;
		this.symbol = null;
		return true;
	}

	dispose() {
		this.clear();
		this.entries.clear();
		this.creationRetries.clear();
		this.removalsInFlight.clear();
		this.chart = null;
		this.symbol = null;
	}

	private createLine(
		chart: TradingViewOverlayChart,
		line: TradingViewOverlayLine,
		colors: ResolvedOverlayColors,
	): EntityId | null {
		const overrides = {
			bold: false,
			fontsize: 10,
			horzLabelsAlign: "right",
			italic: false,
			linecolor: colors.line,
			linestyle: DASHED_LINE_STYLE,
			linewidth: 1,
			showLabel: true,
			showPrice: true,
			textcolor: colors.text,
			vertLabelsAlign: "middle",
		} satisfies HorzlineShapeOverrides;

		return chart.createShape<HorzlineShapeOverrides>(
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
				overrides,
			},
		);
	}

	private updateLine(
		chart: TradingViewOverlayChart,
		entry: OverlayEntry,
		line: TradingViewOverlayLine,
		colors: ResolvedOverlayColors,
	): boolean {
		try {
			chart.getShapeById(entry.id).setProperties(
				{
					linecolor: colors.line,
					text: line.label,
					textcolor: colors.text,
				},
				false,
			);
			return true;
		} catch {
			return false;
		}
	}

	private removeEntry(entry: OverlayEntry): boolean {
		const chart = this.chart;
		if (!chart) return false;
		this.removalsInFlight.add(entry.id);
		try {
			chart.removeEntity(entry.id, { disableUndo: true });
			return true;
		} catch {
			return false;
		} finally {
			this.removalsInFlight.delete(entry.id);
		}
	}

	private deferCreationRetry(key: string, previousAttempt: number) {
		const attempt = previousAttempt + 1;
		const delayMs = Math.min(CREATION_RETRY_BASE_MS * 2 ** Math.min(attempt - 1, 5), CREATION_RETRY_MAX_MS);
		this.creationRetries.set(key, { attempt, at: Date.now() + delayMs });
	}
}

function buildPositionLabel(
	direction: string,
	position: Position,
	size: NonNullable<ReturnType<typeof toBig>>,
	pnl: ReturnType<typeof toBig>,
	quoteSymbol: string,
	labels: TradingViewOverlayLabels,
): string {
	const roe = toBig(position.returnOnEquity);
	let performance = "";
	if (pnl) {
		const formattedPnl = formatQuoteAmount(pnl.toString(), quoteSymbol, {
			decimals: 2,
			signDisplay: "exceptZero",
		});
		const formattedRoe = roe ? ` (${formatPercent(roe.toString(), 1)})` : "";
		performance = `${labels.pnl} ${formattedPnl}${formattedRoe}`;
	} else if (roe) {
		performance = `${labels.roe} ${formatPercent(roe.toString(), 1)}`;
	}

	const quantity = size.abs().toString();
	if (!performance) return `${direction} · ${quantity}`;
	return `${direction} · ${performance} · ${quantity}`;
}

function getPositionTone(pnl: ReturnType<typeof toBig>): -1 | 0 | 1 {
	if (!pnl || pnl.eq(0)) return 0;
	return pnl.gt(0) ? 1 : -1;
}

interface ResolvedOverlayColors {
	line: string;
	text: string;
}

function resolveOverlayColors(line: TradingViewOverlayLine, palette: TradingViewOverlayPalette): ResolvedOverlayColors {
	const lineColors = line.kind === "liquidation" ? palette.liquidation : palette[line.side];
	if (line.kind !== "position") return lineColors;

	if (line.tone === 1) return { line: lineColors.line, text: palette.buy.text };
	if (line.tone === -1) return { line: lineColors.line, text: palette.sell.text };
	return {
		line: lineColors.line,
		text: palette.neutral.text,
	};
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
