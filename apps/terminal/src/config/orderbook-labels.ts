import { msg } from "@lingui/core/macro";

export const ORDERBOOK_LABELS = {
	mid: { ...msg`Mid`, message: "Mid" },
	pricePrecision: { ...msg`Price precision`, message: "Price precision" },
	view: { ...msg`Order book view`, message: "Order book view" },
	both: { ...msg`Show both sides`, message: "Show both sides" },
	asks: { ...msg`Show asks only`, message: "Show asks only" },
	bids: { ...msg`Show bids only`, message: "Show bids only" },

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
