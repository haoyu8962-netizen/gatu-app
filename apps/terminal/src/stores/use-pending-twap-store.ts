import { create } from "zustand";
import { STORAGE_KEYS } from "@/config/app";
import {
	TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS,
	TWAP_RECONCILIATION_MAX_AGE_MS,
	type TwapIntent,
} from "@/domain/trade/twap";
import {
	type PendingSubmissionIdentity,
	type PendingSubmissionSharing,
	shareSubmissionsBetweenTabs,
} from "@/lib/trade/pending-submission-tab-ownership";
import { z } from "@/lib/zod";

const baselineSchema = z.object({
	ready: z.boolean(),
	knownIds: z.array(z.number().int().nonnegative()),
});

const pendingTwapSubmissionSchema = z.object({
	id: z.string(),
	env: z.enum(["Mainnet", "Testnet"]),
	user: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
	queueId: z.string().optional(),
	createdAt: z.number().int().nonnegative(),
	unconfirmedAt: z.number().int().nonnegative().optional(),
	intent: z.object({
		assetId: z.number().int().nonnegative(),
		coin: z.string().min(1),
		side: z.enum(["B", "A"]),
		size: z.string(),
		minutes: z.number().int().positive(),
		reduceOnly: z.boolean(),
		randomize: z.boolean(),
		stopPx: z.string().nullable().optional(),
		trigger: z.object({ px: z.string(), above: z.boolean() }).nullable().optional(),
	}),
	activeBaseline: baselineSchema,
	historyBaseline: baselineSchema,
});

const legacyPendingTwapStoreSchema = z.object({
	state: z.object({ submissions: z.array(pendingTwapSubmissionSchema) }),
});
const PENDING_TWAP_SUBMISSION_STORAGE_PREFIX = `${STORAGE_KEYS.PENDING_TWAPS}:submission:`;

interface TwapBaseline {
	ready: boolean;
	knownIds: number[];
}

export interface PendingTwapSubmission {
	id: string;
	env: "Mainnet" | "Testnet";
	user: `0x${string}`;
	queueId?: string;
	createdAt: number;
	unconfirmedAt?: number;
	intent: TwapIntent;
	activeBaseline: TwapBaseline;
	historyBaseline: TwapBaseline;
}

interface AddPendingTwapInput extends Omit<PendingTwapSubmission, "id" | "createdAt" | "user"> {
	user: `0x${string}`;
}

export type PersistedPendingTwapAssetState = "clear" | "pending" | "unavailable";

export class PendingTwapPersistenceError extends Error {
	constructor() {
		super("Pending TWAP could not be persisted safely");
		this.name = "PendingTwapPersistenceError";
	}
}

interface PendingTwapStore {
	submissions: PendingTwapSubmission[];
	activeSubmissionIds: Set<string>;
	actions: {
		add: (input: AddPendingTwapInput) => PendingTwapSubmission;
		markActive: (id: string) => void;
		/** The owner and network this tab can reconcile now, or null while it cannot reconcile any. */
		serve: (identity: PendingSubmissionIdentity | null) => void;
		/** Whether this tab still reconciles the submission: an asynchronous step checks it before writing. */
		owns: (id: string) => boolean;
		/** Submissions that left the store while another tab reconciled them, each reported once. */
		takeRemovedElsewhere: () => string[];
		clearActive: (id: string) => void;
		remove: (id: string) => void;
		resolve: (id: string) => PendingTwapSubmission | null;
		markUnconfirmed: (id: string, markedAt: number) => PendingTwapSubmission | null;
		prune: (now: number) => void;
	};
}

type PendingTwapStorage = Pick<Storage, "getItem" | "key" | "length" | "removeItem" | "setItem">;

function createSubmissionId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
	return `pending-twap-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getBrowserPendingTwapStorage(): PendingTwapStorage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function getSubmissionStorageKey(submission: Pick<PendingTwapSubmission, "env" | "id" | "user">): string {
	return `${PENDING_TWAP_SUBMISSION_STORAGE_PREFIX}${submission.env}:${submission.user.toLowerCase()}:${encodeURIComponent(submission.id)}`;
}

function getPendingTwapStorageKeys(storage: PendingTwapStorage): string[] | null {
	try {
		const keys: string[] = [];
		for (let index = 0; index < storage.length; index += 1) {
			const key = storage.key(index);
			if (key?.startsWith(PENDING_TWAP_SUBMISSION_STORAGE_PREFIX)) keys.push(key);
		}
		return keys;
	} catch {
		return null;
	}
}

function readPersistedPendingTwaps(
	storage: PendingTwapStorage | null,
	failClosedOnInvalidRecord = false,
): PendingTwapSubmission[] | null {
	if (!storage) return null;
	const keys = getPendingTwapStorageKeys(storage);
	if (!keys) return null;

	try {
		const submissions: PendingTwapSubmission[] = [];
		for (const key of keys) {
			const serialized = storage.getItem(key);
			if (!serialized) continue;

			try {
				const parsed = pendingTwapSubmissionSchema.safeParse(JSON.parse(serialized));
				if (!parsed.success) {
					if (failClosedOnInvalidRecord) return null;
					storage.removeItem(key);
					continue;
				}
				submissions.push({
					...parsed.data,
					user: parsed.data.user.toLowerCase() as `0x${string}`,
				} as PendingTwapSubmission);
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

function writePersistedPendingTwap(storage: PendingTwapStorage | null, submission: PendingTwapSubmission): boolean {
	if (!storage) return false;
	try {
		const key = getSubmissionStorageKey(submission);
		const serialized = JSON.stringify(submission);
		storage.setItem(key, serialized);
		return storage.getItem(key) === serialized;
	} catch {
		return false;
	}
}

function removePersistedPendingTwap(storage: PendingTwapStorage | null, id: string): void {
	if (!storage) return;
	const keys = getPendingTwapStorageKeys(storage);
	if (!keys) return;
	const encodedId = encodeURIComponent(id);
	try {
		for (const key of keys) {
			if (key.endsWith(`:${encodedId}`)) storage.removeItem(key);
		}
	} catch {
		// Keep the in-memory state usable when persistence becomes unavailable.
	}
}

function mergeMutationWithPersistedSnapshot(
	storage: PendingTwapStorage | null,
	fallback: PendingTwapSubmission[],
	upserts: readonly PendingTwapSubmission[] = [],
	removedIds: ReadonlySet<string> = new Set(),
): PendingTwapSubmission[] {
	const persisted = readPersistedPendingTwaps(storage);
	if (!persisted) return fallback;

	const merged = new Map(
		persisted.filter((submission) => !removedIds.has(submission.id)).map((submission) => [submission.id, submission]),
	);
	for (const submission of upserts) merged.set(submission.id, submission);
	return Array.from(merged.values()).sort(
		(left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
	);
}

function arePendingTwapSnapshotsEqual(
	left: readonly PendingTwapSubmission[],
	right: readonly PendingTwapSubmission[],
): boolean {
	if (left === right) return true;
	if (left.length !== right.length) return false;
	return left.every((submission, index) => JSON.stringify(submission) === JSON.stringify(right[index]));
}

function migrateLegacyPendingTwaps(storage: PendingTwapStorage | null): void {
	if (!storage) return;
	try {
		const serialized = storage.getItem(STORAGE_KEYS.PENDING_TWAPS);
		if (!serialized) return;
		let json: unknown;
		try {
			json = JSON.parse(serialized);
		} catch {
			storage.removeItem(STORAGE_KEYS.PENDING_TWAPS);
			return;
		}
		const parsed = legacyPendingTwapStoreSchema.safeParse(json);
		if (!parsed.success) {
			storage.removeItem(STORAGE_KEYS.PENDING_TWAPS);
			return;
		}

		const persisted = readPersistedPendingTwaps(storage);
		if (!persisted) return;
		const existingIds = new Set(persisted.map((submission) => submission.id));
		for (const entry of parsed.data.state.submissions) {
			if (existingIds.has(entry.id)) continue;
			const migrated = writePersistedPendingTwap(storage, {
				...entry,
				user: entry.user.toLowerCase() as `0x${string}`,
			} as PendingTwapSubmission);
			if (!migrated) return;
		}
		storage.removeItem(STORAGE_KEYS.PENDING_TWAPS);
	} catch {
		// Leave the legacy value intact so a future session can retry migration.
	}
}

/** Creates an isolated store instance; separate instances model independent browser tabs sharing one Storage. */
export function createPendingTwapStore(storage: PendingTwapStorage | null = getBrowserPendingTwapStorage()) {
	migrateLegacyPendingTwaps(storage);
	const store = create<PendingTwapStore>()((set) => ({
		submissions: readPersistedPendingTwaps(storage) ?? [],
		activeSubmissionIds: new Set(),
		actions: {
			add: (input) => {
				const now = Date.now();
				const submission: PendingTwapSubmission = {
					...input,
					id: createSubmissionId(),
					user: input.user.toLowerCase() as `0x${string}`,
					createdAt: now,
				};
				sharing.claim(submission.id);
				set(() => {
					const current = readPersistedPendingTwaps(storage);
					if (!current) throw new PendingTwapPersistenceError();
					if (!writePersistedPendingTwap(storage, submission)) throw new PendingTwapPersistenceError();
					const expiredIds = new Set(
						current.filter((entry) => now - entry.createdAt >= TWAP_RECONCILIATION_MAX_AGE_MS).map((entry) => entry.id),
					);
					for (const id of expiredIds) removePersistedPendingTwap(storage, id);
					const fallback = [...current.filter((entry) => !expiredIds.has(entry.id)), submission];
					return {
						submissions: mergeMutationWithPersistedSnapshot(storage, fallback, [submission], expiredIds),
					};
				});
				return submission;
			},
			serve: (identity) => sharing.serve(identity),
			owns: (id) => sharing.owns(id),
			takeRemovedElsewhere: () => sharing.takeRemovedElsewhere(),
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
					const current = readPersistedPendingTwaps(storage) ?? state.submissions;
					const submissions = current.filter((submission) => submission.id !== id);
					const wasActive = state.activeSubmissionIds.has(id);
					if (submissions.length === current.length && !wasActive) {
						return arePendingTwapSnapshotsEqual(state.submissions, current) ? state : { submissions: current };
					}
					removePersistedPendingTwap(storage, id);
					const activeSubmissionIds = new Set(state.activeSubmissionIds);
					activeSubmissionIds.delete(id);
					return {
						submissions: mergeMutationWithPersistedSnapshot(storage, submissions, [], new Set([id])),
						activeSubmissionIds,
					};
				});
			},
			resolve: (id) => {
				let completed: PendingTwapSubmission | null = null;
				set((state) => {
					const current = readPersistedPendingTwaps(storage) ?? state.submissions;
					completed = current.find((submission) => submission.id === id) ?? null;
					if (!completed) {
						return arePendingTwapSnapshotsEqual(state.submissions, current) ? state : { submissions: current };
					}
					removePersistedPendingTwap(storage, id);
					const submissions = current.filter((submission) => submission.id !== id);
					const activeSubmissionIds = new Set(state.activeSubmissionIds);
					activeSubmissionIds.delete(id);
					return {
						submissions: mergeMutationWithPersistedSnapshot(storage, submissions, [], new Set([id])),
						activeSubmissionIds,
					};
				});
				return completed;
			},
			markUnconfirmed: (id, markedAt) => {
				let marked: PendingTwapSubmission | null = null;
				set((state) => {
					const current = readPersistedPendingTwaps(storage) ?? state.submissions;
					const submission = current.find((entry) => entry.id === id);
					if (!submission || submission.unconfirmedAt !== undefined) {
						return arePendingTwapSnapshotsEqual(state.submissions, current) ? state : { submissions: current };
					}
					const next = { ...submission, unconfirmedAt: markedAt };
					marked = next;
					writePersistedPendingTwap(storage, next);
					const submissions = current.map((entry) => (entry.id === id ? next : entry));
					return {
						submissions: mergeMutationWithPersistedSnapshot(storage, submissions, [next]),
					};
				});
				return marked;
			},
			prune: (now) => {
				set((state) => {
					const current = readPersistedPendingTwaps(storage) ?? state.submissions;
					const submissions = current.filter(
						(submission) => now - submission.createdAt < TWAP_RECONCILIATION_MAX_AGE_MS,
					);
					if (submissions.length === current.length) {
						return arePendingTwapSnapshotsEqual(state.submissions, submissions) ? state : { submissions };
					}
					const removedIds = new Set(
						current.filter((submission) => !submissions.includes(submission)).map((submission) => submission.id),
					);
					for (const id of removedIds) removePersistedPendingTwap(storage, id);
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

	if (typeof window !== "undefined" && storage === getBrowserPendingTwapStorage()) {
		window.addEventListener("storage", (event) => {
			if (
				event.key !== null &&
				event.key !== STORAGE_KEYS.PENDING_TWAPS &&
				!event.key.startsWith(PENDING_TWAP_SUBMISSION_STORAGE_PREFIX)
			) {
				return;
			}
			if (event.key === STORAGE_KEYS.PENDING_TWAPS) migrateLegacyPendingTwaps(storage);
			const submissions = readPersistedPendingTwaps(storage);
			if (submissions && !arePendingTwapSnapshotsEqual(store.getState().submissions, submissions)) {
				store.setState({ submissions });
			}
		});
	}

	const sharing: PendingSubmissionSharing = shareSubmissionsBetweenTabs(store, "sairn-pending-twap-owner-v1:", (id) =>
		(readPersistedPendingTwaps(storage) ?? store.getState().submissions).some((submission) => submission.id === id),
	);
	return store;
}

const usePendingTwapStore = createPendingTwapStore();

export function usePendingTwapSubmissions(): PendingTwapSubmission[] {
	return usePendingTwapStore((state) => state.submissions);
}

export function usePendingTwapActiveSubmissionIds(): ReadonlySet<string> {
	return usePendingTwapStore((state) => state.activeSubmissionIds);
}

export function getPendingTwapActions() {
	return usePendingTwapStore.getState().actions;
}

export function getPersistedPendingTwapAssetState(
	env: PendingTwapSubmission["env"],
	user: string,
	assetId: number,
): PersistedPendingTwapAssetState {
	const submissions = readPersistedPendingTwaps(getBrowserPendingTwapStorage(), true);
	if (!submissions) return "unavailable";
	const normalizedUser = user.toLowerCase();
	const now = Date.now();
	return submissions.some(
		(submission) =>
			submission.env === env &&
			submission.user === normalizedUser &&
			submission.intent.assetId === assetId &&
			isPendingTwapSubmissionBlocking(submission, now),
	)
		? "pending"
		: "clear";
}

export function hasPendingTwapForAsset(env: PendingTwapSubmission["env"], user: string, assetId: number): boolean {
	return getPersistedPendingTwapAssetState(env, user, assetId) !== "clear";
}

export function isPendingTwapSubmissionBlocking(submission: PendingTwapSubmission, now: number): boolean {
	return (
		submission.unconfirmedAt === undefined && now - submission.createdAt < TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS
	);
}
