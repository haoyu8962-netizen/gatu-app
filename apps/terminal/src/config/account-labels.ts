import { msg } from "@lingui/core/macro";
import { ACCOUNT_LEDGER_ACTION_MESSAGES } from "./account-ledger";
import { TRADE_PANEL_LABELS } from "./trade-panel-labels";

export const ACCOUNT_LABELS = {
	deposit: { ...ACCOUNT_LEDGER_ACTION_MESSAGES.deposit, message: "Deposit" },
	withdraw: { ...msg`Withdraw`, message: "Withdraw" },
	account: TRADE_PANEL_LABELS.account,
	summary: { ...msg`Account Summary`, message: "Account Summary" },
	marginRatio: { ...msg`Account Margin Ratio`, message: "Account Margin Ratio" },
	portfolioValue: { ...msg`Portfolio Value`, message: "Portfolio Value" },
	unrealizedPnl: { ...msg`Unrealized PNL`, message: "Unrealized PNL" },
	maintenanceMargin: { ...msg`Cross Maintenance Margin`, message: "Cross Maintenance Margin" },
	accountLeverage: { ...msg`Cross Account Leverage`, message: "Cross Account Leverage" },
};
