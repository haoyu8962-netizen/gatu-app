import type { Position } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import type { PositionPnlShareData } from "./position-dialog-types";

interface CreatePositionPnlShareDataOptions {
	position: Position;
	markPx: string | undefined;
	env: "Mainnet" | "Testnet";
	symbol: string;
	quoteSymbol: string;
	szDecimals: number;
	capturedAtMs?: number;
}

export function createPositionPnlShareData({
	position,
	markPx,
	env,
	symbol,
	quoteSymbol,
	szDecimals,
	capturedAtMs = Date.now(),
}: CreatePositionPnlShareDataOptions): PositionPnlShareData | null {
	const size = toBig(position.szi);
	const entry = toBig(position.entryPx);
	const mark = toBig(markPx);
	const pnl = toBig(position.unrealizedPnl);
	const roe = toBig(position.returnOnEquity);

	if (!size || size.eq(0) || !entry?.gt(0) || !mark?.gt(0) || !pnl || !roe) return null;

	return {
		coin: position.coin,
		dex: position.dex,
		env,
		symbol,
		quoteSymbol,
		signedPositionSize: position.szi,
		entryPx: position.entryPx,
		markPx: markPx ?? "",
		unrealizedPnl: position.unrealizedPnl,
		returnOnEquity: position.returnOnEquity,
		leverage: String(position.leverage.value),
		szDecimals,
		capturedAtMs,
	};
}
