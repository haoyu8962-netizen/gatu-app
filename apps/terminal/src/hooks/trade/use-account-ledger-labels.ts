import { useLingui } from "@lingui/react";
import { ACCOUNT_LEDGER_ACTION_MESSAGES, ACCOUNT_LEDGER_LOCATION_MESSAGES } from "@/config/account-ledger";
import type { AccountLedgerAction, AccountLedgerLocation } from "@/lib/trade/account-ledger";

interface AccountLedgerLabels {
	getActionLabel: (action: AccountLedgerAction) => string;
	getLocationLabel: (location: AccountLedgerLocation) => string;
}

export function useAccountLedgerLabels(): AccountLedgerLabels {
	const { _ } = useLingui();

	return {
		getActionLabel: (action) => _(ACCOUNT_LEDGER_ACTION_MESSAGES[action]),
		getLocationLabel: (location) => {
			if (location.kind === "arbitrum") return "Arbitrum";
			if (location.kind === "perpDex") {
				return location.dex
					? `${_(ACCOUNT_LEDGER_LOCATION_MESSAGES.perps)} (${location.dex})`
					: _(ACCOUNT_LEDGER_LOCATION_MESSAGES.perps);
			}
			return _(ACCOUNT_LEDGER_LOCATION_MESSAGES[location.kind]);
		},
	};
}
