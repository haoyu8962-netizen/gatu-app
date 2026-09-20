import { create } from "zustand";
import type {
	IsolatedMarginPositionTarget,
	LimitClosePositionData,
	TpSlPositionTarget,
} from "@/components/trade/positions/position-dialog-types";
import type { PositionCloseAllSnapshot } from "@/domain/trade/position-close-all";
import type { PositionReverseTarget } from "@/hooks/trade/use-position-reverse-submit";

export interface PositionCloseAllSession {
	sessionId: string;
	snapshot: PositionCloseAllSnapshot;
}

export interface PositionReverseSession {
	sessionId: string;
	target: PositionReverseTarget;
}

export interface PositionLimitCloseSession {
	sessionId: string;
	position: LimitClosePositionData;
}

export interface PositionTpSlSession {
	sessionId: string;
	position: TpSlPositionTarget;
}

export interface PositionIsolatedMarginSession {
	sessionId: string;
	position: IsolatedMarginPositionTarget;
}

interface PositionDialogActions {
	openCloseAll: (snapshot: PositionCloseAllSnapshot) => void;
	endCloseAll: (sessionId: string) => void;
	openReverse: (target: PositionReverseTarget) => void;
	endReverse: (sessionId: string) => void;
	openLimitClose: (position: LimitClosePositionData) => void;
	endLimitClose: (sessionId: string) => void;
	openTpSl: (position: TpSlPositionTarget) => void;
	endTpSl: (sessionId: string) => void;
	openIsolatedMargin: (position: IsolatedMarginPositionTarget) => void;
	endIsolatedMargin: (sessionId: string) => void;
}

interface PositionDialogStore {
	closeAll: PositionCloseAllSession | null;
	reverse: PositionReverseSession | null;
	limitClose: PositionLimitCloseSession | null;
	tpSl: PositionTpSlSession | null;
	isolatedMargin: PositionIsolatedMarginSession | null;
	actions: PositionDialogActions;
}

let sessionCount = 0;

function nextSessionId(kind: string): string {
	sessionCount += 1;
	return `${kind}:${sessionCount}`;
}

function isSameIdentity(a: { owner: string; env: string }, b: { owner: string; env: string }): boolean {
	return a.owner === b.owner && a.env === b.env;
}

const usePositionDialogStore = create<PositionDialogStore>((set) => ({
	closeAll: null,
	reverse: null,
	limitClose: null,
	tpSl: null,
	isolatedMargin: null,
	actions: {
		openCloseAll: (snapshot) =>
			set((state) => {
				if (state.closeAll && isSameIdentity(state.closeAll.snapshot, snapshot)) return state;
				return { closeAll: { sessionId: nextSessionId("close-all"), snapshot } };
			}),
		endCloseAll: (sessionId) => set((state) => (state.closeAll?.sessionId === sessionId ? { closeAll: null } : state)),
		openReverse: (target) =>
			set((state) => {
				if (state.reverse && isSameIdentity(state.reverse.target, target)) return state;
				return { reverse: { sessionId: nextSessionId("reverse"), target } };
			}),
		endReverse: (sessionId) => set((state) => (state.reverse?.sessionId === sessionId ? { reverse: null } : state)),
		openLimitClose: (position) =>
			set((state) => {
				if (state.limitClose) return state;
				return { limitClose: { sessionId: nextSessionId("limit-close"), position } };
			}),
		endLimitClose: (sessionId) =>
			set((state) => (state.limitClose?.sessionId === sessionId ? { limitClose: null } : state)),
		openTpSl: (position) =>
			set((state) => {
				if (state.tpSl && isSameIdentity(state.tpSl.position, position)) return state;
				return { tpSl: { sessionId: nextSessionId("tpsl"), position } };
			}),
		endTpSl: (sessionId) => set((state) => (state.tpSl?.sessionId === sessionId ? { tpSl: null } : state)),
		openIsolatedMargin: (position) =>
			set((state) => {
				if (state.isolatedMargin && isSameIdentity(state.isolatedMargin.position, position)) return state;
				return { isolatedMargin: { sessionId: nextSessionId("isolated-margin"), position } };
			}),
		endIsolatedMargin: (sessionId) =>
			set((state) => (state.isolatedMargin?.sessionId === sessionId ? { isolatedMargin: null } : state)),
	},
}));

export function usePositionCloseAllSession(): PositionCloseAllSession | null {
	return usePositionDialogStore((state) => state.closeAll);
}

export function usePositionReverseSession(): PositionReverseSession | null {
	return usePositionDialogStore((state) => state.reverse);
}

export function usePositionLimitCloseSession(): PositionLimitCloseSession | null {
	return usePositionDialogStore((state) => state.limitClose);
}

export function usePositionTpSlSession(): PositionTpSlSession | null {
	return usePositionDialogStore((state) => state.tpSl);
}

export function usePositionIsolatedMarginSession(): PositionIsolatedMarginSession | null {
	return usePositionDialogStore((state) => state.isolatedMargin);
}

export function useHasPositionDialogSession(): boolean {
	return usePositionDialogStore(
		(state) =>
			state.closeAll !== null ||
			state.reverse !== null ||
			state.limitClose !== null ||
			state.tpSl !== null ||
			state.isolatedMargin !== null,
	);
}

export function usePositionDialogActions(): PositionDialogActions {
	return usePositionDialogStore((state) => state.actions);
}

export function resetPositionDialogSessions(): void {
	usePositionDialogStore.setState({
		closeAll: null,
		reverse: null,
		limitClose: null,
		tpSl: null,
		isolatedMargin: null,
	});
}
