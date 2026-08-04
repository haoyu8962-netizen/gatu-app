import type { PerpMarginConstraint } from "@/domain/trade/isolated-margin";
import type { MarginMode } from "@/lib/trade/margin-mode";

export interface IsolatedMarginPositionRef {
	coin: string;
	dex: string;
	assetId: number;
	isLong: boolean;
	szDecimals: number;
	marginConstraint: PerpMarginConstraint | undefined;
	marginUsed: string;
	positionValue: string;
	liquidationPx: string | null;
}

export interface TpSlPositionRef {
	coin: string;
	dex: string;
	assetId: number;
	isLong: boolean;
	szDecimals: number;
	marginMode: MarginMode;
}

export interface PositionMarketCloseRef {
	coin: string;
	dex: string;
	assetId: number;
	szDecimals: number;
	signedPositionSize: string;
	markPx: string;
	marginMode: MarginMode;
}

export interface PositionReverseRef {
	assetId: number;
	coin: string;
	dex: string;
	signedPositionSize: string;
	szDecimals: number;
	marginMode: MarginMode;
}

export interface LimitClosePositionData {
	coin: string;
	dex: string;
	assetId: number;
	signedPositionSize: string;
	entryPx: string;
	markPx: string;
	szDecimals: number;
	marginMode: MarginMode;
}

export interface PositionPnlShareData {
	coin: string;
	dex: string;
	env: "Mainnet" | "Testnet";
	symbol: string;
	quoteSymbol: string;
	signedPositionSize: string;
	entryPx: string;
	markPx: string;
	unrealizedPnl: string;
	returnOnEquity: string;
	leverage: string;
	szDecimals: number;
	capturedAtMs: number;
}
