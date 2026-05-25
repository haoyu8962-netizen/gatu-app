import { describe, expect, it } from "vitest";
import {
	clearMobileSyncDraft,
	readMobileSyncDraft,
	saveMobileSyncDraft,
	updateMobileSyncPairingCodeDraft,
} from "../mobile-sync/draft-storage";
import {
	createMobileAgentSyncUrl,
	MOBILE_SYNC_CLOCK_SKEW_MS,
	MOBILE_SYNC_PAYLOAD_TTL_MS,
} from "../mobile-sync/sync-core";

const NOW_MS = 1_779_364_227_000;
const APP_ORIGIN = "https://app.hypeterminal.com";
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
	it("persists only the encrypted envelope metadata and optional pairing code draft", async () => {
		const sync = await createSyncFixture();
		const storage = createMemoryStorage();

		expect(saveMobileSyncDraft(sync.envelope, "ABCD-1234", { storage, nowMs: NOW_MS })).toBe(true);

		const rawStoredValue = storage.getItem("hypeterminal.mobile-sync.import-draft.v1");
		expect(rawStoredValue).not.toContain(AGENT_PRIVATE_KEY);
		expect(rawStoredValue).not.toContain(USER_ADDRESS);

		expect(readMobileSyncDraft({ storage, nowMs: NOW_MS })).toMatchObject({
			status: "found",
			draft: {
				syncId: sync.syncId,
				createdAtMs: NOW_MS,
				expiresAtMs: sync.expiresAtMs,
				pairingCodeDraft: "ABCD-1234",
			},
		});
	});

	it("updates the pairing-code draft without losing the envelope", async () => {
		const sync = await createSyncFixture();
		const storage = createMemoryStorage();

		saveMobileSyncDraft(sync.envelope, "", { storage, nowMs: NOW_MS });
		updateMobileSyncPairingCodeDraft(sync.envelope, "FFFF-EEEE-DDDD-CCCC", { storage, nowMs: NOW_MS + 1 });

		expect(readMobileSyncDraft({ storage, nowMs: NOW_MS })).toMatchObject({
			status: "found",
			draft: {
				syncId: sync.syncId,
				pairingCodeDraft: "FFFF-EEEE-DDDD-CCCC",
				storedAtMs: NOW_MS + 1,
			},
		});
	});

	it("clears expired or invalid drafts", async () => {
		const sync = await createSyncFixture();
		const storage = createMemoryStorage();

		saveMobileSyncDraft(sync.envelope, "", { storage, nowMs: NOW_MS });
		expect(
			readMobileSyncDraft({
				storage,
				nowMs: NOW_MS + MOBILE_SYNC_PAYLOAD_TTL_MS + MOBILE_SYNC_CLOCK_SKEW_MS + 1,
			}),
		).toEqual({ status: "expired" });
		expect(readMobileSyncDraft({ storage, nowMs: NOW_MS })).toEqual({ status: "empty" });

		storage.setItem("hypeterminal.mobile-sync.import-draft.v1", JSON.stringify({ v: 1, encodedEnvelope: "bad" }));
		expect(readMobileSyncDraft({ storage, nowMs: NOW_MS })).toEqual({ status: "invalid" });
		expect(readMobileSyncDraft({ storage, nowMs: NOW_MS })).toEqual({ status: "empty" });
	});

	it("can be explicitly cleared", async () => {
		const sync = await createSyncFixture();
		const storage = createMemoryStorage();

		saveMobileSyncDraft(sync.envelope, "", { storage, nowMs: NOW_MS });
		expect(clearMobileSyncDraft({ storage })).toBe(true);
		expect(readMobileSyncDraft({ storage, nowMs: NOW_MS })).toEqual({ status: "empty" });
	});
});
