// @vitest-environment jsdom

import {
	FundsActionLockTimeoutError,
	FundsActionLockUnavailableError,
	getFundsActionLockName,
	requiresFundsActionLock,
	runWithFundsActionLock,
} from "@sairn/hl-react/internal/exchange/funds-action-lock";
import { getAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCctpDepositTrackingRecords, saveCctpDepositTrackingRecord } from "@/lib/trade/cctp-deposit-tracking";

const OWNER = "0x1234567890abcdef1234567890abcdef12345678";
const OTHER_OWNER = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

interface PendingLockRequest<T = unknown> {
	name: string;
	signal?: AbortSignal;
	callback: (lock: Lock | null) => T | PromiseLike<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: unknown) => void;
	onAbort?: () => void;
}

function installExclusiveLockManager() {
	const active = new Set<string>();
	const pending: PendingLockRequest[] = [];

	function drain(name: string) {
		if (active.has(name)) return;
		const index = pending.findIndex((entry) => entry.name === name);
		if (index < 0) return;
		const [entry] = pending.splice(index, 1);
		if (!entry) return;
		if (entry.onAbort) entry.signal?.removeEventListener("abort", entry.onAbort);
		if (entry.signal?.aborted) {
			entry.reject(entry.signal.reason);
			drain(name);
			return;
		}

		active.add(name);
		void Promise.resolve(entry.callback({ name, mode: "exclusive" } as Lock))
			.then(entry.resolve, entry.reject)
			.finally(() => {
				active.delete(name);
				drain(name);
			});
	}

	const manager = {
		request<T>(
			name: string,
			optionsOrCallback: LockOptions | ((lock: Lock | null) => T | PromiseLike<T>),
			maybeCallback?: (lock: Lock | null) => T | PromiseLike<T>,
		): Promise<T> {
			const options = typeof optionsOrCallback === "function" ? undefined : optionsOrCallback;
			const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
			if (!callback) return Promise.reject(new Error("Missing lock callback"));
			if (options?.signal?.aborted) return Promise.reject(options.signal.reason);

			return new Promise<T>((resolve, reject) => {
				const entry: PendingLockRequest<T> = {
					name,
					signal: options?.signal,
					callback,
					resolve,
					reject,
				};
				entry.onAbort = () => {
					const index = pending.indexOf(entry as PendingLockRequest);
					if (index < 0) return;
					pending.splice(index, 1);
					reject(entry.signal?.reason);
				};
				entry.signal?.addEventListener("abort", entry.onAbort, { once: true });
				pending.push(entry as PendingLockRequest);
				drain(name);
			});
		},
	} as unknown as LockManager;

	Object.defineProperty(window.navigator, "locks", {
		configurable: true,
		value: manager,
	});
}

async function waitUntil(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	throw new Error("Condition was not reached");
}

describe("cross-tab funds action lock", () => {
	beforeEach(() => {
		window.localStorage.clear();
		installExclusiveLockManager();
	});

	afterEach(() => {
		window.localStorage.clear();
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: undefined,
		});
	});

	it("locks account-scoped financial configuration and funds methods", () => {
		for (const method of [
			"agentEnableDexAbstraction",
			"agentSendAsset",
			"agentSetAbstraction",
			"borrowLend",
			"cDeposit",
			"cWithdraw",
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
			"tokenDelegate",
			"vaultTransfer",
			"withdraw3",
		] as const) {
			expect(requiresFundsActionLock(method)).toBe(true);
		}

		for (const method of ["order", "cancel", "batchModify", "twapOrder", "twapCancel", "linkStakingUser"] as const) {
			expect(requiresFundsActionLock(method)).toBe(false);
		}
	});

	it("scopes lock names by environment and normalized owner", () => {
		expect(getFundsActionLockName("Mainnet", getAddress(OWNER))).toBe(`hyperliquid_funds_action:Mainnet:${OWNER}`);
		expect(getFundsActionLockName("Testnet", OWNER)).toBe(`hyperliquid_funds_action:Testnet:${OWNER}`);
		expect(() => getFundsActionLockName("Mainnet", "0x0000000000000000000000000000000000000000")).toThrow(
			FundsActionLockUnavailableError,
		);
	});

	it("serializes the same environment and owner until the first SDK result settles", async () => {
		const events: string[] = [];
		let releaseFirst = () => {};
		const firstBlocked = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});

		const first = runWithFundsActionLock("Mainnet", OWNER, async () => {
			events.push("first:start");
			await firstBlocked;
			events.push("first:end");
			return 1;
		});
		await waitUntil(() => events.length === 1);
		const second = runWithFundsActionLock("Mainnet", OWNER, async () => {
			events.push("second:start");
			return 2;
		});

		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(events).toEqual(["first:start"]);
		releaseFirst();
		await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
		expect(events).toEqual(["first:start", "first:end", "second:start"]);
	});

	it("does not block a different owner or environment", async () => {
		let releaseFirst = () => {};
		const firstBlocked = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const entered: string[] = [];

		const first = runWithFundsActionLock("Mainnet", OWNER, async () => {
			entered.push("main-owner");
			await firstBlocked;
		});
		await waitUntil(() => entered.length === 1);
		const otherOwner = runWithFundsActionLock("Mainnet", OTHER_OWNER, async () => {
			entered.push("other-owner");
		});
		const testnet = runWithFundsActionLock("Testnet", OWNER, async () => {
			entered.push("testnet");
		});

		await expect(Promise.all([otherOwner, testnet])).resolves.toEqual([undefined, undefined]);
		expect(entered).toEqual(["main-owner", "other-owner", "testnet"]);
		releaseFirst();
		await first;
	});

	it("fails closed after a bounded wait without running a queued callback", async () => {
		let releaseFirst = () => {};
		const firstBlocked = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		let queuedActionRan = false;
		const first = runWithFundsActionLock("Mainnet", OWNER, async () => firstBlocked);

		await expect(
			runWithFundsActionLock(
				"Mainnet",
				OWNER,
				async () => {
					queuedActionRan = true;
				},
				15,
			),
		).rejects.toBeInstanceOf(FundsActionLockTimeoutError);
		expect(queuedActionRan).toBe(false);
		releaseFirst();
		await first;
	});

	it("lets only the lock-holding CCTP context broadcast when a peer tab times out", async () => {
		let releaseFirst = () => {};
		const firstBroadcastPending = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const broadcasts: string[] = [];
		const firstContext = runWithFundsActionLock("Mainnet", OWNER, async () => {
			broadcasts.push("first-tab");
			await firstBroadcastPending;
		});
		await waitUntil(() => broadcasts.length === 1);

		await expect(
			runWithFundsActionLock(
				"Mainnet",
				OWNER,
				async () => {
					broadcasts.push("second-tab");
				},
				15,
			),
		).rejects.toBeInstanceOf(FundsActionLockTimeoutError);
		expect(broadcasts).toEqual(["first-tab"]);

		releaseFirst();
		await firstContext;
	});

	it("makes a queued CCTP context observe the first source hash before it can sign or broadcast", async () => {
		const sourceHash = `0x${"a".repeat(64)}`;
		let releaseFirst = () => {};
		const firstWaiting = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const signatures = { first: 0, second: 0 };
		const broadcasts = { first: 0, second: 0 };

		const firstContext = runWithFundsActionLock("Mainnet", OWNER, async () => {
			signatures.first += 1;
			await firstWaiting;
			broadcasts.first += 1;
			saveCctpDepositTrackingRecord({
				env: "Mainnet",
				owner: OWNER,
				sourceHash,
				amount: "5",
			});
		});
		await waitUntil(() => signatures.first === 1);
		const secondContext = runWithFundsActionLock("Mainnet", OWNER, async () => {
			if (readCctpDepositTrackingRecords("Mainnet", OWNER).length > 0) return "blocked";
			signatures.second += 1;
			broadcasts.second += 1;
			return "broadcast";
		});

		releaseFirst();
		await expect(firstContext).resolves.toBeUndefined();
		await expect(secondContext).resolves.toBe("blocked");
		expect(signatures).toEqual({ first: 1, second: 0 });
		expect(broadcasts).toEqual({ first: 1, second: 0 });
	});

	it("does not apply the acquisition timeout after the callback starts", async () => {
		await expect(
			runWithFundsActionLock(
				"Mainnet",
				OWNER,
				async () => {
					await new Promise((resolve) => setTimeout(resolve, 20));
					return "confirmed";
				},
				5,
			),
		).resolves.toBe("confirmed");
	});

	it("releases the lock after an exception", async () => {
		await expect(
			runWithFundsActionLock("Mainnet", OWNER, async () => {
				throw new Error("wallet rejected");
			}),
		).rejects.toThrow("wallet rejected");
		await expect(runWithFundsActionLock("Mainnet", OWNER, async () => "released")).resolves.toBe("released");
	});

	it("fails closed when Web Locks are unavailable", async () => {
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: undefined,
		});

		await expect(runWithFundsActionLock("Mainnet", OWNER, async () => "unsafe")).rejects.toBeInstanceOf(
			FundsActionLockUnavailableError,
		);
	});
});
