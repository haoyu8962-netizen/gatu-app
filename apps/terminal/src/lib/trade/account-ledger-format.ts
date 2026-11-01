import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import type { NumberFormatters } from "@/lib/format";
import type { AccountLedgerRow } from "./account-ledger";

const LEDGER_FORMAT_OPTIONS = {
	compact: false,
	maximumFractionDigits: 8,
	minimumFractionDigits: 0,
} as const;

/** Protocol token name to the name shown for it (`useMarkets().getTokenDisplayName`). */
type TokenDisplayName = (token: string) => string;

export function formatAccountLedgerAmount(
	row: AccountLedgerRow,
	numberFormat: NumberFormatters,
	getTokenDisplayName: TokenDisplayName,
): string {
	if (row.amount === null) return FALLBACK_VALUE_PLACEHOLDER;
	return numberFormat.formatToken(row.amount, {
		...LEDGER_FORMAT_OPTIONS,
		signDisplay: "exceptZero",
		symbol: row.token ? getTokenDisplayName(row.token) : undefined,
	});
}

export function formatAccountLedgerFee(
	row: AccountLedgerRow,
	numberFormat: NumberFormatters,
	getTokenDisplayName: TokenDisplayName,
): string {
	if (!row.fee) return FALLBACK_VALUE_PLACEHOLDER;
	return numberFormat.formatToken(row.fee.amount, {
		...LEDGER_FORMAT_OPTIONS,
		symbol: getTokenDisplayName(row.fee.token),
	});
}
