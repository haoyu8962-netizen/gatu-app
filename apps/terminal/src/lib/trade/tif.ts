import { t } from "@lingui/core/macro";
import type { OrderType } from "@/config/trade";
import { type LimitTif, TIF_OPTIONS } from "@/config/trade";

export function getAvailableTifOptions(orderType: OrderType | string): readonly LimitTif[] {
	return orderType === "limit" ? (["Gtc", "Ioc", "Alo"] as const) : (["Gtc", "Alo"] as const);
}

export function getTifOptionLabel(tif: LimitTif): string {
	if (tif === "Alo") return t`Post Only`;
	if (tif in TIF_OPTIONS) return TIF_OPTIONS[tif as keyof typeof TIF_OPTIONS].label;
	return String(tif);
}
