import { isAddress, zeroAddress } from "viem";
import type { HyperliquidEnv } from "../../signing/types";

const NONCE_STORAGE_PREFIX = "hyperliquid_exchange_nonce";
const NONCE_RECORD_VERSION = 1;
const MAX_FUTURE_NONCE_MS = 24 * 60 * 60 * 1_000;

interface PersistedNonceRecord {
	version: typeof NONCE_RECORD_VERSION;
	nonce: number;
}

function getNormalizedAddress(address: string): string {
	if (!isAddress(address) || address.toLowerCase() === zeroAddress) {
		throw new Error("Cannot allocate a Hyperliquid nonce for an invalid signer address.");
	}
	return address.toLowerCase();
}

function getStorageKey(env: HyperliquidEnv, address: string): string {
	return `${NONCE_STORAGE_PREFIX}_${env}_${address}`;
}

function getLockName(env: HyperliquidEnv, address: string): string {
	return `${NONCE_STORAGE_PREFIX}:${env}:${address}`;
}

function parsePersistedNonce(raw: string | null): PersistedNonceRecord | null {
	if (raw === null) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("The persisted Hyperliquid nonce state is corrupted.");
	}

	if (!parsed || typeof parsed !== "object") {
		throw new Error("The persisted Hyperliquid nonce state is corrupted.");
	}
	const record = parsed as Record<string, unknown>;
	if (
		record.version !== NONCE_RECORD_VERSION ||
		typeof record.nonce !== "number" ||
		!Number.isSafeInteger(record.nonce) ||
		record.nonce < 0
	) {
		throw new Error("The persisted Hyperliquid nonce state is corrupted.");
	}
	return {
		version: NONCE_RECORD_VERSION,
		nonce: record.nonce,
	};
}

function allocateNonce(storage: Storage, key: string): number {
	const now = Date.now();
	if (!Number.isSafeInteger(now) || now < 0) {
		throw new Error("The local clock cannot produce a safe Hyperliquid nonce.");
	}

	const previous = parsePersistedNonce(storage.getItem(key));
	const nonce = Math.max(now, (previous?.nonce ?? -1) + 1);
	if (!Number.isSafeInteger(nonce) || nonce >= now + MAX_FUTURE_NONCE_MS) {
		throw new Error("The persisted Hyperliquid nonce is outside the allowed future window.");
	}

	const serialized = JSON.stringify({
		version: NONCE_RECORD_VERSION,
		nonce,
	} satisfies PersistedNonceRecord);
	storage.setItem(key, serialized);
	if (storage.getItem(key) !== serialized) {
		throw new Error("The persisted Hyperliquid nonce failed readback verification.");
	}
	return nonce;
}

export function createCrossTabNonceManager(env: HyperliquidEnv): (address: string) => Promise<number> {
	return async (address) => {
		const normalizedAddress = getNormalizedAddress(address);
		if (
			typeof window === "undefined" ||
			typeof navigator === "undefined" ||
			!navigator.locks ||
			typeof navigator.locks.request !== "function"
		) {
			throw new Error("Cross-tab Hyperliquid nonce coordination is unavailable.");
		}

		const storage = window.localStorage;
		return navigator.locks.request(getLockName(env, normalizedAddress), { mode: "exclusive" }, () =>
			allocateNonce(storage, getStorageKey(env, normalizedAddress)),
		);
	};
}
