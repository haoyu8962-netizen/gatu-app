import type { MarketKind } from "./markets/types";

export const OUTCOME_ASSET_ID_OFFSET = 100_000_000;

export type OutcomeSide = 0 | 1;

export interface ParsedOutcomeAsset {
	assetId: number;
	encoding: number;
	outcome: number;
	side: OutcomeSide;
}

export type ParsedAssetId =
	| { kind: "perp"; index: number }
	| { kind: "spot"; index: number }
	| { kind: "builderPerp"; dexIndex: number; index: number }
	| ({ kind: "outcome" } & ParsedOutcomeAsset)
	| { kind: "unknown"; assetId: number };

export type AssetIdKind = ParsedAssetId["kind"];

function isUnsignedSafeInteger(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0;
}

function parseOutcomeEncoding(encoding: number): Omit<ParsedOutcomeAsset, "assetId"> | null {
	if (!isUnsignedSafeInteger(encoding)) return null;
	const side = encoding % 10;
	if (side !== 0 && side !== 1) return null;
	return {
		encoding,
		outcome: (encoding - side) / 10,
		side,
	};
}

export function calculateOutcomeAssetId(outcome: number, side: OutcomeSide): number {
	if (!isUnsignedSafeInteger(outcome) || (side !== 0 && side !== 1)) {
		throw new RangeError("Invalid outcome or side");
	}
	const assetId = OUTCOME_ASSET_ID_OFFSET + outcome * 10 + side;
	if (!Number.isSafeInteger(assetId)) throw new RangeError("Outcome asset ID exceeds the safe integer range");
	return assetId;
}

export function parseOutcomeCoin(coin: string): ParsedOutcomeAsset | null {
	if (!/^#(?:0|[1-9]\d*)$/.test(coin)) return null;
	const parsed = parseOutcomeEncoding(Number(coin.slice(1)));
	if (!parsed) return null;
	const assetId = OUTCOME_ASSET_ID_OFFSET + parsed.encoding;
	if (!Number.isSafeInteger(assetId)) return null;
	return { assetId, ...parsed };
}

export function getOutcomeAssetIdFromCoin(coin: string): number | undefined {
	return parseOutcomeCoin(coin)?.assetId;
}

export function calculateAssetId(kind: MarketKind, index: number, dexIndex?: number): number {
	switch (kind) {
		case "perp":
			return index;
		case "spot":
			return 10000 + index;
		case "builderPerp":
			if (dexIndex === undefined) {
				throw new Error("dexIndex required for builderPerp");
			}
			return 100000 + dexIndex * 10000 + index;
	}
}

export function parseAssetId(assetId: number): ParsedAssetId {
	if (!isUnsignedSafeInteger(assetId)) return { kind: "unknown", assetId };
	if (assetId >= OUTCOME_ASSET_ID_OFFSET) {
		const parsed = parseOutcomeEncoding(assetId - OUTCOME_ASSET_ID_OFFSET);
		return parsed ? { kind: "outcome", assetId, ...parsed } : { kind: "unknown", assetId };
	}
	if (assetId >= 100000) {
		const adjusted = assetId - 100000;
		return {
			kind: "builderPerp",
			dexIndex: Math.floor(adjusted / 10000),
			index: adjusted % 10000,
		};
	}
	if (assetId >= 10000) {
		return { kind: "spot", index: assetId - 10000 };
	}
	return { kind: "perp", index: assetId };
}

export function isSpotAssetId(assetId: number): boolean {
	return isUnsignedSafeInteger(assetId) && assetId >= 10000 && assetId < 100000;
}

export function isPerpAssetId(assetId: number): boolean {
	return isUnsignedSafeInteger(assetId) && assetId < 10000;
}

export function isBuilderPerpAssetId(assetId: number): boolean {
	return isUnsignedSafeInteger(assetId) && assetId >= 100000 && assetId < OUTCOME_ASSET_ID_OFFSET;
}

export function isOutcomeAssetId(assetId: number): boolean {
	return parseAssetId(assetId).kind === "outcome";
}

export function getAssetIdKind(assetId: number): AssetIdKind {
	return parseAssetId(assetId).kind;
}
