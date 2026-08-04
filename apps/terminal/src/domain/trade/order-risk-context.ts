import { getAssetIdKind } from "@gatu/hl-react";
import type { MarginMode } from "@/lib/trade/margin-mode";

export type OrderRiskContext =
	| {
			marketKind: "spot";
	  }
	| {
			marketKind: "perp";
			marginMode: MarginMode | "mixed";
	  };

interface AssetOrder {
	a: number | string;
	r?: boolean;
}

export function doesOrderBatchMatchRiskContext(orders: readonly AssetOrder[], context: OrderRiskContext): boolean {
	return orders.every((order) => {
		const assetId = Number(order.a);
		if (!Number.isSafeInteger(assetId) || assetId < 0) return false;
		const isSpot = getAssetIdKind(assetId) === "spot";
		return context.marketKind === "spot" ? isSpot : !isSpot;
	});
}
