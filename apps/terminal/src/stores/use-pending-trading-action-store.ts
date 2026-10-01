import { getReceiptAgeMs } from "@sairn/hl-react/internal/websocket/staleness";
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
	monotonicRequestStartedAt: number | null;
	monotonicConfirmationStartedAt: number | null;
	monotonicUnconfirmedAt: number | null;
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
	monotonicRequestStartedAt: number | null;
	monotonicConfirmationStartedAt: number | null;
	monotonicUnconfirmedAt: number | null;
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
	monotonicRequestStartedAt: number | null;
	monotonicConfirmationStartedAt: number | null;
	monotonicUnconfirmedAt: number | null;
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
		markModificationRequestStarted: (id: string, now?: number, monotonicNow?: number) => void;
		markModificationAwaiting: (id: string, now?: number, monotonicNow?: number) => void;
		markModificationUnconfirmed: (id: string, now?: number, monotonicNow?: number) => void;
		expireModificationAwaiting: (id: string, now?: number, monotonicNow?: number) => boolean;
		resolveModification: (id: string) => void;
		claimOrderCancellation: (input: ClaimOrderCancellationInput) => PendingOrderCancellation | null;
		markOrderCancellationRequestStarted: (id: string, now?: number, monotonicNow?: number) => void;
		markOrderCancellationAwaiting: (id: string, now?: number, monotonicNow?: number) => void;
		markOrderCancellationUnconfirmed: (id: string, now?: number, monotonicNow?: number) => void;
		expireOrderCancellationAwaiting: (id: string, now?: number, monotonicNow?: number) => boolean;
		releaseOrderCancellation: (id: string) => void;
		confirmOrderCancellation: (id: string) => void;
		claimTwapCancellation: (input: ClaimTwapCancellationInput) => PendingTwapCancellation | null;
		markTwapCancellationRequestStarted: (id: string, now?: number, monotonicNow?: number) => void;
		markTwapCancellationAwaiting: (id: string, now?: number, monotonicNow?: number) => void;
		markTwapCancellationUnconfirmed: (id: string, now?: number, monotonicNow?: number) => void;
		expireTwapCancellationAwaiting: (id: string, now?: number, monotonicNow?: number) => boolean;
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

type ConfirmationClock = Pick<
	PendingOrderModification,
	"phase" | "confirmationStartedAt" | "monotonicConfirmationStartedAt"
>;

type TransitionableAction = ConfirmationClock &
	Pick<PendingOrderModification, "id" | "unconfirmedAt" | "monotonicUnconfirmedAt">;

/**
 * Milliseconds left before an awaiting action times out, or null when its confirmation has not
 * started. The larger of the wall-clock and monotonic ages counts, so setting the system clock back
 * cannot hold an action in `awaiting`, while a forward jump or a sleep still expires it (ADR 0022).
 */
export function getTradingActionConfirmationRemainingMs(
	action: ConfirmationClock,
	now = Date.now(),
	monotonicNow = performance.now(),
): number | null {
	if (action.confirmationStartedAt === null || action.monotonicConfirmationStartedAt === null) return null;
	return (
		TRADING_ACTION_CONFIRMATION_TIMEOUT_MS -
		getReceiptAgeMs(action.confirmationStartedAt, action.monotonicConfirmationStartedAt, now, monotonicNow)
	);
}

/** Delay until the next awaiting action in `actions` times out, or undefined when none is left. */
export function getNextTradingActionExpiryDelayMs(
	actions: readonly ConfirmationClock[],
	now = Date.now(),
	monotonicNow = performance.now(),
): number | undefined {
	let next: number | undefined;
	for (const action of actions) {
		if (action.phase !== "awaiting") continue;
		const remainingMs = getTradingActionConfirmationRemainingMs(action, now, monotonicNow);
		if (remainingMs === null || remainingMs <= 0) continue;
		next = next === undefined ? remainingMs : Math.min(next, remainingMs);
	}
	return next === undefined ? undefined : Math.ceil(next);
}

/**
 * Whether a frame received at `monotonicReceivedAt` arrived after the local event marked at
 * `monotonicMarkedAt`. Both are `performance.now()` readings from this document, so the order holds
 * whatever the system clock does; a missing reading never counts as after.
 */
export function wasReceivedAfter(monotonicReceivedAt: number | undefined, monotonicMarkedAt: number | null): boolean {
	return monotonicReceivedAt !== undefined && monotonicMarkedAt !== null && monotonicReceivedAt > monotonicMarkedAt;
}

function transitionAction<T extends TransitionableAction>(
	actions: readonly T[],
	id: string,
	phase: Extract<PendingTradingActionPhase, "awaiting" | "unconfirmed">,
	now: number,
	monotonicNow: number,
): T[] {
	return actions.map((action) =>
		action.id === id
			? {
					...action,
					phase,
					confirmationStartedAt: action.confirmationStartedAt ?? now,
					monotonicConfirmationStartedAt: action.monotonicConfirmationStartedAt ?? monotonicNow,
					unconfirmedAt: phase === "unconfirmed" ? (action.unconfirmedAt ?? now) : action.unconfirmedAt,
					monotonicUnconfirmedAt:
						phase === "unconfirmed" ? (action.monotonicUnconfirmedAt ?? monotonicNow) : action.monotonicUnconfirmedAt,
				}
			: action,
	);
}

function markRequestStarted<
	T extends { id: string; requestStartedAt: number | null; monotonicRequestStartedAt: number | null },
>(actions: readonly T[], id: string, now: number, monotonicNow: number): T[] {
	return actions.map((action) =>
		action.id === id
			? {
					...action,
					requestStartedAt: action.requestStartedAt ?? now,
					monotonicRequestStartedAt: action.monotonicRequestStartedAt ?? monotonicNow,
				}
			: action,
	);
}

function expireAwaitingAction<T extends TransitionableAction>(
	actions: T[],
	id: string,
	now: number,
	monotonicNow: number,
): { actions: T[]; expired: boolean } {
	let expired = false;
	const next = actions.map((action) => {
		if (action.id !== id || action.phase !== "awaiting") return action;
		const remainingMs = getTradingActionConfirmationRemainingMs(action, now, monotonicNow);
		if (remainingMs === null || remainingMs > 0) return action;
		expired = true;
		return {
			...action,
			phase: "unconfirmed" as const,
			unconfirmedAt: action.unconfirmedAt ?? now,
			monotonicUnconfirmedAt: action.monotonicUnconfirmedAt ?? monotonicNow,
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
				monotonicRequestStartedAt: null,
				monotonicConfirmationStartedAt: null,
				monotonicUnconfirmedAt: null,
			};
			set((current) => ({ modifications: [...current.modifications, action] }));
			return action;
		},
		markModificationRequestStarted: (id, now = Date.now(), monotonicNow = performance.now()) => {
			set((state) => ({ modifications: markRequestStarted(state.modifications, id, now, monotonicNow) }));
		},
		markModificationAwaiting: (id, now = Date.now(), monotonicNow = performance.now()) => {
			set((state) => ({ modifications: transitionAction(state.modifications, id, "awaiting", now, monotonicNow) }));
		},
		markModificationUnconfirmed: (id, now = Date.now(), monotonicNow = performance.now()) => {
			set((state) => ({ modifications: transitionAction(state.modifications, id, "unconfirmed", now, monotonicNow) }));
		},
		expireModificationAwaiting: (id, now = Date.now(), monotonicNow = performance.now()) => {
			let expired = false;
			set((state) => {
				const result = expireAwaitingAction(state.modifications, id, now, monotonicNow);
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
				monotonicRequestStartedAt: null,
				monotonicConfirmationStartedAt: null,
				monotonicUnconfirmedAt: null,
			};
			set((current) => ({ orderCancellations: [...current.orderCancellations, action] }));
			return action;
		},
		markOrderCancellationRequestStarted: (id, now = Date.now(), monotonicNow = performance.now()) => {
			set((state) => ({ orderCancellations: markRequestStarted(state.orderCancellations, id, now, monotonicNow) }));
		},
		markOrderCancellationAwaiting: (id, now = Date.now(), monotonicNow = performance.now()) => {
			set((state) => ({
				orderCancellations: transitionAction(state.orderCancellations, id, "awaiting", now, monotonicNow),
			}));
		},
		markOrderCancellationUnconfirmed: (id, now = Date.now(), monotonicNow = performance.now()) => {
			set((state) => ({
				orderCancellations: transitionAction(state.orderCancellations, id, "unconfirmed", now, monotonicNow),
			}));
		},
		expireOrderCancellationAwaiting: (id, now = Date.now(), monotonicNow = performance.now()) => {
			let expired = false;
			set((state) => {
				const result = expireAwaitingAction(state.orderCancellations, id, now, monotonicNow);
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
				monotonicRequestStartedAt: null,
				monotonicConfirmationStartedAt: null,
				monotonicUnconfirmedAt: null,
			};
			set((current) => ({ twapCancellations: [...current.twapCancellations, action] }));
			return action;
		},
		markTwapCancellationRequestStarted: (id, now = Date.now(), monotonicNow = performance.now()) => {
			set((state) => ({ twapCancellations: markRequestStarted(state.twapCancellations, id, now, monotonicNow) }));
		},
		markTwapCancellationAwaiting: (id, now = Date.now(), monotonicNow = performance.now()) => {
			set((state) => ({
				twapCancellations: transitionAction(state.twapCancellations, id, "awaiting", now, monotonicNow),
			}));
		},
		markTwapCancellationUnconfirmed: (id, now = Date.now(), monotonicNow = performance.now()) => {
			set((state) => ({
				twapCancellations: transitionAction(state.twapCancellations, id, "unconfirmed", now, monotonicNow),
			}));
		},
		expireTwapCancellationAwaiting: (id, now = Date.now(), monotonicNow = performance.now()) => {
			let expired = false;
			set((state) => {
				const result = expireAwaitingAction(state.twapCancellations, id, now, monotonicNow);
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
