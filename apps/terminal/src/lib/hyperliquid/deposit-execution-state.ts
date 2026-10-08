import type { Hash } from "viem";
import { create } from "zustand";

export type DepositExecutionStatus = "idle" | "pending" | "confirming" | "success" | "error";

export interface DepositExecutionState {
	status: DepositExecutionStatus;
	error: Error | null;
	hash: Hash | undefined;
	amount: string | null;
	route: "bridge" | "cctp" | null;
	cctpRecoveryUnavailable: boolean;
	submissionOutcomeUnknown: boolean;
	walletResponseDelayed: boolean;
	networkSwitchPending: boolean;
}

interface DepositExecutionEntry {
	state: DepositExecutionState;
	operationId: number;
	inFlight: boolean;
}

interface DepositExecutionStore {
	entries: Record<string, DepositExecutionEntry>;
}

const IDLE_DEPOSIT_STATE = createIdleDepositExecutionState();
const useDepositExecutionStore = create<DepositExecutionStore>()(() => ({ entries: {} }));
const activeDepositLocks = new Map<string, { executionKey: string; operationId: number }>();

export function useDepositExecutionState(executionKey: string): DepositExecutionState {
	return useDepositExecutionStore((current) => current.entries[executionKey]?.state ?? IDLE_DEPOSIT_STATE);
}

export function getDepositExecutionState(executionKey: string): DepositExecutionState {
	return getDepositExecutionEntry(executionKey)?.state ?? IDLE_DEPOSIT_STATE;
}

export function startDepositExecution(
	executionKey: string,
	lockKey: string,
	amount: string,
	route: "bridge" | "cctp",
): number | null {
	const current = getDepositExecutionEntry(executionKey);
	if (current?.inFlight || activeDepositLocks.has(lockKey)) return null;

	const operationId = (current?.operationId ?? 0) + 1;
	setDepositExecutionEntry(executionKey, {
		state: {
			status: "pending",
			error: null,
			hash: undefined,
			amount,
			route,
			cctpRecoveryUnavailable: false,
			submissionOutcomeUnknown: false,
			walletResponseDelayed: false,
			networkSwitchPending: false,
		},
		operationId,
		inFlight: true,
	});
	activeDepositLocks.set(lockKey, { executionKey, operationId });
	return operationId;
}

export function setBlockedDepositExecution(executionKey: string, error: Error): void {
	const current = getDepositExecutionEntry(executionKey);
	if (current?.inFlight) return;
	setDepositExecutionEntry(executionKey, {
		state: {
			status: "error",
			error,
			hash: undefined,
			amount: null,
			route: null,
			cctpRecoveryUnavailable: false,
			submissionOutcomeUnknown: false,
			walletResponseDelayed: false,
			networkSwitchPending: false,
		},
		operationId: (current?.operationId ?? 0) + 1,
		inFlight: false,
	});
}

export function updateDepositExecutionState(
	executionKey: string,
	operationId: number,
	update: DepositExecutionState | ((previous: DepositExecutionState) => DepositExecutionState),
): boolean {
	const current = getDepositExecutionEntry(executionKey);
	if (!current || current.operationId !== operationId) return false;

	setDepositExecutionEntry(executionKey, {
		...current,
		state: typeof update === "function" ? update(current.state) : update,
	});
	return true;
}

export function isCurrentDepositExecution(executionKey: string, operationId: number): boolean {
	return getDepositExecutionEntry(executionKey)?.operationId === operationId;
}

export function finishDepositExecution(executionKey: string, lockKey: string, operationId: number): void {
	const current = getDepositExecutionEntry(executionKey);
	if (!current || current.operationId !== operationId) return;
	setDepositExecutionEntry(executionKey, { ...current, inFlight: false });

	const activeLock = activeDepositLocks.get(lockKey);
	if (activeLock?.executionKey === executionKey && activeLock.operationId === operationId) {
		activeDepositLocks.delete(lockKey);
	}
}

export function resetDepositExecution(executionKey: string): boolean {
	const current = getDepositExecutionEntry(executionKey);
	if (current?.inFlight) return false;
	setDepositExecutionEntry(executionKey, {
		state: createIdleDepositExecutionState(),
		operationId: (current?.operationId ?? 0) + 1,
		inFlight: false,
	});
	return true;
}

function createIdleDepositExecutionState(): DepositExecutionState {
	return {
		status: "idle",
		error: null,
		hash: undefined,
		amount: null,
		route: null,
		cctpRecoveryUnavailable: false,
		submissionOutcomeUnknown: false,
		walletResponseDelayed: false,
		networkSwitchPending: false,
	};
}

function getDepositExecutionEntry(key: string): DepositExecutionEntry | undefined {
	return useDepositExecutionStore.getState().entries[key];
}

function setDepositExecutionEntry(key: string, entry: DepositExecutionEntry): void {
	useDepositExecutionStore.setState((current) => ({ entries: { ...current.entries, [key]: entry } }));
}
