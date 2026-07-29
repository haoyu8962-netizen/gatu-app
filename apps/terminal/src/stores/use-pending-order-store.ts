import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { STORAGE_KEYS } from "@/config/app";
import {
	getReconciliationDelayMs,
	ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS,
	ORDER_RECONCILIATION_MAX_AGE_MS,
	type OrderProcessingStatus,
	type TrackedOrderChild,
} from "@/domain/trade/order-tracking";
import { createValidatedStorage } from "@/lib/storage/validated-storage";

const cloidSchema = z.string().regex(/^0x[a-fA-F0-9]{32}$/);
const pendingOrderStoreSchema = z.object({
	state: z.object({
		submissions: z.array(
			z.object({
				id: z.string(),
				env: z.enum(["Mainnet", "Testnet"]),
				user: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
				intentKey: z.string(),
				queueId: z.string().optional(),
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
			}),
		),
	}),
});

const validatedStorage = createValidatedStorage(pendingOrderStoreSchema, "pending order store");

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
	queueId?: string;
	createdAt: number;
	unconfirmedAt?: number;
	children: PendingOrderChild[];
}

interface AddPendingOrderInput {
	env: "Mainnet" | "Testnet";
	user: `0x${string}`;
	intentKey: string;
	queueId?: string;
	children: TrackedOrderChild[];
}

interface PendingOrderStore {
	submissions: PendingOrderSubmission[];
	activeSubmissionIds: Set<string>;
	actions: {
		add: (input: AddPendingOrderInput) => PendingOrderSubmission;
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

const usePendingOrderStore = create<PendingOrderStore>()(
	persist(
		(set) => ({
			submissions: [],
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
					set((state) => ({
						submissions: [
							...state.submissions.filter((entry) => now - entry.createdAt < ORDER_RECONCILIATION_MAX_AGE_MS),
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
					set((state) => {
						const submissions = state.submissions.filter((submission) => submission.id !== id);
						const wasActive = state.activeSubmissionIds.has(id);
						if (submissions.length === state.submissions.length && !wasActive) return state;
						const activeSubmissionIds = new Set(state.activeSubmissionIds);
						activeSubmissionIds.delete(id);
						return { submissions, activeSubmissionIds };
					});
				},
				markChecked: (cloid, checkedAt) => {
					set((state) => ({
						submissions: state.submissions.map((submission) => ({
							...submission,
							children: submission.children.map((child) =>
								child.cloid.toLowerCase() === cloid.toLowerCase()
									? {
											...child,
											attempts: child.attempts + 1,
											nextCheckAt: checkedAt + getReconciliationDelayMs(child.attempts),
										}
									: child,
							),
						})),
					}));
				},
				resolve: (env, user, cloid, status) => {
					let completed: PendingOrderSubmission | null = null;
					set((state) => {
						const normalizedUser = user.toLowerCase();
						const normalizedCloid = cloid.toLowerCase();
						let changed = false;
						const submissions = state.submissions.flatMap((submission) => {
							if (submission.env !== env || submission.user !== normalizedUser) return [submission];
							const matchingChild = submission.children.find((child) => child.cloid.toLowerCase() === normalizedCloid);
							if (!matchingChild || matchingChild.status === status) return [submission];
							changed = true;
							const next = {
								...submission,
								children: submission.children.map((child) =>
									child.cloid.toLowerCase() === normalizedCloid ? { ...child, status } : child,
								),
							};
							if (next.children.every((child) => child.status !== undefined)) {
								completed = next;
								return [];
							}
							return [next];
						});
						return changed ? { submissions } : state;
					});
					return completed;
				},
				markUnconfirmed: (id, markedAt) => {
					let marked: PendingOrderSubmission | null = null;
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
							(submission) => now - submission.createdAt < ORDER_RECONCILIATION_MAX_AGE_MS,
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
			name: STORAGE_KEYS.PENDING_ORDERS,
			version: 1,
			storage: createJSONStorage(() => validatedStorage),
			partialize: (state) => ({ submissions: state.submissions }),
			merge: (persisted, current) => ({
				...current,
				submissions: (persisted as Partial<PendingOrderStore>).submissions ?? [],
			}),
		},
	),
);

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

export function isPendingOrderSubmissionActive(id: string): boolean {
	return usePendingOrderStore.getState().activeSubmissionIds.has(id);
}
