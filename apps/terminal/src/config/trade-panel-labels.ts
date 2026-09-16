import { msg } from "@lingui/core/macro";
import { ORDERBOOK_LABELS } from "./orderbook-labels";

export const TRADE_PANEL_LABELS = {
	regionRestricted: {
		...msg`Trading is not available in your region`,
		message: "Trading is not available in your region",
	},
	marginMode: { ...msg`Margin mode`, message: "Margin mode" },
	margin: { ...msg`Margin`, message: "Margin" },
	leverage: { ...msg`Leverage`, message: "Leverage" },
	accountMode: { ...msg`Account mode`, message: "Account mode" },
	account: { ...msg`Account`, message: "Account" },
	market: { ...msg`Market`, message: "Market" },
	limit: { ...msg`Limit`, message: "Limit" },
	advanced: { ...msg`Advanced`, message: "Advanced" },
	other: { ...msg`Other`, message: "Other" },
	available: { ...msg`Available`, message: "Available" },
	position: { ...msg`Position`, message: "Position" },
	reduceOnly: { ...msg`Reduce Only`, message: "Reduce Only" },
	tpSl: { ...msg`TP/SL`, message: "TP/SL" },
	tpSlAria: { ...msg`Take Profit / Stop Loss`, message: "Take Profit / Stop Loss" },
	liqPrice: { ...msg`Liq. Price`, message: "Liq. Price" },
	orderValue: { ...msg`Order Value`, message: "Order Value" },
	marginRequired: { ...msg`Margin Req.`, message: "Margin Req." },
	estimatedSlippage: { ...msg`Est. Slippage`, message: "Est. Slippage" },
	slippage: { ...msg`Slippage`, message: "Slippage" },
	fees: { ...msg`Fees`, message: "Fees" },
	taker: { ...msg`Taker`, message: "Taker" },
	maker: { ...msg`Maker`, message: "Maker" },
	advancedOrderTypes: { ...msg`Advanced order types`, message: "Advanced order types" },
	orderType: { ...msg`Order type`, message: "Order type" },
	cross: { ...msg`Cross`, message: "Cross" },
	size: ORDERBOOK_LABELS.size,
};

export const SIDE_LABELS = {
	buy: { ...msg`Buy`, message: "Buy" },
	sell: { ...msg`Sell`, message: "Sell" },
	long: { ...msg`Long`, message: "Long" },
	short: { ...msg`Short`, message: "Short" },
	buyLong: { ...msg`Buy Long`, message: "Buy Long" },
	sellShort: { ...msg`Sell Short`, message: "Sell Short" },
};
