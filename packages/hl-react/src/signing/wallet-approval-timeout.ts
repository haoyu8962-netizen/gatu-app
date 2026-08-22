const WALLET_APPROVAL_TIMEOUT_MS = 60_000;

export function withWalletApprovalTimeout<T>(promise: Promise<T>): Promise<T> {
	if (typeof document === "undefined") {
		return withWallClockTimeout(promise);
	}

	return new Promise<T>((resolve, reject) => {
		let remainingMs = WALLET_APPROVAL_TIMEOUT_MS;
		let startedAt: number | undefined;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		let settled = false;

		const clearTimer = () => {
			if (timeoutId !== undefined) clearTimeout(timeoutId);
			timeoutId = undefined;
		};

		const cleanup = () => {
			clearTimer();
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("pagehide", pauseTimer);
			window.removeEventListener("pageshow", resumeTimer);
		};

		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			cleanup();
			callback();
		};

		function pauseTimer() {
			if (startedAt === undefined) return;
			remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
			startedAt = undefined;
			clearTimer();
		}

		function resumeTimer() {
			if (settled || document.hidden || startedAt !== undefined) return;
			if (remainingMs <= 0) {
				finish(() => reject(createTimeoutError()));
				return;
			}
			startedAt = Date.now();
			timeoutId = setTimeout(() => {
				finish(() => reject(createTimeoutError()));
			}, remainingMs);
		}

		function handleVisibilityChange() {
			if (document.hidden) pauseTimer();
			else resumeTimer();
		}

		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("pagehide", pauseTimer);
		window.addEventListener("pageshow", resumeTimer);
		resumeTimer();

		promise.then(
			(value) => finish(() => resolve(value)),
			(error: unknown) => finish(() => reject(error)),
		);
	});
}

function withWallClockTimeout<T>(promise: Promise<T>): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(createTimeoutError());
		}, WALLET_APPROVAL_TIMEOUT_MS);
	});

	return Promise.race([promise, timeout]).finally(() => {
		if (timeoutId) clearTimeout(timeoutId);
	});
}

function createTimeoutError(): Error {
	return new Error("Wallet approval timed out. Check your wallet and try again.");
}
