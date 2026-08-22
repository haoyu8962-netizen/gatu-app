import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { formatToken } from "@/lib/format";
import type { AccountLedgerRow } from "./account-ledger";

const LEDGER_FORMAT_OPTIONS = {
	compact: false,
	maximumFractionDigits: 8,
	minimumFractionDigits: 0,
} as const;

export function formatAccountLedgerAmount(row: AccountLedgerRow): string {
	if (row.amount === null) return FALLBACK_VALUE_PLACEHOLDER;
	return formatToken(row.amount, {
		...LEDGER_FORMAT_OPTIONS,
		signDisplay: "exceptZero",
		symbol: row.token || undefined,
	});
}

export function formatAccountLedgerFee(row: AccountLedgerRow): string {
	if (!row.fee) return FALLBACK_VALUE_PLACEHOLDER;
	return formatToken(row.fee.amount, {
		...LEDGER_FORMAT_OPTIONS,
		symbol: row.fee.token,
	});
}
