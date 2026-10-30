import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { AccountLedgerAction, AccountLedgerLocation } from "@/lib/trade/account-ledger";

export const PORTFOLIO_TRANSFERS_TAB = {
	label: msg`Deposits & Withdrawals`,
	value: "transfers",
} as const;

export const ACCOUNT_LEDGER_ACTION_MESSAGES: Record<AccountLedgerAction, MessageDescriptor> = {
	activateDex: msg`Activate DEX`,
	accountActivationFee: msg`Account Activation Fee`,
	borrow: msg`Borrow`,
	deployGasAuction: msg`Deploy Gas Auction`,
	deposit: msg`Deposit`,
	gasAuctionFee: msg`Priority Gas Auction Fee`,
	genesisDistribution: msg`Genesis Distribution`,
	hip3LiquidatorDeposit: msg`HIP-3 Liquidator Deposit`,
	hip3LiquidatorWithdrawal: msg`HIP-3 Liquidator Withdrawal`,
	liquidation: msg`Liquidated`,
	other: msg`Other Ledger Update`,
	repay: msg`Repay`,
	rewardsClaim: msg`Rewards Claim`,
	send: msg`Send`,
	stake: msg`Stake`,
	subAccountTransfer: msg`Sub-account Transfer`,
	supply: msg`Supply`,
	transfer: msg`Transfer`,
	unstake: msg`Unstake`,
	vaultCommission: msg`Vault Commission`,
	vaultCreate: msg`Create Vault`,
	vaultDeposit: msg`Vault Deposit`,
	vaultDistribution: msg`Vault Distribution`,
	vaultWithdrawal: msg`Vault Withdrawal`,
	welcomeBonus: msg`Welcome Bonus`,
	withdrawal: msg`Withdrawal`,
};

export const ACCOUNT_LEDGER_LOCATION_MESSAGES: Record<
	Exclude<AccountLedgerLocation["kind"], "arbitrum" | "hyperevm" | "perpDex">,
	MessageDescriptor
> = {
	earn: msg`Earn`,
	perps: msg`Perps`,
	spot: msg`Spot`,
	staking: msg`Staking`,
};
