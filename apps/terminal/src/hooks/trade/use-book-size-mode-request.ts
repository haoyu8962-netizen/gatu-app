import { useEffect } from "react";
import type { SizeMode } from "@/lib/trade/types";
import { getOrderbookActionsStore, useSizeModeRequest } from "@/stores/use-orderbook-actions-store";

/**
 * Applies a size unit chosen in the order book of `marketName` to the order form once, through the form's own
 * denomination toggle so the size already entered is converted the same way as when the form's unit menu is used.
 * The request is cleared as soon as it is read; a request from another market's book is discarded.
 */
export function useBookSizeModeRequest(
	marketName: string | undefined,
	sizeMode: SizeMode,
	toggleSizeDenomination: () => void,
) {
	const request = useSizeModeRequest();

	useEffect(() => {
		if (request === null) return;

		getOrderbookActionsStore().actions.clearSizeModeRequest();
		if (request.marketName !== marketName || request.mode === sizeMode) return;
		toggleSizeDenomination();
	}, [marketName, request, sizeMode, toggleSizeDenomination]);
}
