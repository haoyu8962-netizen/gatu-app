// @vitest-environment jsdom

import { createCrossTabNonceManager } from "@sairn/hl-react/internal/exchange/cross-tab-nonce-manager";
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

	it.each([
		["unparseable JSON", "{not json"],
		["a non-numeric nonce", '{"version":1,"nonce":"not-a-number"}'],
		["a negative nonce", '{"version":1,"nonce":-5}'],
		["a fractional nonce", '{"version":1,"nonce":1.5}'],
		["an unsafe nonce", `{"version":1,"nonce":${Number.MAX_SAFE_INTEGER + 2}}`],
		["a missing nonce", '{"version":1}'],
		["a non-object record", "[1800000000000]"],
		["a null record", "null"],
	])("resets a corrupted record holding %s", async (_label, raw) => {
		window.localStorage.setItem(STORAGE_KEY, raw);

		await expect(createCrossTabNonceManager("Mainnet")(SIGNER)).resolves.toBe(NOW);
		expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({ version: 1, nonce: NOW });
	});

	it("never hands two managers the same nonce after resetting a corrupted record", async () => {
		window.localStorage.setItem(STORAGE_KEY, '{"version":1,"nonce":"not-a-number"}');

		await expect(
			Promise.all([createCrossTabNonceManager("Mainnet")(SIGNER), createCrossTabNonceManager("Mainnet")(SIGNER)]),
		).resolves.toEqual([NOW, NOW + 1]);
	});

	it("keeps the floor of a newer record version and writes its other fields back", async () => {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, nonce: NOW + 50, lane: "a" }));

		await expect(createCrossTabNonceManager("Mainnet")(SIGNER)).resolves.toBe(NOW + 51);
		expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({
			version: 2,
			nonce: NOW + 51,
			lane: "a",
		});
	});

	it("fails closed without advancing a nonce outside the official future window", async () => {
		const persisted = JSON.stringify({ version: 1, nonce: NOW + ONE_DAY_MS });
		window.localStorage.setItem(STORAGE_KEY, persisted);

		await expect(createCrossTabNonceManager("Mainnet")(SIGNER)).rejects.toThrow(
			"The persisted Hyperliquid nonce is outside the allowed future window.",
		);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe(persisted);
	});

	it.each([
		["no exchange time", () => undefined],
		["an unusable exchange time", () => Number.NaN],
		[
			"a failing exchange clock",
			() => {
				throw new Error("clock unavailable");
			},
		],
	])("keeps failing closed on a far-future record with %s", async (_label, readExchangeNow) => {
		const persisted = JSON.stringify({ version: 1, nonce: NOW + 2 * ONE_DAY_MS });
		window.localStorage.setItem(STORAGE_KEY, persisted);

		await expect(createCrossTabNonceManager("Mainnet", { readExchangeNow })(SIGNER)).rejects.toThrow(
			"The persisted Hyperliquid nonce is outside the allowed future window.",
		);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe(persisted);
	});

	it("discards a record the exchange could never have accepted once the clock is back", async () => {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, nonce: NOW + 400 * ONE_DAY_MS }));
		const manager = createCrossTabNonceManager("Mainnet", { readExchangeNow: () => NOW });

		await expect(manager(SIGNER)).resolves.toBe(NOW);
		await expect(manager(SIGNER)).resolves.toBe(NOW + 1);
		expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({ version: 1, nonce: NOW + 1 });
	});

	it("keeps counting from a record ahead of the clock that is still inside the exchange window", async () => {
		const ahead = NOW + 20 * 60 * 60 * 1_000;
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, nonce: ahead }));

		await expect(createCrossTabNonceManager("Mainnet", { readExchangeNow: () => NOW })(SIGNER)).resolves.toBe(
			ahead + 1,
		);
	});

	it("measures the window from the exchange time when the device clock runs behind", async () => {
		const exchangeNow = NOW + 2 * 60 * 60 * 1_000;
		const persisted = NOW + ONE_DAY_MS + 60 * 60 * 1_000;
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, nonce: persisted }));

		await expect(createCrossTabNonceManager("Mainnet", { readExchangeNow: () => exchangeNow })(SIGNER)).resolves.toBe(
			persisted + 1,
		);
	});

	it("refuses a nonce from a device clock beyond the exchange window instead of recording it", async () => {
		await expect(
			createCrossTabNonceManager("Mainnet", { readExchangeNow: () => NOW - 2 * ONE_DAY_MS })(SIGNER),
		).rejects.toThrow("The persisted Hyperliquid nonce is outside the allowed future window.");
		expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
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
