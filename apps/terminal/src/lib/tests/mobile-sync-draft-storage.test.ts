import { afterEach, describe, expect, it, vi } from "vitest";
import { clearMobileSyncDraft, readMobileSyncDraft, saveMobileSyncDraft } from "../mobile-sync/draft-storage";
import {
	createMobileAgentSyncUrl,
	MOBILE_SYNC_CLOCK_SKEW_MS,
	MOBILE_SYNC_PAYLOAD_TTL_MS,
} from "../mobile-sync/sync-core";

const NOW_MS = 1_779_364_227_000;
const APP_ORIGIN = "https://app.gatu.test";
const USER_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const AGENT_PRIVATE_KEY = `0x${"ab".repeat(32)}` as const;

function createMemoryStorage(): Storage {
	const values = new Map<string, string>();
	return {
		get length() {
			return values.size;
		},
		clear: () => values.clear(),
		getItem: (key: string) => values.get(key) ?? null,
		key: (index: number) => Array.from(values.keys())[index] ?? null,
		removeItem: (key: string) => {
			values.delete(key);
		},
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
	};
}

async function createSyncFixture() {
	return createMobileAgentSyncUrl({
		appOrigin: APP_ORIGIN,
		env: "Mainnet",
		userAddress: USER_ADDRESS,
		agentPrivateKey: AGENT_PRIVATE_KEY,
		nowMs: NOW_MS,
	});
}

describe("mobile sync draft storage", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("persists the encrypted envelope metadata and the embedded key, and survives a reload", async () => {
		const sync = await createSyncFixture();
		const storage = createMemoryStorage();

		expect(saveMobileSyncDraft(sync.envelope, sync.encodedKey, { storage, nowMs: NOW_MS })).toBe(true);

		const rawStoredValue = storage.getItem("gatu.mobile-sync.import-draft.v1");
		expect(rawStoredValue).not.toContain(AGENT_PRIVATE_KEY);
		expect(rawStoredValue).not.toContain(USER_ADDRESS);

		expect(readMobileSyncDraft({ storage, nowMs: NOW_MS })).toMatchObject({
			status: "found",
			draft: {
				syncId: sync.syncId,
				createdAtMs: NOW_MS,
				expiresAtMs: sync.expiresAtMs,
				encodedKey: sync.encodedKey,
			},
		});
	});

	it("clears expired or invalid drafts", async () => {
		const sync = await createSyncFixture();
		const storage = createMemoryStorage();

		saveMobileSyncDraft(sync.envelope, sync.encodedKey, { storage, nowMs: NOW_MS });
		expect(
			readMobileSyncDraft({
				storage,
				nowMs: NOW_MS + MOBILE_SYNC_PAYLOAD_TTL_MS + MOBILE_SYNC_CLOCK_SKEW_MS + 1,
			}),
		).toEqual({ status: "expired" });
		expect(readMobileSyncDraft({ storage, nowMs: NOW_MS })).toEqual({ status: "empty" });

		storage.setItem("gatu.mobile-sync.import-draft.v1", JSON.stringify({ v: 1, encodedEnvelope: "bad" }));
		expect(readMobileSyncDraft({ storage, nowMs: NOW_MS })).toEqual({ status: "invalid" });
		expect(readMobileSyncDraft({ storage, nowMs: NOW_MS })).toEqual({ status: "empty" });
	});

	it("can be explicitly cleared", async () => {
		const sync = await createSyncFixture();
		const storage = createMemoryStorage();

		saveMobileSyncDraft(sync.envelope, sync.encodedKey, { storage, nowMs: NOW_MS });
		expect(clearMobileSyncDraft({ storage })).toBe(true);
		expect(readMobileSyncDraft({ storage, nowMs: NOW_MS })).toEqual({ status: "empty" });
	});

	it("does not report a clear until the exact draft is absent on readback", async () => {
		const sync = await createSyncFixture();
		const storage = createMemoryStorage();

		saveMobileSyncDraft(sync.envelope, sync.encodedKey, { storage, nowMs: NOW_MS });
		storage.removeItem = () => {};

		expect(clearMobileSyncDraft({ storage })).toBe(false);
		expect(readMobileSyncDraft({ storage, nowMs: NOW_MS }).status).toBe("found");
	});

	it("fails closed when the exact draft cannot be read back", async () => {
		const sync = await createSyncFixture();
		const storage = createMemoryStorage();
		const setItem = storage.setItem.bind(storage);
		storage.setItem = (key, value) => setItem(key, `${value}corrupted`);

		expect(saveMobileSyncDraft(sync.envelope, sync.encodedKey, { storage, nowMs: NOW_MS })).toBe(false);
		expect(readMobileSyncDraft({ storage, nowMs: NOW_MS })).toEqual({ status: "empty" });
	});

	it("distinguishes an unreadable store from an empty store", () => {
		const storage = createMemoryStorage();
		storage.getItem = () => {
			throw new Error("storage read blocked");
		};

		expect(readMobileSyncDraft({ storage, nowMs: NOW_MS })).toEqual({ status: "unavailable" });
	});

	it("does not arm browser-length timers for caller-provided memory storage", async () => {
		const sync = await createSyncFixture();
		const storage = createMemoryStorage();
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

		expect(saveMobileSyncDraft(sync.envelope, sync.encodedKey, { storage, nowMs: NOW_MS })).toBe(true);
		expect(readMobileSyncDraft({ storage, nowMs: NOW_MS }).status).toBe("found");
		expect(setTimeoutSpy).not.toHaveBeenCalled();
	});
});
