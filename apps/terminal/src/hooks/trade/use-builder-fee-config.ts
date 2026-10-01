import { useHyperliquidOptional } from "@sairn/hl-react";

/** Reads the same provider value that the exchange mutation layer injects into order actions. */
export function useBuilderFeeTenthsBps(): string | number {
	return useHyperliquidOptional()?.builderConfig?.f ?? 0;
}
