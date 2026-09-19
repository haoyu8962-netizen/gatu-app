// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
	hasImportedMobileSyncId,
	MOBILE_SYNC_IMPORTED_STORAGE_KEY,
	recordImportedMobileSyncId,
} from "../mobile-sync/imported-sync-ids";
import { MOBILE_SYNC_CLOCK_SKEW_MS } from "../mobile-sync/sync-core";

const NOW_MS = 1_800_000_000_000;
const USER_ADDRESS = "0x1111111111111111111111111111111111111111";
const IMPORT = { env: "Mainnet", userAddress: USER_ADDRESS, syncId: "A".repeat(22) } as const;

describe("imported mobile sync IDs", () => {
	beforeEach(() => window.localStorage.clear());

	it("remembers an import per network and owner, case-insensitively", () => {
		expect(hasImportedMobileSyncId(IMPORT, { nowMs: NOW_MS })).toBe(false);
		expect(recordImportedMobileSyncId({ ...IMPORT, expiresAtMs: NOW_MS + 120_000 }, { nowMs: NOW_MS })).toBe(true);

		expect(hasImportedMobileSyncId({ ...IMPORT, userAddress: USER_ADDRESS.toUpperCase() }, { nowMs: NOW_MS })).toBe(
			true,
		);
		expect(hasImportedMobileSyncId({ ...IMPORT, env: "Testnet" }, { nowMs: NOW_MS })).toBe(false);
		expect(hasImportedMobileSyncId({ ...IMPORT, syncId: "B".repeat(22) }, { nowMs: NOW_MS })).toBe(false);
		expect(
			hasImportedMobileSyncId(
				{ ...IMPORT, userAddress: "0x2222222222222222222222222222222222222222" },
				{ nowMs: NOW_MS },
			),
		).toBe(false);
	});

	it("forgets an import once its envelope can no longer be accepted", () => {
		const expiresAtMs = NOW_MS + 120_000;
		recordImportedMobileSyncId({ ...IMPORT, expiresAtMs }, { nowMs: NOW_MS });

		expect(hasImportedMobileSyncId(IMPORT, { nowMs: expiresAtMs + MOBILE_SYNC_CLOCK_SKEW_MS })).toBe(true);
		expect(hasImportedMobileSyncId(IMPORT, { nowMs: expiresAtMs + MOBILE_SYNC_CLOCK_SKEW_MS + 1 })).toBe(false);

		recordImportedMobileSyncId(
			{ ...IMPORT, syncId: "C".repeat(22), expiresAtMs: expiresAtMs + 600_000 },
			{ nowMs: expiresAtMs + MOBILE_SYNC_CLOCK_SKEW_MS + 1 },
		);
		expect(window.localStorage.getItem(MOBILE_SYNC_IMPORTED_STORAGE_KEY)).not.toContain(IMPORT.syncId);
	});

	it("stores only the dedup identity and tolerates corrupt or unavailable storage", () => {
		recordImportedMobileSyncId({ ...IMPORT, expiresAtMs: NOW_MS + 120_000 }, { nowMs: NOW_MS });
		expect(
			Object.keys(JSON.parse(window.localStorage.getItem(MOBILE_SYNC_IMPORTED_STORAGE_KEY) ?? "[]")[0]).sort(),
		).toEqual(["env", "expiresAtMs", "syncId", "userAddress"]);

		window.localStorage.setItem(MOBILE_SYNC_IMPORTED_STORAGE_KEY, "{not json");
		expect(hasImportedMobileSyncId(IMPORT, { nowMs: NOW_MS })).toBe(false);
		expect(hasImportedMobileSyncId(IMPORT, { nowMs: NOW_MS, storage: null })).toBe(false);
		expect(recordImportedMobileSyncId({ ...IMPORT, expiresAtMs: NOW_MS + 1 }, { storage: null })).toBe(false);
	});
});
