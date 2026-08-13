import { useSyncExternalStore } from "react";
import { isAddress } from "viem";
import type { HyperliquidEnv } from "@/lib/hyperliquid";

export const FUNDS_ACTION_MARKER_STORAGE_KEY = "gatu.funds_action.pending.v1";
export const FUNDS_ACTION_MARKER_LOCK_NAME = "gatu_funds_action_marker_storage_v1";

export type FundsActionMethod = "vaultTransfer" | "cDeposit" | "cWithdraw" | "tokenDelegate";
export type FundsActionDirection = "deposit" | "withdraw" | "delegate" | "undelegate";
export type FundsActionAsset = "USDC" | "HYPE";

/**
 * Public history evidence captured from a fresh authoritative read immediately
 * before the SDK signing boundary. Reconciliation accepts only hashes that were
 * absent from this snapshot; client wall-clock time is never the sole boundary.
 */
export interface FundsActionHistoryBaseline {
	version: 1;
	observedAt: number;
	hashes: readonly string[];
}

export type FundsActionStateBaseline =
	| {
			kind: "vault";
			vaultEquity: string;
			withdrawable: string;
	  }
	| {
			kind: "staking";
			spotAvailable: string;
			delegated: string;
			undelegated: string;
			totalPendingWithdrawal: string;
			nPendingWithdrawals: number;
			targetDelegation: string;
	  };

export interface FundsActionReference {
	id: string;
	env: HyperliquidEnv;
	owner: `0x${string}`;
	method: FundsActionMethod;
	target: string;
	direction: FundsActionDirection;
	displayAmount: string;
	atomicAmount: string;
	atomicDecimals: 6 | 8;
	asset: FundsActionAsset;
	startedAt: number;
	identityEpoch: string;
	/** Missing only on a legacy v1 marker. Legacy markers always fail closed. */
	historyBaseline?: FundsActionHistoryBaseline;
	/** Missing only on a legacy v1 marker. Legacy markers always fail closed. */
	stateBaseline?: FundsActionStateBaseline;
}

export interface CreateFundsActionReferenceInput
	extends Omit<FundsActionReference, "id" | "startedAt" | "historyBaseline" | "stateBaseline"> {
	startedAt?: number;
	historyBaseline: FundsActionHistoryBaseline;
	stateBaseline: FundsActionStateBaseline;
}

const EMPTY_MARKERS: readonly FundsActionReference[] = [];
export type FundsActionMarkerStorageSnapshot =
	| { status: "available"; markers: readonly FundsActionReference[] }
	| { status: "corrupt" };
const EMPTY_STORAGE_SNAPSHOT: FundsActionMarkerStorageSnapshot = { status: "available", markers: EMPTY_MARKERS };
let markerSnapshot: readonly FundsActionReference[] = EMPTY_MARKERS;
let storageSnapshot: FundsActionMarkerStorageSnapshot = EMPTY_STORAGE_SNAPSHOT;
let snapshotLoaded = false;
const listeners = new Set<() => void>();
let storageListenerAttached = false;
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/u;
const UNSIGNED_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u;

function isSafeTimestamp(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isHistoryBaseline(value: unknown): value is FundsActionHistoryBaseline {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<FundsActionHistoryBaseline>;
	return (
		candidate.version === 1 &&
		isSafeTimestamp(candidate.observedAt) &&
		Array.isArray(candidate.hashes) &&
		candidate.hashes.every((hash) => typeof hash === "string" && HASH_PATTERN.test(hash)) &&
		new Set(candidate.hashes.map((hash) => hash.toLowerCase())).size === candidate.hashes.length
	);
}

function isUnsignedDecimalValue(value: unknown): value is string {
	return typeof value === "string" && UNSIGNED_DECIMAL_PATTERN.test(value);
}

function isStateBaseline(value: unknown): value is FundsActionStateBaseline {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<FundsActionStateBaseline> & Record<string, unknown>;
	if (candidate.kind === "vault") {
		return isUnsignedDecimalValue(candidate.vaultEquity) && isUnsignedDecimalValue(candidate.withdrawable);
	}
	if (candidate.kind !== "staking") return false;
	return (
		isUnsignedDecimalValue(candidate.spotAvailable) &&
		isUnsignedDecimalValue(candidate.delegated) &&
		isUnsignedDecimalValue(candidate.undelegated) &&
		isUnsignedDecimalValue(candidate.totalPendingWithdrawal) &&
		typeof candidate.nPendingWithdrawals === "number" &&
		Number.isSafeInteger(candidate.nPendingWithdrawals) &&
		candidate.nPendingWithdrawals >= 0 &&
		isUnsignedDecimalValue(candidate.targetDelegation)
	);
}

function isFundsActionReference(value: unknown): value is FundsActionReference {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<FundsActionReference>;
	return (
		typeof candidate.id === "string" &&
		candidate.id.length > 0 &&
		(candidate.env === "Mainnet" || candidate.env === "Testnet") &&
		typeof candidate.owner === "string" &&
		isAddress(candidate.owner) &&
		(candidate.method === "vaultTransfer" ||
			candidate.method === "cDeposit" ||
			candidate.method === "cWithdraw" ||
			candidate.method === "tokenDelegate") &&
		typeof candidate.target === "string" &&
		candidate.target.length > 0 &&
		(candidate.direction === "deposit" ||
			candidate.direction === "withdraw" ||
			candidate.direction === "delegate" ||
			candidate.direction === "undelegate") &&
		typeof candidate.displayAmount === "string" &&
		/^\d+(?:\.\d+)?$/.test(candidate.displayAmount) &&
		typeof candidate.atomicAmount === "string" &&
		/^\d+$/.test(candidate.atomicAmount) &&
		(candidate.atomicDecimals === 6 || candidate.atomicDecimals === 8) &&
		(candidate.asset === "USDC" || candidate.asset === "HYPE") &&
		typeof candidate.startedAt === "number" &&
		Number.isSafeInteger(candidate.startedAt) &&
		candidate.startedAt > 0 &&
		typeof candidate.identityEpoch === "string" &&
		candidate.identityEpoch.length > 0 &&
		(candidate.historyBaseline === undefined || isHistoryBaseline(candidate.historyBaseline)) &&
		(candidate.stateBaseline === undefined || isStateBaseline(candidate.stateBaseline)) &&
		((candidate.historyBaseline === undefined && candidate.stateBaseline === undefined) ||
			(candidate.historyBaseline !== undefined && candidate.stateBaseline !== undefined))
	);
}

function readMarkerStorageSnapshot(): FundsActionMarkerStorageSnapshot {
	if (typeof window === "undefined") return EMPTY_STORAGE_SNAPSHOT;
	try {
		const raw = window.localStorage.getItem(FUNDS_ACTION_MARKER_STORAGE_KEY);
		if (raw === null) return EMPTY_STORAGE_SNAPSHOT;
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed) || !parsed.every(isFundsActionReference)) return { status: "corrupt" };
		return { status: "available", markers: parsed };
	} catch {
		return { status: "corrupt" };
	}
}

function setSnapshots(next: FundsActionMarkerStorageSnapshot) {
	storageSnapshot = next;
	markerSnapshot = next.status === "available" ? next.markers : EMPTY_MARKERS;
}

function loadMarkerSnapshot(): readonly FundsActionReference[] {
	if (!snapshotLoaded) {
		setSnapshots(readMarkerStorageSnapshot());
		snapshotLoaded = true;
	}
	return markerSnapshot;
}

function emitMarkers(next: readonly FundsActionReference[]) {
	setSnapshots({ status: "available", markers: next });
	snapshotLoaded = true;
	for (const listener of listeners) listener();
}

function emitCorruptStorage() {
	setSnapshots({ status: "corrupt" });
	snapshotLoaded = true;
	for (const listener of listeners) listener();
}

function persistMarkers(next: readonly FundsActionReference[]): boolean {
	if (typeof window === "undefined") return false;
	try {
		if (next.length === 0) window.localStorage.removeItem(FUNDS_ACTION_MARKER_STORAGE_KEY);
		else window.localStorage.setItem(FUNDS_ACTION_MARKER_STORAGE_KEY, JSON.stringify(next));
		emitMarkers(next);
		return true;
	} catch {
		return false;
	}
}

function handleStorage(event: StorageEvent) {
	if (event.storageArea !== window.localStorage || event.key !== FUNDS_ACTION_MARKER_STORAGE_KEY) return;
	const next = readMarkerStorageSnapshot();
	if (next.status === "available") emitMarkers(next.markers);
	else emitCorruptStorage();
}

function subscribeMarkers(listener: () => void): () => void {
	const freshSnapshot = readMarkerStorageSnapshot();
	const snapshotChanged = JSON.stringify(freshSnapshot) !== JSON.stringify(storageSnapshot);
	setSnapshots(freshSnapshot);
	snapshotLoaded = true;
	listeners.add(listener);
	if (!storageListenerAttached && typeof window !== "undefined") {
		window.addEventListener("storage", handleStorage);
		storageListenerAttached = true;
	}
	// Close the render-to-subscribe race and refresh changes that occurred while
	// no component was listening for cross-tab storage events.
	if (snapshotChanged) listener();
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0 && storageListenerAttached && typeof window !== "undefined") {
			window.removeEventListener("storage", handleStorage);
			storageListenerAttached = false;
		}
	};
}

export function createFundsActionReference(input: CreateFundsActionReferenceInput): FundsActionReference {
	const startedAt = input.startedAt ?? Date.now();
	const nonce =
		typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
			? crypto.randomUUID()
			: `${typeof performance === "undefined" ? Date.now() : performance.now()}:${Math.random().toString(36).slice(2)}`;
	const id = `${input.env}:${input.owner.toLocaleLowerCase()}:${input.method}:${startedAt}:${nonce}`;
	return { ...input, id, startedAt };
}

export function useFundsActionMarkers(): readonly FundsActionReference[] {
	return useSyncExternalStore(subscribeMarkers, loadMarkerSnapshot, () => EMPTY_MARKERS);
}

export function getFundsActionMarkers(): readonly FundsActionReference[] {
	const snapshot = readMarkerStorageSnapshot();
	return snapshot.status === "available" ? snapshot.markers : EMPTY_MARKERS;
}

export function getFundsActionMarkerStorageSnapshot(): FundsActionMarkerStorageSnapshot {
	return readMarkerStorageSnapshot();
}

export function useFundsActionMarkerStorageStatus(): FundsActionMarkerStorageSnapshot["status"] {
	return useSyncExternalStore(
		subscribeMarkers,
		() => storageSnapshot.status,
		() => "available",
	);
}

/** Compares every persisted public field, including both reconciliation baselines. */
export function fundsActionReferencesEqual(left: FundsActionReference, right: FundsActionReference): boolean {
	return (
		left.id === right.id &&
		left.env === right.env &&
		left.owner.toLowerCase() === right.owner.toLowerCase() &&
		left.method === right.method &&
		left.target.toLowerCase() === right.target.toLowerCase() &&
		left.direction === right.direction &&
		left.displayAmount === right.displayAmount &&
		left.atomicAmount === right.atomicAmount &&
		left.atomicDecimals === right.atomicDecimals &&
		left.asset === right.asset &&
		left.startedAt === right.startedAt &&
		left.identityEpoch === right.identityEpoch &&
		JSON.stringify(left.historyBaseline) === JSON.stringify(right.historyBaseline) &&
		JSON.stringify(left.stateBaseline) === JSON.stringify(right.stateBaseline)
	);
}

export function findPendingFundsAction(env: HyperliquidEnv, owner: string): FundsActionReference | null {
	const normalizedOwner = owner.toLocaleLowerCase();
	const snapshot = readMarkerStorageSnapshot();
	if (snapshot.status !== "available") return null;
	return (
		snapshot.markers.find((marker) => marker.env === env && marker.owner.toLocaleLowerCase() === normalizedOwner) ??
		null
	);
}

export function persistFundsActionMarker(reference: FundsActionReference): boolean {
	if (!isFundsActionReference(reference)) return false;
	const snapshot = readMarkerStorageSnapshot();
	if (snapshot.status !== "available") return false;
	const markers = snapshot.markers;
	const conflicting = markers.find(
		(marker) =>
			marker.id !== reference.id &&
			marker.env === reference.env &&
			marker.owner.toLocaleLowerCase() === reference.owner.toLocaleLowerCase(),
	);
	if (conflicting) return false;
	const next = [...markers.filter((marker) => marker.id !== reference.id), reference];
	return persistMarkers(next);
}

/**
 * Atomically claims the one pending funds-operation slot for an environment
 * and owner across browser tabs. Financial controllers must use this helper
 * instead of the synchronous persistence helper before dispatching a write.
 */
export async function acquireFundsActionMarker(reference: FundsActionReference): Promise<boolean> {
	if (!isFundsActionReference(reference) || typeof navigator === "undefined" || !navigator.locks) return false;
	try {
		return await navigator.locks.request(FUNDS_ACTION_MARKER_LOCK_NAME, { mode: "exclusive" }, async (lock) => {
			if (!lock) return false;
			const snapshot = readMarkerStorageSnapshot();
			if (snapshot.status !== "available") return false;
			const markers = snapshot.markers;
			const conflicting = markers.find(
				(marker) =>
					marker.env === reference.env && marker.owner.toLocaleLowerCase() === reference.owner.toLocaleLowerCase(),
			);
			if (conflicting) return false;
			return persistMarkers([...markers.filter((marker) => marker.id !== reference.id), reference]);
		});
	} catch {
		return false;
	}
}

export function removeFundsActionMarker(id: string): boolean {
	const snapshot = readMarkerStorageSnapshot();
	if (snapshot.status !== "available") return false;
	const markers = snapshot.markers;
	const next = markers.filter((marker) => marker.id !== id);
	if (next.length === markers.length) {
		emitMarkers(markers);
		return true;
	}
	return persistMarkers(next);
}

/** Recovery-only destructive escape hatch for unreadable storage. */
export async function clearCorruptFundsActionMarkerStorageSafely(): Promise<boolean> {
	if (typeof navigator === "undefined" || !navigator.locks || typeof window === "undefined") return false;
	try {
		return await navigator.locks.request(FUNDS_ACTION_MARKER_LOCK_NAME, { mode: "exclusive" }, async (lock) => {
			if (!lock || readMarkerStorageSnapshot().status !== "corrupt") return false;
			try {
				window.localStorage.removeItem(FUNDS_ACTION_MARKER_STORAGE_KEY);
				emitMarkers(EMPTY_MARKERS);
				return true;
			} catch {
				emitCorruptStorage();
				return false;
			}
		});
	} catch {
		return false;
	}
}

export async function removeFundsActionMarkerSafely(id: string): Promise<boolean> {
	if (typeof navigator === "undefined" || !navigator.locks) return false;
	try {
		return await navigator.locks.request(FUNDS_ACTION_MARKER_LOCK_NAME, { mode: "exclusive" }, async (lock) => {
			if (!lock) return false;
			return removeFundsActionMarker(id);
		});
	} catch {
		return false;
	}
}

export function clearFundsActionMarkersForTests() {
	if (typeof window !== "undefined") window.localStorage.removeItem(FUNDS_ACTION_MARKER_STORAGE_KEY);
	emitMarkers(EMPTY_MARKERS);
}
