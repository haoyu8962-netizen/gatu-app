// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/config/app";
import { TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS, TWAP_RECONCILIATION_MAX_AGE_MS } from "@/domain/trade/twap";
import {
	createPendingTwapStore,
	getPendingTwapActions,
	getPersistedPendingTwapAssetState,
	hasPendingTwapForAsset,
	PendingTwapPersistenceError,
} from "@/stores/use-pending-twap-store";

const USER = "0x1111111111111111111111111111111111111111" as const;
const SUBMISSION_STORAGE_PREFIX = `${STORAGE_KEYS.PENDING_TWAPS}:submission:`;

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

function createInput(assetId = 7) {
	return {
		env: "Mainnet" as const,
		user: USER,
		intent: {
			assetId,
			coin: "xyz:GOLD",
			side: "B" as const,
			size: "1",
			minutes: 30,
			reduceOnly: false,
			randomize: true,
		},
		activeBaseline: { ready: true, knownIds: [10] },
		historyBaseline: { ready: true, knownIds: [9, 10] },
	};
}

function addSubmission(assetId = 7) {
	return getPendingTwapActions().add(createInput(assetId));
}

describe("pending TWAP store", () => {
	beforeEach(() => {
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
		window.localStorage.removeItem(STORAGE_KEYS.PENDING_TWAPS);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("blocks duplicate TWAP submissions only for the same network, user, and asset", () => {
		addSubmission();

		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(true);
		expect(hasPendingTwapForAsset("Testnet", USER, 7)).toBe(false);
		expect(hasPendingTwapForAsset("Mainnet", "0x2222222222222222222222222222222222222222", 7)).toBe(false);
		expect(hasPendingTwapForAsset("Mainnet", USER, 8)).toBe(false);
	});

	it("returns the persisted submission exactly once when reconciliation resolves it", () => {
		const submission = addSubmission(8);

		expect(getPendingTwapActions().resolve(submission.id)).toEqual(submission);
		expect(getPendingTwapActions().resolve(submission.id)).toBeNull();
		expect(hasPendingTwapForAsset("Mainnet", USER, 8)).toBe(false);
	});

	it("releases duplicate protection after the confirmation window", () => {
		const submission = addSubmission(9);
		vi.spyOn(Date, "now").mockReturnValue(submission.createdAt + TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS);

		expect(hasPendingTwapForAsset("Mainnet", USER, 9)).toBe(false);
		expect(getPendingTwapActions().markUnconfirmed(submission.id, Date.now())).toMatchObject({
			id: submission.id,
			unconfirmedAt: Date.now(),
		});
	});

	it("preserves unrelated assets across add, remove, resolve, mark, and reload from stale tab snapshots", () => {
		const storage = new MemoryStorage();
		const tabA = createPendingTwapStore(storage);
		const tabB = createPendingTwapStore(storage);
		const first = tabA.getState().actions.add(createInput(21));
		const second = tabB.getState().actions.add(createInput(22));

		expect(tabA.getState().submissions.map((submission) => submission.id)).toEqual([first.id]);
		expect(
			tabB
				.getState()
				.submissions.map((submission) => submission.id)
				.sort(),
		).toEqual([first.id, second.id].sort());

		tabA.getState().actions.remove(first.id);
		expect(
			createPendingTwapStore(storage)
				.getState()
				.submissions.map((submission) => submission.id),
		).toEqual([second.id]);

		const third = tabA.getState().actions.add(createInput(23));
		expect(tabB.getState().actions.resolve(second.id)?.id).toBe(second.id);
		tabB.getState().actions.markUnconfirmed(third.id, 12_000);

		expect(createPendingTwapStore(storage).getState().submissions).toEqual([
			expect.objectContaining({ id: third.id, unconfirmedAt: 12_000 }),
		]);
	});

	it("prunes only expired submissions from shared storage", () => {
		const storage = new MemoryStorage();
		const tabA = createPendingTwapStore(storage);
		const tabB = createPendingTwapStore(storage);
		const start = 1_000_000;
		vi.spyOn(Date, "now").mockReturnValue(start);
		const expired = tabA.getState().actions.add(createInput(31));
		vi.mocked(Date.now).mockReturnValue(start + TWAP_RECONCILIATION_MAX_AGE_MS - 1);
		const retained = tabB.getState().actions.add(createInput(32));

		tabA.getState().actions.prune(start + TWAP_RECONCILIATION_MAX_AGE_MS);

		expect(
			createPendingTwapStore(storage)
				.getState()
				.submissions.map((submission) => submission.id),
		).toEqual([retained.id]);
		expect(
			createPendingTwapStore(storage)
				.getState()
				.submissions.some((submission) => submission.id === expired.id),
		).toBe(false);
	});

	it("migrates the legacy whole-store snapshot into an independent submission record", () => {
		const storage = new MemoryStorage();
		storage.setItem(
			STORAGE_KEYS.PENDING_TWAPS,
			JSON.stringify({
				state: {
					submissions: [
						{
							id: "legacy-twap",
							env: "Mainnet",
							user: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
							createdAt: 5_000,
							intent: createInput(41).intent,
							activeBaseline: { ready: true, knownIds: [1] },
							historyBaseline: { ready: true, knownIds: [1, 2] },
						},
					],
				},
				version: 1,
			}),
		);

		const migrated = createPendingTwapStore(storage);

		expect(storage.getItem(STORAGE_KEYS.PENDING_TWAPS)).toBeNull();
		expect(migrated.getState().submissions).toEqual([
			expect.objectContaining({
				id: "legacy-twap",
				user: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			}),
		]);
		expect(Array.from({ length: storage.length }, (_, index) => storage.key(index))).toEqual([
			expect.stringContaining(SUBMISSION_STORAGE_PREFIX),
		]);
	});

	it("clears malformed legacy and per-submission records without hydrating partial state", () => {
		const storage = new MemoryStorage();
		storage.setItem(STORAGE_KEYS.PENDING_TWAPS, "{");
		storage.setItem(`${SUBMISSION_STORAGE_PREFIX}Mainnet:${USER}:invalid`, JSON.stringify({ id: "invalid" }));

		const store = createPendingTwapStore(storage);

		expect(store.getState().submissions).toEqual([]);
		expect(storage.length).toBe(0);
	});

	it("rejects add before tracking when persistence cannot be read back", () => {
		const storage = new MemoryStorage();
		vi.spyOn(storage, "setItem").mockImplementation(() => undefined);
		const store = createPendingTwapStore(storage);

		expect(() => store.getState().actions.add(createInput(50))).toThrow(PendingTwapPersistenceError);
		expect(store.getState().submissions).toEqual([]);
	});

	it("reads the current persisted asset state instead of a stale singleton snapshot", () => {
		const externalTab = createPendingTwapStore(window.localStorage);
		const submission = externalTab.getState().actions.add(createInput(61));

		expect(getPersistedPendingTwapAssetState("Mainnet", USER, 61)).toBe("pending");
		expect(hasPendingTwapForAsset("Mainnet", USER, 61)).toBe(true);

		externalTab.getState().actions.remove(submission.id);
		expect(getPersistedPendingTwapAssetState("Mainnet", USER, 61)).toBe("clear");
	});

	it("fails closed when the persisted asset state cannot be read", () => {
		vi.stubGlobal("window", {
			get localStorage() {
				throw new Error("storage disabled");
			},
		});

		expect(getPersistedPendingTwapAssetState("Mainnet", USER, 70)).toBe("unavailable");
		expect(hasPendingTwapForAsset("Mainnet", USER, 70)).toBe(true);
	});

	it("refreshes an existing tab snapshot on storage events", () => {
		const storage = new MemoryStorage();
		const eventTarget = new EventTarget();
		vi.stubGlobal("window", {
			localStorage: storage,
			addEventListener: eventTarget.addEventListener.bind(eventTarget),
		});
		const observer = createPendingTwapStore(storage);
		const writer = createPendingTwapStore(storage);
		const submission = writer.getState().actions.add(createInput(71));
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
