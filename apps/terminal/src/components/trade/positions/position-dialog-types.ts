export interface TpSlPositionRef {
	coin: string;
	dex: string;
	assetId: number;
	isLong: boolean;
	szDecimals: number;
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
}
