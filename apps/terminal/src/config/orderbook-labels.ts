import { msg } from "@lingui/core/macro";

export const ORDERBOOK_LABELS = {
	orderBook: { ...msg`Order Book`, message: "Order Book" },
	trades: { ...msg`Trades`, message: "Trades" },
	recentTrades: { ...msg`Recent Trades`, message: "Recent Trades" },
	price: { ...msg`Price`, message: "Price" },
	size: { ...msg`Size`, message: "Size" },
	total: { ...msg`Total`, message: "Total" },
	spread: { ...msg`Spread`, message: "Spread" },
	priceGrouping: { ...msg`Price grouping`, message: "Price grouping" },
	waiting: { ...msg`Waiting for order book...`, message: "Waiting for order book..." },
	noOrders: { ...msg`No orders`, message: "No orders" },
};
