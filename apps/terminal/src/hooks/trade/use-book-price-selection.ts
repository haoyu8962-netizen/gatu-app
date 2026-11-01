import { useEffect } from "react";
import { getOrderTypeForBookPrice } from "@/lib/trade/order-types";
import { useOrderEntryActions, useOrderType } from "@/stores/use-order-entry-store";
import {
	getOrderbookActionsStore,
	getSelectedPriceForMarket,
	useSelectedPrice,
} from "@/stores/use-orderbook-actions-store";

/**
 * Applies a price clicked in the order book to the order form of `marketName` once. The selection is cleared
 * as soon as it is read, whatever the order type, so a later order-type change cannot apply it again; a click
 * in another market's book is discarded. The order type follows `getOrderTypeForBookPrice`.
 */
export function useBookPriceSelection(marketName: string | undefined) {
	const selectedPrice = useSelectedPrice();
	const orderType = useOrderType();
	const { setOrderType, setLimitPriceFromUser } = useOrderEntryActions();

	useEffect(() => {
		if (selectedPrice === null) return;

		const price = getSelectedPriceForMarket(selectedPrice, marketName);
		getOrderbookActionsStore().actions.clearSelectedPrice();
		if (price === null) return;

		const bookOrderType = getOrderTypeForBookPrice(orderType);
		if (bookOrderType === null) return;
		if (bookOrderType !== orderType) setOrderType(bookOrderType);
		setLimitPriceFromUser(`${marketName ?? ""}|${bookOrderType}`, price);
	}, [marketName, orderType, selectedPrice, setOrderType, setLimitPriceFromUser]);
}
