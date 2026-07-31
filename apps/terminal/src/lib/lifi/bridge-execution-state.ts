import type { RouteExtended } from "@lifi/sdk";
import { useEffect } from "react";
import { create } from "zustand";
import { type BridgeRouteIdentity, loadPersistedBridgeExecution } from "./bridge-execution-persistence";

export type BridgeStatus = "idle" | "executing" | "success" | "error";

export interface ProcessDetail {
	type: string;
	txHash: string;
	txLink: string;
	startedAt: number;
	doneAt: number | null;
}

export interface BridgeState {
	status: BridgeStatus;
	statusText: string;
	error: string | null;
	txHash: string | null;
	receivedAmount: string | null;
	startTime: number | null;
	endTime: number | null;
	processDetails: ProcessDetail[];
	latestRoute: RouteExtended | null;
	routeIdentity: BridgeRouteIdentity | null;
	expectedToAmount: string | null;
	sourceAddress: string | null;
	sourceChainId: number | null;
	canAbandon: boolean;
	recoveryWarning: string | null;
}

export const INITIAL_BRIDGE_STATE: BridgeState = {
	status: "idle",
	statusText: "",
	error: null,
	txHash: null,
	receivedAmount: null,
	startTime: null,
	endTime: null,
	processDetails: [],
	latestRoute: null,
	routeIdentity: null,
	expectedToAmount: null,
	sourceAddress: null,
	sourceChainId: null,
	canAbandon: true,
	recoveryWarning: null,
};

export const useBridgeExecutionState = create<BridgeState>(() => INITIAL_BRIDGE_STATE);

function hasSameAddress(left: string | null | undefined, right: string | null | undefined): boolean {
	return !!left && !!right && left.toLowerCase() === right.toLowerCase();
}

export function useHasExistingBridgeExecution(walletAddress: string | undefined): boolean {
	const status = useBridgeExecutionState((state) => state.status);
	const sourceAddress = useBridgeExecutionState((state) => state.sourceAddress);

	useEffect(() => {
		if (!walletAddress || status !== "idle" || useBridgeExecutionState.getState().status !== "idle") return;
		const persisted = loadPersistedBridgeExecution(walletAddress);
		if (!persisted) return;

		useBridgeExecutionState.setState({
			status: "error",
			statusText: "Bridge execution paused",
			error: "This bridge was interrupted by a page reload. Retry to resume status tracking.",
			txHash: null,
			receivedAmount: null,
			startTime: persisted.startTime,
			endTime: null,
			processDetails: [],
			latestRoute: persisted.route,
			routeIdentity: persisted.identity,
			expectedToAmount: persisted.expectedToAmount,
			sourceAddress: persisted.identity.sourceAddress,
			sourceChainId: persisted.identity.sourceChainId,
			canAbandon: false,
			recoveryWarning: null,
		});
	}, [status, walletAddress]);

	return status !== "idle" && hasSameAddress(sourceAddress, walletAddress);
}
