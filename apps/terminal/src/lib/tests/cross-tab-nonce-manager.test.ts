// @vitest-environment jsdom

import { createCrossTabNonceManager } from "@gatu/hl-react/internal/exchange/cross-tab-nonce-manager";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SIGNER = "0x1111111111111111111111111111111111111111";
const NOW = 1_800_000_000_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1_000;
const STORAGE_KEY = `hyperliquid_exchange_nonce_Mainnet_${SIGNER}`;

function installExclusiveLockManager() {
	const queues = new Map<string, Promise<void>>();
	const manager = {
		async request<T>(
			name: string,
			optionsOrCallback: LockOptions | ((lock: Lock | null) => T | PromiseLike<T>),
			maybeCallback?: (lock: Lock | null) => T | PromiseLike<T>,
		): Promise<T> {
			const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
			if (!callback) throw new Error("Missing lock callback");

			const previous = queues.get(name) ?? Promise.resolve();
			let release = () => {};
			const current = new Promise<void>((resolve) => {
				release = resolve;
			});
			queues.set(
				name,
				previous.then(() => current),
			);
			await previous;
			try {
				return await callback({ name, mode: "exclusive" } as Lock);
			} finally {
				release();
			}
		},
	} as unknown as LockManager;

	Object.defineProperty(window.navigator, "locks", {
		configurable: true,
		value: manager,
	});
}

describe("cross-tab Hyperliquid nonce manager", () => {
	beforeEach(() => {
		window.localStorage.clear();
		installExclusiveLockManager();
		vi.spyOn(Date, "now").mockReturnValue(NOW);
	});

	afterEach(() => {
		window.localStorage.clear();
		vi.restoreAllMocks();
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: undefined,
		});
	});

	it("serializes concurrent allocations from independent manager instances", async () => {
		const firstManager = createCrossTabNonceManager("Mainnet");
		const secondManager = createCrossTabNonceManager("Mainnet");

		await expect(Promise.all([firstManager(SIGNER), secondManager(SIGNER)])).resolves.toEqual([NOW, NOW + 1]);
		expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({
			version: 1,
			nonce: NOW + 1,
		});
	});

	it("fails closed without replacing malformed persisted state", async () => {
		window.localStorage.setItem(STORAGE_KEY, '{"version":1,"nonce":"not-a-number"}');

		await expect(createCrossTabNonceManager("Mainnet")(SIGNER)).rejects.toThrow(
			"The persisted Hyperliquid nonce state is corrupted.",
		);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe('{"version":1,"nonce":"not-a-number"}');
	});

	it("fails closed without advancing a nonce outside the official future window", async () => {
		const persisted = JSON.stringify({ version: 1, nonce: NOW + ONE_DAY_MS });
		window.localStorage.setItem(STORAGE_KEY, persisted);

		await expect(createCrossTabNonceManager("Mainnet")(SIGNER)).rejects.toThrow(
			"The persisted Hyperliquid nonce is outside the allowed future window.",
		);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe(persisted);
	});

	it("fails closed when the Web Locks API is unavailable", async () => {
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: undefined,
		});

		await expect(createCrossTabNonceManager("Mainnet")(SIGNER)).rejects.toThrow(
			"Cross-tab Hyperliquid nonce coordination is unavailable.",
		);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
	});
});
