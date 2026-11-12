import { isAddress, zeroAddress } from "viem";
import type { HyperliquidEnv } from "../../signing/types";

const NONCE_STORAGE_PREFIX = "hyperliquid_exchange_nonce";
const NONCE_RECORD_VERSION = 1;
/** Hyperliquid accepts nonces within (T - 2 days, T + 1 day) of the block time T. */
const MAX_FUTURE_NONCE_MS = 24 * 60 * 60 * 1_000;

interface PersistedNonceRecord {
	version: typeof NONCE_RECORD_VERSION;
	nonce: number;
}

export interface CrossTabNonceManagerOptions {
	/**
	 * The exchange's current time estimated from a usable server sample, or `undefined` without one.
	 * With it, a persisted nonce at or beyond that time plus the future window is discarded: the
	 * exchange never accepted it, and keeping it would block the signer until the clock caught up.
	 */
	readExchangeNow?: () => number | undefined;
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

function isUsableNonce(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Reads the last nonce allocated for the signer. A record whose `nonce` is unusable is corrupted and
 * treated as absent, so the next allocation rewrites it. Any other field, the version included, is
 * kept as written: `nonce` keeps this meaning in every version, so a newer record still sets the floor.
 */
function readPersistedNonce(raw: string | null): { nonce: number; fields: Record<string, unknown> } | null {
	if (raw === null) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
	const fields = Object.fromEntries(Object.entries(parsed));
	return isUsableNonce(fields.nonce) ? { nonce: fields.nonce, fields } : null;
}

function readExchangeNow(options: CrossTabNonceManagerOptions): number | undefined {
	try {
		const exchangeNow = options.readExchangeNow?.();
		return typeof exchangeNow === "number" && Number.isSafeInteger(exchangeNow) && exchangeNow > 0
			? exchangeNow
			: undefined;
	} catch {
		return undefined;
	}
}

function allocateNonce(storage: Storage, key: string, exchangeNow: number | undefined): number {
	const now = Date.now();
	if (!Number.isSafeInteger(now) || now < 0) {
		throw new Error("The local clock cannot produce a safe Hyperliquid nonce.");
	}

	const futureLimit = (exchangeNow ?? now) + MAX_FUTURE_NONCE_MS;
	const stored = readPersistedNonce(storage.getItem(key));
	const previous = exchangeNow !== undefined && stored && stored.nonce >= futureLimit ? null : stored;
	const nonce = Math.max(now, (previous?.nonce ?? -1) + 1);
	if (!Number.isSafeInteger(nonce) || nonce >= futureLimit) {
		throw new Error("The persisted Hyperliquid nonce is outside the allowed future window.");
	}

	const serialized = JSON.stringify(
		previous
			? { ...previous.fields, nonce }
			: ({ version: NONCE_RECORD_VERSION, nonce } satisfies PersistedNonceRecord),
	);
	storage.setItem(key, serialized);
	if (storage.getItem(key) !== serialized) {
		throw new Error("The persisted Hyperliquid nonce failed readback verification.");
	}
	return nonce;
}

export function createCrossTabNonceManager(
	env: HyperliquidEnv,
	options: CrossTabNonceManagerOptions = {},
): (address: string) => Promise<number> {
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
			allocateNonce(storage, getStorageKey(env, normalizedAddress), readExchangeNow(options)),
		);
	};
}
