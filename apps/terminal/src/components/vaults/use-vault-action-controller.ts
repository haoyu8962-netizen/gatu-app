import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { zeroAddress } from "viem";
import {
	acquireFundsActionMarker,
	createFundsActionReference,
	type FundsActionReference,
	findPendingFundsAction,
	fundsActionReferencesEqual,
	removeFundsActionMarkerSafely,
} from "@/components/funds-action/funds-action-marker";
import {
	createFundsActionHistoryBaseline,
	type FundsActionMatch,
	reconcileVaultFundsAction,
	type VaultReconciliationState,
	verifyVaultReconciliationState,
} from "@/components/funds-action/funds-action-reconciliation";
import {
	createFundsActionState,
	type FundsActionState,
	isFundsActionLocked,
	transitionFundsAction,
} from "@/components/funds-action/funds-action-state";
import { compareFundsAmounts, scaleFundsAmount, USDC_ATOMIC_DECIMALS } from "@/components/funds-action/funds-amount";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useReconnectWallet, useWalletSession } from "@/hooks/wallet/use-wallet-session";
import {
	readPersistTradingConnection,
	useAgentRegistration,
	useAgentStatus,
	useExchange,
	useHyperliquid,
	useInfo,
	useLegalStatus,
} from "@/lib/hyperliquid";
import {
	deriveVaultOwnerView,
	parseVaultDetailsSnapshot,
	parseVaultEquitiesSnapshot,
	type VaultDetail,
	type VaultOwnerViewState,
} from "./domain/vaults";
import {
	classifyVaultMutationFailure,
	formatVaultOperationReference,
	parseClearinghouseWithdrawable,
	type VaultActionPreflightFailure,
	type VaultActionReceipt,
	type VaultFundsAction,
	VaultLocalPreDispatchError,
	verifyVaultActionPreflight,
} from "./vault-action-domain";

const REQUEST_TIMEOUT_MS = 10_000;
const ELIGIBILITY_LEASE_MS = 60_000;
const RECONCILIATION_ATTEMPTS = 6;
const RECONCILIATION_DELAY_MS = 600;

export interface ActiveVaultAction {
	id: string;
	action: VaultFundsAction;
	amount: string;
	state: FundsActionState;
	identityKey: string;
	ownerAddress: `0x${string}`;
	detail: VaultDetail;
	marker?: FundsActionReference;
	receipt?: VaultActionReceipt;
	errorMessage?: string;
	isPreflighting: boolean;
}

interface VaultExecutionLease {
	actionId: string;
	identityKey: string;
	markerId: string;
	ownerAddress: `0x${string}`;
	atomicAmount: number;
	eligibilityDeadline: number;
}

export interface VaultActionController {
	action: ActiveVaultAction | null;
	availableAmount: string | null;
	canReview: boolean;
	canConfirm: boolean;
	canRequestAction: boolean;
	requestAction: (action: VaultFundsAction) => Promise<void>;
	setAmount: (amount: string) => void;
	review: () => void;
	back: () => void;
	confirm: () => Promise<void>;
	retry: () => void;
	verifyAgain: () => Promise<void>;
	close: () => void;
}

export interface UseVaultActionControllerInput {
	vaultAddress: string;
	detail: VaultDetail | null;
	owner: VaultOwnerViewState;
}

let actionEpoch = 0;

export function useVaultActionController({
	vaultAddress,
	detail,
	owner,
}: UseVaultActionControllerInput): VaultActionController {
	const { t } = useLingui();
	const wallet = useWalletSession();
	const { reconnectWallet } = useReconnectWallet();
	const hyperliquid = useHyperliquid();
	const legalStatus = useLegalStatus();
	const geo = useGeoRestriction();
	const agentStatus = useAgentStatus();
	const agentRegistration = useAgentRegistration();
	const [activeAction, setActiveAction] = useState<ActiveVaultAction | null>(null);
	const actionRef = useRef<ActiveVaultAction | null>(null);
	const mountedRef = useRef(true);
	const requestPendingRef = useRef(false);
	const executionLeaseRef = useRef<VaultExecutionLease | null>(null);

	const exactOwner = getExactMasterOwner(wallet, hyperliquid.clientKey, hyperliquid.sessionMode);
	const identityKey = createVaultIdentityKey({
		env: hyperliquid.env,
		clientKey: hyperliquid.clientKey,
		sessionMode: hyperliquid.sessionMode,
		walletAddress: wallet.walletAddress,
	});
	const identityRef = useRef(identityKey);
	identityRef.current = identityKey;
	const visibleAction = activeAction?.identityKey === identityKey ? activeAction : null;

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		const current = actionRef.current;
		if (!current || current.identityKey === identityKey) return;
		// The persisted public marker remains available to the root recovery host,
		// but the old account can never continue rendering or signing in this shell.
		executionLeaseRef.current = null;
		actionRef.current = null;
		setActiveAction(null);
	}, [identityKey]);

	const validVaultAddress = /^0x[a-fA-F0-9]{40}$/.test(vaultAddress) ? (vaultAddress as `0x${string}`) : zeroAddress;
	const queryOwner = exactOwner ?? zeroAddress;
	const queryEnabled = Boolean(exactOwner && validVaultAddress !== zeroAddress);
	const detailQuery = useInfo(
		"vaultDetails",
		{ vaultAddress: validVaultAddress, user: exactOwner },
		{ enabled: queryEnabled, requestTimeoutMs: REQUEST_TIMEOUT_MS, retry: false, staleTime: 0 },
	);
	const equitiesQuery = useInfo(
		"userVaultEquities",
		{ user: queryOwner },
		{ enabled: queryEnabled, requestTimeoutMs: REQUEST_TIMEOUT_MS, retry: false, staleTime: 0 },
	);
	const clearinghouseQuery = useInfo(
		"clearinghouseState",
		{ user: queryOwner },
		{ enabled: queryEnabled, requestTimeoutMs: REQUEST_TIMEOUT_MS, retry: false, staleTime: 0 },
	);

	const vaultTransfer = useExchange("vaultTransfer", {
		executionGuard: (params) => {
			const lease = executionLeaseRef.current;
			if (
				!lease ||
				lease.identityKey !== identityRef.current ||
				actionRef.current?.id !== lease.actionId ||
				Date.now() >= lease.eligibilityDeadline
			) {
				throw new VaultLocalPreDispatchError();
			}
			const marker = findPendingFundsAction(hyperliquid.env, lease.ownerAddress);
			if (!marker || marker.id !== lease.markerId) throw new VaultLocalPreDispatchError();
			if (
				params.vaultAddress.toLowerCase() !== marker.target.toLowerCase() ||
				params.isDeposit !== (marker.direction === "deposit") ||
				Number(params.usd) !== lease.atomicAmount
			) {
				throw new VaultLocalPreDispatchError();
			}
		},
	});

	const currentDepositAvailable = parseClearinghouseWithdrawable(clearinghouseQuery.data);
	const availableAmount = visibleAction
		? visibleAction.action === "deposit"
			? currentDepositAvailable
			: owner.status === "ready"
				? owner.maxWithdrawable
				: null
		: null;
	const amount = visibleAction ? scaleFundsAmount(visibleAction.amount, USDC_ATOMIC_DECIMALS) : null;
	const canReview = Boolean(
		visibleAction?.state.stage === "input" &&
			amount?.valid &&
			availableAmount !== null &&
			compareFundsAmounts(amount.displayAmount, availableAmount) !== null &&
			compareFundsAmounts(amount.displayAmount, availableAmount) !== 1 &&
			!findPendingFundsAction(hyperliquid.env, visibleAction.ownerAddress),
	);
	const canConfirm = Boolean(visibleAction?.state.stage === "review" && !visibleAction.isPreflighting);
	const canRequestAction = geo.isResolved && !geo.isError && !geo.tradeRestricted && !geo.proxy && geo.country !== null;

	function updateAction(next: ActiveVaultAction | null) {
		actionRef.current = next;
		if (mountedRef.current) setActiveAction(next);
	}

	async function requestAction(action: VaultFundsAction): Promise<void> {
		if (!detail || validVaultAddress === zeroAddress || actionRef.current || requestPendingRef.current) return;
		requestPendingRef.current = true;
		const startIdentity = identityKey;
		if (!exactOwner) {
			void reconnectWallet();
			toast.error(t`Connect the exact owner wallet before continuing.`);
			requestPendingRef.current = false;
			return;
		}
		if (findPendingFundsAction(hyperliquid.env, exactOwner)) {
			toast.error(t`Verify the pending funds operation before starting another one.`);
			requestPendingRef.current = false;
			return;
		}

		try {
			const [legal, geoResult] = await Promise.all([legalStatus.refetch(), geo.retry()]);
			assertVaultIdentityCurrent(startIdentity, identityRef.current);
			if (legal.error || !legal.data?.acceptedTerms || !legal.data.userAllowed || !legal.data.canPerformActions) {
				throw new Error("Vault legal eligibility could not be verified");
			}
			if (
				geoResult.error ||
				!geoResult.data ||
				geoResult.data.country === null ||
				geoResult.data.proxy ||
				geoResult.data.tradeRestricted
			) {
				throw new Error("Vault location eligibility could not be verified");
			}

			let requirements = await agentStatus.refetchAgent();
			assertVaultIdentityCurrent(startIdentity, identityRef.current);
			if (requirements.needsAgent) {
				const registeredAgent = await agentRegistration.register({
					persistConnection: readPersistTradingConnection(),
				});
				assertVaultIdentityCurrent(startIdentity, identityRef.current);
				requirements = await agentStatus.refetchAgent(registeredAgent);
				assertVaultIdentityCurrent(startIdentity, identityRef.current);
			}
			if (!requirements.isAgentReady) throw new Error("Approved Agent could not be verified");

			const epoch = createActionEpoch(startIdentity);
			updateAction({
				id: epoch,
				action,
				amount: "",
				state: createFundsActionState(),
				identityKey: startIdentity,
				ownerAddress: exactOwner,
				detail,
				isPreflighting: false,
			});
		} catch (error) {
			toast.error(getVaultActionErrorMessage(error, t));
		} finally {
			requestPendingRef.current = false;
		}
	}

	function setAmount(nextAmount: string) {
		const current = actionRef.current;
		if (!current || current.state.stage !== "input") return;
		updateAction({ ...current, amount: nextAmount, errorMessage: undefined });
	}

	function review() {
		const current = actionRef.current;
		if (!current || !canReview) return;
		const nextState = transitionFundsAction(current.state, { type: "review" });
		updateAction({ ...current, state: nextState, errorMessage: undefined });
	}

	function back() {
		const current = actionRef.current;
		if (!current || current.isPreflighting) return;
		const nextState = transitionFundsAction(current.state, { type: "back" });
		if (nextState === current.state) return;
		updateAction({ ...current, state: nextState, errorMessage: undefined });
	}

	function close() {
		const current = actionRef.current;
		if (!current || current.isPreflighting || isFundsActionLocked(current.state)) return;
		executionLeaseRef.current = null;
		updateAction(null);
	}

	async function confirm(): Promise<void> {
		const current = actionRef.current;
		if (!current || current.state.stage !== "review" || current.isPreflighting) return;
		const scaledAmount = scaleFundsAmount(current.amount, USDC_ATOMIC_DECIMALS);
		if (!scaledAmount.valid) return;
		updateAction({ ...current, isPreflighting: true, errorMessage: undefined });

		let marker: FundsActionReference | undefined;
		let markerAcquired = false;
		try {
			assertVaultIdentityCurrent(current.identityKey, identityRef.current);
			const ownerAddress = getExactMasterOwner(wallet, hyperliquid.clientKey, hyperliquid.sessionMode);
			if (!ownerAddress || ownerAddress.toLowerCase() !== current.ownerAddress.toLowerCase()) {
				throw new Error("The active owner wallet no longer matches this Vault action");
			}

			const [legal, geoResult, requirements, freshDetail, freshEquities, freshClearinghouse, freshHistory] =
				await Promise.all([
					legalStatus.refetch(),
					geo.retry(),
					agentStatus.refetchAgent(),
					detailQuery.refetch({ cancelRefetch: true }),
					equitiesQuery.refetch({ cancelRefetch: true }),
					clearinghouseQuery.refetch({ cancelRefetch: true }),
					hyperliquid.info.userNonFundingLedgerUpdates({ user: ownerAddress }),
				]);
			assertVaultIdentityCurrent(current.identityKey, identityRef.current);
			if (legal.error || !legal.data?.acceptedTerms || !legal.data.userAllowed || !legal.data.canPerformActions) {
				throw new Error("Vault legal eligibility could not be verified");
			}
			if (
				geoResult.error ||
				!geoResult.data ||
				geoResult.data.country === null ||
				geoResult.data.proxy ||
				geoResult.data.tradeRestricted
			) {
				throw new Error("Vault location eligibility could not be verified");
			}
			if (!requirements.isAgentReady) {
				throw new Error("The approved Agent is missing or could not be freshly verified");
			}
			if (freshDetail.error || freshEquities.error || freshClearinghouse.error) {
				throw new Error("Fresh Vault account data could not be verified");
			}

			const preflight = verifyVaultActionPreflight({
				action: current.action,
				vaultAddress: validVaultAddress,
				ownerAddress,
				amountAtomic: scaledAmount.atomicAmount,
				detailSnapshot: freshDetail.data,
				equitiesSnapshot: freshEquities.data,
				clearinghouseSnapshot: freshClearinghouse.data,
				now: Date.now(),
			});
			if (!preflight.valid) throw new VaultActionPreflightError(preflight.error);
			const historyBaseline = createFundsActionHistoryBaseline(freshHistory);
			const stateBaseline = createVaultStateBaseline(
				validVaultAddress,
				freshDetail.data,
				freshEquities.data,
				freshClearinghouse.data,
			);
			if (!historyBaseline || !stateBaseline) {
				throw new Error("Fresh Vault reconciliation baseline could not be verified");
			}

			const startedAt = Date.now();
			marker = createFundsActionReference({
				env: hyperliquid.env,
				owner: ownerAddress,
				method: "vaultTransfer",
				target: validVaultAddress,
				direction: current.action,
				displayAmount: scaledAmount.displayAmount,
				atomicAmount: scaledAmount.atomicAmount,
				atomicDecimals: USDC_ATOMIC_DECIMALS,
				asset: "USDC",
				startedAt,
				identityEpoch: current.id,
				historyBaseline,
				stateBaseline,
			});
			if (!(await acquireFundsActionMarker(marker))) {
				throw new Error("The pending Vault operation could not be stored safely");
			}
			markerAcquired = true;

			const awaitingState = transitionFundsAction(current.state, { type: "requestAuthorization" });
			const awaitingAction = { ...current, state: awaitingState, marker, isPreflighting: false };
			updateAction(awaitingAction);
			executionLeaseRef.current = {
				actionId: current.id,
				identityKey: current.identityKey,
				markerId: marker.id,
				ownerAddress,
				atomicAmount: scaledAmount.atomicNumber,
				eligibilityDeadline: Date.now() + ELIGIBILITY_LEASE_MS,
			};

			let mutationError: unknown;
			try {
				await vaultTransfer.mutateAsync({
					vaultAddress: validVaultAddress,
					isDeposit: current.action === "deposit",
					usd: scaledAmount.atomicNumber,
				});
			} catch (error) {
				mutationError = error;
			}
			executionLeaseRef.current = null;

			if (mutationError) {
				await resolveMutationFailure(current.id, marker, mutationError);
				return;
			}
			await reconcileSubmittedAction(current.id, marker);
		} catch (error) {
			executionLeaseRef.current = null;
			const latest = actionRef.current;
			if (!latest || latest.id !== current.id) return;
			if (marker && markerAcquired) await removeFundsActionMarkerSafely(marker.id);
			updateAction({
				...latest,
				isPreflighting: false,
				errorMessage: getVaultActionErrorMessage(error, t),
			});
		}
	}

	async function resolveMutationFailure(actionId: string, marker: FundsActionReference, error: unknown): Promise<void> {
		const latest = actionRef.current;
		if (!latest || latest.id !== actionId) return;
		const failure = classifyVaultMutationFailure(error);
		if (failure === "rejected" || failure === "deterministic") {
			await removeFundsActionMarkerSafely(marker.id);
			const doneState = transitionFundsAction(latest.state, {
				type: "resolve",
				result: failure === "rejected" ? "rejected" : "apiError",
			});
			updateAction({
				...latest,
				state: doneState,
				isPreflighting: false,
				errorMessage: getVaultActionErrorMessage(error, t),
			});
			return;
		}

		const submittedState = transitionFundsAction(latest.state, { type: "submissionAccepted" });
		const reconcilingState = transitionFundsAction(submittedState, { type: "reconcile" });
		updateAction({ ...latest, state: reconcilingState, isPreflighting: false });
		const proof = await reconcileMarker(marker, hyperliquid.info);
		await finishReconciliation(actionId, marker, proof);
	}

	async function reconcileSubmittedAction(actionId: string, marker: FundsActionReference): Promise<void> {
		const latest = actionRef.current;
		if (!latest || latest.id !== actionId) return;
		const submittedState = transitionFundsAction(latest.state, { type: "submissionAccepted" });
		const submittedAction = { ...latest, state: submittedState, isPreflighting: false };
		updateAction(submittedAction);
		const reconcilingState = transitionFundsAction(submittedState, { type: "reconcile" });
		updateAction({ ...submittedAction, state: reconcilingState });
		const proof = await reconcileMarker(marker, hyperliquid.info);
		await finishReconciliation(actionId, marker, proof);
	}

	async function finishReconciliation(
		actionId: string,
		marker: FundsActionReference,
		proof: VaultReconciliationProof | null,
	): Promise<void> {
		const latest = actionRef.current;
		if (!latest || latest.id !== actionId) return;
		const identityCurrent = latest.identityKey === identityRef.current;
		const storedMarker = findPendingFundsAction(marker.env, marker.owner);
		const markerCurrent = Boolean(storedMarker && fundsActionReferencesEqual(storedMarker, marker));
		const canVerify = Boolean(proof?.match && proof.stateVerified && identityCurrent && markerCurrent);
		const verified = canVerify ? await removeFundsActionMarkerSafely(marker.id) : false;
		const result = verified ? "success" : "unknown";
		const doneState = transitionFundsAction(latest.state, { type: "resolve", result });
		updateAction({
			...latest,
			state: doneState,
			isPreflighting: false,
			receipt:
				verified && proof?.match
					? {
							...proof.match,
							operationReference: formatVaultOperationReference({
								env: marker.env,
								owner: marker.owner,
								method: "vaultTransfer",
								target: marker.target,
								direction: marker.direction as VaultFundsAction,
								atomicAmount: marker.atomicAmount,
								startedAt: marker.startedAt,
								identityEpoch: marker.identityEpoch,
							}),
						}
					: undefined,
		});
	}

	async function verifyAgain(): Promise<void> {
		const current = actionRef.current;
		if (!current || current.state.stage !== "done" || current.state.result !== "unknown" || !current.marker) return;
		const storedMarker = findPendingFundsAction(current.marker.env, current.marker.owner);
		if (!storedMarker || !fundsActionReferencesEqual(storedMarker, current.marker)) return;
		const reconcilingState = transitionFundsAction(current.state, { type: "verify" });
		updateAction({ ...current, state: reconcilingState, errorMessage: undefined });
		const proof = await reconcileMarker(current.marker, hyperliquid.info);
		await finishReconciliation(current.id, current.marker, proof);
	}

	function retry() {
		const current = actionRef.current;
		if (
			!current ||
			current.state.stage !== "done" ||
			(current.state.result !== "rejected" && current.state.result !== "apiError")
		) {
			return;
		}
		const reviewState = transitionFundsAction(current.state, { type: "retry" });
		if (reviewState === current.state) return;
		updateAction({
			...current,
			id: createActionEpoch(current.identityKey),
			state: reviewState,
			marker: undefined,
			receipt: undefined,
			errorMessage: undefined,
			isPreflighting: false,
		});
	}

	return {
		action: visibleAction,
		availableAmount,
		canReview,
		canConfirm,
		canRequestAction,
		requestAction,
		setAmount,
		review,
		back,
		confirm,
		retry,
		verifyAgain,
		close,
	};
}

async function reconcileMarker(
	marker: FundsActionReference,
	info: {
		userNonFundingLedgerUpdates: (params: { user: `0x${string}`; startTime?: number }) => Promise<unknown>;
		vaultDetails: (params: { vaultAddress: `0x${string}`; user?: `0x${string}` }) => Promise<unknown>;
		userVaultEquities: (params: { user: `0x${string}` }) => Promise<unknown>;
		clearinghouseState: (params: { user: `0x${string}` }) => Promise<unknown>;
	},
): Promise<VaultReconciliationProof | null> {
	if (!/^0x[a-fA-F0-9]{40}$/.test(marker.target)) return null;
	for (let attempt = 0; attempt < RECONCILIATION_ATTEMPTS; attempt += 1) {
		try {
			const [history, detail, equities, clearinghouse] = await Promise.all([
				info.userNonFundingLedgerUpdates({ user: marker.owner }),
				info.vaultDetails({ vaultAddress: marker.target as `0x${string}`, user: marker.owner }),
				info.userVaultEquities({ user: marker.owner }),
				info.clearinghouseState({ user: marker.owner }),
			]);
			const match = reconcileVaultFundsAction(marker, history);
			const state = parseVaultReconciliationState(marker.target, detail, equities, clearinghouse);
			if (match && verifyVaultReconciliationState(marker, state)) return { match, stateVerified: true };
		} catch {
			// A read failure cannot turn an already dispatched request into a safe retry.
		}
		if (attempt < RECONCILIATION_ATTEMPTS - 1) await waitForReconciliationAttempt();
	}
	return null;
}

interface VaultReconciliationProof {
	match: FundsActionMatch;
	stateVerified: true;
}

function createVaultStateBaseline(
	vaultAddress: string,
	detailSnapshot: unknown,
	equitiesSnapshot: unknown,
	clearinghouseSnapshot: unknown,
): FundsActionReference["stateBaseline"] | null {
	const state = parseVaultReconciliationState(vaultAddress, detailSnapshot, equitiesSnapshot, clearinghouseSnapshot);
	if (!state) return null;
	return { kind: "vault", vaultEquity: state.vaultEquity, withdrawable: state.withdrawable };
}

function parseVaultReconciliationState(
	vaultAddress: string,
	detailSnapshot: unknown,
	equitiesSnapshot: unknown,
	clearinghouseSnapshot: unknown,
): VaultReconciliationState | null {
	const detail = parseVaultDetailsSnapshot(detailSnapshot);
	const equities = parseVaultEquitiesSnapshot(equitiesSnapshot);
	const withdrawable = parseClearinghouseWithdrawable(clearinghouseSnapshot);
	if (detail.status !== "valid" || equities.status !== "valid" || withdrawable === null) return null;
	if (detail.detail.vaultAddress.toLowerCase() !== vaultAddress.toLowerCase()) return null;
	const owner = deriveVaultOwnerView({
		detail: detail.detail,
		account: { status: "ready", equities: equities.equities },
		now: 0,
	});
	if (owner.status !== "ready") return null;
	return { detailValid: true, vaultEquity: owner.equity, withdrawable };
}

function waitForReconciliationAttempt(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, RECONCILIATION_DELAY_MS));
}

function getExactMasterOwner(
	wallet: ReturnType<typeof useWalletSession>,
	clientKey: string,
	sessionMode: string,
): `0x${string}` | undefined {
	if (
		!wallet.hasWalletAccess ||
		sessionMode !== "wallet" ||
		!wallet.walletAddress ||
		clientKey === "disconnected" ||
		wallet.walletAddress.toLowerCase() !== clientKey.toLowerCase()
	) {
		return undefined;
	}
	return wallet.walletAddress;
}

export function createVaultIdentityKey(input: {
	env: string;
	clientKey: string;
	sessionMode: string;
	walletAddress: string | undefined;
}): string {
	return [
		input.env,
		input.clientKey.toLowerCase(),
		input.sessionMode,
		input.walletAddress?.toLowerCase() ?? "no-wallet",
	].join(":");
}

function createActionEpoch(identityKey: string): string {
	actionEpoch += 1;
	return `${identityKey}:${Date.now()}:${actionEpoch}`;
}

function assertVaultIdentityCurrent(expected: string, current: string) {
	if (expected !== current) throw new Error("Wallet or network changed during the Vault action");
}

class VaultActionPreflightError extends Error {
	readonly reason: VaultActionPreflightFailure;

	constructor(reason: VaultActionPreflightFailure) {
		super(`Vault preflight failed: ${reason}`);
		this.name = "VaultActionPreflightError";
		this.reason = reason;
	}
}

function getVaultActionErrorMessage(error: unknown, t: ReturnType<typeof useLingui>["t"]): string {
	if (error instanceof VaultActionPreflightError) {
		switch (error.reason) {
			case "depositsClosed":
				return t`This Vault no longer accepts deposits.`;
			case "withdrawalLocked":
				return t`Withdrawal is still locked by the fresh server timestamp.`;
			case "amountExceedsAvailable":
				return t`The amount exceeds the freshly verified maximum.`;
			case "ownerMismatch":
			case "vaultMismatch":
				return t`The refreshed Vault identity did not match this reviewed action.`;
			case "balanceUnavailable":
			case "equityUnavailable":
			case "withdrawalUnavailable":
			case "detailUnavailable":
				return t`Fresh Vault balances and limits could not be verified.`;
		}
	}
	if (error instanceof Error) {
		if (/user rejected|user denied/i.test(error.message)) return t`Authorization was rejected in the wallet.`;
		if (/location eligibility/i.test(error.message)) return t`Location eligibility could not be verified.`;
		if (/legal eligibility/i.test(error.message)) return t`Legal eligibility could not be verified.`;
		if (/agent/i.test(error.message)) return t`The approved Agent could not be verified for this owner and network.`;
		if (/pending vault operation could not be stored/i.test(error.message)) {
			return t`The operation reference could not be stored safely, so nothing was signed.`;
		}
		if (/another|pending funds operation/i.test(error.message)) {
			return t`Verify the pending funds operation before starting another one.`;
		}
		if (/wallet|network|owner/i.test(error.message)) return t`The active owner wallet or network changed.`;
		return t`Vault operation failed. Verify current balances and history before trying again.`;
	}
	return t`Vault operation failed.`;
}
