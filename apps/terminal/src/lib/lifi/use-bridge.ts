import type { RouteExtended } from "@lifi/sdk";
import { convertQuoteToRoute, executeRoute } from "@lifi/sdk";
import { useRef, useState } from "react";
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
};

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

export function useBridgeExecutor() {
	const [state, setState] = useState<BridgeState>(INITIAL_STATE);
	const executingRef = useRef(false);

	async function execute(quote: BridgeQuote): Promise<BridgeOutcome> {
		if (executingRef.current) return "error";
		executingRef.current = true;

		const startedAt = Date.now();
		setState({
			status: "executing",
			statusText: "Preparing transaction...",
			error: null,
			txHash: null,
			receivedAmount: null,
			startTime: startedAt,
			endTime: null,
			processDetails: [],
		});

		try {
			const route = convertQuoteToRoute(quote.step);

			const result = await executeRoute(route, {
				updateRouteHook(updatedRoute) {
					const txHash = getLastTxHash(updatedRoute);
					const statusText = getProcessStatusText(updatedRoute);
					setState((prev) => ({
						...prev,
						statusText,
						txHash: txHash ?? prev.txHash,
						processDetails: getAllProcessDetails(updatedRoute),
					}));
				},
			});

			const toAmount = result.steps.at(-1)?.execution?.toAmount ?? quote.toAmount;

			setState({
				status: "success",
				statusText: "Bridge complete",
				error: null,
				txHash: getLastTxHash(result),
				receivedAmount: toAmount,
				startTime: startedAt,
				endTime: Date.now(),
				processDetails: getAllProcessDetails(result),
			});
			return "success";
		} catch (err) {
			const message = err instanceof Error ? err.message : "Bridge failed";
			const isUserRejection =
				message.includes("rejected") ||
				message.includes("denied") ||
				message.includes("cancelled") ||
				message.includes("user rejected");

			if (isUserRejection) {
				setState((prev) => ({
					...prev,
					status: "idle",
					statusText: "",
					error: null,
					endTime: Date.now(),
				}));
				return "rejected";
			}
			setState((prev) => ({
				...prev,
				status: "error",
				error: message,
				endTime: Date.now(),
			}));
			return "error";
		} finally {
			executingRef.current = false;
		}
	}

	function reset() {
		setState(INITIAL_STATE);
		executingRef.current = false;
	}

	return { ...state, execute, reset };
}
