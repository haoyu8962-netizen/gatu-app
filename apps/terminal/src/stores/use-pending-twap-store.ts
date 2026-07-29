import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { STORAGE_KEYS } from "@/config/app";
import {
	TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS,
	TWAP_RECONCILIATION_MAX_AGE_MS,
	type TwapIntent,
} from "@/domain/trade/twap";
import { createValidatedStorage } from "@/lib/storage/validated-storage";

const baselineSchema = z.object({
	ready: z.boolean(),
	knownIds: z.array(z.number().int().nonnegative()),
});

const pendingTwapStoreSchema = z.object({
	state: z.object({
		submissions: z.array(
			z.object({
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
				}),
				activeBaseline: baselineSchema,
				historyBaseline: baselineSchema,
			}),
		),
	}),
});

const validatedStorage = createValidatedStorage(pendingTwapStoreSchema, "pending TWAP store");

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

interface PendingTwapStore {
	submissions: PendingTwapSubmission[];
	activeSubmissionIds: Set<string>;
	actions: {
		add: (input: AddPendingTwapInput) => PendingTwapSubmission;
		markActive: (id: string) => void;
		clearActive: (id: string) => void;
		remove: (id: string) => void;
		resolve: (id: string) => PendingTwapSubmission | null;
		markUnconfirmed: (id: string, markedAt: number) => PendingTwapSubmission | null;
		prune: (now: number) => void;
	};
}

function createSubmissionId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
	return `pending-twap-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const usePendingTwapStore = create<PendingTwapStore>()(
	persist(
		(set) => ({
			submissions: [],
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
					set((state) => ({
						submissions: [
							...state.submissions.filter((entry) => now - entry.createdAt < TWAP_RECONCILIATION_MAX_AGE_MS),
							submission,
						],
					}));
					return submission;
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
					set((state) => removeSubmission(state, id));
				},
				resolve: (id) => {
					let completed: PendingTwapSubmission | null = null;
					set((state) => {
						completed = state.submissions.find((submission) => submission.id === id) ?? null;
						return completed ? removeSubmission(state, id) : state;
					});
					return completed;
				},
				markUnconfirmed: (id, markedAt) => {
					let marked: PendingTwapSubmission | null = null;
					set((state) => {
						const submission = state.submissions.find((entry) => entry.id === id);
						if (!submission || submission.unconfirmedAt !== undefined) return state;
						const next = { ...submission, unconfirmedAt: markedAt };
						marked = next;
						return {
							submissions: state.submissions.map((entry) => (entry.id === id ? next : entry)),
						};
					});
					return marked;
				},
				prune: (now) => {
					set((state) => {
						const submissions = state.submissions.filter(
							(submission) => now - submission.createdAt < TWAP_RECONCILIATION_MAX_AGE_MS,
						);
						if (submissions.length === state.submissions.length) return state;
						const retainedIds = new Set(submissions.map((submission) => submission.id));
						const activeSubmissionIds = new Set(
							Array.from(state.activeSubmissionIds).filter((id) => retainedIds.has(id)),
						);
						return { submissions, activeSubmissionIds };
					});
				},
			},
		}),
		{
			name: STORAGE_KEYS.PENDING_TWAPS,
			version: 1,
			storage: createJSONStorage(() => validatedStorage),
			partialize: (state) => ({ submissions: state.submissions }),
			merge: (persisted, current) => ({
				...current,
				submissions: (persisted as Partial<PendingTwapStore>).submissions ?? [],
			}),
		},
	),
);

function removeSubmission(state: PendingTwapStore, id: string): Partial<PendingTwapStore> | PendingTwapStore {
	const submissions = state.submissions.filter((submission) => submission.id !== id);
	const wasActive = state.activeSubmissionIds.has(id);
	if (submissions.length === state.submissions.length && !wasActive) return state;
	const activeSubmissionIds = new Set(state.activeSubmissionIds);
	activeSubmissionIds.delete(id);
	return { submissions, activeSubmissionIds };
}

export function usePendingTwapSubmissions(): PendingTwapSubmission[] {
	return usePendingTwapStore((state) => state.submissions);
}

export function usePendingTwapActiveSubmissionIds(): ReadonlySet<string> {
	return usePendingTwapStore((state) => state.activeSubmissionIds);
}

export function getPendingTwapActions() {
	return usePendingTwapStore.getState().actions;
}

export function hasPendingTwapForAsset(env: PendingTwapSubmission["env"], user: string, assetId: number): boolean {
	const normalizedUser = user.toLowerCase();
	const now = Date.now();
	return usePendingTwapStore
		.getState()
		.submissions.some(
			(submission) =>
				submission.env === env &&
				submission.user === normalizedUser &&
				submission.intent.assetId === assetId &&
				isPendingTwapSubmissionBlocking(submission, now),
		);
}

export function isPendingTwapSubmissionBlocking(submission: PendingTwapSubmission, now: number): boolean {
	return (
		submission.unconfirmedAt === undefined && now - submission.createdAt < TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS
	);
}
