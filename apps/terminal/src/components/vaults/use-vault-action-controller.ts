import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { zeroAddress } from "viem";
import {
	acquireFundsActionMarker,
	createFundsActionReference,
	type FundsActionReference,
	findPendingFundsAction,
	fundsActionReferencesEqual,
	removeFundsActionMarkerSafely,
	resolveFundsActionRecoveryOwner,
	useFundsActionMarkers,
} from "@/components/funds-action/funds-action-marker";
import {
	createFundsActionHistoryBaseline,
	type FundsActionMatch,
	getFundsActionHistoryStartTime,
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
import { FILLED_AMOUNT_MIN_DECIMALS } from "@/config/app";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useReconnectWallet, useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { type ActionFailure, classifyActionErrorOr, describeActionFailure } from "@/lib/errors/action-error";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";
import {
	readPersistTradingConnection,
	useActiveAgentOwner,
	useAgentRegistration,
	useExchange,
	useHyperliquid,
	useInfo,
	useLegalStatus,
	useTradingStatus,
} from "@/lib/hyperliquid";
import { formatDecimalFloor } from "@/lib/trade/numbers";
import {
	deriveVaultActionsAvailability,
	deriveVaultOwnerView,
	getVaultMinimumDeposit,
	getVaultRequestAvailability,
	parseVaultDetailsSnapshot,
	parseVaultEquitiesSnapshot,
	type VaultActionsAvailability,
	type VaultDetail,
	type VaultOwnerViewState,
} from "./domain/vaults";
import {
	classifyVaultMutationFailure,
	formatVaultOperationReference,
	getVaultDepositAvailable,
	parseClearinghouseWithdrawable,
	type VaultActionPreflightFailure,
	type VaultActionReceipt,
	type VaultFundsAction,
	VaultLocalPreDispatchError,
	vaultDepositUsesSpotBalance,
	verifyVaultActionPreflight,
} from "./vault-action-domain";

const REQUEST_TIMEOUT_MS = 10_000;
const ELIGIBILITY_LEASE_MS = 60_000;
const RECONCILIATION_ATTEMPTS = 6;
const RECONCILIATION_DELAY_MS = 600;

const LEGAL_UNVERIFIED = msg`Legal eligibility could not be verified.`;
const LOCATION_UNVERIFIED = msg`Location eligibility could not be verified.`;
const SIGNER_UNVERIFIED = msg`The trading wallet could not be verified for this owner and network.`;
const OWNER_CHANGED = msg`The active owner wallet or network changed.`;
const VAULT_DATA_UNVERIFIED = msg`Fresh Vault balances and limits could not be verified.`;
const MARKER_NOT_STORED = msg`The operation reference could not be stored safely, so nothing was signed.`;
const VAULT_OPERATION_FAILED = msg`Vault operation failed. Verify current balances and history before trying again.`;

export interface ActiveVaultAction {
	id: string;
	action: VaultFundsAction;
	amount: string;
	state: FundsActionState;
	identityKey: string;
	routeIdentityKey: string;
	ownerAddress: `0x${string}`;
	detail: VaultDetail;
	marker?: FundsActionReference;
	receipt?: VaultActionReceipt;
	error?: ActionFailure;
	isPreflighting: boolean;
	recoveredFromMarker?: boolean;
}

interface VaultExecutionLease {
	actionId: string;
	identityKey: string;
	routeIdentityKey: string;
	env: FundsActionReference["env"];
	vaultAddress: `0x${string}`;
	reference: FundsActionReference;
	ownerAddress: `0x${string}`;
	atomicAmount: number;
	eligibilityDeadline: number;
	/** Counts `useExchange` guard runs: once before queueing, once at the SDK boundary. */
	guardCalls: number;
	/** True only once the SDK boundary guard ran, so a request may actually have been signed. */
	guardPassed: boolean;
}

interface VaultRouteIdentity {
	key: string;
	identityKey: string;
	env: FundsActionReference["env"];
	vaultAddress: `0x${string}`;
	ownerAddress: `0x${string}` | undefined;
}

interface VaultRequestLease {
	actionId: string;
	routeIdentity: VaultRouteIdentity;
	abortController: AbortController;
}

export interface VaultActionController {
	action: ActiveVaultAction | null;
	availableAmount: string | null;
	maxAmount: string | null;
	minimumAmount: string | null;
	belowMinimum: boolean;
	actionAvailability: VaultActionsAvailability;
	canReview: boolean;
	canConfirm: boolean;
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
	/** False while `detail` is the snapshot kept after a failed refresh: actions wait for a current one. */
	detailCurrent?: boolean;
	owner: VaultOwnerViewState;
}

let actionEpoch = 0;

export function useVaultActionController({
	vaultAddress,
	detail,
	detailCurrent = true,
	owner,
}: UseVaultActionControllerInput): VaultActionController {
	const { t } = useLingui();
	const wallet = useWalletSession();
	const { reconnectWallet } = useReconnectWallet();
	const hyperliquid = useHyperliquid();
	const legalStatus = useLegalStatus();
	const geo = useGeoRestriction();
	const activeAgentOwner = useActiveAgentOwner();
	const tradingStatus = useTradingStatus();
	const agentRegistration = useAgentRegistration({ enabled: tradingStatus.signerMode === "agent" });
	const fundsActionMarkers = useFundsActionMarkers();
	const [activeAction, setActiveAction] = useState<ActiveVaultAction | null>(null);
	const actionRef = useRef<ActiveVaultAction | null>(null);
	const mountedRef = useRef(true);
	const requestLeaseRef = useRef<VaultRequestLease | null>(null);
	const preflightAbortRef = useRef<AbortController | null>(null);
	const executionLeaseRef = useRef<VaultExecutionLease | null>(null);
	const hydratedRecoveryMarkerIdRef = useRef<string | null>(null);

	const exactOwner = getExactMasterOwner(wallet, hyperliquid.clientKey, hyperliquid.sessionMode);
	const recoveryOwner = resolveFundsActionRecoveryOwner({
		sessionMode: hyperliquid.sessionMode,
		env: hyperliquid.env,
		activeAgentOwner,
		fallbackOwner: exactOwner,
	});
	const identityKey = createVaultIdentityKey({
		env: hyperliquid.env,
		clientKey: hyperliquid.clientKey,
		sessionMode: hyperliquid.sessionMode,
		walletAddress: wallet.walletAddress,
	});
	const validVaultAddress = normalizeVaultAddress(vaultAddress) ?? zeroAddress;
	const routeIdentity = createVaultRouteIdentity({
		identityKey,
		env: hyperliquid.env,
		vaultAddress: validVaultAddress,
		ownerAddress: recoveryOwner,
	});
	// This ref is deliberately synchronized during render. A route, owner, or
	// network render must invalidate an older event-handler continuation before
	// passive Effect cleanup gets a chance to run.
	const routeIdentityRef = useRef(routeIdentity);
	routeIdentityRef.current = routeIdentity;
	const visibleAction =
		activeAction?.routeIdentityKey === routeIdentity.key &&
		activeAction.detail.vaultAddress.toLowerCase() === validVaultAddress
			? activeAction
			: null;
	const recoveredAction = useMemo(
		() =>
			createRecoveredVaultAction({
				markers: fundsActionMarkers,
				env: hyperliquid.env,
				recoveryOwner,
				vaultAddress: validVaultAddress,
				detail,
				identityKey,
				routeIdentityKey: routeIdentity.key,
			}),
		[detail, fundsActionMarkers, hyperliquid.env, identityKey, recoveryOwner, routeIdentity.key, validVaultAddress],
	);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			requestLeaseRef.current?.abortController.abort();
			requestLeaseRef.current = null;
			preflightAbortRef.current?.abort();
			preflightAbortRef.current = null;
			executionLeaseRef.current = null;
			actionRef.current = null;
		};
	}, []);

	useEffect(() => {
		const pendingRequest = requestLeaseRef.current;
		if (pendingRequest && pendingRequest.routeIdentity.key !== routeIdentity.key) {
			pendingRequest.abortController.abort();
			requestLeaseRef.current = null;
		}
		const current = actionRef.current;
		if (!current || current.routeIdentityKey === routeIdentity.key) return;
		// The persisted public marker remains available to the root recovery host,
		// but a different account, network, or Vault can never continue rendering
		// or signing in this shell.
		preflightAbortRef.current?.abort();
		preflightAbortRef.current = null;
		executionLeaseRef.current = null;
		actionRef.current = null;
		hydratedRecoveryMarkerIdRef.current = null;
		setActiveAction(null);
	}, [routeIdentity.key]);

	useEffect(() => {
		const current = activeAction;
		if (!recoveredAction) {
			hydratedRecoveryMarkerIdRef.current = null;
			if (current?.recoveredFromMarker && current.state.stage === "done" && current.state.result === "unknown") {
				actionRef.current = null;
				setActiveAction(null);
			}
			return;
		}
		if (
			current?.recoveredFromMarker &&
			current.state.stage === "done" &&
			current.state.result === "unknown" &&
			current.marker?.id !== recoveredAction.marker?.id
		) {
			hydratedRecoveryMarkerIdRef.current = recoveredAction.marker?.id ?? null;
			actionRef.current = recoveredAction;
			setActiveAction(recoveredAction);
			return;
		}
		if (current || hydratedRecoveryMarkerIdRef.current === recoveredAction.marker?.id) return;
		// This synchronizes a validated public recovery marker into page-local UI
		// state only. Authorization and SDK dispatch remain reachable exclusively
		// from the review/confirm event path below.
		hydratedRecoveryMarkerIdRef.current = recoveredAction.marker?.id ?? null;
		actionRef.current = recoveredAction;
		setActiveAction(recoveredAction);
	}, [activeAction, recoveredAction]);

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
	const spotClearinghouseQuery = useInfo(
		"spotClearinghouseState",
		{ user: queryOwner },
		{ enabled: queryEnabled, requestTimeoutMs: REQUEST_TIMEOUT_MS, retry: false, staleTime: 0 },
	);
	const accountAbstractionQuery = useInfo(
		"userAbstraction",
		{ user: queryOwner },
		{ enabled: queryEnabled, requestTimeoutMs: REQUEST_TIMEOUT_MS, retry: false, staleTime: 0 },
	);

	const vaultTransfer = useExchange("vaultTransfer", {
		executionGuard: (params) => {
			const lease = executionLeaseRef.current;
			const currentRoute = routeIdentityRef.current;
			const currentAction = actionRef.current;
			if (
				!lease ||
				lease.identityKey !== currentRoute.identityKey ||
				lease.routeIdentityKey !== currentRoute.key ||
				lease.env !== currentRoute.env ||
				lease.vaultAddress !== currentRoute.vaultAddress ||
				lease.ownerAddress.toLowerCase() !== currentRoute.ownerAddress?.toLowerCase() ||
				currentAction?.id !== lease.actionId ||
				currentAction.routeIdentityKey !== lease.routeIdentityKey ||
				Date.now() >= lease.eligibilityDeadline
			) {
				throw new VaultLocalPreDispatchError();
			}
			const marker = findPendingFundsAction(lease.env, lease.ownerAddress);
			if (!marker || !fundsActionReferencesEqual(marker, lease.reference)) {
				throw new VaultLocalPreDispatchError();
			}
			if (
				params.vaultAddress.toLowerCase() !== marker.target.toLowerCase() ||
				params.isDeposit !== (marker.direction === "deposit") ||
				Number(params.usd) !== lease.atomicAmount
			) {
				throw new VaultLocalPreDispatchError();
			}
			lease.guardCalls += 1;
			if (lease.guardCalls >= 2) lease.guardPassed = true;
		},
	});

	const currentDepositAvailable = getVaultDepositAvailable({
		accountAbstraction: accountAbstractionQuery.isSuccess ? accountAbstractionQuery.data : undefined,
		clearinghouseSnapshot: clearinghouseQuery.isSuccess ? clearinghouseQuery.data : undefined,
		spotClearinghouseSnapshot: spotClearinghouseQuery.isSuccess ? spotClearinghouseQuery.data : undefined,
	});
	const minimumDeposit = detail ? getVaultMinimumDeposit(detail) : null;
	const availableAmount = visibleAction
		? visibleAction.action === "deposit"
			? currentDepositAvailable
			: owner.status === "ready"
				? owner.maxWithdrawable
				: null
		: null;
	const amount = visibleAction ? scaleFundsAmount(visibleAction.amount, USDC_ATOMIC_DECIMALS) : null;
	const minimumAmount = visibleAction?.action === "deposit" ? minimumDeposit : null;
	const meetsMinimum =
		minimumAmount === null ||
		(amount?.valid === true && compareFundsAmounts(amount.displayAmount, minimumAmount) !== -1);
	const canReview = Boolean(
		detailCurrent &&
			visibleAction?.state.stage === "input" &&
			amount?.valid &&
			availableAmount !== null &&
			(visibleAction.action === "withdraw" || minimumAmount !== null) &&
			meetsMinimum &&
			compareFundsAmounts(amount.displayAmount, availableAmount) !== null &&
			compareFundsAmounts(amount.displayAmount, availableAmount) !== 1 &&
			!findPendingFundsAction(hyperliquid.env, visibleAction.ownerAddress),
	);
	const actionAvailability = deriveVaultActionsAvailability({
		detail,
		detailCurrent,
		owner,
		ownerAddress: exactOwner,
		request: getVaultRequestAvailability(geo),
		sessionMode: hyperliquid.sessionMode,
	});
	const canConfirm = Boolean(
		visibleAction?.state.stage === "review" &&
			!visibleAction.isPreflighting &&
			actionAvailability[visibleAction.action].available,
	);

	function updateAction(next: ActiveVaultAction | null) {
		actionRef.current = next;
		if (mountedRef.current) setActiveAction(next);
	}

	async function requestAction(action: VaultFundsAction): Promise<void> {
		const startRoute = routeIdentityRef.current;
		if (
			!actionAvailability[action].available ||
			!detail ||
			startRoute.vaultAddress === zeroAddress ||
			detail.vaultAddress.toLowerCase() !== startRoute.vaultAddress ||
			actionRef.current ||
			requestLeaseRef.current
		) {
			return;
		}
		const signingOwner = exactOwner;
		if (!signingOwner || signingOwner.toLowerCase() !== startRoute.ownerAddress?.toLowerCase()) {
			void reconnectWallet();
			toast.error(t`Connect the exact owner wallet before continuing.`);
			return;
		}
		if (findPendingFundsAction(startRoute.env, signingOwner)) {
			toast.error(t`Review the pending funds operation before starting another one.`);
			return;
		}
		const requestLease: VaultRequestLease = {
			actionId: createActionEpoch(startRoute.identityKey),
			routeIdentity: startRoute,
			abortController: new AbortController(),
		};
		requestLeaseRef.current = requestLease;

		try {
			const [legal, geoResult] = await Promise.all([legalStatus.refetch(), geo.retry()]);
			assertVaultRequestCurrent(requestLease, requestLeaseRef.current, routeIdentityRef.current, mountedRef.current);
			if (legal.error || !legal.data?.acceptedTerms || !legal.data.userAllowed || !legal.data.canPerformActions) {
				throw new LocalizedActionError(LEGAL_UNVERIFIED);
			}
			if (
				geoResult.error ||
				!geoResult.data ||
				geoResult.data.country === null ||
				geoResult.data.proxy ||
				geoResult.data.tradeRestricted
			) {
				throw new LocalizedActionError(LOCATION_UNVERIFIED);
			}

			let requirements = await tradingStatus.refetchSigner();
			assertVaultRequestCurrent(requestLease, requestLeaseRef.current, routeIdentityRef.current, mountedRef.current);
			if (requirements.needsAgent) {
				const registeredAgent = await agentRegistration.register({
					persistConnection: readPersistTradingConnection(),
				});
				assertVaultRequestCurrent(requestLease, requestLeaseRef.current, routeIdentityRef.current, mountedRef.current);
				requirements = await tradingStatus.refetchSigner(registeredAgent);
				assertVaultRequestCurrent(requestLease, requestLeaseRef.current, routeIdentityRef.current, mountedRef.current);
			}
			if (!requirements.isSignerReady) throw new LocalizedActionError(SIGNER_UNVERIFIED);

			assertVaultRequestCurrent(requestLease, requestLeaseRef.current, routeIdentityRef.current, mountedRef.current);
			updateAction({
				id: requestLease.actionId,
				action,
				amount: "",
				state: createFundsActionState(),
				identityKey: startRoute.identityKey,
				routeIdentityKey: startRoute.key,
				ownerAddress: signingOwner,
				detail,
				isPreflighting: false,
			});
		} catch (error) {
			if (!(error instanceof VaultActionContextChangedError)) {
				toast.error(describeActionFailure(getVaultActionFailure(error), (descriptor) => t(descriptor)));
			}
		} finally {
			if (requestLeaseRef.current === requestLease) requestLeaseRef.current = null;
		}
	}

	function setAmount(nextAmount: string) {
		const current = actionRef.current;
		if (!current || current.state.stage !== "input") return;
		updateAction({ ...current, amount: nextAmount, error: undefined });
	}

	function review() {
		const current = actionRef.current;
		if (!current || !canReview) return;
		const nextState = transitionFundsAction(current.state, { type: "review" });
		updateAction({ ...current, state: nextState, error: undefined });
	}

	function back() {
		const current = actionRef.current;
		if (!current || current.isPreflighting) return;
		const nextState = transitionFundsAction(current.state, { type: "back" });
		if (nextState === current.state) return;
		updateAction({ ...current, state: nextState, error: undefined });
	}

	function close() {
		const current = actionRef.current;
		if (!current || current.isPreflighting || isFundsActionLocked(current.state)) return;
		executionLeaseRef.current = null;
		if (current.marker?.id) hydratedRecoveryMarkerIdRef.current = current.marker.id;
		updateAction(null);
	}

	async function confirm(): Promise<void> {
		const current = actionRef.current;
		if (
			!current ||
			current.state.stage !== "review" ||
			current.isPreflighting ||
			!actionAvailability[current.action].available
		) {
			return;
		}
		const startRoute = routeIdentityRef.current;
		if (!isVaultActionCurrent(current, startRoute, mountedRef.current)) return;
		const scaledAmount = scaleFundsAmount(current.amount, USDC_ATOMIC_DECIMALS);
		if (!scaledAmount.valid) return;
		const preflightAbort = new AbortController();
		preflightAbortRef.current?.abort();
		preflightAbortRef.current = preflightAbort;
		updateAction({ ...current, isPreflighting: true, error: undefined });

		let marker: FundsActionReference | undefined;
		let markerAcquired = false;
		try {
			assertVaultActionCurrent(
				current,
				actionRef.current,
				startRoute,
				routeIdentityRef.current,
				mountedRef.current,
				preflightAbort.signal,
			);
			const ownerAddress = startRoute.ownerAddress;
			if (!ownerAddress || ownerAddress.toLowerCase() !== current.ownerAddress.toLowerCase()) {
				throw new LocalizedActionError(OWNER_CHANGED);
			}
			const startedAt = Date.now();

			const [
				legal,
				geoResult,
				requirements,
				freshDetail,
				freshEquities,
				freshClearinghouse,
				freshSpotClearinghouse,
				freshAccountAbstraction,
				freshHistory,
			] = await Promise.all([
				legalStatus.refetch(),
				geo.retry(),
				tradingStatus.refetchSigner(),
				detailQuery.refetch({ cancelRefetch: true }),
				equitiesQuery.refetch({ cancelRefetch: true }),
				clearinghouseQuery.refetch({ cancelRefetch: true }),
				spotClearinghouseQuery.refetch({ cancelRefetch: true }),
				accountAbstractionQuery.refetch({ cancelRefetch: true }),
				hyperliquid.info.userNonFundingLedgerUpdates({
					user: ownerAddress,
					startTime: getFundsActionHistoryStartTime(startedAt),
				}),
			]);
			assertVaultActionCurrent(
				current,
				actionRef.current,
				startRoute,
				routeIdentityRef.current,
				mountedRef.current,
				preflightAbort.signal,
			);
			if (legal.error || !legal.data?.acceptedTerms || !legal.data.userAllowed || !legal.data.canPerformActions) {
				throw new LocalizedActionError(LEGAL_UNVERIFIED);
			}
			if (
				geoResult.error ||
				!geoResult.data ||
				geoResult.data.country === null ||
				geoResult.data.proxy ||
				geoResult.data.tradeRestricted
			) {
				throw new LocalizedActionError(LOCATION_UNVERIFIED);
			}
			if (!requirements.isSignerReady) {
				throw new LocalizedActionError(SIGNER_UNVERIFIED);
			}
			const isDeposit = current.action === "deposit";
			if (
				freshDetail.error ||
				freshEquities.error ||
				freshClearinghouse.error ||
				(isDeposit && freshAccountAbstraction.error) ||
				(isDeposit && vaultDepositUsesSpotBalance(freshAccountAbstraction.data) && freshSpotClearinghouse.error)
			) {
				throw new LocalizedActionError(VAULT_DATA_UNVERIFIED);
			}

			const preflight = verifyVaultActionPreflight({
				action: current.action,
				vaultAddress: startRoute.vaultAddress,
				ownerAddress,
				amountAtomic: scaledAmount.atomicAmount,
				detailSnapshot: freshDetail.data,
				equitiesSnapshot: freshEquities.data,
				clearinghouseSnapshot: freshClearinghouse.data,
				spotClearinghouseSnapshot: freshSpotClearinghouse.error ? undefined : freshSpotClearinghouse.data,
				accountAbstraction: freshAccountAbstraction.data,
				now: Date.now(),
			});
			if (!preflight.valid) throw new VaultActionPreflightError(preflight.error);
			assertVaultActionCurrent(
				current,
				actionRef.current,
				startRoute,
				routeIdentityRef.current,
				mountedRef.current,
				preflightAbort.signal,
			);
			const historyBaseline = createFundsActionHistoryBaseline(freshHistory);
			const stateBaseline = createVaultStateBaseline(
				startRoute.vaultAddress,
				freshDetail.data,
				freshEquities.data,
				freshClearinghouse.data,
			);
			if (!historyBaseline || !stateBaseline) {
				throw new Error("Fresh Vault reconciliation baseline could not be verified");
			}

			marker = createFundsActionReference({
				env: startRoute.env,
				owner: ownerAddress,
				method: "vaultTransfer",
				target: startRoute.vaultAddress,
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
			assertVaultActionCurrent(
				current,
				actionRef.current,
				startRoute,
				routeIdentityRef.current,
				mountedRef.current,
				preflightAbort.signal,
			);
			const acquired = await acquireFundsActionMarker(marker);
			markerAcquired = acquired;
			assertVaultActionCurrent(
				current,
				actionRef.current,
				startRoute,
				routeIdentityRef.current,
				mountedRef.current,
				preflightAbort.signal,
			);
			if (!acquired) {
				throw new LocalizedActionError(MARKER_NOT_STORED);
			}

			const awaitingState = transitionFundsAction(current.state, { type: "requestAuthorization" });
			const awaitingAction = { ...current, state: awaitingState, marker, isPreflighting: false };
			updateAction(awaitingAction);
			const executionLease: VaultExecutionLease = {
				actionId: current.id,
				identityKey: current.identityKey,
				routeIdentityKey: current.routeIdentityKey,
				env: startRoute.env,
				vaultAddress: startRoute.vaultAddress,
				reference: marker,
				ownerAddress,
				atomicAmount: scaledAmount.atomicNumber,
				eligibilityDeadline: Date.now() + ELIGIBILITY_LEASE_MS,
				guardCalls: 0,
				guardPassed: false,
			};
			executionLeaseRef.current = executionLease;
			if (preflightAbortRef.current === preflightAbort) preflightAbortRef.current = null;
			assertVaultActionCurrent(current, actionRef.current, startRoute, routeIdentityRef.current, mountedRef.current);

			let mutationError: unknown;
			try {
				await vaultTransfer.mutateAsync({
					vaultAddress: startRoute.vaultAddress,
					isDeposit: current.action === "deposit",
					usd: scaledAmount.atomicNumber,
				});
			} catch (error) {
				mutationError = error;
			}
			executionLeaseRef.current = null;

			if (mutationError) {
				await resolveMutationFailure(current.id, marker, mutationError, executionLease.guardPassed);
				return;
			}
			if (!isVaultActionEpochCurrent(current, actionRef.current, routeIdentityRef.current, mountedRef.current)) return;
			await reconcileSubmittedAction(current.id, marker);
		} catch (error) {
			if (preflightAbortRef.current === preflightAbort) preflightAbortRef.current = null;
			executionLeaseRef.current = null;
			if (marker && markerAcquired) await removeFundsActionMarkerSafely(marker.id);
			const latest = actionRef.current;
			if (
				!latest ||
				latest.id !== current.id ||
				!isVaultActionCurrent(latest, routeIdentityRef.current, mountedRef.current)
			) {
				return;
			}
			updateAction({
				...latest,
				isPreflighting: false,
				error: getVaultActionFailure(error),
			});
		}
	}

	async function resolveMutationFailure(
		actionId: string,
		marker: FundsActionReference,
		error: unknown,
		guardPassed: boolean,
	): Promise<void> {
		const failure = guardPassed ? classifyVaultMutationFailure(error) : "deterministic";
		if (failure === "rejected" || failure === "deterministic") {
			await removeFundsActionMarkerSafely(marker.id);
			const latest = actionRef.current;
			if (!isVaultMarkerActionCurrent(latest, actionId, marker, routeIdentityRef.current, mountedRef.current)) return;
			const doneState = transitionFundsAction(latest.state, {
				type: "resolve",
				result: failure === "rejected" ? "rejected" : "apiError",
			});
			updateAction({
				...latest,
				state: doneState,
				isPreflighting: false,
				error: getVaultActionFailure(error),
			});
			return;
		}

		const latest = actionRef.current;
		if (!isVaultMarkerActionCurrent(latest, actionId, marker, routeIdentityRef.current, mountedRef.current)) return;
		const submittedState = transitionFundsAction(latest.state, { type: "submissionAccepted" });
		const reconcilingState = transitionFundsAction(submittedState, { type: "reconcile" });
		updateAction({ ...latest, state: reconcilingState, isPreflighting: false });
		const proof = await reconcileMarker(marker, hyperliquid.info);
		await finishReconciliation(actionId, marker, proof);
	}

	async function reconcileSubmittedAction(actionId: string, marker: FundsActionReference): Promise<void> {
		const latest = actionRef.current;
		if (!isVaultMarkerActionCurrent(latest, actionId, marker, routeIdentityRef.current, mountedRef.current)) return;
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
		if (!isVaultMarkerActionCurrent(latest, actionId, marker, routeIdentityRef.current, mountedRef.current)) return;
		const routeCurrent = isVaultActionCurrent(latest, routeIdentityRef.current, mountedRef.current);
		const storedMarker = findPendingFundsAction(marker.env, marker.owner);
		const markerCurrent = Boolean(storedMarker && fundsActionReferencesEqual(storedMarker, marker));
		const canVerify = Boolean(proof?.match && proof.stateVerified && routeCurrent && markerCurrent);
		const verified = canVerify ? await removeFundsActionMarkerSafely(marker.id) : false;
		const currentAfterRemoval = actionRef.current;
		if (
			!isVaultMarkerActionCurrent(currentAfterRemoval, actionId, marker, routeIdentityRef.current, mountedRef.current)
		) {
			return;
		}
		const result = verified ? "success" : "unknown";
		const doneState = transitionFundsAction(currentAfterRemoval.state, { type: "resolve", result });
		updateAction({
			...currentAfterRemoval,
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
		if (!isVaultActionCurrent(current, routeIdentityRef.current, mountedRef.current)) return;
		const storedMarker = findPendingFundsAction(current.marker.env, current.marker.owner);
		if (!storedMarker || !fundsActionReferencesEqual(storedMarker, current.marker)) return;
		const reconcilingState = transitionFundsAction(current.state, { type: "verify" });
		updateAction({ ...current, state: reconcilingState, error: undefined });
		const proof = await reconcileMarker(current.marker, hyperliquid.info);
		await finishReconciliation(current.id, current.marker, proof);
	}

	function retry() {
		const current = actionRef.current;
		if (
			!current ||
			!isVaultActionCurrent(current, routeIdentityRef.current, mountedRef.current) ||
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
			error: undefined,
			isPreflighting: false,
		});
	}

	return {
		action: visibleAction,
		availableAmount,
		maxAmount:
			availableAmount === null
				? null
				: formatDecimalFloor(availableAmount, USDC_ATOMIC_DECIMALS, FILLED_AMOUNT_MIN_DECIMALS),
		minimumAmount,
		belowMinimum: minimumAmount !== null && amount?.valid === true && !meetsMinimum,
		actionAvailability,
		canReview,
		canConfirm,
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
				info.userNonFundingLedgerUpdates({
					user: marker.owner,
					startTime: getFundsActionHistoryStartTime(marker.startedAt),
				}),
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

function createRecoveredVaultAction({
	markers,
	env,
	recoveryOwner,
	vaultAddress,
	detail,
	identityKey,
	routeIdentityKey,
}: {
	markers: readonly FundsActionReference[];
	env: FundsActionReference["env"];
	recoveryOwner: `0x${string}` | undefined;
	vaultAddress: `0x${string}`;
	detail: VaultDetail | null;
	identityKey: string;
	routeIdentityKey: string;
}): ActiveVaultAction | null {
	if (!recoveryOwner || !detail || vaultAddress === zeroAddress) return null;
	if (detail.vaultAddress.toLowerCase() !== vaultAddress.toLowerCase()) return null;

	const ownerMarkers = markers.filter(
		(marker) => marker.env === env && marker.owner.toLowerCase() === recoveryOwner.toLowerCase(),
	);
	if (ownerMarkers.length !== 1) return null;
	const marker = ownerMarkers[0];
	if (
		marker.method !== "vaultTransfer" ||
		(marker.direction !== "deposit" && marker.direction !== "withdraw") ||
		marker.asset !== "USDC" ||
		marker.atomicDecimals !== USDC_ATOMIC_DECIMALS ||
		marker.target.toLowerCase() !== vaultAddress.toLowerCase() ||
		!marker.historyBaseline ||
		!marker.stateBaseline ||
		marker.stateBaseline.kind !== "vault" ||
		!isRecoveryIdentityEpoch(marker, marker.identityEpoch) ||
		!isRecoveryMarkerId(marker)
	) {
		return null;
	}

	const amount = scaleFundsAmount(marker.displayAmount, USDC_ATOMIC_DECIMALS);
	if (!amount.valid || amount.displayAmount !== marker.displayAmount || amount.atomicAmount !== marker.atomicAmount) {
		return null;
	}

	return {
		id: marker.identityEpoch,
		action: marker.direction,
		amount: amount.displayAmount,
		state: { stage: "done", result: "unknown" },
		identityKey,
		routeIdentityKey,
		ownerAddress: recoveryOwner,
		detail,
		marker,
		isPreflighting: false,
		recoveredFromMarker: true,
	};
}

function isRecoveryMarkerId(marker: FundsActionReference): boolean {
	const prefix = `${marker.env}:${marker.owner.toLowerCase()}:${marker.method}:${marker.startedAt}:`;
	return marker.id.startsWith(prefix) && marker.id.length > prefix.length;
}

function isRecoveryIdentityEpoch(marker: FundsActionReference, value: string): boolean {
	const parts = value.split(":");
	if (parts.length !== 6) return false;
	const [epochEnv, epochClientKey, epochMode, epochWallet, createdAtRaw, sequenceRaw] = parts;
	if (
		epochEnv !== marker.env ||
		epochClientKey?.toLowerCase() !== marker.owner.toLowerCase() ||
		epochMode !== "wallet" ||
		epochWallet?.toLowerCase() !== marker.owner.toLowerCase() ||
		!/^\d+$/.test(createdAtRaw ?? "") ||
		!/^\d+$/.test(sequenceRaw ?? "")
	) {
		return false;
	}
	const createdAt = Number(createdAtRaw);
	const sequence = Number(sequenceRaw);
	return (
		Number.isSafeInteger(createdAt) &&
		createdAt > 0 &&
		createdAt <= marker.startedAt &&
		Number.isSafeInteger(sequence) &&
		sequence > 0
	);
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

function normalizeVaultAddress(value: string): `0x${string}` | null {
	return /^0x[a-fA-F0-9]{40}$/.test(value) ? (value.toLowerCase() as `0x${string}`) : null;
}

function createVaultRouteIdentity(input: {
	identityKey: string;
	env: FundsActionReference["env"];
	vaultAddress: `0x${string}`;
	ownerAddress: `0x${string}` | undefined;
}): VaultRouteIdentity {
	const ownerAddress = input.ownerAddress?.toLowerCase() as `0x${string}` | undefined;
	return {
		...input,
		ownerAddress,
		key: [input.identityKey, input.env, input.vaultAddress, ownerAddress ?? "no-owner"].join("|"),
	};
}

function vaultRouteIdentitiesEqual(expected: VaultRouteIdentity, current: VaultRouteIdentity): boolean {
	return (
		expected.key === current.key &&
		expected.identityKey === current.identityKey &&
		expected.env === current.env &&
		expected.vaultAddress === current.vaultAddress &&
		expected.ownerAddress?.toLowerCase() === current.ownerAddress?.toLowerCase()
	);
}

function isVaultActionCurrent(
	action: ActiveVaultAction | null,
	currentRoute: VaultRouteIdentity,
	mounted: boolean,
): action is ActiveVaultAction {
	return Boolean(
		mounted &&
			action &&
			action.identityKey === currentRoute.identityKey &&
			action.routeIdentityKey === currentRoute.key &&
			action.ownerAddress.toLowerCase() === currentRoute.ownerAddress?.toLowerCase() &&
			action.detail.vaultAddress.toLowerCase() === currentRoute.vaultAddress,
	);
}

function isVaultActionEpochCurrent(
	expectedAction: ActiveVaultAction,
	currentAction: ActiveVaultAction | null,
	currentRoute: VaultRouteIdentity,
	mounted: boolean,
): currentAction is ActiveVaultAction {
	return Boolean(
		isVaultActionCurrent(currentAction, currentRoute, mounted) &&
			currentAction.id === expectedAction.id &&
			currentAction.identityKey === expectedAction.identityKey &&
			currentAction.routeIdentityKey === expectedAction.routeIdentityKey &&
			currentAction.ownerAddress.toLowerCase() === expectedAction.ownerAddress.toLowerCase() &&
			currentAction.detail.vaultAddress.toLowerCase() === expectedAction.detail.vaultAddress.toLowerCase(),
	);
}

function isVaultMarkerActionCurrent(
	action: ActiveVaultAction | null,
	actionId: string,
	marker: FundsActionReference,
	currentRoute: VaultRouteIdentity,
	mounted: boolean,
): action is ActiveVaultAction {
	return Boolean(
		isVaultActionCurrent(action, currentRoute, mounted) &&
			action.id === actionId &&
			marker.identityEpoch === actionId &&
			marker.env === currentRoute.env &&
			marker.owner.toLowerCase() === currentRoute.ownerAddress?.toLowerCase() &&
			marker.target.toLowerCase() === currentRoute.vaultAddress,
	);
}

function assertVaultRequestCurrent(
	expected: VaultRequestLease,
	currentRequest: VaultRequestLease | null,
	currentRoute: VaultRouteIdentity,
	mounted: boolean,
): void {
	if (
		!mounted ||
		expected.abortController.signal.aborted ||
		currentRequest !== expected ||
		!vaultRouteIdentitiesEqual(expected.routeIdentity, currentRoute)
	) {
		throw new VaultActionContextChangedError();
	}
}

function assertVaultActionCurrent(
	expectedAction: ActiveVaultAction,
	currentAction: ActiveVaultAction | null,
	expectedRoute: VaultRouteIdentity,
	currentRoute: VaultRouteIdentity,
	mounted: boolean,
	signal?: AbortSignal,
): void {
	if (
		signal?.aborted ||
		!vaultRouteIdentitiesEqual(expectedRoute, currentRoute) ||
		!isVaultActionEpochCurrent(expectedAction, currentAction, currentRoute, mounted)
	) {
		throw new VaultActionContextChangedError();
	}
}

function createActionEpoch(identityKey: string): string {
	actionEpoch += 1;
	return `${identityKey}:${Date.now()}:${actionEpoch}`;
}

class VaultActionContextChangedError extends Error {
	constructor() {
		super("Vault route, owner, network, or action epoch changed");
		this.name = "VaultActionContextChangedError";
	}
}

class VaultActionPreflightError extends Error {
	readonly reason: VaultActionPreflightFailure;

	constructor(reason: VaultActionPreflightFailure) {
		super(`Vault preflight failed: ${reason}`);
		this.name = "VaultActionPreflightError";
		this.reason = reason;
	}
}

/**
 * What to show for a failed Vault action. The Vault preflight has its own reasons; everything else
 * goes through the shared classifier, so exchange rejections keep their text and transport failures
 * are never reported as a wallet or network change.
 */
function getVaultActionFailure(error: unknown): ActionFailure {
	if (error instanceof VaultActionPreflightError) {
		switch (error.reason) {
			case "depositsClosed":
				return msg`This Vault no longer accepts deposits.`;
			case "belowMinimumDeposit":
				return msg`The amount is below this Vault's minimum deposit.`;
			case "withdrawalLocked":
				return msg`Withdrawal is still locked by the fresh server timestamp.`;
			case "amountExceedsAvailable":
				return msg`The amount exceeds the freshly verified maximum.`;
			case "ownerMismatch":
			case "vaultMismatch":
				return msg`The refreshed Vault identity did not match this reviewed action.`;
			case "balanceUnavailable":
			case "equityUnavailable":
			case "withdrawalUnavailable":
			case "detailUnavailable":
				return VAULT_DATA_UNVERIFIED;
		}
	}
	const failure = classifyActionErrorOr(error, VAULT_OPERATION_FAILED);
	if ("kind" in failure && failure.kind === "action-error" && failure.code === "wallet-rejected") {
		return msg`Authorization was rejected in the wallet.`;
	}
	return failure;
}
