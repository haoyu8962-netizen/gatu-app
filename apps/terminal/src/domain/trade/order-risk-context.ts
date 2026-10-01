import { getAssetIdKind } from "@sairn/hl-react";
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
		const kind = getAssetIdKind(assetId);
		if (context.marketKind === "spot") return kind === "spot" || kind === "outcome";
		return kind === "perp" || kind === "builderPerp";
	});
}
