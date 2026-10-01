/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	clearOrderAssetReservations,
	getOrderAssetLockName,
	getOrderAssetReservationState,
	releaseOrderAssetReservations,
	reserveOrderAssets,
	runWithAvailableOrderAssetLocks,
	runWithOrderAssetLocks,
} from "@/lib/trade/order-asset-lock";

const IDENTITY = {
	env: "Mainnet" as const,
	owner: "0x1111111111111111111111111111111111111111",
	assetIds: [42],
};

function installExclusiveLockManager(): void {
	const queues = new Map<string, Promise<void>>();
	const busyCounts = new Map<string, number>();
	const manager = {
		async request<T>(
			name: string,
			options: LockOptions,
			callback: (lock: Lock | null) => T | PromiseLike<T>,
		): Promise<T> {
			if (options.ifAvailable) {
				if ((busyCounts.get(name) ?? 0) > 0) return callback(null);
				busyCounts.set(name, 1);
				try {
					return await callback({ name, mode: "exclusive" } as Lock);
				} finally {
					busyCounts.delete(name);
				}
			}

			const previous = queues.get(name) ?? Promise.resolve();
			let release = () => {};
			const current = new Promise<void>((resolve) => {
				release = resolve;
			});
			busyCounts.set(name, (busyCounts.get(name) ?? 0) + 1);
			queues.set(
				name,
				previous.then(() => current),
			);
			await previous;
			try {
				return await callback({ name, mode: "exclusive" } as Lock);
			} finally {
				release();
				const remaining = (busyCounts.get(name) ?? 1) - 1;
				if (remaining === 0) busyCounts.delete(name);
				else busyCounts.set(name, remaining);
			}
		},
	} as unknown as LockManager;

	Object.defineProperty(window.navigator, "locks", { configurable: true, value: manager });
}

describe("cross-tab order asset locks", () => {
	beforeEach(() => {
		window.localStorage.clear();
		installExclusiveLockManager();
	});

	afterEach(() => {
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
	});

	it("serializes the preflight and submission boundary for the same account asset", async () => {
		const events: string[] = [];
		let releaseFirst = () => {};
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});

		const first = runWithOrderAssetLocks(IDENTITY, async () => {
			events.push("first-start");
			await firstGate;
			events.push("first-end");
		});
		const second = runWithOrderAssetLocks(IDENTITY, async () => {
			events.push("second-start");
		});

		await Promise.resolve();
		expect(events).toEqual(["first-start"]);
		releaseFirst();
		await Promise.all([first, second]);
		expect(events).toEqual(["first-start", "first-end", "second-start"]);
	});

	it("rejects an admission request immediately while another tab holds the asset lock", async () => {
		let releaseFirst = () => {};
		let markEntered = () => {};
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const entered = new Promise<void>((resolve) => {
			markEntered = resolve;
		});
		const first = runWithAvailableOrderAssetLocks(IDENTITY, async () => {
			markEntered();
			await firstGate;
			return "first";
		});
		await entered;

		let secondRan = false;
		const second = await runWithAvailableOrderAssetLocks(IDENTITY, async () => {
			secondRan = true;
			return "second";
		});

		expect(second).toEqual({ supported: true, acquired: false });
		expect(secondRan).toBe(false);
		releaseFirst();
		expect(await first).toEqual({ supported: true, acquired: true, value: "first" });
	});

	it("persists ambiguous reservations across lock holders while preserving reduce-only semantics", async () => {
		const first = await runWithOrderAssetLocks(IDENTITY, async (lease) =>
			reserveOrderAssets(lease, {
				submissionId: "submission-1",
				intentKey: "entry-1",
				exclusiveAssetLock: false,
				isRiskReducing: false,
				createdAt: Date.now(),
			}),
		);
		expect(first).toEqual({ supported: true, value: true });

		await runWithOrderAssetLocks(IDENTITY, async (lease) => {
			expect(
				getOrderAssetReservationState(lease, {
					intentKey: "reduce-only-2",
					exclusiveAssetLock: false,
					isRiskReducing: true,
				}),
			).toBe("clear");
			expect(
				getOrderAssetReservationState(lease, {
					intentKey: "entry-2",
					exclusiveAssetLock: false,
					isRiskReducing: false,
				}),
			).toBe("conflict");
			expect(
				getOrderAssetReservationState(lease, {
					intentKey: "market-close",
					exclusiveAssetLock: true,
					isRiskReducing: true,
				}),
			).toBe("conflict");
			clearOrderAssetReservations(lease, "submission-1");
		});
	});

	it("releases a reconciled reservation under the same asset lock", async () => {
		await runWithOrderAssetLocks(IDENTITY, async (lease) => {
			expect(
				reserveOrderAssets(lease, {
					submissionId: "submission-2",
					intentKey: "close-2",
					exclusiveAssetLock: true,
					isRiskReducing: true,
					createdAt: Date.now(),
				}),
			).toBe(true);
		});
		expect(await releaseOrderAssetReservations(IDENTITY, "submission-2")).toBe(true);

		await runWithOrderAssetLocks(IDENTITY, async (lease) => {
			expect(
				getOrderAssetReservationState(lease, {
					intentKey: "entry-after-release",
					exclusiveAssetLock: false,
					isRiskReducing: false,
				}),
			).toBe("clear");
		});
	});

	it("fails closed without Web Locks and scopes names by network, owner, and asset", async () => {
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
		let ran = false;
		const result = await runWithOrderAssetLocks(IDENTITY, async () => {
			ran = true;
		});

		expect(result).toEqual({ supported: false });
		expect(await runWithAvailableOrderAssetLocks(IDENTITY, async () => undefined)).toEqual({ supported: false });
		expect(ran).toBe(false);
		expect(getOrderAssetLockName(IDENTITY, 42)).toBe(
			"sairn-order-asset-v1:mainnet:0x1111111111111111111111111111111111111111:42",
		);
	});
});
