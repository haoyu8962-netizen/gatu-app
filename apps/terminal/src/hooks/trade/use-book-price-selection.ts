import { useEffect } from "react";
import { formatPriceForInput } from "@/domain/trade/orders";
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
 * in another market's book is discarded. The order type follows `getOrderTypeForBookPrice`. With the market's
 * asset id and size decimals the price is written with every decimal the official terminal shows (85.810).
 */
export function useBookPriceSelection(marketName: string | undefined, assetId?: number, szDecimals?: number) {
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
		const fieldPrice =
			typeof assetId === "number" && typeof szDecimals === "number"
				? formatPriceForInput(price, { assetId, szDecimals })
				: price;
		setLimitPriceFromUser(`${marketName ?? ""}|${bookOrderType}`, fieldPrice);
	}, [assetId, marketName, orderType, selectedPrice, setOrderType, setLimitPriceFromUser, szDecimals]);
}
