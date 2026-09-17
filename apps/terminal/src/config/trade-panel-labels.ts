import { msg } from "@lingui/core/macro";
import { ORDERBOOK_LABELS } from "./orderbook-labels";

export const TRADE_PANEL_LABELS = {
	estimatedFee: msg`Est. Fee`,
	max: msg`Max`,

	regionRestricted: msg`Trading is not available in your region`,
	marginMode: msg`Margin mode`,
	margin: msg`Margin`,
	leverage: msg`Leverage`,
	accountMode: msg`Account mode`,
	account: msg`Account`,
	market: msg`Market`,
	limit: msg`Limit`,
	advanced: msg`Advanced`,
	other: msg`Other`,
	available: msg`Available`,
	position: msg`Position`,
	reduceOnly: msg`Reduce Only`,
	tpSl: msg`TP/SL`,
	tpSlAria: msg`Take Profit / Stop Loss`,
	liqPrice: msg`Liq. Price`,
	orderValue: msg`Order Value`,
	marginRequired: msg`Margin Req.`,
	estimatedSlippage: msg`Est. Slippage`,
	slippage: msg`Slippage`,
	fees: msg`Fees`,
	taker: msg`Taker`,
	maker: msg`Maker`,
	advancedOrderTypes: msg`Advanced order types`,
	orderType: msg`Order type`,
	cross: msg`Cross`,
	size: ORDERBOOK_LABELS.size,
};

export const SIDE_LABELS = {
	buy: msg`Buy`,
	sell: msg`Sell`,
	long: msg`Long`,
	short: msg`Short`,
	buyLong: msg`Buy Long`,
	sellShort: msg`Sell Short`,
};
