import { ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS } from "@/domain/trade/order-tracking";

const ORDER_ASSET_LOCK_PREFIX = "gatu-order-asset-v1";
const ORDER_ASSET_RESERVATION_PREFIX = "gatu-order-asset-reservations-v1";
const ORDER_ASSET_RESERVATION_VERSION = 1;
const activeLeases = new WeakSet<object>();

export interface OrderAssetLockIdentity {
	env: "Mainnet" | "Testnet";
	owner: string;
	assetIds: readonly number[];
}

export interface OrderAssetLockLease extends OrderAssetLockIdentity {}

export interface OrderAssetReservationIntent {
	intentKey: string;
	exclusiveAssetLock: boolean;
	isRiskReducing: boolean;
}

export interface OrderAssetReservationInput extends OrderAssetReservationIntent {
	submissionId: string;
	createdAt: number;
	expiresAt?: number;
}

interface OrderAssetReservation extends OrderAssetReservationInput {
	expiresAt: number;
}

interface PersistedOrderAssetReservations {
	version: typeof ORDER_ASSET_RESERVATION_VERSION;
	reservations: OrderAssetReservation[];
}

export type OrderAssetLockResult<T> = { supported: true; value: T } | { supported: false };
export type AvailableOrderAssetLockResult<T> =
	| { supported: true; acquired: true; value: T }
	| { supported: true; acquired: false }
	| { supported: false };
export type OrderAssetReservationState = "clear" | "conflict" | "unavailable";

export async function runWithOrderAssetLocks<T>(
	identity: OrderAssetLockIdentity,
	task: (lease: OrderAssetLockLease) => Promise<T>,
): Promise<OrderAssetLockResult<T>> {
	const lockManager = typeof navigator === "undefined" ? undefined : navigator.locks;
	if (!lockManager || typeof lockManager.request !== "function") return { supported: false };

	const normalizedIdentity = normalizeIdentity(identity);
	const value = await acquireLockAtIndex(lockManager, normalizedIdentity, 0, async () => {
		const lease: OrderAssetLockLease = normalizedIdentity;
		activeLeases.add(lease);
		try {
			return await task(lease);
		} finally {
			activeLeases.delete(lease);
		}
	});
	return { supported: true, value };
}

export async function runWithAvailableOrderAssetLocks<T>(
	identity: OrderAssetLockIdentity,
	task: (lease: OrderAssetLockLease) => Promise<T>,
): Promise<AvailableOrderAssetLockResult<T>> {
	const lockManager = typeof navigator === "undefined" ? undefined : navigator.locks;
	if (!lockManager || typeof lockManager.request !== "function") return { supported: false };

	const normalizedIdentity = normalizeIdentity(identity);
	const result = await acquireAvailableLockAtIndex(lockManager, normalizedIdentity, 0, async () => {
		const lease: OrderAssetLockLease = normalizedIdentity;
		activeLeases.add(lease);
		try {
			return await task(lease);
		} finally {
			activeLeases.delete(lease);
		}
	});
	if (!result.acquired) return { supported: true, acquired: false };
	return { supported: true, acquired: true, value: result.value };
}

export function doesOrderAssetLockLeaseCover(
	lease: OrderAssetLockLease | undefined,
	identity: OrderAssetLockIdentity,
): lease is OrderAssetLockLease {
	if (!lease || !activeLeases.has(lease)) return false;
	const normalizedIdentity = normalizeIdentity(identity);
	return (
		lease.env === normalizedIdentity.env &&
		lease.owner === normalizedIdentity.owner &&
		normalizedIdentity.assetIds.every((assetId) => lease.assetIds.includes(assetId))
	);
}

export function getOrderAssetReservationState(
	lease: OrderAssetLockLease,
	intent: OrderAssetReservationIntent,
): OrderAssetReservationState {
	if (!activeLeases.has(lease) || typeof window === "undefined") return "unavailable";

	try {
		const reservations = readActiveReservations(lease, Date.now());
		if (!reservations) return "unavailable";
		return reservations.some(
			(reservation) =>
				reservation.intentKey === intent.intentKey ||
				reservation.exclusiveAssetLock ||
				intent.exclusiveAssetLock ||
				!intent.isRiskReducing,
		)
			? "conflict"
			: "clear";
	} catch {
		return "unavailable";
	}
}

export function reserveOrderAssets(lease: OrderAssetLockLease, input: OrderAssetReservationInput): boolean {
	if (!activeLeases.has(lease) || typeof window === "undefined") return false;
	const reservation: OrderAssetReservation = {
		...input,
		expiresAt: input.expiresAt ?? input.createdAt + ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS,
	};

	try {
		for (const assetId of lease.assetIds) {
			const key = getOrderAssetReservationKey(lease, assetId);
			const current = readReservationsForKey(key, Date.now());
			if (!current) throw new Error("Invalid order asset reservation state");
			const next = [...current.filter((entry) => entry.submissionId !== input.submissionId), reservation];
			writeReservationsForKey(key, next);
		}
		return true;
	} catch {
		clearOrderAssetReservations(lease, input.submissionId);
		return false;
	}
}

export function clearOrderAssetReservations(lease: OrderAssetLockLease, submissionId: string): void {
	if (!activeLeases.has(lease) || typeof window === "undefined") return;

	for (const assetId of lease.assetIds) {
		try {
			const key = getOrderAssetReservationKey(lease, assetId);
			const current = readReservationsForKey(key, Date.now());
			if (!current) continue;
			const next = current.filter((entry) => entry.submissionId !== submissionId);
			if (next.length === 0) window.localStorage.removeItem(key);
			else writeReservationsForKey(key, next);
		} catch {
			// The reservation expires on its own; retaining it is safer than clearing another submission.
		}
	}
}

export async function releaseOrderAssetReservations(
	identity: OrderAssetLockIdentity,
	submissionId: string,
): Promise<boolean> {
	try {
		const result = await runWithOrderAssetLocks(identity, async (lease) => {
			clearOrderAssetReservations(lease, submissionId);
		});
		return result.supported;
	} catch {
		return false;
	}
}

export function getOrderAssetLockName(identity: Omit<OrderAssetLockIdentity, "assetIds">, assetId: number): string {
	return [ORDER_ASSET_LOCK_PREFIX, identity.env.toLowerCase(), identity.owner.toLowerCase(), assetId].join(":");
}

function normalizeIdentity(identity: OrderAssetLockIdentity): OrderAssetLockIdentity {
	const assetIds = [...new Set(identity.assetIds)].sort((left, right) => left - right);
	if (assetIds.length === 0 || assetIds.some((assetId) => !Number.isSafeInteger(assetId) || assetId < 0)) {
		throw new Error("Order asset locks require non-negative integer asset ids");
	}
	return { env: identity.env, owner: identity.owner.toLowerCase(), assetIds };
}

async function acquireLockAtIndex<T>(
	lockManager: LockManager,
	identity: OrderAssetLockIdentity,
	index: number,
	task: () => Promise<T>,
): Promise<T> {
	const assetId = identity.assetIds[index];
	if (assetId === undefined) return task();
	return lockManager.request(getOrderAssetLockName(identity, assetId), { mode: "exclusive" }, () =>
		acquireLockAtIndex(lockManager, identity, index + 1, task),
	);
}

async function acquireAvailableLockAtIndex<T>(
	lockManager: LockManager,
	identity: OrderAssetLockIdentity,
	index: number,
	task: () => Promise<T>,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
	const assetId = identity.assetIds[index];
	if (assetId === undefined) return { acquired: true, value: await task() };
	return lockManager.request(
		getOrderAssetLockName(identity, assetId),
		{ mode: "exclusive", ifAvailable: true },
		(lock) =>
			lock
				? acquireAvailableLockAtIndex(lockManager, identity, index + 1, task)
				: Promise.resolve({ acquired: false } as const),
	);
}

function readActiveReservations(lease: OrderAssetLockLease, now: number): OrderAssetReservation[] | null {
	const reservations: OrderAssetReservation[] = [];
	for (const assetId of lease.assetIds) {
		const key = getOrderAssetReservationKey(lease, assetId);
		const current = readReservationsForKey(key, now);
		if (!current) return null;
		reservations.push(...current);
	}
	return reservations;
}

function readReservationsForKey(key: string, now: number): OrderAssetReservation[] | null {
	const serialized = window.localStorage.getItem(key);
	if (!serialized) return [];
	const parsed = parseReservations(serialized);
	if (!parsed) {
		window.localStorage.removeItem(key);
		return null;
	}
	const active = parsed.reservations.filter((reservation) => reservation.expiresAt > now);
	if (active.length === 0) window.localStorage.removeItem(key);
	else if (active.length !== parsed.reservations.length) writeReservationsForKey(key, active);
	return active;
}

function parseReservations(serialized: string): PersistedOrderAssetReservations | null {
	const value: unknown = JSON.parse(serialized);
	if (!value || typeof value !== "object") return null;
	const record = value as Partial<PersistedOrderAssetReservations>;
	if (record.version !== ORDER_ASSET_RESERVATION_VERSION || !Array.isArray(record.reservations)) return null;
	if (!record.reservations.every(isOrderAssetReservation)) return null;
	return { version: ORDER_ASSET_RESERVATION_VERSION, reservations: record.reservations };
}

function isOrderAssetReservation(value: unknown): value is OrderAssetReservation {
	if (!value || typeof value !== "object") return false;
	const reservation = value as Partial<OrderAssetReservation>;
	return (
		typeof reservation.submissionId === "string" &&
		reservation.submissionId.length > 0 &&
		typeof reservation.intentKey === "string" &&
		reservation.intentKey.length > 0 &&
		typeof reservation.exclusiveAssetLock === "boolean" &&
		typeof reservation.isRiskReducing === "boolean" &&
		Number.isSafeInteger(reservation.createdAt) &&
		Number.isSafeInteger(reservation.expiresAt)
	);
}

function writeReservationsForKey(key: string, reservations: OrderAssetReservation[]): void {
	const serialized = JSON.stringify({
		version: ORDER_ASSET_RESERVATION_VERSION,
		reservations,
	} satisfies PersistedOrderAssetReservations);
	window.localStorage.setItem(key, serialized);
	if (window.localStorage.getItem(key) !== serialized) throw new Error("Order asset reservation readback failed");
}

function getOrderAssetReservationKey(identity: Omit<OrderAssetLockIdentity, "assetIds">, assetId: number): string {
	return [ORDER_ASSET_RESERVATION_PREFIX, identity.env.toLowerCase(), identity.owner.toLowerCase(), assetId].join(":");
}
