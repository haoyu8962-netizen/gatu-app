// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	armMobileSyncDraftExpiryCleanup,
	clearMobileSyncDraft,
	MOBILE_SYNC_DRAFT_STORAGE_KEY,
	readMobileSyncDraft,
	saveMobileSyncDraft,
} from "../mobile-sync/draft-storage";
import {
	createMobileAgentSyncUrl,
	MOBILE_SYNC_CLOCK_SKEW_MS,
	MOBILE_SYNC_PAYLOAD_TTL_MS,
} from "../mobile-sync/sync-core";

const NOW_MS = 1_779_364_227_000;
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
		appOrigin: "https://app.gatu.test",
		env: "Mainnet",
		userAddress: USER_ADDRESS,
		agentPrivateKey: AGENT_PRIVATE_KEY,
		nowMs: NOW_MS,
	});
}

describe("mobile sync draft expiry cleanup", () => {
	afterEach(() => {
		clearMobileSyncDraft();
		vi.useRealTimers();
	});

	it("clears the recoverable QR credential after expiry even when its route is no longer mounted", async () => {
		vi.useFakeTimers({ now: NOW_MS });
		const sync = await createSyncFixture();

		expect(saveMobileSyncDraft(sync.envelope, sync.encodedKey)).toBe(true);
		expect(readMobileSyncDraft().status).toBe("found");

		await vi.advanceTimersByTimeAsync(MOBILE_SYNC_PAYLOAD_TTL_MS + MOBILE_SYNC_CLOCK_SKEW_MS);
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).not.toBeNull();

		await vi.advanceTimersByTimeAsync(1);
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toBeNull();
		expect(readMobileSyncDraft()).toEqual({ status: "empty" });
	});

	it("arms expiry cleanup during client hydration for a draft saved before the route mounts", async () => {
		vi.useFakeTimers({ now: NOW_MS });
		const sync = await createSyncFixture();
		const memoryStorage = createMemoryStorage();
		expect(saveMobileSyncDraft(sync.envelope, sync.encodedKey, { storage: memoryStorage, nowMs: NOW_MS })).toBe(true);
		const serialized = memoryStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY);
		if (!serialized) throw new Error("Missing draft fixture");
		window.sessionStorage.setItem(MOBILE_SYNC_DRAFT_STORAGE_KEY, serialized);

		armMobileSyncDraftExpiryCleanup();
		await vi.advanceTimersByTimeAsync(MOBILE_SYNC_PAYLOAD_TTL_MS + MOBILE_SYNC_CLOCK_SKEW_MS + 1);

		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toBeNull();
	});
});
