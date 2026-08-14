// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	acquireFundsActionMarker,
	clearCorruptFundsActionMarkerStorageSafely,
	clearFundsActionMarkersForTests,
	createFundsActionReference,
	FUNDS_ACTION_MARKER_STORAGE_KEY,
	findPendingFundsAction,
	getFundsActionMarkerStorageSnapshot,
	getFundsActionMarkers,
	persistFundsActionMarker,
	removeFundsActionMarker,
	removeFundsActionMarkerSafely,
} from "@/components/funds-action/funds-action-marker";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const TARGET = "0x2222222222222222222222222222222222222222" as const;
const STAKING_BASELINE = {
	kind: "staking",
	spotAvailable: "100",
	delegated: "0",
	undelegated: "0",
	totalPendingWithdrawal: "0",
	nPendingWithdrawals: 0,
	targetDelegation: "0",
} as const;

function installExclusiveLockManager() {
	const tails = new Map<string, Promise<void>>();
	const manager = {
		async request<T>(
			name: string,
			_options: LockOptions,
			callback: (lock: Lock | null) => T | PromiseLike<T>,
		): Promise<T> {
			const previous = tails.get(name) ?? Promise.resolve();
			let release = () => {};
			const current = new Promise<void>((resolve) => {
				release = resolve;
			});
			tails.set(
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
	Object.defineProperty(window.navigator, "locks", { configurable: true, value: manager });
}

function reference(overrides = {}) {
	return createFundsActionReference({
		env: "Mainnet",
		owner: OWNER,
		method: "vaultTransfer",
		target: TARGET,
		direction: "deposit",
		displayAmount: "12.5",
		atomicAmount: "12500000",
		atomicDecimals: 6,
		asset: "USDC",
		startedAt: 1720000000000,
		identityEpoch: "Mainnet:owner:1",
		historyBaseline: { version: 1, observedAt: 1720000000000, hashes: [] },
		stateBaseline: { kind: "vault", vaultEquity: "0", withdrawable: "100" },
		...overrides,
	});
}

describe("funds action marker", () => {
	beforeEach(() => {
		clearFundsActionMarkersForTests();
		installExclusiveLockManager();
	});

	afterEach(() => {
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
	});

	it("persists only the public operation tuple", () => {
		const marker = reference();
		expect(persistFundsActionMarker(marker)).toBe(true);
		expect(findPendingFundsAction("Mainnet", OWNER.toUpperCase())).toEqual(marker);
		expect(window.localStorage.getItem(FUNDS_ACTION_MARKER_STORAGE_KEY)).toBe(JSON.stringify([marker]));
		expect(window.localStorage.getItem(FUNDS_ACTION_MARKER_STORAGE_KEY)).not.toContain("privateKey");
	});

	it.each([
		{
			method: "vaultTransfer",
			target: TARGET,
			direction: "withdraw",
			atomicDecimals: 6,
			asset: "USDC",
			stateBaseline: { kind: "vault", vaultEquity: "100", withdrawable: "100" },
		},
		{
			method: "cDeposit",
			target: "staking",
			direction: "deposit",
			atomicDecimals: 8,
			asset: "HYPE",
			stateBaseline: STAKING_BASELINE,
		},
		{
			method: "cWithdraw",
			target: "staking",
			direction: "withdraw",
			atomicDecimals: 8,
			asset: "HYPE",
			stateBaseline: STAKING_BASELINE,
		},
		{
			method: "tokenDelegate",
			target: TARGET,
			direction: "delegate",
			atomicDecimals: 8,
			asset: "HYPE",
			stateBaseline: STAKING_BASELINE,
		},
		{
			method: "tokenDelegate",
			target: TARGET,
			direction: "undelegate",
			atomicDecimals: 8,
			asset: "HYPE",
			stateBaseline: STAKING_BASELINE,
		},
	])("accepts the valid $method/$direction operation tuple", (overrides) => {
		const marker = reference(overrides);

		expect(persistFundsActionMarker(marker)).toBe(true);
		expect(getFundsActionMarkerStorageSnapshot()).toEqual({ status: "available", markers: [marker] });
	});

	it("refuses to persist a marker with mismatched action semantics", () => {
		const marker = reference({ direction: "delegate" });

		expect(persistFundsActionMarker(marker)).toBe(false);
		expect(getFundsActionMarkerStorageSnapshot()).toEqual({ status: "available", markers: [] });
		expect(window.localStorage.getItem(FUNDS_ACTION_MARKER_STORAGE_KEY)).toBeNull();
	});

	it("blocks a second marker for the same environment and owner", () => {
		expect(persistFundsActionMarker(reference())).toBe(true);
		expect(
			persistFundsActionMarker(reference({ method: "cDeposit", target: "staking", startedAt: 1720000000001 })),
		).toBe(false);
		expect(getFundsActionMarkers()).toHaveLength(1);
	});

	it("atomically lets only one concurrent tab claim an owner and environment", async () => {
		const first = reference();
		const second = reference({ method: "cDeposit", target: "staking", startedAt: 1720000000001 });

		const results = await Promise.all([acquireFundsActionMarker(first), acquireFundsActionMarker(second)]);

		expect(results.filter(Boolean)).toHaveLength(1);
		expect(getFundsActionMarkers()).toHaveLength(1);
	});

	it("preserves concurrent markers for different owners under the shared storage lock", async () => {
		const otherOwner = "0x3333333333333333333333333333333333333333" as const;
		const first = reference();
		const second = reference({ owner: otherOwner, startedAt: 1720000000001 });

		await expect(Promise.all([acquireFundsActionMarker(first), acquireFundsActionMarker(second)])).resolves.toEqual([
			true,
			true,
		]);
		expect(
			getFundsActionMarkers()
				.map((marker) => marker.owner)
				.sort(),
		).toEqual([OWNER, otherOwner].sort());
	});

	it("serializes removal with acquisition so an unrelated marker is never lost", async () => {
		const otherOwner = "0x3333333333333333333333333333333333333333" as const;
		const first = reference();
		const second = reference({ owner: otherOwner, startedAt: 1720000000001 });
		expect(persistFundsActionMarker(first)).toBe(true);

		await expect(
			Promise.all([removeFundsActionMarkerSafely(first.id), acquireFundsActionMarker(second)]),
		).resolves.toEqual([true, true]);
		expect(getFundsActionMarkers()).toEqual([second]);
	});

	it("uses collision-resistant ids even for otherwise identical same-millisecond references", () => {
		expect(reference().id).not.toBe(reference().id);
	});

	it("fails closed when cross-tab marker locking is unavailable", async () => {
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });

		await expect(acquireFundsActionMarker(reference())).resolves.toBe(false);
		expect(getFundsActionMarkers()).toEqual([]);
	});

	it("isolates markers by environment and owner", () => {
		expect(persistFundsActionMarker(reference())).toBe(true);
		expect(
			persistFundsActionMarker(
				reference({ env: "Testnet", identityEpoch: "Testnet:owner:1", startedAt: 1720000000001 }),
			),
		).toBe(true);
		expect(getFundsActionMarkers()).toHaveLength(2);
	});

	it("requires explicit removal and never expires by time", () => {
		const marker = reference({ startedAt: 1 });
		expect(persistFundsActionMarker(marker)).toBe(true);
		expect(findPendingFundsAction("Mainnet", OWNER)).toEqual(marker);
		expect(removeFundsActionMarker(marker.id)).toBe(true);
		expect(findPendingFundsAction("Mainnet", OWNER)).toBeNull();
	});

	it("keeps legacy markers readable but without proof that can auto-reconcile", () => {
		const marker = reference();
		const { historyBaseline: _history, stateBaseline: _state, ...legacy } = marker;
		window.localStorage.setItem(FUNDS_ACTION_MARKER_STORAGE_KEY, JSON.stringify([legacy]));

		expect(getFundsActionMarkers()).toEqual([legacy]);
		expect(getFundsActionMarkers()[0]?.historyBaseline).toBeUndefined();
	});

	it("keeps a semantically valid legacy staking marker readable", () => {
		const marker = reference({
			method: "tokenDelegate",
			target: TARGET,
			direction: "undelegate",
			atomicDecimals: 8,
			asset: "HYPE",
			stateBaseline: STAKING_BASELINE,
		});
		const { historyBaseline: _history, stateBaseline: _state, ...legacy } = marker;
		window.localStorage.setItem(FUNDS_ACTION_MARKER_STORAGE_KEY, JSON.stringify([legacy]));

		expect(getFundsActionMarkerStorageSnapshot()).toEqual({ status: "available", markers: [legacy] });
	});

	it.each([
		{ method: "vaultTransfer", target: "staking" },
		{ method: "vaultTransfer", target: "0x0000000000000000000000000000000000000000" },
		{ method: "vaultTransfer", direction: "delegate" },
		{ method: "vaultTransfer", asset: "HYPE" },
		{ method: "vaultTransfer", atomicDecimals: 8 },
		{ method: "vaultTransfer", stateBaseline: STAKING_BASELINE },
		{
			method: "cDeposit",
			target: TARGET,
			direction: "deposit",
			asset: "HYPE",
			atomicDecimals: 8,
			stateBaseline: STAKING_BASELINE,
		},
		{
			method: "cDeposit",
			target: "staking",
			direction: "withdraw",
			asset: "HYPE",
			atomicDecimals: 8,
			stateBaseline: STAKING_BASELINE,
		},
		{
			method: "cWithdraw",
			target: "staking",
			direction: "deposit",
			asset: "HYPE",
			atomicDecimals: 8,
			stateBaseline: STAKING_BASELINE,
		},
		{
			method: "cWithdraw",
			target: "staking",
			direction: "withdraw",
			asset: "USDC",
			atomicDecimals: 8,
			stateBaseline: STAKING_BASELINE,
		},
		{
			method: "cWithdraw",
			target: "staking",
			direction: "withdraw",
			asset: "HYPE",
			atomicDecimals: 6,
			stateBaseline: STAKING_BASELINE,
		},
		{
			method: "cWithdraw",
			target: "staking",
			direction: "withdraw",
			asset: "HYPE",
			atomicDecimals: 8,
			stateBaseline: { kind: "vault", vaultEquity: "0", withdrawable: "100" },
		},
		{
			method: "tokenDelegate",
			target: "staking",
			direction: "delegate",
			asset: "HYPE",
			atomicDecimals: 8,
			stateBaseline: STAKING_BASELINE,
		},
		{
			method: "tokenDelegate",
			target: "0x0000000000000000000000000000000000000000",
			direction: "delegate",
			asset: "HYPE",
			atomicDecimals: 8,
			stateBaseline: STAKING_BASELINE,
		},
		{
			method: "tokenDelegate",
			target: TARGET,
			direction: "deposit",
			asset: "HYPE",
			atomicDecimals: 8,
			stateBaseline: STAKING_BASELINE,
		},
	])("treats a stored marker with mismatched action semantics as corrupt", (overrides) => {
		const marker = reference(overrides);
		window.localStorage.setItem(FUNDS_ACTION_MARKER_STORAGE_KEY, JSON.stringify([marker]));

		expect(getFundsActionMarkerStorageSnapshot()).toEqual({ status: "corrupt" });
		expect(getFundsActionMarkers()).toEqual([]);
		expect(findPendingFundsAction("Mainnet", OWNER)).toBeNull();
	});

	it("rejects invalid legacy action semantics without overwriting storage", () => {
		const marker = reference({
			method: "cDeposit",
			target: "staking",
			direction: "withdraw",
			atomicDecimals: 8,
			asset: "HYPE",
			stateBaseline: STAKING_BASELINE,
		});
		const { historyBaseline: _history, stateBaseline: _state, ...legacy } = marker;
		const raw = JSON.stringify([legacy]);
		window.localStorage.setItem(FUNDS_ACTION_MARKER_STORAGE_KEY, raw);

		expect(getFundsActionMarkerStorageSnapshot()).toEqual({ status: "corrupt" });
		expect(persistFundsActionMarker(reference())).toBe(false);
		expect(window.localStorage.getItem(FUNDS_ACTION_MARKER_STORAGE_KEY)).toBe(raw);
	});

	it("rejects a partially upgraded or malformed baseline", () => {
		const marker = reference();
		const { stateBaseline: _state, ...partial } = marker;
		window.localStorage.setItem(FUNDS_ACTION_MARKER_STORAGE_KEY, JSON.stringify([partial]));
		expect(getFundsActionMarkers()).toEqual([]);

		window.localStorage.setItem(
			FUNDS_ACTION_MARKER_STORAGE_KEY,
			JSON.stringify([{ ...marker, historyBaseline: { ...marker.historyBaseline, hashes: ["not-a-hash"] } }]),
		);
		expect(getFundsActionMarkers()).toEqual([]);
	});

	it("distinguishes corrupt storage and refuses to overwrite it", async () => {
		window.localStorage.setItem(FUNDS_ACTION_MARKER_STORAGE_KEY, "{not-json");

		expect(getFundsActionMarkerStorageSnapshot()).toEqual({ status: "corrupt" });
		expect(findPendingFundsAction("Mainnet", OWNER)).toBeNull();
		expect(persistFundsActionMarker(reference())).toBe(false);
		await expect(acquireFundsActionMarker(reference())).resolves.toBe(false);
		expect(window.localStorage.getItem(FUNDS_ACTION_MARKER_STORAGE_KEY)).toBe("{not-json");
	});

	it("treats duplicate marker ids as corrupt at the storage array boundary", () => {
		const first = reference();
		const second = {
			...reference({ owner: "0x3333333333333333333333333333333333333333", startedAt: 1720000000001 }),
			id: first.id,
		};
		const raw = JSON.stringify([first, second]);
		window.localStorage.setItem(FUNDS_ACTION_MARKER_STORAGE_KEY, raw);

		expect(getFundsActionMarkerStorageSnapshot()).toEqual({ status: "corrupt" });
		expect(persistFundsActionMarker(reference())).toBe(false);
		expect(window.localStorage.getItem(FUNDS_ACTION_MARKER_STORAGE_KEY)).toBe(raw);
	});

	it("treats multiple markers for one environment and owner as corrupt", () => {
		const raw = JSON.stringify([reference(), reference({ startedAt: 1720000000001 })]);
		window.localStorage.setItem(FUNDS_ACTION_MARKER_STORAGE_KEY, raw);

		expect(getFundsActionMarkerStorageSnapshot()).toEqual({ status: "corrupt" });
		expect(findPendingFundsAction("Mainnet", OWNER)).toBeNull();
		expect(removeFundsActionMarker("missing")).toBe(false);
		expect(window.localStorage.getItem(FUNDS_ACTION_MARKER_STORAGE_KEY)).toBe(raw);
	});

	it("requires the recovery-only destructive clear before corrupt storage unlocks", async () => {
		window.localStorage.setItem(FUNDS_ACTION_MARKER_STORAGE_KEY, JSON.stringify([reference(), { broken: true }]));
		expect(getFundsActionMarkerStorageSnapshot()).toEqual({ status: "corrupt" });

		await expect(clearCorruptFundsActionMarkerStorageSafely()).resolves.toBe(true);
		expect(getFundsActionMarkerStorageSnapshot()).toEqual({ status: "available", markers: [] });
		await expect(acquireFundsActionMarker(reference())).resolves.toBe(true);
	});

	it("fails closed when storage reads throw", async () => {
		const prototype = Object.getPrototypeOf(window.localStorage) as Storage;
		const original = prototype.getItem;
		prototype.getItem = () => {
			throw new Error("storage denied");
		};
		try {
			expect(getFundsActionMarkerStorageSnapshot()).toEqual({ status: "corrupt" });
			await expect(acquireFundsActionMarker(reference())).resolves.toBe(false);
		} finally {
			prototype.getItem = original;
		}
	});
});
