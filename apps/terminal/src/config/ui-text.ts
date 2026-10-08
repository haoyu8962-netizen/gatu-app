import { t } from "@lingui/core/macro";
import type { SizeMode } from "@/lib/trade/types";
import { MARKET_HEADER_LABELS } from "./market-header";

export interface SideLabels {
	buy: string;
	sell: string;
	buyAria: string;
	sellAria: string;
}

export function getSizeModeLabel(sizeMode: SizeMode, baseToken: string, quoteToken: string): string {
	return sizeMode === "base" ? baseToken || "---" : quoteToken;
}

/**
 * @deprecated Module-level translated getters can be cached by React Compiler. React components
 * must call `useLingui()` and translate during render instead of reading this object.
 */
export const UI_TEXT = {
	TOP_NAV: {
		get SETTINGS_ARIA() {
			return t`Settings`;
		},
	},
	MARKET_OVERVIEW: {
		get LABEL_ORACLE() {
			return t(MARKET_HEADER_LABELS.oracle);
		},
		get LABEL_VOLUME() {
			return t(MARKET_HEADER_LABELS.volume24h);
		},
		get LABEL_OPEN_INTEREST() {
			return t(MARKET_HEADER_LABELS.openInterest);
		},
	},
	ORDERBOOK: {
		get BOOK_LABEL() {
			return t`Order Book`;
		},
		get TRADES_LABEL() {
			return t`Trades`;
		},
		get HEADER_PRICE() {
			return t`Price`;
		},
		get HEADER_SIZE() {
			return t`Size`;
		},
		get HEADER_TOTAL() {
			return t`Total`;
		},
		get SPREAD_LABEL() {
			return t`Spread`;
		},
		get FAILED() {
			return t`Failed to load order book.`;
		},
		get WAITING() {
			return t`Waiting for order book...`;
		},
	},
	ACCOUNT_PANEL: {
		get EQUITY_LABEL() {
			return t`Equity`;
		},
		get BALANCE_LABEL() {
			return t`Balance`;
		},
		get UNREALIZED_LABEL() {
			return t`Unrealized PNL`;
		},
		get AVAILABLE_LABEL() {
			return t`Available`;
		},
		get MARGIN_USED_LABEL() {
			return t`Margin Used`;
		},
		get MARGIN_RATIO_LABEL() {
			return t`Margin Ratio`;
		},
		get CROSS_LEVERAGE_LABEL() {
			return t`Cross Leverage`;
		},
		get DEPOSIT_LABEL() {
			return t`Deposit`;
		},
		get WITHDRAW_LABEL() {
			return t`Withdraw`;
		},
	},
	ORDER_ENTRY: {
		get AVAILABLE_LABEL() {
			return t`Available`;
		},
		get SIZE_LABEL() {
			return t`Size`;
		},
		get LIMIT_PRICE_LABEL() {
			return t`Limit Price`;
		},
		get REDUCE_ONLY_LABEL() {
			return t`Reduce Only`;
		},
		get TPSL_LABEL() {
			return t`TP/SL`;
		},
		get BUTTON_CONNECT() {
			return t`Connect Wallet`;
		},
		get BUTTON_DEPOSIT() {
			return t`Deposit`;
		},
		get BUTTON_SIGNING() {
			return t`Signing...`;
		},
		get BUTTON_LOADING() {
			return t`Loading...`;
		},
		get BUTTON_ENABLE_TRADING() {
			return t`Enable Trading`;
		},
		get SUMMARY_LIQ() {
			return t`Liq. Price`;
		},
		get SUMMARY_ORDER_VALUE() {
			return t`Order Value`;
		},
		get SUMMARY_MARGIN_REQ() {
			return t`Margin Req.`;
		},
		get SUMMARY_SLIPPAGE() {
			return t`Slippage`;
		},
		get SUMMARY_FEE() {
			return t`Est. Fee`;
		},
		get APPROVAL_ERROR_FALLBACK() {
			return t`Failed to enable trading`;
		},
		get ORDER_ERROR_FALLBACK() {
			return t`Order failed`;
		},
	},
};
