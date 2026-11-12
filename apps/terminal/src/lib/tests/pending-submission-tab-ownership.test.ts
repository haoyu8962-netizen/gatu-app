// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPendingOrderStore } from "@/stores/use-pending-order-store";
import { createPendingTwapStore } from "@/stores/use-pending-twap-store";

const USER = "0x1111111111111111111111111111111111111111" as const;

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

/** One exclusive lock per name with a FIFO queue, shared by the store instances that model tabs. */
function installLockManager() {
	const queues = new Map<string, Array<() => void>>();
	const holders = new Map<string, () => void>();

	function grantNext(name: string): void {
		const run = queues.get(name)?.shift();
		if (run) run();
		else queues.delete(name);
	}

	const manager = {
		request(name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown) {
			return new Promise((resolve, reject) => {
				const run = () => {
					let finished = false;
					const finish = () => {
						if (finished) return;
						finished = true;
						holders.delete(name);
						grantNext(name);
					};
					holders.set(name, finish);
					Promise.resolve()
						.then(() => callback({ name, mode: "exclusive" } as Lock))
						.then(resolve, reject)
						.finally(finish);
				};
				const queue = queues.get(name);
				if (queue) {
					queue.push(run);
					return;
				}
				queues.set(name, []);
				run();
			});
		},
	} as unknown as LockManager;
	Object.defineProperty(window.navigator, "locks", { configurable: true, value: manager });
	return {
		isHeld: (name: string) => holders.has(name),
		closeHolder: (name: string) => holders.get(name)?.(),
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
				add: () =>
					store.getState().actions.add({
						env: "Mainnet",
						user: USER,
						intentKey: "tab-order",
						children: [{ assetId: 31, cloid: "0x00000000000000000000000000000031" }],
					}),
				remove: (id: string) => store.getState().actions.remove(id),
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
				add: () =>
					store.getState().actions.add({
						env: "Mainnet",
						user: USER,
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
				remove: (id: string) => store.getState().actions.remove(id),
			};
		},
	},
];

describe.each(kinds)("pending $name submission ownership between tabs", ({ lockPrefix, createTab }) => {
	afterEach(() => {
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
	});

	describe("with Web Locks", () => {
		let locks: ReturnType<typeof installLockManager>;

		beforeEach(() => {
			locks = installLockManager();
		});

		it("keeps a submission with the tab that sent it while that tab holds it", async () => {
			const storage = new MemoryStorage();
			const sender = createTab(storage);
			const submission = sender.add();
			sender.store.getState().actions.markActive(submission.id);
			const other = createTab(storage);
			await settle();

			expect(locks.isHeld(`${lockPrefix}${submission.id}`)).toBe(true);
			expect(other.store.getState().submissions.map((entry) => entry.id)).toEqual([submission.id]);
			expect(other.store.getState().activeSubmissionIds.has(submission.id)).toBe(true);
			expect(sender.store.getState().activeSubmissionIds.has(submission.id)).toBe(true);

			sender.store.getState().actions.clearActive(submission.id);
			await settle();
			expect(sender.store.getState().activeSubmissionIds.has(submission.id)).toBe(false);
			expect(other.store.getState().activeSubmissionIds.has(submission.id)).toBe(true);
		});

		it("does not take over a submission the sending tab settled, even before the other tab hears of it", async () => {
			const storage = new MemoryStorage();
			const sender = createTab(storage);
			const submission = sender.add();
			const other = createTab(storage);
			await settle();

			sender.remove(submission.id);
			await settle();

			expect(other.store.getState().activeSubmissionIds.has(submission.id)).toBe(true);
			expect(locks.isHeld(`${lockPrefix}${submission.id}`)).toBe(false);
		});

		it("lets one other tab take over a submission whose sending tab closed", async () => {
			const storage = new MemoryStorage();
			const sender = createTab(storage);
			const submission = sender.add();
			const other = createTab(storage);
			const third = createTab(storage);
			await settle();

			locks.closeHolder(`${lockPrefix}${submission.id}`);
			await settle();

			expect(other.store.getState().activeSubmissionIds.has(submission.id)).toBe(false);
			expect(third.store.getState().activeSubmissionIds.has(submission.id)).toBe(true);
			expect(locks.isHeld(`${lockPrefix}${submission.id}`)).toBe(true);
		});
	});

	it("lets every tab reconcile every submission without Web Locks", async () => {
		const storage = new MemoryStorage();
		const submission = createTab(storage).add();
		const other = createTab(storage);
		await settle();

		expect(other.store.getState().activeSubmissionIds.has(submission.id)).toBe(false);
	});
});
