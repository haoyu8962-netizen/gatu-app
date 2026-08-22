import Big from "big.js";

export const FUNDS_BALANCE_MAX_AGE_MS = 60_000;

export function assertFreshFundsAmount(
	amount: unknown,
	available: unknown,
	receivedAt: number | undefined,
	now = Date.now(),
): void {
	const age = receivedAt === undefined ? Number.POSITIVE_INFINITY : now - receivedAt;
	if (age < 0 || age > FUNDS_BALANCE_MAX_AGE_MS) {
		throw new Error("Balance data is unavailable");
	}
	try {
		const normalizedAmount = new Big(String(amount));
		const normalizedAvailable = new Big(String(available));
		if (normalizedAmount.lte(0) || normalizedAvailable.lt(normalizedAmount)) {
			throw new Error("Balance changed before submission");
		}
	} catch (error) {
		if (error instanceof Error && error.message === "Balance changed before submission") throw error;
		throw new Error("Balance data is unavailable");
	}
}
