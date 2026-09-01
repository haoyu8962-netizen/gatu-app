import Big from "big.js";

export const FUNDS_BALANCE_MAX_AGE_MS = 60_000;

export type FundsExecutionErrorReason = "balance-changed" | "balance-unavailable";

export class FundsExecutionError extends Error {
	constructor(readonly reason: FundsExecutionErrorReason) {
		super(reason === "balance-changed" ? "Balance changed before submission" : "Balance data is unavailable");
		this.name = "FundsExecutionError";
	}
}

export function assertFreshFundsAmount(
	amount: unknown,
	available: unknown,
	receivedAt: number | undefined,
	now = Date.now(),
): void {
	const age = receivedAt === undefined ? Number.POSITIVE_INFINITY : now - receivedAt;
	if (age < 0 || age > FUNDS_BALANCE_MAX_AGE_MS) {
		throw new FundsExecutionError("balance-unavailable");
	}
	try {
		const normalizedAmount = new Big(String(amount));
		const normalizedAvailable = new Big(String(available));
		if (normalizedAmount.lte(0) || normalizedAvailable.lt(normalizedAmount)) {
			throw new FundsExecutionError("balance-changed");
		}
	} catch (error) {
		if (error instanceof FundsExecutionError) throw error;
		throw new FundsExecutionError("balance-unavailable");
	}
}
