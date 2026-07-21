import type { RouteExtended } from "@lifi/sdk";
import { convertQuoteToRoute, executeRoute, resumeRoute, updateRouteExecution } from "@lifi/sdk";
import { create } from "zustand";
import { isSafeHttpUrl } from "@/lib/safe-url";
import type { BridgeQuote } from "./use-quote";

type BridgeStatus = "idle" | "executing" | "success" | "error";

export type BridgeOutcome = "success" | "error" | "rejected";

export interface ProcessDetail {
	type: string;
	txHash: string;
	txLink: string;
	startedAt: number;
	doneAt: number | null;
}

interface BridgeState {
	status: BridgeStatus;
	statusText: string;
	error: string | null;
	txHash: string | null;
	receivedAmount: string | null;
	startTime: number | null;
	endTime: number | null;
	processDetails: ProcessDetail[];
	latestRoute: RouteExtended | null;
	expectedToAmount: string | null;
	sourceAddress: string | null;
	canAbandon: boolean;
}

const INITIAL_STATE: BridgeState = {
	status: "idle",
	statusText: "",
	error: null,
	txHash: null,
	receivedAmount: null,
	startTime: null,
	endTime: null,
	processDetails: [],
	latestRoute: null,
	expectedToAmount: null,
	sourceAddress: null,
	canAbandon: true,
};

const useBridgeExecutionState = create<BridgeState>(() => INITIAL_STATE);

function getProcessStatusText(route: RouteExtended): string {
	for (const step of route.steps) {
		if (!step.execution) continue;
		for (const process of step.execution.process) {
			if (process.status === "DONE") continue;
			if (process.message) return process.message;
			switch (process.type) {
				case "TOKEN_ALLOWANCE":
					return `Approving ${step.action.fromToken.symbol}...`;
				case "SWAP":
					return `Swapping on ${step.action.fromChainId === step.action.toChainId ? "same chain" : "source chain"}...`;
				case "CROSS_CHAIN":
					return "Bridging to Hyperliquid...";
				case "RECEIVING_CHAIN":
					return "Confirming on destination...";
			}
		}
	}
	return "Processing...";
}

function getLastTxHash(route: RouteExtended): string | null {
	for (let i = route.steps.length - 1; i >= 0; i--) {
		const step = route.steps[i];
		if (!step.execution) continue;
		for (let j = step.execution.process.length - 1; j >= 0; j--) {
			const process = step.execution.process[j];
			if (process.txHash) return process.txHash;
		}
	}
	return null;
}

function getAllProcessDetails(route: RouteExtended): ProcessDetail[] {
	const details: ProcessDetail[] = [];
	for (const step of route.steps) {
		if (!step.execution) continue;
		for (const process of step.execution.process) {
			if (!process.txHash) continue;
			details.push({
				type: process.type,
				txHash: process.txHash,
				txLink: isSafeHttpUrl(process.txLink) ? process.txLink : "",
				startedAt: process.startedAt,
				doneAt: process.doneAt ?? null,
			});
		}
	}
	return details;
}

function isRouteDone(route: RouteExtended): boolean {
	let hasProcess = false;
	for (const step of route.steps) {
		if (!step.execution) continue;
		for (const process of step.execution.process) {
			hasProcess = true;
			if (process.status !== "DONE") return false;
		}
	}
	return hasProcess;
}

function hasCommittedFunds(route: RouteExtended): boolean {
	for (const step of route.steps) {
		if (!step.execution) continue;
		for (const process of step.execution.process) {
			if (process.type === "TOKEN_ALLOWANCE" || process.status === "FAILED" || process.status === "CANCELLED") {
				continue;
			}
			const hasSignedData = Array.isArray(process.signedTypedData) && process.signedTypedData.length > 0;
			if (process.txHash || process.taskId || hasSignedData) return true;
		}
	}
	return false;
}

function getRouteToAmount(route: RouteExtended, fallback: string): string {
	return route.steps.at(-1)?.execution?.toAmount ?? fallback;
}

function getSourceAddress(route: RouteExtended): string | null {
	return route.steps[0]?.action.fromAddress ?? null;
}

function updateBridgeRoute(route: RouteExtended) {
	const current = useBridgeExecutionState.getState();
	const txHash = getLastTxHash(route);
	const processDetails = getAllProcessDetails(route);
	const canAbandon = !hasCommittedFunds(route);

	if (isRouteDone(route)) {
		useBridgeExecutionState.setState({
			status: "success",
			statusText: "Bridge complete",
			error: null,
			txHash,
			receivedAmount: getRouteToAmount(route, current.expectedToAmount ?? "0"),
			endTime: Date.now(),
			processDetails,
			latestRoute: route,
			canAbandon,
		});
		return;
	}

	useBridgeExecutionState.setState({
		statusText: getProcessStatusText(route),
		txHash: txHash ?? current.txHash,
		processDetails,
		latestRoute: route,
		canAbandon,
	});
}

function isUserRejection(error: unknown): boolean {
	const message = error instanceof Error ? error.message.toLowerCase() : "";
	return (
		message.includes("rejected") ||
		message.includes("denied") ||
		message.includes("cancelled") ||
		message.includes("canceled")
	);
}

async function runBridgeRoute(
	route: RouteExtended,
	runner: typeof executeRoute | typeof resumeRoute,
): Promise<BridgeOutcome> {
	try {
		const result = await runner(route, { updateRouteHook: updateBridgeRoute });
		updateBridgeRoute(result);
		if (isRouteDone(result)) return "success";

		useBridgeExecutionState.setState({
			status: "error",
			error: "Bridge execution paused before completion.",
			endTime: Date.now(),
		});
		return "error";
	} catch (error) {
		if (useBridgeExecutionState.getState().status === "success") return "success";

		const current = useBridgeExecutionState.getState();
		const latestRoute = current.latestRoute;
		const canAbandon = latestRoute ? !hasCommittedFunds(latestRoute) : current.canAbandon;
		if (isUserRejection(error) && canAbandon) {
			useBridgeExecutionState.setState(INITIAL_STATE);
			return "rejected";
		}

		useBridgeExecutionState.setState({
			status: "error",
			error: error instanceof Error ? error.message : "Bridge failed",
			endTime: Date.now(),
			canAbandon,
		});
		return "error";
	}
}

export async function executeBridgeQuote(quote: BridgeQuote): Promise<BridgeOutcome> {
	if (useBridgeExecutionState.getState().status !== "idle") return "error";

	let route: RouteExtended;
	try {
		route = convertQuoteToRoute(quote.step);
	} catch (error) {
		useBridgeExecutionState.setState({
			status: "error",
			error: error instanceof Error ? error.message : "Bridge failed",
			endTime: Date.now(),
		});
		return "error";
	}

	useBridgeExecutionState.setState({
		status: "executing",
		statusText: "Preparing transaction...",
		error: null,
		txHash: null,
		receivedAmount: null,
		startTime: Date.now(),
		endTime: null,
		processDetails: [],
		latestRoute: route,
		expectedToAmount: quote.toAmount,
		sourceAddress: getSourceAddress(route),
		canAbandon: true,
	});

	return runBridgeRoute(route, executeRoute);
}

export async function retryBridgeExecution(): Promise<BridgeOutcome> {
	const current = useBridgeExecutionState.getState();
	if (current.status !== "error" || !current.latestRoute) return "error";

	useBridgeExecutionState.setState({
		status: "executing",
		statusText: getProcessStatusText(current.latestRoute),
		error: null,
		endTime: null,
	});

	return runBridgeRoute(current.latestRoute, resumeRoute);
}

export function resetBridgeExecution(): boolean {
	const current = useBridgeExecutionState.getState();
	if (current.status === "executing" || (current.status === "error" && !current.canAbandon)) return false;
	useBridgeExecutionState.setState(INITIAL_STATE);
	return true;
}

export function continueBridgeInBackground(): boolean {
	const current = useBridgeExecutionState.getState();
	if (current.status !== "executing" || !current.latestRoute) return false;
	updateRouteExecution(current.latestRoute, { executeInBackground: true });
	return true;
}

export function useBridgeExecutor() {
	const state = useBridgeExecutionState();
	return {
		...state,
		execute: executeBridgeQuote,
		retry: retryBridgeExecution,
		reset: resetBridgeExecution,
		continueInBackground: continueBridgeInBackground,
	};
}
