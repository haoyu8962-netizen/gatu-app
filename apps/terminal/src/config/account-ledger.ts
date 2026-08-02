import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { AccountLedgerAction, AccountLedgerLocation } from "@/lib/trade/account-ledger";

export const PORTFOLIO_TRANSFERS_TAB = {
	label: msg`Deposits & Withdrawals`,
	value: "transfers",
} as const;

export const ACCOUNT_LEDGER_ACTION_MESSAGES: Record<AccountLedgerAction, MessageDescriptor> = {
	activateDex: msg`Activate DEX`,
	borrow: msg`Borrow`,
	deployGasAuction: msg`Deploy Gas Auction`,
	deposit: msg`Deposit`,
	genesisDistribution: msg`Genesis Distribution`,
	liquidation: msg`Liquidated`,
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
	withdrawal: msg`Withdrawal`,
};

export const ACCOUNT_LEDGER_LOCATION_MESSAGES: Record<
	Exclude<AccountLedgerLocation["kind"], "arbitrum" | "perpDex">,
	MessageDescriptor
> = {
	earn: msg`Earn`,
	perps: msg`Perps`,
	spot: msg`Spot`,
	staking: msg`Staking`,
};
