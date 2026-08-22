import type { RouteExtended } from "@lifi/sdk";
import {
	convertQuoteToRoute,
	executeRoute,
	isGaslessStep,
	isRelayerStep,
	resumeRoute,
	updateRouteExecution,
} from "@lifi/sdk";
import { t } from "@lingui/core/macro";
import { useCallback } from "react";
import { LIFI_BRIDGE_FEATURES } from "@/config/lifi-bridge";
import { useFreshLegalActionGuard } from "@/hooks/trade/use-fresh-legal-action-guard";
import { isSafeHttpUrl } from "@/lib/safe-url";
import {
	type BridgeRouteIdentity,
	clearPersistedBridgeExecution,
	getBridgeRouteIdentity,
	hasCommittedBridgeFunds,
	hasSameBridgeRouteIdentity,
	isBridgeRecoveryStorageAvailable,
	isBridgeRouteRecoveryCompatible,
	persistCommittedBridgeExecution,
	prepareCommittedBridgeRouteForTracking,
} from "./bridge-execution-persistence";
import {
	type BridgeState,
	INITIAL_BRIDGE_STATE,
	type ProcessDetail,
	useBridgeExecutionState,
} from "./bridge-execution-state";
import { getActiveLiFiWalletAddress, runWithLiFiExecutionWallet } from "./config";
import type { BridgeQuote } from "./use-quote";

export type { ProcessDetail } from "./bridge-execution-state";

export type BridgeOutcome = "success" | "error" | "rejected" | "disabled";
export type BridgeRetryMode = "retry" | "track";
export type BridgeLegalActionGuard = () => Promise<void>;

let bridgeExecutionEpoch = 0;

const MISSING_LEGAL_ACTION_GUARD: BridgeLegalActionGuard = () => Promise.reject(new Error("Legal guard unavailable"));
const UNSUPPORTED_MESSAGE_SIGNING_ERROR =
	"This bridge route requires unsupported message signing and was not submitted.";

function requiresUnsupportedMessageSigning(route: RouteExtended): boolean {
	return route.steps.some((step) => {
		if (isGaslessStep(step) || isRelayerStep(step)) return true;
		return (
			step.execution?.process.some(
				(process) =>
					process.type === "PERMIT" ||
					process.status === "MESSAGE_REQUIRED" ||
					(Array.isArray(process.signedTypedData) && process.signedTypedData.length > 0),
			) ?? false
		);
	});
}

function assertBridgeRouteDoesNotRequireMessageSigning(
	route: RouteExtended,
	options: { allowCommittedTracking?: boolean } = {},
): void {
	if (!requiresUnsupportedMessageSigning(route)) return;
	if (options.allowCommittedTracking && hasCommittedBridgeFunds(route)) return;
	throw new Error(UNSUPPORTED_MESSAGE_SIGNING_ERROR);
}

async function assertBridgeWriteAllowed(guard: BridgeLegalActionGuard, identity: BridgeRouteIdentity): Promise<void> {
	try {
		await guard();
	} catch {
		throw new Error(t`Unable to verify regional availability. This funds action was not submitted.`);
	}

	if (!hasSameAddress(getActiveLiFiWalletAddress(), identity.sourceAddress)) {
		throw new Error("The active wallet does not match this bridge route.");
	}
}

async function verifyBridgeWriteAllowed(
	guard: BridgeLegalActionGuard,
	identity: BridgeRouteIdentity,
): Promise<boolean> {
	try {
		await assertBridgeWriteAllowed(guard, identity);
	} catch (error) {
		useBridgeExecutionState.setState({
			status: "error",
			error:
				error instanceof Error
					? error.message
					: t`Unable to verify regional availability. This funds action was not submitted.`,
			endTime: Date.now(),
			canAbandon: true,
			isBackgrounded: false,
		});
		return false;
	}
	return true;
}

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
	return route.steps.length > 0 && route.steps.every((step) => step.execution?.status === "DONE");
}

function hasPossiblyCommittedFunds(route: RouteExtended): boolean {
	for (const step of route.steps) {
		if (!step.execution) continue;
		for (const process of step.execution.process) {
			if (process.type === "TOKEN_ALLOWANCE") continue;
			const hasSignedData = Array.isArray(process.signedTypedData) && process.signedTypedData.length > 0;
			if (process.txHash || process.taskId || hasSignedData) return true;
		}
	}
	return false;
}

function getRouteToAmount(route: RouteExtended, fallback: string): string {
	return route.steps.at(-1)?.execution?.toAmount ?? fallback;
}

function hasSameAddress(left: string | null | undefined, right: string | null | undefined): boolean {
	return !!left && !!right && left.toLowerCase() === right.toLowerCase();
}

function updateBridgeRoute(route: RouteExtended, expectedIdentity: BridgeRouteIdentity, executionEpoch: number) {
	if (executionEpoch !== bridgeExecutionEpoch) return;
	const identity = getBridgeRouteIdentity(route);
	if (!hasSameBridgeRouteIdentity(identity, expectedIdentity)) {
		throw new Error("LI.FI returned a bridge route that does not match the approved route.");
	}

	const current = useBridgeExecutionState.getState();
	const txHash = getLastTxHash(route);
	const processDetails = getAllProcessDetails(route);
	const canAbandon = !hasPossiblyCommittedFunds(route);

	if (isRouteDone(route)) {
		clearPersistedBridgeExecution();
		useBridgeExecutionState.setState({
			status: "success",
			statusText: "Bridge complete",
			error: null,
			txHash,
			receivedAmount: getRouteToAmount(route, current.expectedToAmount ?? "0"),
			endTime: Date.now(),
			processDetails,
			latestRoute: route,
			routeIdentity: expectedIdentity,
			canAbandon,
			isBackgrounded: false,
			sourceAddress: expectedIdentity.sourceAddress,
			sourceChainId: expectedIdentity.sourceChainId,
			recoveryWarning: null,
		});
		return;
	}

	let recoveryWarning = current.recoveryWarning;
	if (hasCommittedBridgeFunds(route) && current.expectedToAmount && current.startTime) {
		const persisted = persistCommittedBridgeExecution({
			route,
			expectedToAmount: current.expectedToAmount,
			startTime: current.startTime,
		});
		recoveryWarning = persisted
			? null
			: "Reload recovery could not be saved. Keep this tab open until the bridge completes.";
	}

	useBridgeExecutionState.setState({
		statusText: getProcessStatusText(route),
		txHash: txHash ?? current.txHash,
		processDetails,
		latestRoute: route,
		routeIdentity: expectedIdentity,
		canAbandon,
		sourceAddress: expectedIdentity.sourceAddress,
		sourceChainId: expectedIdentity.sourceChainId,
		recoveryWarning,
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
	identity: BridgeRouteIdentity,
	executionEpoch: number,
	resetOnUserRejection: boolean,
	legalActionGuard?: BridgeLegalActionGuard,
): Promise<BridgeOutcome> {
	try {
		if (legalActionGuard) assertBridgeRouteDoesNotRequireMessageSigning(route);
		const result = await runWithLiFiExecutionWallet(identity.sourceAddress, identity.sourceChainId, () =>
			runner(route, {
				disableMessageSigning: true,
				updateRouteHook: (updatedRoute) => {
					if (legalActionGuard) {
						assertBridgeRouteDoesNotRequireMessageSigning(updatedRoute, { allowCommittedTracking: true });
					}
					updateBridgeRoute(updatedRoute, identity, executionEpoch);
				},
				...(legalActionGuard
					? {
							updateTransactionRequestHook: async (transactionRequest) => {
								await assertBridgeWriteAllowed(legalActionGuard, identity);
								return transactionRequest;
							},
						}
					: {}),
			}),
		);
		if (executionEpoch !== bridgeExecutionEpoch) return "error";
		updateBridgeRoute(result, identity, executionEpoch);
		if (isRouteDone(result)) return "success";

		useBridgeExecutionState.setState({
			status: "error",
			error: t`Request status could not be confirmed. Check balances and transfer history before retrying.`,
			endTime: Date.now(),
		});
		return "error";
	} catch (error) {
		if (executionEpoch !== bridgeExecutionEpoch) return "error";
		const stateBeforeRecovery = useBridgeExecutionState.getState();
		const committedRoute = [stateBeforeRecovery.latestRoute, route].find(
			(candidate): candidate is RouteExtended => !!candidate && hasCommittedBridgeFunds(candidate),
		);
		if (committedRoute) {
			try {
				updateBridgeRoute(committedRoute, identity, executionEpoch);
			} catch {}
		}
		if (useBridgeExecutionState.getState().status === "success") return "success";

		const current = useBridgeExecutionState.getState();
		const latestRoute = current.latestRoute;
		const canAbandon = latestRoute ? !hasPossiblyCommittedFunds(latestRoute) : current.canAbandon;
		if (isUserRejection(error) && canAbandon) {
			if (resetOnUserRejection) {
				clearPersistedBridgeExecution();
				useBridgeExecutionState.setState(INITIAL_BRIDGE_STATE);
			} else {
				useBridgeExecutionState.setState({
					status: "error",
					error: t`Transaction was rejected`,
					endTime: Date.now(),
					canAbandon: true,
					isBackgrounded: false,
				});
			}
			return "rejected";
		}

		useBridgeExecutionState.setState({
			status: "error",
			error: error instanceof Error ? error.message : "Bridge failed",
			endTime: Date.now(),
			canAbandon,
			isBackgrounded: false,
		});
		return "error";
	}
}

export async function executeBridgeQuote(
	quote: BridgeQuote,
	legalActionGuard: BridgeLegalActionGuard = MISSING_LEGAL_ACTION_GUARD,
): Promise<BridgeOutcome> {
	if (!LIFI_BRIDGE_FEATURES.createNewRoute) return "disabled";
	if (useBridgeExecutionState.getState().status !== "idle") return "error";
	if (!isBridgeRecoveryStorageAvailable()) {
		useBridgeExecutionState.setState({
			status: "error",
			error: "Secure reload recovery is unavailable in this browser. Bridge execution was not started.",
			endTime: Date.now(),
		});
		return "error";
	}

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

	const identity = getBridgeRouteIdentity(route);
	const activeWalletAddress = getActiveLiFiWalletAddress();
	if (
		!identity ||
		!isBridgeRouteRecoveryCompatible(route) ||
		!hasSameAddress(activeWalletAddress, identity.sourceAddress)
	) {
		useBridgeExecutionState.setState({
			status: "error",
			error: "The active wallet does not match this bridge route.",
			endTime: Date.now(),
		});
		return "error";
	}
	try {
		assertBridgeRouteDoesNotRequireMessageSigning(route);
	} catch (error) {
		useBridgeExecutionState.setState({
			status: "error",
			error: error instanceof Error ? error.message : UNSUPPORTED_MESSAGE_SIGNING_ERROR,
			endTime: Date.now(),
		});
		return "error";
	}
	useBridgeExecutionState.setState({
		status: "executing",
		statusText: "Verifying access...",
		error: null,
		txHash: null,
		receivedAmount: null,
		startTime: Date.now(),
		endTime: null,
		processDetails: [],
		latestRoute: route,
		routeIdentity: identity,
		expectedToAmount: quote.toAmount,
		sourceAddress: identity.sourceAddress,
		sourceChainId: identity.sourceChainId,
		canAbandon: true,
		isBackgrounded: false,
		recoveryWarning: null,
	});
	if (!(await verifyBridgeWriteAllowed(legalActionGuard, identity))) return "error";
	clearPersistedBridgeExecution();
	useBridgeExecutionState.setState({ statusText: "Preparing transaction..." });

	const executionEpoch = ++bridgeExecutionEpoch;
	return runBridgeRoute(route, executeRoute, identity, executionEpoch, true, legalActionGuard);
}

function getBridgeRetryMode(state: BridgeState): BridgeRetryMode | null {
	if (state.status !== "error" || !state.latestRoute || !state.routeIdentity) return null;
	const identity = getBridgeRouteIdentity(state.latestRoute);
	if (!hasSameBridgeRouteIdentity(identity, state.routeIdentity)) return null;
	if (hasCommittedBridgeFunds(state.latestRoute)) return "track";
	return LIFI_BRIDGE_FEATURES.createNewRoute ? "retry" : null;
}

export async function retryBridgeExecution(
	legalActionGuard: BridgeLegalActionGuard = MISSING_LEGAL_ACTION_GUARD,
): Promise<BridgeOutcome> {
	const current = useBridgeExecutionState.getState();
	if (current.status !== "error" || !current.latestRoute || !current.routeIdentity) return "error";
	const identity = getBridgeRouteIdentity(current.latestRoute);
	const activeWalletAddress = getActiveLiFiWalletAddress();
	if (
		!hasSameBridgeRouteIdentity(identity, current.routeIdentity) ||
		!hasSameAddress(current.sourceAddress, current.routeIdentity.sourceAddress) ||
		current.sourceChainId !== current.routeIdentity.sourceChainId ||
		!hasSameAddress(activeWalletAddress, current.routeIdentity.sourceAddress)
	) {
		return "error";
	}

	const hasCommittedTransaction = hasCommittedBridgeFunds(current.latestRoute);
	if (!hasCommittedTransaction) {
		try {
			assertBridgeRouteDoesNotRequireMessageSigning(current.latestRoute);
		} catch (error) {
			useBridgeExecutionState.setState({
				error: error instanceof Error ? error.message : UNSUPPORTED_MESSAGE_SIGNING_ERROR,
				endTime: Date.now(),
				canAbandon: true,
				isBackgrounded: false,
			});
			return "error";
		}
	}
	if (!LIFI_BRIDGE_FEATURES.createNewRoute && !hasCommittedTransaction) {
		useBridgeExecutionState.setState({
			error: "Bridge creation is paused. This route did not submit a source transaction and cannot be retried.",
			endTime: Date.now(),
		});
		return "disabled";
	}
	const route = hasCommittedTransaction
		? prepareCommittedBridgeRouteForTracking(current.latestRoute)
		: current.latestRoute;
	if (!route) {
		useBridgeExecutionState.setState({
			error: "The submitted bridge transaction could not be prepared for safe status tracking.",
			endTime: Date.now(),
		});
		return "error";
	}

	useBridgeExecutionState.setState({
		status: "executing",
		statusText: hasCommittedTransaction ? "Checking the submitted bridge transaction..." : "Verifying access...",
		error: null,
		endTime: null,
		latestRoute: route,
		isBackgrounded: false,
	});
	if (!hasCommittedTransaction && !(await verifyBridgeWriteAllowed(legalActionGuard, current.routeIdentity))) {
		return "error";
	}
	if (!hasCommittedTransaction) useBridgeExecutionState.setState({ statusText: getProcessStatusText(route) });

	const executionEpoch = ++bridgeExecutionEpoch;
	return runBridgeRoute(
		route,
		resumeRoute,
		current.routeIdentity,
		executionEpoch,
		false,
		hasCommittedTransaction ? undefined : legalActionGuard,
	);
}

export function resetBridgeExecution(): boolean {
	const current = useBridgeExecutionState.getState();
	if (current.status === "executing" || (current.status === "error" && !current.canAbandon)) return false;
	bridgeExecutionEpoch += 1;
	clearPersistedBridgeExecution();
	useBridgeExecutionState.setState(INITIAL_BRIDGE_STATE);
	return true;
}

export function continueBridgeInBackground(): boolean {
	const current = useBridgeExecutionState.getState();
	if (current.status !== "executing" || !current.latestRoute || !current.routeIdentity) return false;
	if (!hasSameAddress(getActiveLiFiWalletAddress(), current.sourceAddress)) return false;
	if (!hasSameBridgeRouteIdentity(getBridgeRouteIdentity(current.latestRoute), current.routeIdentity)) return false;
	updateRouteExecution(current.latestRoute, { executeInBackground: true });
	useBridgeExecutionState.setState({ isBackgrounded: true });
	return true;
}

export function restoreBridgeInForeground(
	legalActionGuard: BridgeLegalActionGuard = MISSING_LEGAL_ACTION_GUARD,
): boolean {
	const current = useBridgeExecutionState.getState();
	if (!current.isBackgrounded || !current.latestRoute || !current.routeIdentity) return false;
	if (!hasSameAddress(getActiveLiFiWalletAddress(), current.sourceAddress)) return false;
	if (!hasSameBridgeRouteIdentity(getBridgeRouteIdentity(current.latestRoute), current.routeIdentity)) return false;

	if (current.status === "executing") {
		updateRouteExecution(current.latestRoute, { executeInBackground: false });
		useBridgeExecutionState.setState({ isBackgrounded: false });
		return true;
	}
	if (current.status !== "error") return false;

	useBridgeExecutionState.setState({ isBackgrounded: false });
	void retryBridgeExecution(legalActionGuard);
	return true;
}

export function useBridgeExecutor() {
	const state = useBridgeExecutionState();
	const { env, verify: verifyFreshLegalAction } = useFreshLegalActionGuard();
	const legalActionGuard = useCallback(() => verifyFreshLegalAction({ env }), [env, verifyFreshLegalAction]);
	const execute = useCallback((quote: BridgeQuote) => executeBridgeQuote(quote, legalActionGuard), [legalActionGuard]);
	const retry = useCallback(() => retryBridgeExecution(legalActionGuard), [legalActionGuard]);
	const restoreInForeground = useCallback(() => restoreBridgeInForeground(legalActionGuard), [legalActionGuard]);
	return {
		...state,
		retryMode: getBridgeRetryMode(state),
		execute,
		retry,
		reset: resetBridgeExecution,
		continueInBackground: continueBridgeInBackground,
		restoreInForeground,
	};
}
