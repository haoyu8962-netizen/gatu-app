import type { AllDexsAssetCtxsEvent, AssetCtxsEvent, SpotAssetCtxsEvent } from "@nktkas/hyperliquid/api/subscription";

export type PerpAssetCtx = AssetCtxsEvent["ctxs"][number];
export type PerpAssetCtxs = AssetCtxsEvent["ctxs"];

export type AllDexsAssetCtxs = AllDexsAssetCtxsEvent["ctxs"];
export type DexAssetCtxs = AllDexsAssetCtxs[number];
export type DexAssetCtx = DexAssetCtxs[1][number];

export type SpotAssetCtx = SpotAssetCtxsEvent[number];
export type SpotAssetCtxs = SpotAssetCtxsEvent;
