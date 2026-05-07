import { t } from "@lingui/core/macro";
import { MIN_WITHDRAW_USD } from "@/config/contracts";
import { toNumber } from "./numbers";

export interface WithdrawValidation {
	valid: boolean;
	error: string | null;
}

export function validateWithdraw(amount: string, withdrawableNum: number): WithdrawValidation {
	if (!amount || amount === "0") return { valid: false, error: null };
	const amountNum = toNumber(amount);
	if (amountNum === null || amountNum <= 0) return { valid: false, error: t`Invalid amount` };
	if (amountNum < MIN_WITHDRAW_USD) return { valid: false, error: t`Minimum withdrawal is $${MIN_WITHDRAW_USD}` };
	if (amountNum > withdrawableNum) return { valid: false, error: t`Insufficient balance` };
	return { valid: true, error: null };
}
