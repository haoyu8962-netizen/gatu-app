import { t } from "@lingui/core/macro";
import type { Side } from "@/lib/trade/types";

export function getTwapStopPriceLabel(side: Side): string {
	return side === "buy" ? t`Max Price` : t`Min Price`;
}
