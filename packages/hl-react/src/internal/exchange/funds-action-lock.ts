import { isAddress, zeroAddress } from "viem";
import type { HyperliquidEnv } from "../../signing/types";
import type { ExchangeMethod } from "../../types/clients";

const FUNDS_ACTION_LOCK_PREFIX = "hyperliquid_funds_action";
export const FUNDS_ACTION_LOCK_WAIT_TIMEOUT_MS = 10_000;

const FUNDS_ACTION_METHODS: ReadonlySet<ExchangeMethod> = new Set([
	"agentEnableDexAbstraction",
	"agentSendAsset",
	"agentSetAbstraction",
	"claimRewards",
	"registerReferrer",
	"sendAsset",
	"sendToEvmWithData",
	"setReferrer",
	"spotSend",
	"usdClassTransfer",
	"usdSend",
	"userDexAbstraction",
	"userSetAbstraction",
	"userPortfolioMargin",
	"withdraw3",
]);

export class FundsActionLockUnavailableError extends Error {
	constructor() {
		super("Secure cross-tab funds coordination requires Web Locks support.");
		this.name = "FundsActionLockUnavailableError";
	}
}

export class FundsActionLockTimeoutError extends Error {
	constructor() {
		super("Another funds operation is still in progress for this account. Try again after it finishes.");
		this.name = "FundsActionLockTimeoutError";
	}
}

export function requiresFundsActionLock(method: ExchangeMethod): boolean {
	return FUNDS_ACTION_METHODS.has(method);
}

export function getFundsActionLockName(env: HyperliquidEnv, owner: string): string {
	if (!isAddress(owner) || owner.toLowerCase() === zeroAddress) {
		throw new FundsActionLockUnavailableError();
	}
	return `${FUNDS_ACTION_LOCK_PREFIX}:${env}:${owner.toLowerCase()}`;
}

/**
 * Serializes account-scoped financial configuration and funds actions across tabs.
 *
 * The timeout applies only while waiting to acquire the lock. Once acquired,
 * the lock remains held until the SDK promise settles, so the acquisition
 * timeout can never cut short an already-started signing or network request.
 */
export async function runWithFundsActionLock<T>(
	env: HyperliquidEnv,
	owner: string,
	action: () => Promise<T>,
	waitTimeoutMs = FUNDS_ACTION_LOCK_WAIT_TIMEOUT_MS,
): Promise<T> {
	if (typeof navigator === "undefined" || !navigator.locks || typeof navigator.locks.request !== "function") {
		throw new FundsActionLockUnavailableError();
	}
	if (!Number.isFinite(waitTimeoutMs) || waitTimeoutMs <= 0) {
		throw new FundsActionLockUnavailableError();
	}

	const lockName = getFundsActionLockName(env, owner);
	const controller = new AbortController();
	const timeoutError = new FundsActionLockTimeoutError();
	let acquired = false;
	let timeout: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
		if (!acquired) controller.abort(timeoutError);
	}, waitTimeoutMs);

	try {
		return await navigator.locks.request(lockName, { mode: "exclusive", signal: controller.signal }, async (lock) => {
			if (!lock) throw new FundsActionLockUnavailableError();
			acquired = true;
			if (timeout !== undefined) {
				clearTimeout(timeout);
				timeout = undefined;
			}
			return action();
		});
	} catch (error) {
		if (!acquired) {
			if (controller.signal.aborted) throw timeoutError;
			if (error instanceof FundsActionLockUnavailableError) throw error;
			throw new FundsActionLockUnavailableError();
		}
		throw error;
	} finally {
		if (timeout !== undefined) clearTimeout(timeout);
	}
}
