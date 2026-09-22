// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/config/app";
import {
	ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS,
	ORDER_RECONCILIATION_MAX_AGE_MS,
} from "@/domain/trade/order-tracking";
import {
	createPendingOrderStore,
	getPendingOrderActions,
	getPersistedPendingOrderAssetState,
	hasExclusivePendingOrderForAssets,
	hasPendingOrderForAssets,
	hasPendingOrderIntent,
	PendingOrderPersistenceError,
} from "@/stores/use-pending-order-store";

const USER = "0x1111111111111111111111111111111111111111" as const;
const SUBMISSION_STORAGE_PREFIX = `${STORAGE_KEYS.PENDING_ORDERS}:submission:`;

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

describe("pending order store", () => {
	beforeEach(() => {
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		window.localStorage.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("restores display metadata without changing tracked order facts", () => {
		const storage = new MemoryStorage();
		const store = createPendingOrderStore(storage);
		const submission = store.getState().actions.add({
			env: "Mainnet",
			user: USER,
			intentKey: "close",
			confirmationMode: "filled",
			queueId: "feedback-1",
			children: [{ assetId: 0, cloid: "0x00000000000000000000000000000001" }],
		});
		store.getState().actions.updateFeedback(submission.id, {
			operation: "close-all",
			children: [{ assetId: 0, market: "HYPE", size: "2", filledSize: "1", status: "partial" }],
		});
		const restored = createPendingOrderStore(storage).getState().submissions[0];
		expect(restored.feedback?.children?.[0]).toMatchObject({ status: "partial", filledSize: "1" });
		expect(restored.children).toEqual(submission.children);
		expect(restored.confirmationMode).toBe("filled");
		const key = storage.key(0);
		if (!key) throw new Error("Missing pending record");
		storage.setItem(key, JSON.stringify({ ...restored, feedback: { operation: "invalid-ui-metadata" } }));
		const withInvalidDisplay = createPendingOrderStore(storage).getState().submissions[0];
		expect(withInvalidDisplay?.id).toBe(submission.id);
		expect(withInvalidDisplay?.children).toEqual(submission.children);
		expect(withInvalidDisplay?.feedback).toBeUndefined();
	});

	it("restores execution evidence and ignores corrupt optional execution without discarding a lock", () => {
		const storage = new MemoryStorage();
		const store = createPendingOrderStore(storage);
		const execution = {
			evidence: "exchange-response",
			filledSize: "0.4",
			requestedSize: "1",
			averagePrice: "99",
			orderIds: [1],
			completeness: "partial",
		} as const;
		const submission = store.getState().actions.add({
			env: "Mainnet",
			user: USER,
			intentKey: "execution",
			children: [{ assetId: 0, cloid: "0x00000000000000000000000000000001" }],
			feedback: { market: "HYPE", quoteToken: "USDC", execution: { ...execution, orderIds: [1] } },
		});
		const restored = createPendingOrderStore(storage).getState().submissions[0];
		expect(restored.feedback).toMatchObject({ market: "HYPE", quoteToken: "USDC", execution });
		const key = storage.key(0);
		if (!key) throw new Error("Missing pending record");
		for (const corrupted of [
			{ ...execution, averagePrice: "bad" },
			{ ...execution, completeness: "full" },
			{ ...execution, filledSize: "2" },
			{ ...execution, orderIds: [1, 1] },
			{ ...execution, orderIds: [Number.MAX_SAFE_INTEGER + 1] },
		]) {
			storage.setItem(key, JSON.stringify({ ...submission, feedback: { market: "HYPE", execution: corrupted } }));
			const invalid = createPendingOrderStore(storage).getState().submissions[0];
			expect(invalid.id).toBe(submission.id);
			expect(invalid.children).toEqual(submission.children);
			expect(invalid.feedback).toEqual({ market: "HYPE", execution: undefined });
		}
	});

	it("restores IOC remainder evidence and drops corrupt optional fields without losing execution facts", () => {
		const storage = new MemoryStorage();
		const cloid = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		const execution = {
			evidence: "exchange-response" as const,
			filledSize: "0.4",
			requestedSize: "1",
			averagePrice: "99",
			orderIds: [1],
			completeness: "partial" as const,
		};
		const submission = createPendingOrderStore(storage)
			.getState()
			.actions.add({
				env: "Mainnet",
				user: USER,
				intentKey: "partial-ioc-execution",
				children: [{ assetId: 0, cloid }],
				feedback: { execution: { ...execution, partialIoc: { cloid, orderId: 1 } } },
			});
		expect(createPendingOrderStore(storage).getState().submissions[0].feedback?.execution?.partialIoc).toEqual({
			cloid,
			orderId: 1,
		});
		const key = storage.key(0);
		if (!key) throw new Error("Missing pending record");
		for (const partialIoc of [{ cloid, orderId: 2 }, { cloid: "bad", orderId: 1 }, { cloid, orderId: -1 }, "bad"]) {
			storage.setItem(key, JSON.stringify({ ...submission, feedback: { execution: { ...execution, partialIoc } } }));
			const restored = createPendingOrderStore(storage).getState().submissions[0];
			expect(restored.children).toEqual(submission.children);
			expect(restored.feedback?.execution).toMatchObject(execution);
			expect(restored.feedback?.execution?.partialIoc).toBeUndefined();
		}
	});

	it("blocks the affected asset until every child has a known exchange status", () => {
		const submission = getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "scale-order",
			children: [
				{ assetId: 0, cloid: "0x00000000000000000000000000000001" },
				{ assetId: 0, cloid: "0x00000000000000000000000000000002" },
			],
		});
		const firstChild = submission.children[0];
		const secondChild = submission.children[1];
		if (!firstChild || !secondChild) throw new Error("Expected two tracked order children");

		expect(hasPendingOrderForAssets("Mainnet", USER, [0])).toBe(true);
		expect(getPendingOrderActions().resolve("Mainnet", USER, firstChild.cloid, "open")).toBeNull();
		expect(hasPendingOrderForAssets("Mainnet", USER, [0])).toBe(true);

		const completed = getPendingOrderActions().resolve("Mainnet", USER, secondChild.cloid, "filled");
		expect(completed?.children.map((child) => child.status)).toEqual(["open", "filled"]);
		expect(hasPendingOrderForAssets("Mainnet", USER, [0])).toBe(false);
	});

	it("scopes duplicate protection by network and actual user", () => {
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "order",
			children: [{ assetId: 10, cloid: "0x00000000000000000000000000000003" }],
		});

		expect(hasPendingOrderForAssets("Mainnet", USER, [10])).toBe(true);
		expect(hasPendingOrderForAssets("Testnet", USER, [10])).toBe(false);
		expect(hasPendingOrderForAssets("Mainnet", "0x2222222222222222222222222222222222222222", [10])).toBe(false);
	});

	it("fresh-reads the persisted asset state for cross-tab coordination", () => {
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "persisted-order",
			children: [{ assetId: 17, cloid: "0x00000000000000000000000000000017" }],
		});

		expect(getPersistedPendingOrderAssetState("Mainnet", USER, [17])).toBe("pending");
		expect(getPersistedPendingOrderAssetState("Mainnet", USER, [18])).toBe("clear");
		expect(getPersistedPendingOrderAssetState("Testnet", USER, [17])).toBe("clear");
	});

	it("reports unavailable instead of trusting a stale in-memory snapshot", () => {
		const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			get() {
				throw new Error("storage unavailable");
			},
		});

		try {
			expect(getPersistedPendingOrderAssetState("Mainnet", USER, [17])).toBe("unavailable");
		} finally {
			if (descriptor) Object.defineProperty(window, "localStorage", descriptor);
		}
	});

	it("fails closed when any shared pending-order record is malformed", () => {
		window.localStorage.setItem(`${SUBMISSION_STORAGE_PREFIX}Mainnet:${USER}:corrupt`, "{not-json");

		expect(getPersistedPendingOrderAssetState("Mainnet", USER, [17])).toBe("unavailable");
	});

	it("distinguishes an exclusive asset lock from an ordinary pending submission", () => {
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "ordinary-order",
			children: [{ assetId: 12, cloid: "0x00000000000000000000000000000005" }],
		});
		const exclusiveSubmission = getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "exclusive-order",
			exclusiveAssetLock: true,
			children: [{ assetId: 13, cloid: "0x00000000000000000000000000000006" }],
		});

		expect(exclusiveSubmission.exclusiveAssetLock).toBe(true);
		expect(hasExclusivePendingOrderForAssets("Mainnet", USER, [12])).toBe(false);
		expect(hasExclusivePendingOrderForAssets("Mainnet", USER, [13])).toBe(true);
		expect(hasExclusivePendingOrderForAssets("Testnet", USER, [13])).toBe(false);
	});

	it("keeps filled-confirmation submissions locked while the order is still open", () => {
		const submission = getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "market-close",
			exclusiveAssetLock: true,
			confirmationMode: "filled",
			children: [{ assetId: 14, cloid: "0x00000000000000000000000000000007" }],
		});
		const child = submission.children[0];
		if (!child) throw new Error("Expected a tracked order child");

		expect(getPendingOrderActions().resolve("Mainnet", USER, child.cloid, "open")).toBeNull();
		expect(hasPendingOrderForAssets("Mainnet", USER, [14])).toBe(true);

		expect(getPendingOrderActions().resolve("Mainnet", USER, child.cloid, "filled")).toMatchObject({
			id: submission.id,
			confirmationMode: "filled",
		});
		expect(hasPendingOrderForAssets("Mainnet", USER, [14])).toBe(false);
	});

	it("releases the hard lock after the confirmation window while retaining the tracked record", () => {
		const submission = getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "order",
			children: [{ assetId: 11, cloid: "0x00000000000000000000000000000004" }],
		});
		vi.spyOn(Date, "now").mockReturnValue(submission.createdAt + ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS);

		expect(hasPendingOrderForAssets("Mainnet", USER, [11])).toBe(false);
		expect(hasPendingOrderIntent("Mainnet", USER, "order")).toBe(false);
		expect(getPendingOrderActions().markUnconfirmed(submission.id, Date.now())).toMatchObject({
			id: submission.id,
			unconfirmedAt: Date.now(),
		});
	});

	it("merges add, mark, resolve, and remove actions from stale tab snapshots without overwriting other assets", () => {
		const storage = new MemoryStorage();
		const tabA = createPendingOrderStore(storage);
		const tabB = createPendingOrderStore(storage);
		const first = tabA.getState().actions.add({
			env: "Mainnet",
			user: USER,
			intentKey: "first-tab-order",
			children: [{ assetId: 21, cloid: "0x00000000000000000000000000000021" }],
		});
		const second = tabB.getState().actions.add({
			env: "Mainnet",
			user: USER,
			intentKey: "second-tab-order",
			children: [{ assetId: 22, cloid: "0x00000000000000000000000000000022" }],
		});

		expect(tabA.getState().submissions.map((submission) => submission.id)).toEqual([first.id]);
		expect(
			tabB
				.getState()
				.submissions.map((submission) => submission.id)
				.sort(),
		).toEqual([first.id, second.id].sort());

		tabA.getState().actions.markChecked(first.children[0]?.cloid ?? "", 10_000);
		tabB.getState().actions.markUnconfirmed(second.id, 11_000);
		expect(tabB.getState().submissions.find((submission) => submission.id === first.id)?.children[0]?.attempts).toBe(1);

		expect(tabA.getState().actions.resolve("Mainnet", USER, first.children[0]?.cloid ?? "", "filled")?.id).toBe(
			first.id,
		);
		tabB.getState().actions.markChecked(second.children[0]?.cloid ?? "", 12_000);

		const reloaded = createPendingOrderStore(storage);
		expect(reloaded.getState().submissions).toEqual([
			expect.objectContaining({
				id: second.id,
				unconfirmedAt: 11_000,
				children: [expect.objectContaining({ attempts: 1 })],
			}),
		]);

		tabA.getState().actions.remove(second.id);
		expect(createPendingOrderStore(storage).getState().submissions).toEqual([]);
	});

	it("prunes only expired submissions from shared storage", () => {
		const storage = new MemoryStorage();
		const tabA = createPendingOrderStore(storage);
		const tabB = createPendingOrderStore(storage);
		const start = 1_000_000;
		vi.spyOn(Date, "now").mockReturnValue(start);
		const expired = tabA.getState().actions.add({
			env: "Mainnet",
			user: USER,
			intentKey: "expired-order",
			children: [{ assetId: 31, cloid: "0x00000000000000000000000000000031" }],
		});
		vi.mocked(Date.now).mockReturnValue(start + ORDER_RECONCILIATION_MAX_AGE_MS - 1);
		const retained = tabB.getState().actions.add({
			env: "Testnet",
			user: USER,
			intentKey: "retained-order",
			children: [{ assetId: 32, cloid: "0x00000000000000000000000000000032" }],
		});

		tabA.getState().actions.prune(start + ORDER_RECONCILIATION_MAX_AGE_MS);

		expect(
			createPendingOrderStore(storage)
				.getState()
				.submissions.map((submission) => submission.id),
		).toEqual([retained.id]);
		expect(
			createPendingOrderStore(storage)
				.getState()
				.submissions.some((submission) => submission.id === expired.id),
		).toBe(false);
	});

	it("migrates the legacy whole-store snapshot into independent submission records", () => {
		const storage = new MemoryStorage();
		storage.setItem(
			STORAGE_KEYS.PENDING_ORDERS,
			JSON.stringify({
				state: {
					submissions: [
						{
							id: "legacy-submission",
							env: "Mainnet",
							user: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
							intentKey: "legacy-order",
							createdAt: 5_000,
							children: [
								{
									assetId: 41,
									cloid: "0x00000000000000000000000000000041",
									attempts: 0,
									nextCheckAt: 6_000,
								},
							],
						},
					],
				},
				version: 1,
			}),
		);

		const migrated = createPendingOrderStore(storage);

		expect(storage.getItem(STORAGE_KEYS.PENDING_ORDERS)).toBeNull();
		expect(migrated.getState().submissions).toEqual([
			expect.objectContaining({
				id: "legacy-submission",
				user: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			}),
		]);
		expect(Array.from({ length: storage.length }, (_, index) => storage.key(index))).toEqual([
			expect.stringContaining(SUBMISSION_STORAGE_PREFIX),
		]);
	});

	it("clears malformed legacy and per-submission records without hydrating partial state", () => {
		const storage = new MemoryStorage();
		storage.setItem(STORAGE_KEYS.PENDING_ORDERS, "{");
		storage.setItem(`${SUBMISSION_STORAGE_PREFIX}Mainnet:${USER}:invalid`, JSON.stringify({ id: "invalid" }));

		const store = createPendingOrderStore(storage);

		expect(store.getState().submissions).toEqual([]);
		expect(storage.length).toBe(0);
	});

	it("rejects add before tracking when persistence cannot be read back", () => {
		const storage = new MemoryStorage();
		vi.spyOn(storage, "setItem").mockImplementation(() => undefined);
		const store = createPendingOrderStore(storage);

		expect(() =>
			store.getState().actions.add({
				env: "Mainnet",
				user: USER,
				intentKey: "unsafe-order",
				children: [{ assetId: 50, cloid: "0x00000000000000000000000000000050" }],
			}),
		).toThrow(PendingOrderPersistenceError);
		expect(store.getState().submissions).toEqual([]);
	});

	it("refreshes an existing tab snapshot on storage events", () => {
		const storage = new MemoryStorage();
		const eventTarget = new EventTarget();
		vi.stubGlobal("window", {
			localStorage: storage,
			addEventListener: eventTarget.addEventListener.bind(eventTarget),
		});
		const observer = createPendingOrderStore(storage);
		const writer = createPendingOrderStore(storage);
		const submission = writer.getState().actions.add({
			env: "Mainnet",
			user: USER,
			intentKey: "external-order",
			children: [{ assetId: 51, cloid: "0x00000000000000000000000000000051" }],
		});
		expect(observer.getState().submissions).toEqual([]);

		const additionEvent = new Event("storage");
		Object.defineProperty(additionEvent, "key", { value: `${SUBMISSION_STORAGE_PREFIX}external` });
		eventTarget.dispatchEvent(additionEvent);
		expect(observer.getState().submissions.map((entry) => entry.id)).toEqual([submission.id]);

		writer.getState().actions.remove(submission.id);
		const removalEvent = new Event("storage");
		Object.defineProperty(removalEvent, "key", { value: `${SUBMISSION_STORAGE_PREFIX}external` });
		eventTarget.dispatchEvent(removalEvent);
		expect(observer.getState().submissions).toEqual([]);
	});
});
