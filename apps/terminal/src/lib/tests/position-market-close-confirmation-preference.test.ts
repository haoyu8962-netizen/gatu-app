import { describe, expect, it } from "vitest";
import {
	dismissPositionMarketCloseConfirmation,
	POSITION_MARKET_CLOSE_CONFIRMATION_POLICY_VERSION,
	type PositionMarketCloseConfirmationPreferenceStorage,
	readPositionMarketCloseConfirmationPreference,
	resetPositionMarketCloseConfirmation,
} from "@/lib/trade/position-market-close-confirmation-preference";

const OWNER = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const UPPERCASE_OWNER = "0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD";
const OTHER_OWNER = "0x1111111111111111111111111111111111111111";

const MAINNET_IDENTITY = { owner: OWNER, env: "Mainnet" as const };

class ControlledStorage implements PositionMarketCloseConfirmationPreferenceStorage {
	readonly records = new Map<string, string>();
	throwOnGet = false;
	throwOnRemove = false;
	throwOnSet = false;
	ignoreRemove = false;
	ignoreSet = false;
	readOverride: string | null | undefined;

	getItem(key: string): string | null {
		if (this.throwOnGet) throw new Error("get blocked");
		if (this.readOverride !== undefined) return this.readOverride;
		return this.records.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		if (this.throwOnSet) throw new Error("set blocked");
		if (!this.ignoreSet) this.records.set(key, value);
	}

	removeItem(key: string): void {
		if (this.throwOnRemove) throw new Error("remove blocked");
		if (!this.ignoreRemove) this.records.delete(key);
	}
}

function getOnlyRecord(storage: ControlledStorage): [string, string] {
	const entries = [...storage.records.entries()];
	expect(entries).toHaveLength(1);
	return entries[0];
}

describe("position market close confirmation preference", () => {
	it("is SSR-safe and treats missing browser storage as unavailable", () => {
		expect(readPositionMarketCloseConfirmationPreference(MAINNET_IDENTITY)).toBe("unavailable");
		expect(dismissPositionMarketCloseConfirmation(MAINNET_IDENTITY)).toBe("unavailable");
		expect(resetPositionMarketCloseConfirmation(MAINNET_IDENTITY)).toBe("unavailable");
	});

	it("requires confirmation when the scoped preference does not exist", () => {
		const storage = new ControlledStorage();

		expect(readPositionMarketCloseConfirmationPreference(MAINNET_IDENTITY, storage)).toBe("required");
	});

	it("isolates the dismissal by normalized owner and environment", () => {
		const storage = new ControlledStorage();

		expect(dismissPositionMarketCloseConfirmation({ owner: UPPERCASE_OWNER, env: "Mainnet" }, storage)).toBe(
			"dismissed",
		);
		expect(readPositionMarketCloseConfirmationPreference(MAINNET_IDENTITY, storage)).toBe("dismissed");
		expect(readPositionMarketCloseConfirmationPreference({ owner: OTHER_OWNER, env: "Mainnet" }, storage)).toBe(
			"required",
		);
		expect(readPositionMarketCloseConfirmationPreference({ owner: OWNER, env: "Testnet" }, storage)).toBe("required");

		const [storageKey] = getOnlyRecord(storage);
		expect(storageKey).toContain(`:mainnet:${OWNER}`);
		expect(storageKey).not.toContain(UPPERCASE_OWNER);
	});

	it("persists only schema and policy versions after an exact readback", () => {
		const storage = new ControlledStorage();

		expect(dismissPositionMarketCloseConfirmation(MAINNET_IDENTITY, storage)).toBe("dismissed");
		const [, serialized] = getOnlyRecord(storage);
		expect(JSON.parse(serialized)).toEqual({
			storageSchemaVersion: 1,
			dismissedPolicyVersion: POSITION_MARKET_CLOSE_CONFIRMATION_POLICY_VERSION,
		});
		expect(serialized).not.toMatch(/size|percent|price/i);
	});

	it("requires confirmation again when the independent policy version changes", () => {
		const storage = new ControlledStorage();
		dismissPositionMarketCloseConfirmation(MAINNET_IDENTITY, storage);
		const [storageKey] = getOnlyRecord(storage);
		storage.records.set(
			storageKey,
			JSON.stringify({
				storageSchemaVersion: 1,
				dismissedPolicyVersion: POSITION_MARKET_CLOSE_CONFIRMATION_POLICY_VERSION + 1,
			}),
		);

		expect(readPositionMarketCloseConfirmationPreference(MAINNET_IDENTITY, storage)).toBe("required");
	});

	it.each([
		"not-json",
		"null",
		"[]",
		JSON.stringify({ storageSchemaVersion: 2, dismissedPolicyVersion: 1 }),
		JSON.stringify({ storageSchemaVersion: 1, dismissedPolicyVersion: -1 }),
		JSON.stringify({ storageSchemaVersion: 1, dismissedPolicyVersion: 1, size: "1" }),
	])("fails closed as unavailable for malformed persisted data: %s", (serialized) => {
		const storage = new ControlledStorage();
		dismissPositionMarketCloseConfirmation(MAINNET_IDENTITY, storage);
		const [storageKey] = getOnlyRecord(storage);
		storage.records.set(storageKey, serialized);

		expect(readPositionMarketCloseConfirmationPreference(MAINNET_IDENTITY, storage)).toBe("unavailable");
	});

	it("fails closed when reading storage throws", () => {
		const storage = new ControlledStorage();
		storage.throwOnGet = true;

		expect(readPositionMarketCloseConfirmationPreference(MAINNET_IDENTITY, storage)).toBe("unavailable");
	});

	it("fails closed and removes an unverified preference when writing throws", () => {
		const storage = new ControlledStorage();
		storage.throwOnSet = true;

		expect(dismissPositionMarketCloseConfirmation(MAINNET_IDENTITY, storage)).toBe("unavailable");
		expect(storage.records.size).toBe(0);
	});

	it.each(["ignored write", "mismatched readback"])(
		"fails closed and removes an unverified preference after %s",
		(failure) => {
			const storage = new ControlledStorage();
			if (failure === "ignored write") storage.ignoreSet = true;
			else storage.readOverride = "different";

			expect(dismissPositionMarketCloseConfirmation(MAINNET_IDENTITY, storage)).toBe("unavailable");
			expect(storage.records.size).toBe(0);
		},
	);

	it("resets a verified preference and confirms the removal by readback", () => {
		const storage = new ControlledStorage();
		dismissPositionMarketCloseConfirmation(MAINNET_IDENTITY, storage);

		expect(resetPositionMarketCloseConfirmation(MAINNET_IDENTITY, storage)).toBe("required");
		expect(storage.records.size).toBe(0);
		expect(readPositionMarketCloseConfirmationPreference(MAINNET_IDENTITY, storage)).toBe("required");
	});

	it.each(["remove throws", "remove is ignored", "reset readback throws"])(
		"fails closed as unavailable when %s",
		(failure) => {
			const storage = new ControlledStorage();
			dismissPositionMarketCloseConfirmation(MAINNET_IDENTITY, storage);
			if (failure === "remove throws") storage.throwOnRemove = true;
			else if (failure === "remove is ignored") storage.ignoreRemove = true;
			else storage.throwOnGet = true;

			expect(resetPositionMarketCloseConfirmation(MAINNET_IDENTITY, storage)).toBe("unavailable");
		},
	);

	it("fails closed for invalid runtime identities", () => {
		const storage = new ControlledStorage();

		expect(readPositionMarketCloseConfirmationPreference({ owner: "0x1234", env: "Mainnet" }, storage)).toBe(
			"unavailable",
		);
		expect(readPositionMarketCloseConfirmationPreference({ owner: OWNER, env: "invalid" as "Mainnet" }, storage)).toBe(
			"unavailable",
		);
	});
});
