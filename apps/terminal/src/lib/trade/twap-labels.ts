import type { Side } from "@/lib/trade/types";

export function getTwapStopPriceLabel(side: Side, labels: Record<Side, string>): string {
	return labels[side];
}
