import { create } from "zustand";
import { STORAGE_KEYS } from "@/config/app";
import { isPartialIocExecutionForOrder, isValidOrderExecutionSummary } from "@/domain/trade/order-execution-summary";
import {
	getReconciliationDelayMs,
	ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS,
	ORDER_RECONCILIATION_MAX_AGE_MS,
	type OrderProcessingStatus,
	type TrackedOrderChild,
} from "@/domain/trade/order-tracking";
import { z } from "@/lib/zod";
import type { OrderQueueMetadata } from "@/stores/use-order-queue-store";

const cloidSchema = z.string().regex(/^0x[a-fA-F0-9]{32}$/);
const feedbackMessageSchema = z.object({
	id: z.string(),
	message: z.string().optional(),
	values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});
const orderExecutionSummarySchema = z
	.object({
		evidence: z.literal("exchange-response"),
		filledSize: z.string(),
		requestedSize: z.string(),
		averagePrice: z.string(),
		orderIds: z.array(z.number().int().nonnegative()).min(1),
		completeness: z.enum(["full", "partial"]),
		partialIoc: z.object({ cloid: cloidSchema, orderId: z.number().int().nonnegative() }).optional().catch(undefined),
	})
	.refine(isValidOrderExecutionSummary)
	.transform((summary) =>
		summary.partialIoc && !isPartialIocExecutionForOrder(summary, summary.partialIoc.cloid)
			? { ...summary, partialIoc: undefined }
			: summary,
	);
const orderQueueMetadataSchema = z.object({
	title: feedbackMessageSchema.optional(),
	message: feedbackMessageSchema.optional(),
	operation: z.enum(["order", "market-close", "close-all", "spot-swap"]).optional(),
	market: z.string().optional(),
	side: z.enum(["buy", "sell"]).optional(),
	size: z.string().optional(),
	price: z.string().optional(),
	quoteToken: z.string().optional(),
	execution: orderExecutionSummarySchema.optional().catch(undefined),
	orderType: z.enum(["market", "limit", "trigger", "scale", "twap"]).optional(),
	tpPrice: z.string().optional(),
	slPrice: z.string().optional(),
	countMode: z.enum(["accepted", "filled"]).optional(),
	children: z
		.array(
			z.object({
				assetId: z.number().int().nonnegative(),
				market: z.string().optional(),
				size: z.string().optional(),
				filledSize: z.string().optional(),
				status: z.enum([
					"pending",
					"filled",
					"filled-unverified",
					"partial",
					"accepted",
					"rejected",
					"unknown",
					"canceled",
				]),
				error: z.string().optional(),
			}),
		)
		.optional(),
});
const pendingOrderSubmissionSchema = z.object({
	id: z.string(),
	env: z.enum(["Mainnet", "Testnet"]),
	user: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
	intentKey: z.string(),
	exclusiveAssetLock: z.boolean().optional(),
	confirmationMode: z.enum(["accepted", "filled"]).optional(),
	origin: z.object({ type: z.literal("positionMarketClose"), sessionId: z.string().min(1) }).optional(),
	queueId: z.string().optional(),
	feedback: orderQueueMetadataSchema.optional().catch(undefined),
	createdAt: z.number().int().nonnegative(),
	unconfirmedAt: z.number().int().nonnegative().optional(),
	children: z.array(
		z.object({
			assetId: z.number().int().nonnegative(),
			cloid: cloidSchema,
			status: z.string().optional(),
			attempts: z.number().int().nonnegative(),
			nextCheckAt: z.number().int().nonnegative(),
		}),
	),
});
const legacyPendingOrderStoreSchema = z.object({
	state: z.object({ submissions: z.array(pendingOrderSubmissionSchema) }),
});
const PENDING_ORDER_SUBMISSION_STORAGE_PREFIX = `${STORAGE_KEYS.PENDING_ORDERS}:submission:`;

export interface PendingOrderChild extends TrackedOrderChild {
	status?: OrderProcessingStatus;
	attempts: number;
	nextCheckAt: number;
}

export interface PendingOrderSubmission {
	id: string;
	env: "Mainnet" | "Testnet";
	user: `0x${string}`;
	intentKey: string;
	exclusiveAssetLock?: boolean;
	confirmationMode?: "accepted" | "filled";
	origin?: PendingOrderOrigin;
	queueId?: string;
	feedback?: OrderQueueMetadata;
	createdAt: number;
	unconfirmedAt?: number;
	children: PendingOrderChild[];
}

interface AddPendingOrderInput {
	env: "Mainnet" | "Testnet";
	user: `0x${string}`;
	intentKey: string;
	exclusiveAssetLock?: boolean;
	confirmationMode?: "accepted" | "filled";
	origin?: PendingOrderOrigin;
	queueId?: string;
	feedback?: OrderQueueMetadata;
	children: TrackedOrderChild[];
}

export type PendingOrderOrigin = { type: "positionMarketClose"; sessionId: string };

export class PendingOrderPersistenceError extends Error {
	constructor() {
		super("Pending order could not be persisted safely");
		this.name = "PendingOrderPersistenceError";
	}
}

interface PendingOrderStore {
	submissions: PendingOrderSubmission[];
	activeSubmissionIds: Set<string>;
	actions: {
		add: (input: AddPendingOrderInput) => PendingOrderSubmission;
		updateFeedback: (id: string, feedback: OrderQueueMetadata) => void;
		markActive: (id: string) => void;
		clearActive: (id: string) => void;
		remove: (id: string) => void;
		markChecked: (cloid: string, checkedAt: number) => void;
		resolve: (
			env: PendingOrderSubmission["env"],
			user: string,
			cloid: string,
			status: OrderProcessingStatus,
		) => PendingOrderSubmission | null;
		markUnconfirmed: (id: string, markedAt: number) => PendingOrderSubmission | null;
		prune: (now: number) => void;
	};
}

function createSubmissionId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
	return `pending-order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type PendingOrderStorage = Pick<Storage, "getItem" | "key" | "length" | "removeItem" | "setItem">;

function getBrowserPendingOrderStorage(): PendingOrderStorage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function getSubmissionStorageKey(submission: Pick<PendingOrderSubmission, "env" | "id" | "user">): string {
	return `${PENDING_ORDER_SUBMISSION_STORAGE_PREFIX}${submission.env}:${submission.user.toLowerCase()}:${encodeURIComponent(submission.id)}`;
}

function getPendingOrderStorageKeys(storage: PendingOrderStorage): string[] | null {
	try {
		const keys: string[] = [];
		for (let index = 0; index < storage.length; index += 1) {
			const key = storage.key(index);
			if (key?.startsWith(PENDING_ORDER_SUBMISSION_STORAGE_PREFIX)) keys.push(key);
		}
		return keys;
	} catch {
		return null;
	}
}

function readPersistedPendingOrders(
	storage: PendingOrderStorage | null,
	failClosedOnInvalidRecord = false,
): PendingOrderSubmission[] | null {
	if (!storage) return null;
	const keys = getPendingOrderStorageKeys(storage);
	if (!keys) return null;

	try {
		const submissions: PendingOrderSubmission[] = [];
		for (const key of keys) {
			const serialized = storage.getItem(key);
			if (!serialized) continue;

			try {
				const parsed = pendingOrderSubmissionSchema.safeParse(JSON.parse(serialized));
				if (!parsed.success) {
					if (failClosedOnInvalidRecord) return null;
					storage.removeItem(key);
					continue;
				}
				submissions.push({
					...parsed.data,
					user: parsed.data.user.toLowerCase() as `0x${string}`,
				} as PendingOrderSubmission);
			} catch {
				if (failClosedOnInvalidRecord) return null;
				storage.removeItem(key);
			}
		}
		submissions.sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
		return submissions;
	} catch {
		return null;
	}
}

function writePersistedPendingOrder(storage: PendingOrderStorage | null, submission: PendingOrderSubmission): boolean {
	if (!storage) return false;
	try {
		const key = getSubmissionStorageKey(submission);
		const serialized = JSON.stringify(submission);
		storage.setItem(key, serialized);
		return storage.getItem(key) === serialized;
	} catch {
		// Continue with the in-memory store when persistence is unavailable.
		return false;
	}
}

function removePersistedPendingOrder(storage: PendingOrderStorage | null, id: string): void {
	if (!storage) return;
	const keys = getPendingOrderStorageKeys(storage);
	if (!keys) return;
	const encodedId = encodeURIComponent(id);
	try {
		for (const key of keys) {
			if (key.endsWith(`:${encodedId}`)) storage.removeItem(key);
		}
	} catch {
		// Continue with the in-memory store when persistence is unavailable.
	}
}

function mergeMutationWithPersistedSnapshot(
	storage: PendingOrderStorage | null,
	fallback: PendingOrderSubmission[],
	upserts: readonly PendingOrderSubmission[] = [],
	removedIds: ReadonlySet<string> = new Set(),
): PendingOrderSubmission[] {
	const persisted = readPersistedPendingOrders(storage);
	if (!persisted) return fallback;

	const merged = new Map(
		persisted.filter((submission) => !removedIds.has(submission.id)).map((submission) => [submission.id, submission]),
	);
	for (const submission of upserts) merged.set(submission.id, submission);
	return Array.from(merged.values()).sort(
		(left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
	);
}

function arePendingOrderSnapshotsEqual(
	left: readonly PendingOrderSubmission[],
	right: readonly PendingOrderSubmission[],
): boolean {
	if (left === right) return true;
	if (left.length !== right.length) return false;
	return left.every((submission, index) => JSON.stringify(submission) === JSON.stringify(right[index]));
}

function migrateLegacyPendingOrders(storage: PendingOrderStorage | null): void {
	if (!storage) return;
	try {
		const serialized = storage.getItem(STORAGE_KEYS.PENDING_ORDERS);
		if (!serialized) return;
		let json: unknown;
		try {
			json = JSON.parse(serialized);
		} catch {
			storage.removeItem(STORAGE_KEYS.PENDING_ORDERS);
			return;
		}
		const parsed = legacyPendingOrderStoreSchema.safeParse(json);
		if (!parsed.success) {
			storage.removeItem(STORAGE_KEYS.PENDING_ORDERS);
			return;
		}

		const persisted = readPersistedPendingOrders(storage);
		if (!persisted) return;
		const existingIds = new Set(persisted.map((submission) => submission.id));
		for (const entry of parsed.data.state.submissions) {
			if (existingIds.has(entry.id)) continue;
			const migrated = writePersistedPendingOrder(storage, {
				...entry,
				user: entry.user.toLowerCase() as `0x${string}`,
			} as PendingOrderSubmission);
			if (!migrated) return;
		}
		storage.removeItem(STORAGE_KEYS.PENDING_ORDERS);
	} catch {
		// Leave the legacy value intact so a future session can retry migration.
	}
}

/** Creates an isolated store instance; separate instances model independent browser tabs sharing one Storage. */
export function createPendingOrderStore(storage: PendingOrderStorage | null = getBrowserPendingOrderStorage()) {
	migrateLegacyPendingOrders(storage);
	const store = create<PendingOrderStore>()((set) => ({
		submissions: readPersistedPendingOrders(storage) ?? [],
		activeSubmissionIds: new Set(),
		actions: {
			add: (input) => {
				const now = Date.now();
				const submission: PendingOrderSubmission = {
					...input,
					id: createSubmissionId(),
					user: input.user.toLowerCase() as `0x${string}`,
					createdAt: now,
					children: input.children.map((child) => ({ ...child, attempts: 0, nextCheckAt: now + 1_000 })),
				};
				set(() => {
					const current = readPersistedPendingOrders(storage);
					if (!current) throw new PendingOrderPersistenceError();
					if (!writePersistedPendingOrder(storage, submission)) throw new PendingOrderPersistenceError();
					const expiredIds = new Set(
						current
							.filter((entry) => now - entry.createdAt >= ORDER_RECONCILIATION_MAX_AGE_MS)
							.map((entry) => entry.id),
					);
					for (const id of expiredIds) removePersistedPendingOrder(storage, id);
					const fallback = [...current.filter((entry) => !expiredIds.has(entry.id)), submission];
					return {
						submissions: mergeMutationWithPersistedSnapshot(storage, fallback, [submission], expiredIds),
					};
				});
				return submission;
			},
			updateFeedback: (id, feedback) => {
				set((state) => {
					const current = readPersistedPendingOrders(storage) ?? state.submissions;
					const submission = current.find((entry) => entry.id === id);
					if (!submission) return state;
					const next = { ...submission, feedback };
					writePersistedPendingOrder(storage, next);
					const submissions = current.map((entry) => (entry.id === id ? next : entry));
					return { submissions: mergeMutationWithPersistedSnapshot(storage, submissions, [next]) };
				});
			},
			markActive: (id) => {
				set((state) => ({ activeSubmissionIds: new Set(state.activeSubmissionIds).add(id) }));
			},
			clearActive: (id) => {
				set((state) => {
					if (!state.activeSubmissionIds.has(id)) return state;
					const activeSubmissionIds = new Set(state.activeSubmissionIds);
					activeSubmissionIds.delete(id);
					return { activeSubmissionIds };
				});
			},
			remove: (id) => {
				set((state) => {
					const current = readPersistedPendingOrders(storage) ?? state.submissions;
					const submissions = current.filter((submission) => submission.id !== id);
					const wasActive = state.activeSubmissionIds.has(id);
					if (submissions.length === current.length && !wasActive) {
						return arePendingOrderSnapshotsEqual(state.submissions, current) ? state : { submissions: current };
					}
					removePersistedPendingOrder(storage, id);
					const activeSubmissionIds = new Set(state.activeSubmissionIds);
					activeSubmissionIds.delete(id);
					return {
						submissions: mergeMutationWithPersistedSnapshot(storage, submissions, [], new Set([id])),
						activeSubmissionIds,
					};
				});
			},
			markChecked: (cloid, checkedAt) => {
				set((state) => {
					const normalizedCloid = cloid.toLowerCase();
					const current = readPersistedPendingOrders(storage) ?? state.submissions;
					const changed: PendingOrderSubmission[] = [];
					const submissions = current.map((submission) => {
						if (!submission.children.some((child) => child.cloid.toLowerCase() === normalizedCloid)) {
							return submission;
						}
						const next = {
							...submission,
							children: submission.children.map((child) =>
								child.cloid.toLowerCase() === normalizedCloid
									? {
											...child,
											attempts: child.attempts + 1,
											nextCheckAt: checkedAt + getReconciliationDelayMs(child.attempts),
										}
									: child,
							),
						};
						changed.push(next);
						writePersistedPendingOrder(storage, next);
						return next;
					});
					if (changed.length === 0) {
						return arePendingOrderSnapshotsEqual(state.submissions, submissions) ? state : { submissions };
					}
					return { submissions: mergeMutationWithPersistedSnapshot(storage, submissions, changed) };
				});
			},
			resolve: (env, user, cloid, status) => {
				let completed: PendingOrderSubmission | null = null;
				set((state) => {
					const normalizedUser = user.toLowerCase();
					const normalizedCloid = cloid.toLowerCase();
					const current = readPersistedPendingOrders(storage) ?? state.submissions;
					const upserts: PendingOrderSubmission[] = [];
					const removedIds = new Set<string>();
					const submissions = current.flatMap((submission) => {
						if (submission.env !== env || submission.user !== normalizedUser) return [submission];
						const matchingChild = submission.children.find((child) => child.cloid.toLowerCase() === normalizedCloid);
						if (!matchingChild || matchingChild.status === status) return [submission];
						const next = {
							...submission,
							children: submission.children.map((child) =>
								child.cloid.toLowerCase() === normalizedCloid ? { ...child, status } : child,
							),
						};
						if (next.children.every((child) => isOrderStatusFinalForSubmission(next, child.status))) {
							completed = next;
							removedIds.add(next.id);
							removePersistedPendingOrder(storage, next.id);
							return [];
						}
						upserts.push(next);
						writePersistedPendingOrder(storage, next);
						return [next];
					});
					if (upserts.length === 0 && removedIds.size === 0) {
						return arePendingOrderSnapshotsEqual(state.submissions, submissions) ? state : { submissions };
					}
					return {
						submissions: mergeMutationWithPersistedSnapshot(storage, submissions, upserts, removedIds),
					};
				});
				return completed;
			},
			markUnconfirmed: (id, markedAt) => {
				let marked: PendingOrderSubmission | null = null;
				set((state) => {
					const current = readPersistedPendingOrders(storage) ?? state.submissions;
					const submission = current.find((entry) => entry.id === id);
					if (!submission || submission.unconfirmedAt !== undefined) {
						return arePendingOrderSnapshotsEqual(state.submissions, current) ? state : { submissions: current };
					}
					const next = { ...submission, unconfirmedAt: markedAt };
					marked = next;
					writePersistedPendingOrder(storage, next);
					const submissions = current.map((entry) => (entry.id === id ? next : entry));
					return {
						submissions: mergeMutationWithPersistedSnapshot(storage, submissions, [next]),
					};
				});
				return marked;
			},
			prune: (now) => {
				set((state) => {
					const current = readPersistedPendingOrders(storage) ?? state.submissions;
					const submissions = current.filter(
						(submission) => now - submission.createdAt < ORDER_RECONCILIATION_MAX_AGE_MS,
					);
					if (submissions.length === current.length) {
						return arePendingOrderSnapshotsEqual(state.submissions, submissions) ? state : { submissions };
					}
					const removedIds = new Set(
						current.filter((submission) => !submissions.includes(submission)).map((submission) => submission.id),
					);
					for (const id of removedIds) removePersistedPendingOrder(storage, id);
					const retainedIds = new Set(submissions.map((submission) => submission.id));
					const activeSubmissionIds = new Set(
						Array.from(state.activeSubmissionIds).filter((id) => retainedIds.has(id)),
					);
					return {
						submissions: mergeMutationWithPersistedSnapshot(storage, submissions, [], removedIds),
						activeSubmissionIds,
					};
				});
			},
		},
	}));

	if (typeof window !== "undefined" && storage === getBrowserPendingOrderStorage()) {
		window.addEventListener("storage", (event) => {
			if (
				event.key !== null &&
				event.key !== STORAGE_KEYS.PENDING_ORDERS &&
				!event.key.startsWith(PENDING_ORDER_SUBMISSION_STORAGE_PREFIX)
			) {
				return;
			}
			if (event.key === STORAGE_KEYS.PENDING_ORDERS) migrateLegacyPendingOrders(storage);
			const submissions = readPersistedPendingOrders(storage);
			if (submissions && !arePendingOrderSnapshotsEqual(store.getState().submissions, submissions)) {
				store.setState({ submissions });
			}
		});
	}

	return store;
}

const usePendingOrderStore = createPendingOrderStore();

export function usePendingOrderSubmissions(): PendingOrderSubmission[] {
	return usePendingOrderStore((state) => state.submissions);
}

export function usePendingOrderActiveSubmissionIds(): ReadonlySet<string> {
	return usePendingOrderStore((state) => state.activeSubmissionIds);
}

export function getPendingOrderActions() {
	return usePendingOrderStore.getState().actions;
}

export function hasPendingOrderForAssets(
	env: PendingOrderSubmission["env"],
	user: string,
	assetIds: readonly number[],
): boolean {
	const normalizedUser = user.toLowerCase();
	const assets = new Set(assetIds);
	const now = Date.now();
	return usePendingOrderStore
		.getState()
		.submissions.some(
			(submission) =>
				submission.env === env &&
				submission.user === normalizedUser &&
				isPendingOrderSubmissionBlocking(submission, now) &&
				submission.children.some((child) => assets.has(child.assetId)),
		);
}

export type PersistedPendingOrderAssetState = "pending" | "clear" | "unavailable";

/**
 * Reads the shared persistence snapshot synchronously. Call this while holding the
 * cross-tab asset lock so a delayed `storage` event cannot permit a duplicate order.
 */
export function getPersistedPendingOrderAssetState(
	env: PendingOrderSubmission["env"],
	user: string,
	assetIds: readonly number[],
): PersistedPendingOrderAssetState {
	const submissions = readPersistedPendingOrders(getBrowserPendingOrderStorage(), true);
	if (!submissions) return "unavailable";
	const normalizedUser = user.toLowerCase();
	const assets = new Set(assetIds);
	const now = Date.now();
	return submissions.some(
		(submission) =>
			submission.env === env &&
			submission.user === normalizedUser &&
			isPendingOrderSubmissionBlocking(submission, now) &&
			submission.children.some((child) => assets.has(child.assetId)),
	)
		? "pending"
		: "clear";
}

export function hasExclusivePendingOrderForAssets(
	env: PendingOrderSubmission["env"],
	user: string,
	assetIds: readonly number[],
): boolean {
	const normalizedUser = user.toLowerCase();
	const assets = new Set(assetIds);
	const now = Date.now();
	return usePendingOrderStore
		.getState()
		.submissions.some(
			(submission) =>
				submission.env === env &&
				submission.user === normalizedUser &&
				submission.exclusiveAssetLock === true &&
				isPendingOrderSubmissionBlocking(submission, now) &&
				submission.children.some((child) => assets.has(child.assetId)),
		);
}

export function hasPendingOrderIntent(env: PendingOrderSubmission["env"], user: string, intentKey: string): boolean {
	const normalizedUser = user.toLowerCase();
	const now = Date.now();
	return usePendingOrderStore
		.getState()
		.submissions.some(
			(submission) =>
				submission.env === env &&
				submission.user === normalizedUser &&
				submission.intentKey === intentKey &&
				isPendingOrderSubmissionBlocking(submission, now),
		);
}

export function isPendingOrderSubmissionBlocking(submission: PendingOrderSubmission, now: number): boolean {
	return (
		submission.unconfirmedAt === undefined && now - submission.createdAt < ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS
	);
}

export function isOrderStatusFinalForSubmission(
	submission: Pick<PendingOrderSubmission, "confirmationMode">,
	status: OrderProcessingStatus | undefined,
): boolean {
	if (status === undefined) return false;
	if (submission.confirmationMode !== "filled") return true;
	return status !== "open" && status !== "triggered";
}

export function isPendingOrderSubmissionActive(id: string): boolean {
	return usePendingOrderStore.getState().activeSubmissionIds.has(id);
}
