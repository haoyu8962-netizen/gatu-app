import { useEffect } from "react";
import type { SizeMode } from "@/lib/trade/types";
import { getOrderbookActionsStore, useSizeModeRequest } from "@/stores/use-orderbook-actions-store";

/**
 * Applies a size unit chosen in the order book of `marketName` to the order form once, through the form's own
 * denomination toggle so the size already entered is converted the same way as when the form's unit menu is used.
 * The request is taken from the store by identity before anything else, so a repeated effect run (StrictMode, or a
 * request made before the form mounted) cannot apply it twice; a request from another market's book is discarded.
 */
export function useBookSizeModeRequest(
	marketName: string | undefined,
	sizeMode: SizeMode,
	toggleSizeDenomination: () => void,
) {
	const request = useSizeModeRequest();

	useEffect(() => {
		if (request === null || !getOrderbookActionsStore().actions.takeSizeModeRequest(request)) return;
		if (request.marketName !== marketName || request.mode === sizeMode) return;
		toggleSizeDenomination();
	}, [marketName, request, sizeMode, toggleSizeDenomination]);
}
