import { t } from "@lingui/core/macro";
import type { Side } from "@/lib/trade/types";

export function getTwapStopPriceLabel(side: Side, labels = { buy: t`Max Price`, sell: t`Min Price` }): string {
	return labels[side];
}
