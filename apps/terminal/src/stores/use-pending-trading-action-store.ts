import { create } from "zustand";

export const TRADING_ACTION_CONFIRMATION_TIMEOUT_MS = 15_000;

type TradingEnv = "Mainnet" | "Testnet";
export type PendingTradingActionPhase = "submitting" | "awaiting" | "unconfirmed";

interface TradingActionIdentity {
	env: TradingEnv;
	owner: string;
}

export interface PendingOrderModification extends TradingActionIdentity {
	id: string;
	oid: number;
	originalSize: string;
	originalTriggerPx: string;
	expectedSize: string | null;
	expectedTriggerPx: string | null;
	phase: PendingTradingActionPhase;
	createdAt: number;
	requestStartedAt: number | null;
	confirmationStartedAt: number | null;
	unconfirmedAt: number | null;
}

interface ClaimOrderModificationInput extends TradingActionIdentity {
	oid: number;
	originalSize: string;
	originalTriggerPx: string;
	expectedSize?: string;
	expectedTriggerPx?: string;
}

export interface PendingOrderCancellation extends TradingActionIdentity {
	id: string;
	oids: number[];
	phase: PendingTradingActionPhase;
	createdAt: number;
	requestStartedAt: number | null;
	confirmationStartedAt: number | null;
	unconfirmedAt: number | null;
}

interface ClaimOrderCancellationInput extends TradingActionIdentity {
	oids: readonly number[];
}

export interface PendingTwapCancellation extends TradingActionIdentity {
	id: string;
	twapId: number;
	assetId: number;
	phase: PendingTradingActionPhase;
	createdAt: number;
	requestStartedAt: number | null;
	confirmationStartedAt: number | null;
	unconfirmedAt: number | null;
}

interface ClaimTwapCancellationInput extends TradingActionIdentity {
	twapId: number;
	assetId: number;
}

interface PendingTradingActionStore {
	modifications: PendingOrderModification[];
	orderCancellations: PendingOrderCancellation[];
	twapCancellations: PendingTwapCancellation[];
	actions: {
		claimModification: (input: ClaimOrderModificationInput) => PendingOrderModification | null;
		markModificationRequestStarted: (id: string, now?: number) => void;
		markModificationAwaiting: (id: string, now?: number) => void;
		markModificationUnconfirmed: (id: string, now?: number) => void;
		expireModificationAwaiting: (id: string, now?: number) => boolean;
		resolveModification: (id: string) => void;
		claimOrderCancellation: (input: ClaimOrderCancellationInput) => PendingOrderCancellation | null;
		markOrderCancellationRequestStarted: (id: string, now?: number) => void;
		markOrderCancellationAwaiting: (id: string, now?: number) => void;
		markOrderCancellationUnconfirmed: (id: string, now?: number) => void;
		expireOrderCancellationAwaiting: (id: string, now?: number) => boolean;
		releaseOrderCancellation: (id: string) => void;
		confirmOrderCancellation: (id: string) => void;
		claimTwapCancellation: (input: ClaimTwapCancellationInput) => PendingTwapCancellation | null;
		markTwapCancellationRequestStarted: (id: string, now?: number) => void;
		markTwapCancellationAwaiting: (id: string, now?: number) => void;
		markTwapCancellationUnconfirmed: (id: string, now?: number) => void;
		expireTwapCancellationAwaiting: (id: string, now?: number) => boolean;
		resolveTwapCancellation: (id: string) => void;
		reset: () => void;
	};
}

function createActionId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
	return `pending-trading-action-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeOwner(owner: string): string {
	return owner.toLowerCase();
}

function hasIdentity(action: Pick<TradingActionIdentity, "env" | "owner">, env: TradingEnv, owner: string): boolean {
	return action.env === env && action.owner === normalizeOwner(owner);
}

function transitionAction<
	T extends {
		id: string;
		phase: PendingTradingActionPhase;
		confirmationStartedAt: number | null;
		unconfirmedAt: number | null;
	},
>(
	actions: readonly T[],
	id: string,
	phase: Extract<PendingTradingActionPhase, "awaiting" | "unconfirmed">,
	now: number,
): T[] {
	return actions.map((action) =>
		action.id === id
			? {
					...action,
					phase,
					confirmationStartedAt: action.confirmationStartedAt ?? now,
					unconfirmedAt: phase === "unconfirmed" ? (action.unconfirmedAt ?? now) : action.unconfirmedAt,
				}
			: action,
	);
}

function markRequestStarted<T extends { id: string; requestStartedAt: number | null }>(
	actions: readonly T[],
	id: string,
	now: number,
): T[] {
	return actions.map((action) =>
		action.id === id ? { ...action, requestStartedAt: action.requestStartedAt ?? now } : action,
	);
}

function expireAwaitingAction<
	T extends {
		id: string;
		phase: PendingTradingActionPhase;
		confirmationStartedAt: number | null;
		unconfirmedAt: number | null;
	},
>(actions: T[], id: string, now: number): { actions: T[]; expired: boolean } {
	let expired = false;
	const next = actions.map((action) => {
		if (
			action.id !== id ||
			action.phase !== "awaiting" ||
			action.confirmationStartedAt === null ||
			now - action.confirmationStartedAt < TRADING_ACTION_CONFIRMATION_TIMEOUT_MS
		) {
			return action;
		}
		expired = true;
		return {
			...action,
			phase: "unconfirmed" as const,
			unconfirmedAt: action.unconfirmedAt ?? now,
		};
	});
	return expired ? { actions: next, expired } : { actions, expired };
}

export function getPendingTradingActionToastId(id: string): string {
	return `pending-trading-action:${id}`;
}

const usePendingTradingActionStore = create<PendingTradingActionStore>()((set, get) => ({
	modifications: [],
	orderCancellations: [],
	twapCancellations: [],
	actions: {
		claimModification: (input) => {
			const owner = normalizeOwner(input.owner);
			const state = get();
			const modificationExists = state.modifications.some(
				(action) => hasIdentity(action, input.env, owner) && action.oid === input.oid,
			);
			const cancellationExists = state.orderCancellations.some(
				(action) => hasIdentity(action, input.env, owner) && action.oids.includes(input.oid),
			);
			if (modificationExists || cancellationExists) return null;

			const now = Date.now();
			const action: PendingOrderModification = {
				...input,
				id: createActionId(),
				owner,
				expectedSize: input.expectedSize ?? null,
				expectedTriggerPx: input.expectedTriggerPx ?? null,
				phase: "submitting",
				createdAt: now,
				requestStartedAt: null,
				confirmationStartedAt: null,
				unconfirmedAt: null,
			};
			set((current) => ({ modifications: [...current.modifications, action] }));
			return action;
		},
		markModificationRequestStarted: (id, now = Date.now()) => {
			set((state) => ({ modifications: markRequestStarted(state.modifications, id, now) }));
		},
		markModificationAwaiting: (id, now = Date.now()) => {
			set((state) => ({ modifications: transitionAction(state.modifications, id, "awaiting", now) }));
		},
		markModificationUnconfirmed: (id, now = Date.now()) => {
			set((state) => ({ modifications: transitionAction(state.modifications, id, "unconfirmed", now) }));
		},
		expireModificationAwaiting: (id, now = Date.now()) => {
			let expired = false;
			set((state) => {
				const result = expireAwaitingAction(state.modifications, id, now);
				expired = result.expired;
				return result.expired ? { modifications: result.actions } : state;
			});
			return expired;
		},
		resolveModification: (id) => {
			set((state) => ({ modifications: state.modifications.filter((action) => action.id !== id) }));
		},
		claimOrderCancellation: (input) => {
			const oids = Array.from(new Set(input.oids));
			if (oids.length === 0) return null;
			const owner = normalizeOwner(input.owner);
			const requestedOids = new Set(oids);
			const state = get();
			const cancellationExists = state.orderCancellations.some(
				(action) => hasIdentity(action, input.env, owner) && action.oids.some((oid) => requestedOids.has(oid)),
			);
			const activeModificationExists = state.modifications.some(
				(action) =>
					hasIdentity(action, input.env, owner) && requestedOids.has(action.oid) && action.phase !== "unconfirmed",
			);
			if (cancellationExists || activeModificationExists) return null;

			const now = Date.now();
			const action: PendingOrderCancellation = {
				id: createActionId(),
				env: input.env,
				owner,
				oids,
				phase: "submitting",
				createdAt: now,
				requestStartedAt: null,
				confirmationStartedAt: null,
				unconfirmedAt: null,
			};
			set((current) => ({ orderCancellations: [...current.orderCancellations, action] }));
			return action;
		},
		markOrderCancellationRequestStarted: (id, now = Date.now()) => {
			set((state) => ({ orderCancellations: markRequestStarted(state.orderCancellations, id, now) }));
		},
		markOrderCancellationAwaiting: (id, now = Date.now()) => {
			set((state) => ({
				orderCancellations: transitionAction(state.orderCancellations, id, "awaiting", now),
			}));
		},
		markOrderCancellationUnconfirmed: (id, now = Date.now()) => {
			set((state) => ({
				orderCancellations: transitionAction(state.orderCancellations, id, "unconfirmed", now),
			}));
		},
		expireOrderCancellationAwaiting: (id, now = Date.now()) => {
			let expired = false;
			set((state) => {
				const result = expireAwaitingAction(state.orderCancellations, id, now);
				expired = result.expired;
				return result.expired ? { orderCancellations: result.actions } : state;
			});
			return expired;
		},
		releaseOrderCancellation: (id) => {
			set((state) => ({ orderCancellations: state.orderCancellations.filter((action) => action.id !== id) }));
		},
		confirmOrderCancellation: (id) => {
			set((state) => {
				const completed = state.orderCancellations.find((action) => action.id === id);
				if (!completed) return state;
				const completedOids = new Set(completed.oids);
				return {
					orderCancellations: state.orderCancellations.filter((action) => action.id !== id),
					modifications: state.modifications.filter(
						(action) => !hasIdentity(action, completed.env, completed.owner) || !completedOids.has(action.oid),
					),
				};
			});
		},
		claimTwapCancellation: (input) => {
			const owner = normalizeOwner(input.owner);
			const exists = get().twapCancellations.some(
				(action) => hasIdentity(action, input.env, owner) && action.twapId === input.twapId,
			);
			if (exists) return null;

			const now = Date.now();
			const action: PendingTwapCancellation = {
				...input,
				id: createActionId(),
				owner,
				phase: "submitting",
				createdAt: now,
				requestStartedAt: null,
				confirmationStartedAt: null,
				unconfirmedAt: null,
			};
			set((current) => ({ twapCancellations: [...current.twapCancellations, action] }));
			return action;
		},
		markTwapCancellationRequestStarted: (id, now = Date.now()) => {
			set((state) => ({ twapCancellations: markRequestStarted(state.twapCancellations, id, now) }));
		},
		markTwapCancellationAwaiting: (id, now = Date.now()) => {
			set((state) => ({
				twapCancellations: transitionAction(state.twapCancellations, id, "awaiting", now),
			}));
		},
		markTwapCancellationUnconfirmed: (id, now = Date.now()) => {
			set((state) => ({
				twapCancellations: transitionAction(state.twapCancellations, id, "unconfirmed", now),
			}));
		},
		expireTwapCancellationAwaiting: (id, now = Date.now()) => {
			let expired = false;
			set((state) => {
				const result = expireAwaitingAction(state.twapCancellations, id, now);
				expired = result.expired;
				return result.expired ? { twapCancellations: result.actions } : state;
			});
			return expired;
		},
		resolveTwapCancellation: (id) => {
			set((state) => ({ twapCancellations: state.twapCancellations.filter((action) => action.id !== id) }));
		},
		reset: () => set({ modifications: [], orderCancellations: [], twapCancellations: [] }),
	},
}));

export function usePendingOrderModifications(): PendingOrderModification[] {
	return usePendingTradingActionStore((state) => state.modifications);
}

export function usePendingOrderCancellations(): PendingOrderCancellation[] {
	return usePendingTradingActionStore((state) => state.orderCancellations);
}

export function usePendingTwapCancellations(): PendingTwapCancellation[] {
	return usePendingTradingActionStore((state) => state.twapCancellations);
}

export function getPendingTradingActionActions() {
	return usePendingTradingActionStore.getState().actions;
}

export function getPendingTradingActionSnapshot() {
	const state = usePendingTradingActionStore.getState();
	return {
		modifications: state.modifications,
		orderCancellations: state.orderCancellations,
		twapCancellations: state.twapCancellations,
	};
}
