import type { InfoClient } from "@nktkas/hyperliquid";
import Big from "big.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { isAddress, zeroAddress } from "viem";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { getReferralActionGeo, type ReferralActionGeoDecision } from "@/lib/geo/get-referral-action-geo";
import { useExchange, useHyperliquid, useLegalStatus } from "@/lib/hyperliquid";
import { hasSameWalletAddress } from "@/lib/wallet/privy-wagmi";
import {
	acquireFundsActionMarker,
	createFundsActionReference,
	type FundsActionReference,
	findPendingFundsAction,
	fundsActionReferencesEqual,
	getFundsActionMarkers,
	removeFundsActionMarkerSafely,
	useFundsActionMarkers,
} from "../funds-action/funds-action-marker";
import {
	createFundsActionHistoryBaseline,
	type FundsActionMatch,
	reconcileStakingFundsAction,
	type StakingReconciliationState,
	verifyStakingReconciliationState,
} from "../funds-action/funds-action-reconciliation";
import {
	createFundsActionState,
	type FundsActionState,
	isFundsActionLocked,
	transitionFundsAction,
} from "../funds-action/funds-action-state";
import {
	canDelegateToValidator,
	canUndelegate,
	parseSpotHypeAvailable,
	parseStakingDelegations,
	parseStakingHistory,
	parseStakingSummary,
	parseValidatorSummaries,
	type StakingActionSubmission,
	validateHypeActionAmount,
} from "./domain/staking";

const RECONCILIATION_ATTEMPTS = 6;
const RECONCILIATION_INTERVAL_MS = 800;

export interface StakingActionSession {
	submission: StakingActionSubmission;
	identityKey: string;
	state: FundsActionState;
	errorMessage: string | null;
	match: FundsActionMatch | null;
	reference: FundsActionReference | null;
	recoveredFromMarker: boolean;
}

export interface StakingActionsController {
	active: StakingActionSession | null;
	canStart: boolean;
	hasPendingMarker: boolean;
	isLocked: boolean;
	review: (submission: StakingActionSubmission) => void;
	back: () => void;
	submit: () => Promise<void>;
	retry: () => void;
	verify: () => Promise<void>;
	close: () => void;
}

export interface StakingActionIdentity {
	env: "Mainnet" | "Testnet";
	clientKey: string;
	owner: `0x${string}` | undefined;
	walletAddress: `0x${string}` | undefined;
	sessionMode: "wallet" | "agent-only" | "disconnected";
	hasWalletAccess: boolean;
}

export type StakingActionErrorCode = "preflightFailed" | "rejected" | "apiError" | "statusUnknown";

interface StakingPreflightSnapshot {
	spot?: unknown;
	summary?: unknown;
	delegations?: unknown;
	validators?: unknown;
	history?: unknown;
}

interface ExecutionLease {
	id: symbol;
	mode: "write" | "recovery";
	identity: StakingActionIdentity;
	submission: StakingActionSubmission;
	identityEpoch: string;
	geoDeadline: number;
	preflightComplete: boolean;
	sdkBoundaryPassed: boolean;
	reference: FundsActionReference | null;
	abortController: AbortController;
}

export class StakingActionPreflightError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StakingActionPreflightError";
	}
}

export type StakingActionErrorKind = "preflight" | "rejected" | "apiError" | "unknown";

export interface StakingActionErrorDecision {
	result: "rejected" | "apiError" | "unknown";
	clearMarker: boolean;
	reconcile: boolean;
}

export function classifyStakingActionError(error: unknown, sdkBoundaryPassed: boolean): StakingActionErrorKind {
	if (error instanceof StakingActionPreflightError) return "preflight";
	if (!sdkBoundaryPassed) return "preflight";
	if (isUserRejectedRequest(error)) return "rejected";
	if (error instanceof Error && (error.name === "ApiRequestError" || error.name === "ValidationError")) {
		return "apiError";
	}
	return "unknown";
}

export function decideStakingActionError(error: unknown, sdkBoundaryPassed: boolean): StakingActionErrorDecision {
	const kind = classifyStakingActionError(error, sdkBoundaryPassed);
	if (kind === "rejected") return { result: "rejected", clearMarker: true, reconcile: false };
	if (kind === "apiError" || kind === "preflight") {
		return { result: "apiError", clearMarker: true, reconcile: false };
	}
	return { result: "unknown", clearMarker: false, reconcile: true };
}

export function buildStakingExchangeParameters(submission: StakingActionSubmission):
	| { method: "cDeposit"; params: { wei: number } }
	| { method: "cWithdraw"; params: { wei: number } }
	| {
			method: "tokenDelegate";
			params: { validator: `0x${string}`; wei: number; isUndelegate: boolean };
	  } {
	if (submission.request.kind === "cDeposit") return { method: "cDeposit", params: { wei: submission.wei } };
	if (submission.request.kind === "cWithdraw") return { method: "cWithdraw", params: { wei: submission.wei } };
	if (!submission.request.validator) throw new StakingActionPreflightError("The validator is unavailable.");
	return {
		method: "tokenDelegate",
		params: {
			validator: submission.request.validator,
			wei: submission.wei,
			isUndelegate: submission.request.kind === "undelegate",
		},
	};
}

export function buildStakingRecoverySubmission(reference: FundsActionReference): StakingActionSubmission | null {
	if (
		reference.asset !== "HYPE" ||
		reference.atomicDecimals !== 8 ||
		!reference.historyBaseline ||
		reference.stateBaseline?.kind !== "staking"
	) {
		return null;
	}
	const amount = validateHypeActionAmount(reference.displayAmount);
	if (!amount.valid || amount.amount !== reference.displayAmount || String(amount.wei) !== reference.atomicAmount) {
		return null;
	}

	if (reference.method === "cDeposit") {
		if (
			reference.direction !== "deposit" ||
			reference.target !== "staking" ||
			reference.stateBaseline.targetDelegation !== "0"
		) {
			return null;
		}
		return {
			request: { kind: "cDeposit", maxAmount: amount.amount },
			amount: amount.amount,
			wei: amount.wei,
		};
	}
	if (reference.method === "cWithdraw") {
		if (
			reference.direction !== "withdraw" ||
			reference.target !== "staking" ||
			reference.stateBaseline.targetDelegation !== "0"
		) {
			return null;
		}
		return {
			request: { kind: "cWithdraw", maxAmount: amount.amount },
			amount: amount.amount,
			wei: amount.wei,
		};
	}
	if (
		reference.method !== "tokenDelegate" ||
		(reference.direction !== "delegate" && reference.direction !== "undelegate") ||
		!isAddress(reference.target) ||
		reference.target !== reference.target.toLowerCase() ||
		reference.target.toLowerCase() === zeroAddress
	) {
		return null;
	}
	return {
		request: {
			kind: reference.direction,
			maxAmount: amount.amount,
			validator: reference.target as `0x${string}`,
		},
		amount: amount.amount,
		wei: amount.wei,
	};
}

export function assertStakingActionPreflight(
	submission: StakingActionSubmission,
	snapshot: StakingPreflightSnapshot,
	nowMs = Date.now(),
): void {
	const { request, amount } = submission;
	if (request.kind === "cDeposit") {
		const available = parseSpotHypeAvailable(snapshot.spot);
		if (available === null || !decimalAtLeast(available, amount)) {
			throw new StakingActionPreflightError("Fresh Spot HYPE balance is unavailable or insufficient.");
		}
		return;
	}

	if (request.kind === "cWithdraw") {
		const summary = parseStakingSummary(snapshot.summary);
		if (!summary || summary.nPendingWithdrawals >= 5 || !decimalAtLeast(summary.undelegated, amount)) {
			throw new StakingActionPreflightError("Fresh staking availability or pending withdrawal capacity changed.");
		}
		return;
	}

	const validators = parseValidatorSummaries(snapshot.validators);
	const delegations = parseStakingDelegations(snapshot.delegations);
	if (!validators || !delegations || !request.validator) {
		throw new StakingActionPreflightError("Fresh validator or delegation data is unavailable.");
	}
	const validator = validators.find(
		(candidate) => candidate.validator.toLowerCase() === request.validator?.toLowerCase(),
	);
	if (!validator) throw new StakingActionPreflightError("The selected validator is no longer available.");

	if (request.kind === "delegate") {
		const summary = parseStakingSummary(snapshot.summary);
		if (!summary || !canDelegateToValidator(validator) || !decimalAtLeast(summary.undelegated, amount)) {
			throw new StakingActionPreflightError("Validator status or available staking balance changed.");
		}
		return;
	}

	const delegation = delegations.find(
		(candidate) => candidate.validator.toLowerCase() === request.validator?.toLowerCase(),
	);
	if (!delegation || !canUndelegate(delegation, nowMs) || !decimalAtLeast(delegation.amount, amount)) {
		throw new StakingActionPreflightError("Delegation balance or validator lock changed.");
	}
}

export function useStakingActions(ownerAddress: `0x${string}` | undefined): StakingActionsController {
	const wallet = useWalletSession();
	const { clientKey, env, info, sessionMode } = useHyperliquid();
	const legalStatus = useLegalStatus();
	const markers = useFundsActionMarkers();
	const [active, setActive] = useState<StakingActionSession | null>(null);
	const activeRef = useRef(active);
	const executionRef = useRef<ExecutionLease | null>(null);
	const controllerEpochRef = useRef(createControllerEpoch());
	const identity: StakingActionIdentity = {
		env,
		clientKey,
		owner: ownerAddress,
		walletAddress: wallet.walletAddress,
		sessionMode,
		hasWalletAccess: wallet.hasWalletAccess,
	};
	const identityRef = useRef(identity);
	identityRef.current = identity;
	const mountedRef = useRef(true);
	const identityKey = createStakingIdentityKey(identity);
	const previousIdentityKeyRef = useRef(identityKey);
	const recoveredSession = useMemo<StakingActionSession | null>(
		() => buildStakingRecoveredSession(markers, env, ownerAddress, identityKey),
		[env, identityKey, markers, ownerAddress],
	);

	function updateActive(next: StakingActionSession | null) {
		activeRef.current = next;
		setActive(next);
	}

	async function preflight(expectedKind: StakingActionSubmission["request"]["kind"], signal: AbortSignal) {
		const lease = executionRef.current;
		if (!lease || lease.submission.request.kind !== expectedKind) {
			throw new StakingActionPreflightError("The staking request is no longer active.");
		}
		assertIdentityCurrent(lease.identity, identityRef.current);
		if (Date.now() >= lease.geoDeadline) {
			throw new StakingActionPreflightError("Location eligibility expired before signing.");
		}
		const owner = lease.identity.owner;
		if (!owner) throw new StakingActionPreflightError("The staking owner is unavailable.");
		const snapshot = await loadStakingPreflightSnapshot(info, owner, signal);
		assertIdentityCurrent(lease.identity, identityRef.current);
		assertStakingActionPreflight(lease.submission, snapshot);
		lease.preflightComplete = true;
	}

	function executionGuard() {
		const lease = executionRef.current;
		if (!lease?.reference) throw new StakingActionPreflightError("The staking request is no longer active.");
		assertIdentityCurrent(lease.identity, identityRef.current);
		const stored = getFundsActionMarkers().find((marker) => marker.id === lease.reference?.id);
		if (!stored || !fundsActionReferencesEqual(stored, lease.reference)) {
			throw new StakingActionPreflightError("The pending operation reference changed before signing.");
		}
		if (lease.preflightComplete) lease.sdkBoundaryPassed = true;
	}

	const cDeposit = useExchange("cDeposit", {
		executionGuard,
		preExecutionGuard: (_params, signal) => preflight("cDeposit", signal),
	});
	const cWithdraw = useExchange("cWithdraw", {
		executionGuard,
		preExecutionGuard: (_params, signal) => preflight("cWithdraw", signal),
	});
	const tokenDelegate = useExchange("tokenDelegate", {
		executionGuard,
		preExecutionGuard: (_params, signal) => {
			const kind = executionRef.current?.submission.request.kind;
			if (kind !== "delegate" && kind !== "undelegate") {
				throw new StakingActionPreflightError("The staking request is no longer active.");
			}
			return preflight(kind, signal);
		},
	});

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			const execution = executionRef.current;
			executionRef.current = null;
			execution?.abortController.abort();
		};
	}, []);

	useEffect(() => {
		if (previousIdentityKeyRef.current === identityKey) return;
		previousIdentityKeyRef.current = identityKey;
		const execution = executionRef.current;
		executionRef.current = null;
		execution?.abortController.abort();
		activeRef.current = null;
		setActive(null);
	}, [identityKey]);

	useEffect(() => {
		if (executionRef.current) return;
		const current = activeRef.current;
		if (current?.recoveredFromMarker) {
			const unchanged = Boolean(
				current.reference &&
					recoveredSession?.reference &&
					fundsActionReferencesEqual(current.reference, recoveredSession.reference),
			);
			if (unchanged) return;
			activeRef.current = recoveredSession;
			setActive(recoveredSession);
			return;
		}
		if (current || !recoveredSession) return;
		activeRef.current = recoveredSession;
		setActive(recoveredSession);
	}, [recoveredSession]);

	const hasPendingMarker = Boolean(
		ownerAddress &&
			markers.some((marker) => marker.env === env && marker.owner.toLowerCase() === ownerAddress.toLowerCase()),
	);
	const canOpenReview = Boolean(
		ownerAddress &&
			wallet.walletAddress &&
			wallet.hasWalletAccess &&
			sessionMode === "wallet" &&
			hasSameWalletAddress(ownerAddress, wallet.walletAddress) &&
			clientKey !== "disconnected" &&
			hasSameWalletAddress(ownerAddress, clientKey) &&
			!hasPendingMarker,
	);

	function review(submission: StakingActionSubmission) {
		if (!canOpenReview || executionRef.current || findPendingFundsAction(env, ownerAddress ?? "")) return;
		updateActive({
			submission,
			identityKey,
			state: transitionFundsAction(createFundsActionState(), { type: "review" }),
			errorMessage: null,
			match: null,
			reference: null,
			recoveredFromMarker: false,
		});
	}

	function back() {
		const current = activeRef.current;
		if (!current || isFundsActionLocked(current.state)) return;
		updateActive({ ...current, state: transitionFundsAction(current.state, { type: "back" }), errorMessage: null });
	}

	async function submit() {
		const current = activeRef.current;
		if (!current || current.state.stage !== "review" || executionRef.current) return;
		const startIdentity = identityRef.current;
		const lease: ExecutionLease = {
			id: Symbol("staking-action"),
			mode: "write",
			identity: startIdentity,
			submission: current.submission,
			identityEpoch: `${controllerEpochRef.current}:${env}:${ownerAddress?.toLowerCase() ?? "disconnected"}`,
			geoDeadline: 0,
			preflightComplete: false,
			sdkBoundaryPassed: false,
			reference: null,
			abortController: new AbortController(),
		};
		executionRef.current = lease;
		updateActive({
			...current,
			state: transitionFundsAction(current.state, { type: "requestAuthorization" }),
			errorMessage: null,
			match: null,
		});

		try {
			assertIdentityCurrent(startIdentity, identityRef.current);
			const legal = await legalStatus.refetch();
			assertExecutionCurrent(lease, executionRef.current);
			assertIdentityCurrent(startIdentity, identityRef.current);
			if (legal.error || !legal.data?.acceptedTerms || !legal.data.userAllowed || !legal.data.canPerformActions) {
				throw new StakingActionPreflightError("Hyperliquid legal eligibility could not be verified.");
			}

			const geoStartedAt = Date.now();
			const geoDecision = await getReferralActionGeo({ data: { override: getDevGeoOverride() } });
			assertExecutionCurrent(lease, executionRef.current);
			assertIdentityCurrent(startIdentity, identityRef.current);
			assertGeoAllowed(geoDecision);
			lease.geoDeadline = geoStartedAt + geoDecision.ttlMs;

			const baselineOwner = startIdentity.owner;
			if (!baselineOwner) throw new StakingActionPreflightError("The staking owner is unavailable.");
			const baselineSnapshot = await loadStakingPreflightSnapshot(info, baselineOwner, lease.abortController.signal);
			assertExecutionCurrent(lease, executionRef.current);
			assertIdentityCurrent(startIdentity, identityRef.current);
			assertStakingActionPreflight(lease.submission, baselineSnapshot);
			const baseline = createStakingBaseline(lease.submission, baselineSnapshot);
			if (!baseline) throw new StakingActionPreflightError("Fresh staking reconciliation baseline is unavailable.");
			const reference = createReference(lease, baseline);
			if (!(await acquireFundsActionMarker(reference))) {
				throw new StakingActionPreflightError("Another funds operation is awaiting verification.");
			}
			lease.reference = reference;
			const acquired = activeRef.current;
			if (acquired) updateActive({ ...acquired, reference });
			await executeStakingMutation(
				lease.submission,
				cDeposit.mutateAsync,
				cWithdraw.mutateAsync,
				tokenDelegate.mutateAsync,
			);
			if (!executionIsCurrent(lease)) return;
			const awaiting = activeRef.current;
			if (!awaiting) return;
			const submitted = transitionFundsAction(awaiting.state, { type: "submissionAccepted" });
			updateActive({ ...awaiting, state: transitionFundsAction(submitted, { type: "reconcile" }) });
			await reconcile(lease);
		} catch (error) {
			await handleExecutionError(lease, error);
		}
	}

	async function handleExecutionError(lease: ExecutionLease, error: unknown) {
		const decision = decideStakingActionError(error, lease.sdkBoundaryPassed);
		if (lease.reference && decision.clearMarker) await removeFundsActionMarkerSafely(lease.reference.id);
		if (!executionIsCurrent(lease)) return;
		const current = activeRef.current;
		if (!current) return;

		if (decision.reconcile && lease.reference) {
			const submitted =
				current.state.stage === "awaiting"
					? transitionFundsAction(current.state, { type: "submissionAccepted" })
					: current.state;
			updateActive({ ...current, state: transitionFundsAction(submitted, { type: "reconcile" }) });
			await reconcile(lease);
			return;
		}

		updateActive({
			...current,
			state: transitionFundsAction(current.state, { type: "resolve", result: decision.result }),
			errorMessage:
				decision.result === "rejected"
					? "rejected"
					: classifyStakingActionError(error, lease.sdkBoundaryPassed) === "apiError"
						? "apiError"
						: "preflightFailed",
		});
		finishExecution(lease);
	}

	async function reconcile(lease: ExecutionLease) {
		if (!lease.reference) return;
		for (let attempt = 0; attempt < RECONCILIATION_ATTEMPTS; attempt += 1) {
			if (!executionIsCurrent(lease)) return;
			try {
				const snapshot = await loadStakingReconciliationSnapshot(
					info,
					lease.reference.owner,
					lease.submission,
					lease.abortController.signal,
				);
				if (!executionIsCurrent(lease)) return;
				const parsed = parseStakingHistory(snapshot.history);
				const match = parsed ? reconcileStakingFundsAction(lease.reference, snapshot.history) : null;
				const state = parseStakingReconciliationSnapshot(lease.submission, snapshot);
				const stored = findPendingFundsAction(lease.reference.env, lease.reference.owner);
				if (
					match &&
					state &&
					verifyStakingReconciliationState(lease.reference, state) &&
					stored &&
					fundsActionReferencesEqual(stored, lease.reference)
				) {
					if (!(await removeFundsActionMarkerSafely(lease.reference.id))) continue;
					const current = activeRef.current;
					if (current) {
						updateActive({
							...current,
							state: transitionFundsAction(current.state, { type: "resolve", result: "success" }),
							match,
						});
					}
					finishExecution(lease);
					return;
				}
			} catch {
				// A failed read never proves that the signed operation failed.
			}
			if (attempt < RECONCILIATION_ATTEMPTS - 1) {
				await waitForReconciliation(lease.abortController.signal);
			}
		}
		if (!executionIsCurrent(lease)) return;
		const current = activeRef.current;
		if (current) {
			updateActive({
				...current,
				state: transitionFundsAction(current.state, { type: "resolve", result: "unknown" }),
				errorMessage: "statusUnknown",
			});
		}
		finishExecution(lease);
	}

	function retry() {
		const current = activeRef.current;
		if (!current || current.state.stage !== "done") return;
		const next = transitionFundsAction(current.state, { type: "retry" });
		if (next === current.state) return;
		updateActive({ ...current, state: next, errorMessage: null, match: null, reference: null });
	}

	async function verify() {
		const current = activeRef.current;
		if (!current || current.state.stage !== "done" || current.state.result !== "unknown" || executionRef.current)
			return;
		const reference = ownerAddress ? findPendingFundsAction(env, ownerAddress) : null;
		if (!reference || !current.reference || !fundsActionReferencesEqual(reference, current.reference)) return;
		if (current.identityKey !== identityKey || !referenceMatchesRecoveryIdentity(reference, identityRef.current))
			return;
		const lease: ExecutionLease = {
			id: Symbol("staking-reconciliation"),
			mode: "recovery",
			identity: identityRef.current,
			submission: current.submission,
			identityEpoch: reference.identityEpoch,
			geoDeadline: 0,
			preflightComplete: true,
			sdkBoundaryPassed: true,
			reference,
			abortController: new AbortController(),
		};
		executionRef.current = lease;
		updateActive({
			...current,
			state: transitionFundsAction(current.state, { type: "verify" }),
			errorMessage: null,
		});
		await reconcile(lease);
	}

	function close() {
		const current = activeRef.current;
		if (!current || isFundsActionLocked(current.state)) return;
		updateActive(null);
	}

	return {
		active: active?.identityKey === identityKey ? active : null,
		canStart: canOpenReview,
		hasPendingMarker,
		isLocked: Boolean(active && isFundsActionLocked(active.state)),
		review,
		back,
		submit,
		retry,
		verify,
		close,
	};

	function executionIsCurrent(lease: ExecutionLease): boolean {
		if (!mountedRef.current || executionRef.current !== lease) return false;
		if (lease.mode === "recovery") return recoveryIdentityIsCurrent(lease.identity, identityRef.current);
		try {
			assertIdentityCurrent(lease.identity, identityRef.current);
			return true;
		} catch {
			return false;
		}
	}

	function finishExecution(lease: ExecutionLease) {
		if (executionRef.current !== lease) return;
		executionRef.current = null;
		lease.abortController.abort();
		const current = activeRef.current;
		if (
			lease.mode === "recovery" &&
			current?.recoveredFromMarker &&
			current.state.stage === "done" &&
			current.state.result === "unknown"
		) {
			const currentIdentity = identityRef.current;
			updateActive(
				buildStakingRecoveredSession(
					getFundsActionMarkers(),
					currentIdentity.env,
					currentIdentity.owner,
					createStakingIdentityKey(currentIdentity),
				),
			);
		}
	}
}

function buildStakingRecoveredSession(
	markers: readonly FundsActionReference[],
	env: StakingActionIdentity["env"],
	owner: StakingActionIdentity["owner"],
	identityKey: string,
): StakingActionSession | null {
	if (!owner) return null;
	const matching = markers.filter((marker) => marker.env === env && hasSameWalletAddress(marker.owner, owner));
	if (matching.length !== 1) return null;
	const [reference] = matching;
	if (!reference) return null;
	const submission = buildStakingRecoverySubmission(reference);
	if (!submission) return null;
	return {
		submission,
		identityKey,
		state: { stage: "done", result: "unknown" },
		errorMessage: "statusUnknown",
		match: null,
		reference,
		recoveredFromMarker: true,
	};
}

async function loadStakingPreflightSnapshot(
	info: InfoClient,
	owner: `0x${string}`,
	signal: AbortSignal,
): Promise<StakingPreflightSnapshot> {
	const [spot, summary, delegations, validators, history] = await Promise.all([
		info.spotClearinghouseState({ user: owner }, signal),
		info.delegatorSummary({ user: owner }, signal),
		info.delegations({ user: owner }, signal),
		info.validatorSummaries(signal),
		info.delegatorHistory({ user: owner }, signal),
	]);
	return { spot, summary, delegations, validators, history };
}

async function loadStakingReconciliationSnapshot(
	info: InfoClient,
	owner: `0x${string}`,
	submission: StakingActionSubmission,
	signal: AbortSignal,
): Promise<StakingPreflightSnapshot> {
	const [spot, summary, delegations, history] = await Promise.all([
		info.spotClearinghouseState({ user: owner }, signal),
		info.delegatorSummary({ user: owner }, signal),
		info.delegations({ user: owner }, signal),
		info.delegatorHistory({ user: owner }, signal),
	]);
	return { spot, summary, delegations, history, validators: submission.request.validator ? [] : undefined };
}

async function executeStakingMutation(
	submission: StakingActionSubmission,
	cDeposit: (params: { wei: number }) => Promise<unknown>,
	cWithdraw: (params: { wei: number }) => Promise<unknown>,
	tokenDelegate: (params: { validator: string; wei: number; isUndelegate: boolean }) => Promise<unknown>,
): Promise<void> {
	const execution = buildStakingExchangeParameters(submission);
	if (execution.method === "cDeposit") {
		await cDeposit(execution.params);
		return;
	}
	if (execution.method === "cWithdraw") {
		await cWithdraw(execution.params);
		return;
	}
	await tokenDelegate(execution.params);
}

function createReference(
	lease: ExecutionLease,
	baseline: {
		historyBaseline: NonNullable<FundsActionReference["historyBaseline"]>;
		stateBaseline: NonNullable<FundsActionReference["stateBaseline"]>;
	},
): FundsActionReference {
	const owner = lease.identity.owner;
	if (!owner) throw new StakingActionPreflightError("The staking owner is unavailable.");
	const request = lease.submission.request;
	return createFundsActionReference({
		env: lease.identity.env,
		owner,
		method: request.kind === "delegate" || request.kind === "undelegate" ? "tokenDelegate" : request.kind,
		target: request.validator ?? "staking",
		direction: request.kind === "cDeposit" ? "deposit" : request.kind === "cWithdraw" ? "withdraw" : request.kind,
		displayAmount: lease.submission.amount,
		atomicAmount: String(lease.submission.wei),
		atomicDecimals: 8,
		asset: "HYPE",
		identityEpoch: lease.identityEpoch,
		...baseline,
	});
}

function createStakingBaseline(
	submission: StakingActionSubmission,
	snapshot: StakingPreflightSnapshot,
): {
	historyBaseline: NonNullable<FundsActionReference["historyBaseline"]>;
	stateBaseline: NonNullable<FundsActionReference["stateBaseline"]>;
} | null {
	const historyBaseline = createFundsActionHistoryBaseline(snapshot.history);
	const state = parseStakingReconciliationSnapshot(submission, snapshot);
	if (!historyBaseline || !state) return null;
	return { historyBaseline, stateBaseline: { kind: "staking", ...state } };
}

function parseStakingReconciliationSnapshot(
	submission: StakingActionSubmission,
	snapshot: StakingPreflightSnapshot,
): StakingReconciliationState | null {
	const spotAvailable = parseSpotHypeAvailable(snapshot.spot);
	const summary = parseStakingSummary(snapshot.summary);
	const delegations = parseStakingDelegations(snapshot.delegations);
	if (spotAvailable === null || !summary || !delegations) return null;
	const validator = submission.request.validator?.toLowerCase();
	const targetDelegation = validator
		? (delegations.find((entry) => entry.validator.toLowerCase() === validator)?.amount ?? "0")
		: "0";
	return { spotAvailable, ...summary, targetDelegation };
}

function assertIdentityCurrent(expected: StakingActionIdentity, current: StakingActionIdentity): void {
	if (
		!expected.owner ||
		!expected.walletAddress ||
		!expected.hasWalletAccess ||
		expected.sessionMode !== "wallet" ||
		expected.env !== current.env ||
		current.sessionMode !== "wallet" ||
		!current.hasWalletAccess ||
		!current.owner ||
		!current.walletAddress ||
		current.clientKey === "disconnected" ||
		expected.clientKey === "disconnected" ||
		expected.clientKey.toLowerCase() !== current.clientKey.toLowerCase() ||
		!hasSameWalletAddress(expected.owner, expected.walletAddress) ||
		!hasSameWalletAddress(expected.owner, expected.clientKey) ||
		!hasSameWalletAddress(expected.owner, current.owner) ||
		!hasSameWalletAddress(expected.owner, current.walletAddress)
	) {
		throw new StakingActionPreflightError("The active master wallet or network changed.");
	}
}

function referenceMatchesRecoveryIdentity(reference: FundsActionReference, identity: StakingActionIdentity): boolean {
	return Boolean(
		identity.owner && reference.env === identity.env && hasSameWalletAddress(reference.owner, identity.owner),
	);
}

function recoveryIdentityIsCurrent(expected: StakingActionIdentity, current: StakingActionIdentity): boolean {
	return Boolean(
		expected.owner &&
			current.owner &&
			expected.env === current.env &&
			hasSameWalletAddress(expected.owner, current.owner),
	);
}

function assertExecutionCurrent(expected: ExecutionLease, current: ExecutionLease | null): void {
	if (expected !== current) throw new StakingActionPreflightError("The staking request is no longer active.");
}

function assertGeoAllowed(
	decision: ReferralActionGeoDecision,
): asserts decision is Extract<ReferralActionGeoDecision, { status: "allowed" }> {
	if (decision.status === "blocked") throw new StakingActionPreflightError("Staking actions are unavailable here.");
	if (decision.status === "unavailable") {
		throw new StakingActionPreflightError("Location eligibility could not be verified.");
	}
}

function getDevGeoOverride(): string | null {
	if (!import.meta.env.DEV || typeof window === "undefined") return null;
	return new URLSearchParams(window.location.search).get("geo");
}

function decimalAtLeast(left: string, right: string): boolean {
	try {
		return Big(left).gte(Big(right));
	} catch {
		return false;
	}
}

function isUserRejectedRequest(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const candidate = error as { code?: unknown; message?: unknown };
	return (
		candidate.code === 4001 ||
		(typeof candidate.message === "string" &&
			/user rejected|user denied|rejected the request in (?:the )?wallet|request rejected by (?:the )?user/i.test(
				candidate.message,
			))
	);
}

function waitForReconciliation(signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(signal.reason);
			return;
		}
		const timeout = window.setTimeout(resolve, RECONCILIATION_INTERVAL_MS);
		signal.addEventListener(
			"abort",
			() => {
				window.clearTimeout(timeout);
				reject(signal.reason);
			},
			{ once: true },
		);
	});
}

function createControllerEpoch(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return `${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function createStakingIdentityKey(identity: StakingActionIdentity): string {
	return [
		identity.env,
		identity.owner?.toLowerCase() ?? "disconnected",
		identity.walletAddress?.toLowerCase() ?? "no-wallet",
		identity.clientKey.toLowerCase(),
		identity.sessionMode,
		identity.hasWalletAccess ? "available" : "unavailable",
	].join(":");
}
