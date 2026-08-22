import type { HyperliquidEnv } from "@/lib/hyperliquid";

export const POSITION_MARKET_CLOSE_CONFIRMATION_POLICY_VERSION = 1;

const POSITION_MARKET_CLOSE_CONFIRMATION_STORAGE_SCHEMA_VERSION = 1;
const POSITION_MARKET_CLOSE_CONFIRMATION_STORAGE_PREFIX = "gatu:position-market-close-confirmation:v1";
const EVM_ADDRESS_PATTERN = /^0x[a-f0-9]{40}$/;

export type PositionMarketCloseConfirmationPreferenceStatus = "dismissed" | "required" | "unavailable";

export interface PositionMarketCloseConfirmationPreferenceIdentity {
	owner: string;
	env: HyperliquidEnv;
}

export type PositionMarketCloseConfirmationPreferenceStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

interface PersistedPositionMarketCloseConfirmationPreference {
	storageSchemaVersion: number;
	dismissedPolicyVersion: number;
}

export function readPositionMarketCloseConfirmationPreference(
	identity: PositionMarketCloseConfirmationPreferenceIdentity,
	storage?: PositionMarketCloseConfirmationPreferenceStorage | null,
): PositionMarketCloseConfirmationPreferenceStatus {
	const targetStorage = storage === undefined ? getBrowserStorage() : storage;
	const storageKey = getStorageKey(identity);
	if (!targetStorage || !storageKey) return "unavailable";

	let serialized: string | null;
	try {
		serialized = targetStorage.getItem(storageKey);
	} catch {
		return "unavailable";
	}
	if (serialized === null) return "required";

	const persisted = parsePersistedPreference(serialized);
	if (!persisted) return "unavailable";
	return persisted.dismissedPolicyVersion === POSITION_MARKET_CLOSE_CONFIRMATION_POLICY_VERSION
		? "dismissed"
		: "required";
}

export function dismissPositionMarketCloseConfirmation(
	identity: PositionMarketCloseConfirmationPreferenceIdentity,
	storage?: PositionMarketCloseConfirmationPreferenceStorage | null,
): PositionMarketCloseConfirmationPreferenceStatus {
	const targetStorage = storage === undefined ? getBrowserStorage() : storage;
	const storageKey = getStorageKey(identity);
	if (!targetStorage || !storageKey) return "unavailable";

	const persisted: PersistedPositionMarketCloseConfirmationPreference = {
		storageSchemaVersion: POSITION_MARKET_CLOSE_CONFIRMATION_STORAGE_SCHEMA_VERSION,
		dismissedPolicyVersion: POSITION_MARKET_CLOSE_CONFIRMATION_POLICY_VERSION,
	};
	const serialized = JSON.stringify(persisted);

	try {
		targetStorage.setItem(storageKey, serialized);
		if (targetStorage.getItem(storageKey) === serialized) return "dismissed";
	} catch {
		// The preference must not be trusted unless its exact value can be read back.
	}

	removeUnverifiedPreference(targetStorage, storageKey);
	return "unavailable";
}

export function resetPositionMarketCloseConfirmation(
	identity: PositionMarketCloseConfirmationPreferenceIdentity,
	storage?: PositionMarketCloseConfirmationPreferenceStorage | null,
): PositionMarketCloseConfirmationPreferenceStatus {
	const targetStorage = storage === undefined ? getBrowserStorage() : storage;
	const storageKey = getStorageKey(identity);
	if (!targetStorage || !storageKey) return "unavailable";

	try {
		targetStorage.removeItem(storageKey);
		return targetStorage.getItem(storageKey) === null ? "required" : "unavailable";
	} catch {
		return "unavailable";
	}
}

function getBrowserStorage(): PositionMarketCloseConfirmationPreferenceStorage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function getStorageKey(identity: PositionMarketCloseConfirmationPreferenceIdentity): string | null {
	const owner = identity.owner.trim().toLowerCase();
	if (!EVM_ADDRESS_PATTERN.test(owner)) return null;
	if (identity.env !== "Mainnet" && identity.env !== "Testnet") return null;
	return `${POSITION_MARKET_CLOSE_CONFIRMATION_STORAGE_PREFIX}:${identity.env.toLowerCase()}:${owner}`;
}

function parsePersistedPreference(serialized: string): PersistedPositionMarketCloseConfirmationPreference | null {
	try {
		const parsed: unknown = JSON.parse(serialized);
		if (!isPlainRecord(parsed)) return null;
		if (Object.keys(parsed).length !== 2) return null;
		if (
			parsed.storageSchemaVersion !== POSITION_MARKET_CLOSE_CONFIRMATION_STORAGE_SCHEMA_VERSION ||
			typeof parsed.dismissedPolicyVersion !== "number" ||
			!Number.isInteger(parsed.dismissedPolicyVersion) ||
			parsed.dismissedPolicyVersion < 0
		) {
			return null;
		}
		return {
			storageSchemaVersion: parsed.storageSchemaVersion,
			dismissedPolicyVersion: parsed.dismissedPolicyVersion,
		};
	} catch {
		return null;
	}
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function removeUnverifiedPreference(
	storage: PositionMarketCloseConfirmationPreferenceStorage,
	storageKey: string,
): void {
	try {
		storage.removeItem(storageKey);
	} catch {
		// The caller still receives unavailable and must keep showing confirmation.
	}
}
