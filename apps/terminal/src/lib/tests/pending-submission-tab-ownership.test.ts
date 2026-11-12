// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPendingOrderStore } from "@/stores/use-pending-order-store";
import { createPendingTwapStore } from "@/stores/use-pending-twap-store";

const USER_X = "0x1111111111111111111111111111111111111111" as const;
const USER_Y = "0x2222222222222222222222222222222222222222" as const;

class MemoryStorage implements Storage {
	private readonly items = new Map<string, string>();

	get length(): number {
		return this.items.size;
	}

	clear(): void {
		this.items.clear();
	}

	getItem(key: string): string | null {
		return this.items.get(key) ?? null;
	}

	key(index: number): string | null {
		return Array.from(this.items.keys())[index] ?? null;
	}

	removeItem(key: string): void {
		this.items.delete(key);
	}

	setItem(key: string, value: string): void {
		this.items.set(key, value);
	}
}

interface Waiter {
	mode: LockMode;
	grant: () => void;
}

/**
 * Web Locks as the specification describes them for one document: exclusive and shared modes, a FIFO
 * queue per name, `signal` aborting a queued request with an `AbortError`, and a request that can be
 * made to reject. Store instances that share it model tabs of one browser.
 */
function installLockManager() {
	const holders = new Map<string, Map<symbol, LockMode>>();
	const queues = new Map<string, Waiter[]>();
	const closers = new Map<string, Array<() => void>>();
	const requests = new Map<string, number>();
	const grants = new Map<string, number>();
	let rejectRequests = false;

	function canGrant(name: string, mode: LockMode): boolean {
		const held = [...(holders.get(name)?.values() ?? [])];
		return held.length === 0 || (mode === "shared" && held.every((heldMode) => heldMode === "shared"));
	}

	function grantWaiting(name: string): void {
		const queue = queues.get(name) ?? [];
		while (queue.length > 0) {
			const next = queue[0];
			if (!next || !canGrant(name, next.mode)) break;
			queue.shift();
			next.grant();
		}
	}

	const manager = {
		request(name: string, options: LockOptions, callback: (lock: Lock | null) => unknown) {
			if (rejectRequests) return Promise.reject(new DOMException("Lock request failed", "InvalidStateError"));
			const mode = options.mode ?? "exclusive";
			requests.set(name, (requests.get(name) ?? 0) + 1);
			return new Promise((resolve, reject) => {
				const token = Symbol(name);
				let finished = false;
				const finish = () => {
					if (finished) return;
					finished = true;
					holders.get(name)?.delete(token);
					grantWaiting(name);
				};
				const waiter: Waiter = {
					mode,
					grant: () => {
						grants.set(name, (grants.get(name) ?? 0) + 1);
						const held = holders.get(name) ?? new Map<symbol, LockMode>();
						held.set(token, mode);
						holders.set(name, held);
						closers.set(name, [...(closers.get(name) ?? []), finish]);
						Promise.resolve()
							.then(() => callback({ name, mode } as Lock))
							.then(resolve, reject)
							.finally(finish);
					},
				};
				options.signal?.addEventListener("abort", () => {
					const queue = queues.get(name) ?? [];
					const index = queue.indexOf(waiter);
					if (index < 0) return;
					queue.splice(index, 1);
					reject(new DOMException("Aborted", "AbortError"));
				});
				const queue = queues.get(name) ?? [];
				queues.set(name, queue);
				if (queue.length === 0 && canGrant(name, mode)) waiter.grant();
				else queue.push(waiter);
			});
		},
	} as unknown as LockManager;
	Object.defineProperty(window.navigator, "locks", { configurable: true, value: manager });
	return {
		holderCount: (name: string) => holders.get(name)?.size ?? 0,
		requestCount: (name: string) => requests.get(name) ?? 0,
		grantCount: (name: string) => grants.get(name) ?? 0,
		closeFirstHolder: (name: string) => closers.get(name)?.shift()?.(),
		rejectRequests: () => {
			rejectRequests = true;
		},
	};
}

async function settle(): Promise<void> {
	for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

const kinds = [
	{
		name: "order",
		lockPrefix: "sairn-pending-order-owner-v1:",
		createTab: (storage: Storage) => {
			const store = createPendingOrderStore(storage);
			return {
				store,
				actions: () => store.getState().actions,
				add: () =>
					store.getState().actions.add({
						env: "Mainnet",
						user: USER_X,
						intentKey: "tab-order",
						children: [{ assetId: 31, cloid: "0x00000000000000000000000000000031" }],
					}),
			};
		},
	},
	{
		name: "TWAP",
		lockPrefix: "sairn-pending-twap-owner-v1:",
		createTab: (storage: Storage) => {
			const store = createPendingTwapStore(storage);
			return {
				store,
				actions: () => store.getState().actions,
				add: () =>
					store.getState().actions.add({
						env: "Mainnet",
						user: USER_X,
						intent: {
							assetId: 7,
							coin: "xyz:GOLD",
							side: "B",
							size: "1.25",
							minutes: 30,
							reduceOnly: false,
							randomize: true,
							stopPx: null,
							trigger: null,
						},
						activeBaseline: { ready: true, knownIds: [] },
						historyBaseline: { ready: true, knownIds: [] },
					}),
			};
		},
	},
];

describe.each(kinds)("pending $name submission ownership between tabs", ({ lockPrefix, createTab }) => {
	afterEach(() => {
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
	});

	function openTab(storage: Storage, user: string | null) {
		const tab = createTab(storage);
		tab.actions().serve(user ? { env: "Mainnet", user } : null);
		return tab;
	}

	function isBlocked(tab: ReturnType<typeof createTab>, id: string): boolean {
		return tab.store.getState().activeSubmissionIds.has(id);
	}

	describe("with Web Locks", () => {
		let locks: ReturnType<typeof installLockManager>;

		beforeEach(() => {
			locks = installLockManager();
		});

		it("keeps a submission with the tab that sent it while that tab holds it", async () => {
			const storage = new MemoryStorage();
			const sender = openTab(storage, USER_X);
			const submission = sender.add();
			sender.actions().markActive(submission.id);
			const other = openTab(storage, USER_X);
			await settle();

			expect(locks.holderCount(`${lockPrefix}${submission.id}`)).toBe(1);
			expect(other.store.getState().submissions.map((entry) => entry.id)).toEqual([submission.id]);
			expect(isBlocked(other, submission.id)).toBe(true);
			expect(isBlocked(sender, submission.id)).toBe(true);

			sender.actions().clearActive(submission.id);
			await settle();
			expect(isBlocked(sender, submission.id)).toBe(false);
			expect(isBlocked(other, submission.id)).toBe(true);
		});

		it("keeps a submission that is still being sent even after its tab switches accounts", async () => {
			const storage = new MemoryStorage();
			const sender = openTab(storage, USER_X);
			const submission = sender.add();
			sender.actions().markActive(submission.id);
			const other = openTab(storage, USER_X);
			await settle();

			sender.actions().serve({ env: "Mainnet", user: USER_Y });
			await settle();
			expect(isBlocked(other, submission.id)).toBe(true);

			sender.actions().clearActive(submission.id);
			await settle();
			expect(isBlocked(sender, submission.id)).toBe(true);
			expect(isBlocked(other, submission.id)).toBe(false);
		});

		it("does not take over a submission the sending tab settled, even before the other tab hears of it", async () => {
			const storage = new MemoryStorage();
			const sender = openTab(storage, USER_X);
			const submission = sender.add();
			const other = openTab(storage, USER_X);
			await settle();

			sender.actions().remove(submission.id);
			await settle();

			expect(isBlocked(other, submission.id)).toBe(true);
			expect(locks.holderCount(`${lockPrefix}${submission.id}`)).toBe(0);
		});

		it("hands the submission of a closed tab to a tab of the same account, not to an earlier tab of another", async () => {
			const storage = new MemoryStorage();
			const sender = openTab(storage, USER_X);
			const submission = sender.add();
			const otherAccount = openTab(storage, USER_Y);
			const disconnected = openTab(storage, null);
			const sameAccount = openTab(storage, USER_X);
			await settle();

			locks.closeFirstHolder(`${lockPrefix}${submission.id}`);
			await settle();

			expect(isBlocked(otherAccount, submission.id)).toBe(true);
			expect(isBlocked(disconnected, submission.id)).toBe(true);
			expect(isBlocked(sameAccount, submission.id)).toBe(false);
			expect(locks.holderCount(`${lockPrefix}${submission.id}`)).toBe(1);
			expect(locks.requestCount(`${lockPrefix}${submission.id}`)).toBe(2);
			expect(locks.grantCount(`${lockPrefix}${submission.id}`)).toBe(2);

			otherAccount.actions().serve({ env: "Mainnet", user: USER_X });
			sameAccount.actions().serve({ env: "Mainnet", user: USER_Y });
			await settle();
			expect(isBlocked(sameAccount, submission.id)).toBe(true);
			expect(isBlocked(otherAccount, submission.id)).toBe(false);
			expect(locks.holderCount(`${lockPrefix}${submission.id}`)).toBe(1);
		});

		it("stops waiting for the lock as soon as a waiting tab switches accounts", async () => {
			const storage = new MemoryStorage();
			const sender = openTab(storage, USER_X);
			const submission = sender.add();
			const switching = openTab(storage, USER_X);
			const staying = openTab(storage, USER_X);
			await settle();

			switching.actions().serve({ env: "Mainnet", user: USER_Y });
			locks.closeFirstHolder(`${lockPrefix}${submission.id}`);
			await settle();

			expect(isBlocked(switching, submission.id)).toBe(true);
			expect(isBlocked(staying, submission.id)).toBe(false);
			expect(locks.grantCount(`${lockPrefix}${submission.id}`)).toBe(2);
		});

		it("lets one other tab take over a submission whose sending tab closed", async () => {
			const storage = new MemoryStorage();
			const sender = openTab(storage, USER_X);
			const submission = sender.add();
			const other = openTab(storage, USER_X);
			const third = openTab(storage, USER_X);
			await settle();

			locks.closeFirstHolder(`${lockPrefix}${submission.id}`);
			await settle();

			expect(isBlocked(other, submission.id)).toBe(false);
			expect(isBlocked(third, submission.id)).toBe(true);
			expect(locks.holderCount(`${lockPrefix}${submission.id}`)).toBe(1);
		});

		it("reconciles in this tab when the lock request itself fails", async () => {
			const storage = new MemoryStorage();
			const submission = openTab(storage, USER_X).add();
			locks.rejectRequests();
			const other = openTab(storage, USER_X);
			await settle();

			expect(isBlocked(other, submission.id)).toBe(false);
		});
	});

	it("lets every tab reconcile every submission without Web Locks", async () => {
		const storage = new MemoryStorage();
		const submission = openTab(storage, USER_X).add();
		const other = openTab(storage, USER_X);
		await settle();

		expect(isBlocked(other, submission.id)).toBe(false);
	});
});
