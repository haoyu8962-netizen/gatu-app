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

export interface ClosePositionData {
	assetId: number;
	coin: string;
	size: number;
	markPx: number;
	szDecimals: number;
	isLong: boolean;
	unrealizedPnl: number;
	roe: number;
	marginMode: MarginMode;
}

export interface LimitClosePositionData {
	coin: string;
	assetId: number;
	isLong: boolean;
	size: number;
	entryPx: number;
	markPx: number;
	unrealizedPnl: number;
	roe: number;
	szDecimals: number;
	marginMode: MarginMode;
}
