const WALLET_APPROVAL_TIMEOUT_MS = 60_000;

export function withWalletApprovalTimeout<T>(promise: Promise<T>): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new Error("Wallet approval timed out. Check your wallet and try again."));
		}, WALLET_APPROVAL_TIMEOUT_MS);
	});

	return Promise.race([promise, timeout]).finally(() => {
		if (timeoutId) clearTimeout(timeoutId);
	});
}
