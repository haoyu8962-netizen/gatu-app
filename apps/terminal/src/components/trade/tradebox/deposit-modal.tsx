import { Button, ModalContent, ModalHeader, ModalTitle } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useRef, useState } from "react";
import { type Address, formatUnits, isAddress, parseUnits, zeroAddress } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import {
	CCTP_MAX_DEPOSIT_USDC,
	CCTP_TESTNET_MAX_DEPOSIT_USDC,
	isCctpExternalDepositEnabled,
} from "@/config/cctp-deposit";
import { LIFI_BRIDGE_FEATURES, shouldShowLiFiBridgeTab } from "@/config/lifi-bridge";
import { NETWORKS } from "@/config/networks";
import { DEPOSIT_BALANCE_REFRESH_MS } from "@/config/time";
import { getAccountBalanceSummary } from "@/domain/trade/balances";
import {
	assertPreTransferCheckMatchesReview,
	getCanonicalSpotSystemAddress,
	normalizePreTransferCheck,
	PreTransferCheckExecutionError,
} from "@/domain/trade/pre-transfer-check";
import { getUsdcRoutingQueryStatus, getWithdrawalRoute } from "@/domain/trade/usdc-routing";
import { useAccountAbstractionPreExecutionGuard } from "@/hooks/trade/use-account-abstraction-guard";
import { useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useCctpDepositFee } from "@/hooks/trade/use-cctp-deposit-fee";
import { useCctpDepositTracking } from "@/hooks/trade/use-cctp-deposit-tracking";
import { useCctpWithdrawalFee } from "@/hooks/trade/use-cctp-withdrawal-fee";
import { executeWithFreshWithdrawalRoute, useFreshUsdcRouting, useUsdcRouting } from "@/hooks/trade/use-usdc-routing";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEmailEmbeddedWallet } from "@/hooks/wallet/use-email-embedded-wallet";
import { useReconnectWallet, useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatExchangeActionError, formatTransferError, isAmbiguousExchangeActionError } from "@/lib/errors/format";
import { formatNumber } from "@/lib/format";
import { infoQueryOptions, useExchange, useHyperliquid, useInfo } from "@/lib/hyperliquid";
import { isDefinitiveDepositSourceFailure } from "@/lib/hyperliquid/deposit-source-error";
import { useDeposit } from "@/lib/hyperliquid/use-deposit";
import { createLazyComponent } from "@/lib/lazy";
import { useHasExistingBridgeExecution } from "@/lib/lifi/bridge-execution-state";
import { calculateCctpDepositFee } from "@/lib/trade/cctp-deposit";
import { removeCctpDepositTrackingRecord } from "@/lib/trade/cctp-deposit-tracking";
import {
	buildCctpWithdrawalParameters,
	getMaximumWithdrawal,
	getWithdrawalNetReceived,
	getWithdrawalRouteFee,
	getWithdrawalSourceDex,
	isPositiveDecimal,
	validateWithdrawal,
	type WithdrawalRoute,
} from "@/lib/trade/withdrawal";
import { getPrivyEmailAddress, shouldUsePrivyEmbeddedWallet } from "@/lib/wallet/privy-wagmi";
import {
	useDepositModalActions,
	useDepositModalOpen,
	useDepositModalTab,
	useTransferModalActions,
} from "@/stores/use-global-modal-store";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { PendingActionModal } from "../components/pending-action-modal";
import { DepositForm } from "./deposit/deposit-form";
import { StatusScreen, WalletNotConnected } from "./deposit/shared-ui";
import { WithdrawForm } from "./deposit/withdraw-form";
import { WrongNetworkScreen } from "./deposit/wrong-network-screen";

const LazyBridgeTab = createLazyComponent(() => import("./bridge/bridge-tab"), "BridgeTab");

const ARBITRUM_NETWORK = NETWORKS[0];

interface WithdrawalAttempt {
	activationFee: string;
	amount: string;
	route: WithdrawalRoute;
	routeFee: string;
}

interface CctpPreTransferReview {
	fee: string;
	params: {
		source: Address;
		user: Address;
	};
}

function normalizeError(error: unknown): Error {
	if (error instanceof Error) return error;
	return new Error(typeof error === "string" ? error : t`Unknown error`);
}

export function DepositModal() {
	const open = useDepositModalOpen();
	const activeTab = useDepositModalTab();
	const { close } = useDepositModalActions();
	const { open: openTransferModal } = useTransferModalActions();
	const isMobile = useIsMobile();
	const presentation = isMobile ? "drawer" : "modal";

	const [depositAmount, setDepositAmount] = useState("");
	const [withdrawAmount, setWithdrawAmount] = useState("");
	const [withdrawDestination, setWithdrawDestination] = useState("");
	const [withdrawalAttempt, setWithdrawalAttempt] = useState<WithdrawalAttempt | null>(null);
	const [withdrawalRouteChanged, setWithdrawalRouteChanged] = useState(false);
	const [depositRoutingPreflightFailed, setDepositRoutingPreflightFailed] = useState(false);
	const [depositCctpPreflightError, setDepositCctpPreflightError] = useState<string | null>(null);
	const [withdrawalRoutingPreflightFailed, setWithdrawalRoutingPreflightFailed] = useState(false);
	const [isDepositPreflighting, setIsDepositPreflighting] = useState(false);
	const [isWithdrawalPreflighting, setIsWithdrawalPreflighting] = useState(false);
	const depositPreflightIdRef = useRef(0);
	const cctpPreTransferReviewRef = useRef<CctpPreTransferReview | null>(null);
	const observedWithdrawalRouteRef = useRef<WithdrawalRoute | null>(null);
	const queryClient = useQueryClient();
	const { env, info } = useHyperliquid();
	const isTestnet = useIsTestnet();
	const depositTxChain = isTestnet ? arbitrumSepolia : arbitrum;
	const usdcRoutingQuery = useUsdcRouting(open);
	const fetchFreshUsdcRouting = useFreshUsdcRouting();
	const usdcRoutingStatus = getUsdcRoutingQueryStatus({
		data: usdcRoutingQuery.data,
		isError: usdcRoutingQuery.isError,
		isFetching: usdcRoutingQuery.isFetching,
	});
	const depositRoutingStatus = depositRoutingPreflightFailed ? "error" : usdcRoutingStatus;
	const withdrawalRoutingStatus = withdrawalRoutingPreflightFailed ? "error" : usdcRoutingStatus;
	const routedWithdrawalRoute = getWithdrawalRoute(usdcRoutingQuery.data);
	const withdrawalRoute = routedWithdrawalRoute ?? "arbitrum-cctp";
	const selectedDepositRoute = usdcRoutingQuery.data?.depositRoute ?? "bridge";
	const depositRouteReady = depositRoutingStatus === "ready" && !!usdcRoutingQuery.data?.depositRoute;
	const cctpExternalDepositEnabled = isCctpExternalDepositEnabled(isTestnet);

	const { walletAddress, hasWalletAccess, user, embeddedWalletAddress } = useWalletSession();
	const { reconnectWallet, walletsReady, isReconnecting } = useReconnectWallet();
	const {
		emailAddress: emailWalletAddress,
		embeddedWalletAddress: ensuredEmbeddedWalletAddress,
		shouldUseEmbeddedWallet: shouldUseEmailEmbeddedWallet,
		needsEmbeddedWallet,
		isCreatingEmbeddedWallet,
		embeddedWalletError,
		ensureEmailEmbeddedWallet,
	} = useEmailEmbeddedWallet();
	const emailAddress = getPrivyEmailAddress(user) ?? emailWalletAddress;
	const depositEmbeddedWalletAddress = embeddedWalletAddress ?? ensuredEmbeddedWalletAddress;
	const isEmbeddedDeposit = !!emailAddress && (shouldUsePrivyEmbeddedWallet(user) || shouldUseEmailEmbeddedWallet);
	const depositMode = isEmbeddedDeposit ? "smart" : "wallet";
	let depositAmountRaw: bigint | undefined;
	try {
		depositAmountRaw = depositAmount.trim() ? parseUnits(depositAmount.trim(), 6) : undefined;
	} catch {
		depositAmountRaw = undefined;
	}
	const cctpDepositFeeQuery = useCctpDepositFee({
		amountRaw: depositAmountRaw,
		enabled:
			open && depositRouteReady && selectedDepositRoute === "cctp" && !isEmbeddedDeposit && cctpExternalDepositEnabled,
		isTestnet,
	});

	const {
		balance: depositBalance,
		maxAmount: maxDepositAmount,
		maxDepositRaw,
		balanceStatus: depositBalanceStatus,
		balanceError: depositBalanceError,
		status: depositStatus,
		error: depositError,
		hash: depositHash,
		executionAmount: depositExecutionAmount,
		executionRoute: depositExecutionRoute,
		cctpRecoveryUnavailable,
		walletResponseDelayed,
		isArbitrum,
		isSwitching,
		deposit,
		switchError,
		switchToArbitrum,
		walletProviderStatus,
		walletProviderError,
		validate: validateDeposit,
		reset: resetDeposit,
		networkName: depositNetworkName,
		smartDepositEnabled,
	} = useDeposit({
		balanceEnabled: open,
		balancePollIntervalMs: isEmbeddedDeposit ? DEPOSIT_BALANCE_REFRESH_MS : undefined,
		mode: depositMode,
		depositRoute: selectedDepositRoute,
		expectedCctpMaxFeeRaw: cctpDepositFeeQuery.calculation?.maxFeeRaw,
		walletAddress: isEmbeddedDeposit ? depositEmbeddedWalletAddress : undefined,
	});
	const cctpDepositTracking = useCctpDepositTracking({
		enabled: open && !isEmbeddedDeposit && !!walletAddress,
		env: isTestnet ? "Testnet" : "Mainnet",
		owner: walletAddress,
		sourceHash: depositExecutionRoute === "cctp" ? depositHash : undefined,
	});
	const isCurrentCctpDeposit =
		!!depositHash &&
		(depositExecutionRoute === "cctp" || cctpDepositTracking.recoveryRecord?.sourceHash === depositHash.toLowerCase());
	const defaultBalances = useDefaultDexBalances();
	const accountAbstraction = defaultBalances.accountAbstraction;
	const assertAccountAbstraction = useAccountAbstractionPreExecutionGuard(accountAbstraction, walletAddress);
	const {
		marginSummary,
		perpSummary,
		spotBalances,
		spotAvailableAfterMaintenance,
		withdrawable: perpWithdrawable,
	} = defaultBalances;
	const accountSummary = getAccountBalanceSummary({
		accountAbstraction,
		marginSummary,
		perpSummary,
		withdrawable: perpWithdrawable,
		spotBalances,
		spotAvailableAfterMaintenance,
	});
	const withdrawable = String(accountSummary.withdrawable);
	const showSpotFundsNotice =
		!accountSummary.usesSpotStateForPerps && accountSummary.hasSpotFundsWhenPerpWithdrawableZero;

	const baseDepositValidation = validateDeposit(depositAmount);
	const embeddedWalletValidationError =
		isEmbeddedDeposit && embeddedWalletError
			? formatTransferError(normalizeError(embeddedWalletError))
			: isEmbeddedDeposit && (needsEmbeddedWallet || isCreatingEmbeddedWallet || !depositEmbeddedWalletAddress)
				? t`Creating your wallet. Please wait...`
				: null;
	const cctpDepositFeeUnavailable =
		selectedDepositRoute === "cctp" &&
		!isEmbeddedDeposit &&
		(cctpDepositFeeQuery.isLoading ||
			cctpDepositFeeQuery.isError ||
			!cctpDepositFeeQuery.calculation ||
			cctpDepositFeeQuery.hasSufficientFastAllowance === false);
	const cctpDepositFee = cctpDepositFeeQuery.calculation
		? formatUnits(cctpDepositFeeQuery.calculation.maxFeeRaw, 6)
		: null;
	const cctpDepositNetAmount = cctpDepositFeeQuery.calculation
		? formatUnits(cctpDepositFeeQuery.calculation.netAmountRaw, 6)
		: null;
	const cctpDepositAmountLimitError =
		selectedDepositRoute === "cctp" && depositAmountRaw !== undefined && depositAmountRaw > CCTP_MAX_DEPOSIT_USDC
			? t`Circle CCTP deposits are limited to 10,000,000 USDC per transfer.`
			: selectedDepositRoute === "cctp" &&
					isTestnet &&
					depositAmountRaw !== undefined &&
					depositAmountRaw > CCTP_TESTNET_MAX_DEPOSIT_USDC
				? t`Circle testnet deposits are limited to 1,000 USDC per transfer.`
				: null;
	const depositValidation = !depositRouteReady
		? { valid: false, error: null }
		: embeddedWalletValidationError
			? { valid: false, error: embeddedWalletValidationError }
			: selectedDepositRoute === "cctp" && !isEmbeddedDeposit && !cctpExternalDepositEnabled
				? {
						valid: false,
						error: t`CCTP deposits are awaiting funded end-to-end verification for this network.`,
					}
				: isEmbeddedDeposit && selectedDepositRoute === "cctp"
					? {
							valid: false,
							error: t`Gas-sponsored CCTP deposits require a configured and verified relayer.`,
						}
					: isEmbeddedDeposit && !smartDepositEnabled
						? { valid: false, error: t`Smart wallet deposits are not enabled for this network.` }
						: cctpDepositAmountLimitError
							? { valid: false, error: cctpDepositAmountLimitError }
							: cctpDepositFeeUnavailable
								? {
										valid: false,
										error: cctpDepositFeeQuery.isError
											? t`Unable to verify the current Circle CCTP fee and Fast Transfer capacity.`
											: cctpDepositFeeQuery.hasSufficientFastAllowance === false
												? t`Circle Fast Transfer capacity is temporarily unavailable. Try again later.`
												: null,
									}
								: { ...baseDepositValidation, error: depositCctpPreflightError ?? baseDepositValidation.error };
	const canUseFundsActions = hasWalletAccess && !!walletAddress;
	const canUseDeposit = canUseFundsActions || isEmbeddedDeposit;
	const hasExistingBridgeExecution = useHasExistingBridgeExecution(walletAddress);
	const showBridgeTab = shouldShowLiFiBridgeTab({
		isEmbeddedDeposit,
		hasExistingExecution: hasExistingBridgeExecution,
		createNewRoute: LIFI_BRIDGE_FEATURES.createNewRoute,
	});
	const visibleTab = showBridgeTab || activeTab !== "bridge" ? activeTab : "deposit";
	const usesFundsRedesign = visibleTab !== "bridge";
	const withdrawalQueriesEnabled =
		open &&
		visibleTab === "withdraw" &&
		canUseFundsActions &&
		accountSummary.isAvailable &&
		withdrawalRoutingStatus === "ready" &&
		!!routedWithdrawalRoute;
	const cctpWithdrawalQueriesEnabled = withdrawalQueriesEnabled && withdrawalRoute === "arbitrum-cctp";
	const spotMetaQuery = useInfo("spotMeta", undefined, {
		enabled: cctpWithdrawalQueriesEnabled,
		refetchOnWindowFocus: true,
		staleTime: 30_000,
	});
	let cctpUsdcSystemAddress: Address | undefined;
	if (spotMetaQuery.data) {
		try {
			cctpUsdcSystemAddress = getCanonicalSpotSystemAddress(spotMetaQuery.data, "USDC");
		} catch {
			cctpUsdcSystemAddress = undefined;
		}
	}
	const preTransferParams = {
		user: cctpUsdcSystemAddress ?? zeroAddress,
		source: walletAddress ?? zeroAddress,
	};
	const preTransferCheckQuery = useInfo("preTransferCheck", preTransferParams, {
		enabled: cctpWithdrawalQueriesEnabled && !!cctpUsdcSystemAddress,
		refetchOnWindowFocus: true,
		select: normalizePreTransferCheck,
		staleTime: 30_000,
	});
	const cctpFeeQuery = useCctpWithdrawalFee({
		enabled: withdrawalQueriesEnabled && withdrawalRoute === "arbitrum-cctp",
		isTestnet,
	});
	const cctpWithdrawal = useExchange("sendToEvmWithData", {
		preExecutionGuard: (_params, signal) => assertFreshWithdrawalExecution("arbitrum-cctp", signal),
	});
	const legacyWithdrawal = useExchange("withdraw3", {
		preExecutionGuard: (_params, signal) => assertFreshWithdrawalExecution("arbitrum-legacy", signal),
	});
	const isWithdrawPending = isWithdrawalPreflighting || cctpWithdrawal.isPending || legacyWithdrawal.isPending;
	const isWithdrawSuccess = cctpWithdrawal.isSuccess || legacyWithdrawal.isSuccess;
	const withdrawError = cctpWithdrawal.error ?? legacyWithdrawal.error;
	const cctpFee = cctpFeeQuery.data ?? null;
	const withdrawalRouteFee = getWithdrawalRouteFee(withdrawalRoute, cctpFee);
	const withdrawalActivationFee = withdrawalRoute === "arbitrum-cctp" ? (preTransferCheckQuery.data?.fee ?? "0") : "0";
	const withdrawalMaxAmount =
		withdrawalRoute === "arbitrum-legacy" || preTransferCheckQuery.isSuccess
			? getMaximumWithdrawal(withdrawable, withdrawalActivationFee)
			: "0";
	const withdrawValidation = validateWithdrawal({
		amount: withdrawAmount,
		available: withdrawable,
		route: withdrawalRoute,
		routeFee: withdrawalRouteFee,
		activationFee: withdrawalActivationFee,
	});
	const isDepositPending = isDepositPreflighting || depositStatus === "pending" || depositStatus === "confirming";
	const displayedDepositAmount = depositExecutionAmount ?? depositAmount;
	const walletDepositProviderUnavailable =
		canUseFundsActions && depositMode === "wallet" && visibleTab === "deposit" && walletProviderStatus === "error";
	const requiresWithdrawDestination = isEmbeddedDeposit;
	const normalizedWithdrawDestination = withdrawDestination.trim();
	const isWithdrawDestinationValid =
		!requiresWithdrawDestination || (!!normalizedWithdrawDestination && isAddress(normalizedWithdrawDestination));
	const withdrawDestinationError =
		requiresWithdrawDestination && normalizedWithdrawDestination && !isAddress(normalizedWithdrawDestination)
			? t`Invalid destination address`
			: null;
	const withdrawalPrerequisitesPending =
		isWithdrawalPreflighting ||
		withdrawalRoutingStatus === "loading" ||
		(withdrawalRoute === "arbitrum-cctp" &&
			(spotMetaQuery.isFetching || preTransferCheckQuery.isFetching || cctpFeeQuery.isFetching));
	const cctpSpotMetaInvalid = spotMetaQuery.isSuccess && !cctpUsdcSystemAddress;
	let withdrawalPrerequisiteError: string | null = null;
	if (!accountSummary.isAvailable) {
		withdrawalPrerequisiteError = t`Select a supported account mode before moving funds.`;
	} else if (
		withdrawalRoutingStatus === "ready" &&
		withdrawalRoute === "arbitrum-cctp" &&
		(spotMetaQuery.isError || cctpSpotMetaInvalid)
	) {
		withdrawalPrerequisiteError = t`Unable to verify the current HyperCore USDC destination.`;
	} else if (
		withdrawalRoutingStatus === "ready" &&
		withdrawalRoute === "arbitrum-cctp" &&
		preTransferCheckQuery.data?.isSanctioned
	) {
		withdrawalPrerequisiteError = t`Withdrawals are unavailable for this address.`;
	} else if (
		withdrawalRoutingStatus === "ready" &&
		withdrawalRoute === "arbitrum-cctp" &&
		preTransferCheckQuery.isError
	) {
		withdrawalPrerequisiteError = t`Unable to verify withdrawal eligibility.`;
	} else if (withdrawalRoutingStatus === "ready" && withdrawalRoute === "arbitrum-cctp" && cctpFeeQuery.isError) {
		withdrawalPrerequisiteError = t`Unable to load the current CCTP withdrawal fee.`;
	}
	const withdrawalPrerequisitesReady =
		accountSummary.isAvailable &&
		withdrawalRoutingStatus === "ready" &&
		!!routedWithdrawalRoute &&
		(withdrawalRoute === "arbitrum-legacy" ||
			(spotMetaQuery.isSuccess &&
				!!cctpUsdcSystemAddress &&
				preTransferCheckQuery.isSuccess &&
				!preTransferCheckQuery.data.isSanctioned &&
				cctpFeeQuery.isSuccess));
	const canRetryWithdrawalPrerequisites =
		withdrawalRoutingStatus === "ready" &&
		withdrawalRoute === "arbitrum-cctp" &&
		!preTransferCheckQuery.data?.isSanctioned &&
		(spotMetaQuery.isError || cctpSpotMetaInvalid || preTransferCheckQuery.isError || cctpFeeQuery.isError);
	const canSubmitWithdraw = withdrawValidation.valid && isWithdrawDestinationValid && withdrawalPrerequisitesReady;

	useEffect(() => {
		if (!open || visibleTab !== "deposit" || !needsEmbeddedWallet) return;
		void ensureEmailEmbeddedWallet().catch(() => {});
	}, [ensureEmailEmbeddedWallet, needsEmbeddedWallet, open, visibleTab]);

	useEffect(() => {
		if (!open) {
			observedWithdrawalRouteRef.current = null;
			return;
		}
		if (!routedWithdrawalRoute) return;
		const previousRoute = observedWithdrawalRouteRef.current;
		observedWithdrawalRouteRef.current = routedWithdrawalRoute;
		if (previousRoute && previousRoute !== routedWithdrawalRoute) setWithdrawalRouteChanged(true);
	}, [open, routedWithdrawalRoute]);

	function handleDepositRetry() {
		resetDeposit();
	}

	async function assertFreshWithdrawalRoute(expectedRoute: WithdrawalRoute, signal?: AbortSignal) {
		let freshRoute: WithdrawalRoute | null;
		try {
			freshRoute = getWithdrawalRoute(await fetchFreshUsdcRouting(signal));
		} catch {
			throw new Error(t`Unable to verify the current Hyperliquid withdrawal route.`);
		}
		if (!freshRoute) throw new Error(t`Unable to verify the current Hyperliquid withdrawal route.`);
		if (freshRoute !== expectedRoute) {
			throw new Error(
				t`The Hyperliquid withdrawal route changed. Review the updated route and fee, then submit again.`,
			);
		}
	}

	async function fetchFreshPreTransferCheck(review: CctpPreTransferReview, signal: AbortSignal) {
		const options = infoQueryOptions(info, "preTransferCheck", review.params, env);
		try {
			signal.throwIfAborted();
			await queryClient.cancelQueries({ exact: true, queryKey: options.queryKey });
			signal.throwIfAborted();
			const response = await info.preTransferCheck(review.params, signal);
			signal.throwIfAborted();
			const normalized = normalizePreTransferCheck(response);
			await queryClient.cancelQueries({ exact: true, queryKey: options.queryKey });
			signal.throwIfAborted();
			queryClient.setQueryData(options.queryKey, response);
			return normalized;
		} catch (error) {
			if (signal.aborted) throw signal.reason ?? error;
			throw new PreTransferCheckExecutionError("unavailable");
		}
	}

	async function assertFreshCctpPreTransferCheck(signal: AbortSignal) {
		const review = cctpPreTransferReviewRef.current;
		if (!review) throw new PreTransferCheckExecutionError("unavailable");
		const current = await fetchFreshPreTransferCheck(review, signal);
		assertPreTransferCheckMatchesReview(review.fee, current);
	}

	async function assertFreshWithdrawalExecution(expectedRoute: WithdrawalRoute, signal: AbortSignal) {
		const guards = [assertFreshWithdrawalRoute(expectedRoute, signal), assertAccountAbstraction(signal)];
		if (expectedRoute === "arbitrum-cctp") guards.push(assertFreshCctpPreTransferCheck(signal));
		await Promise.all(guards);
	}

	function handleClose() {
		const completedTrackingHash =
			cctpDepositTracking.data?.status === "forward-submitted" ? cctpDepositTracking.trackedSourceHash : undefined;
		const definitivelyFailedTrackingHash =
			depositExecutionRoute === "cctp" && depositHash && isDefinitiveDepositSourceFailure(depositError)
				? depositHash
				: undefined;
		const removableTrackingHash = completedTrackingHash ?? definitivelyFailedTrackingHash;
		if (removableTrackingHash && walletAddress) {
			try {
				removeCctpDepositTrackingRecord(isTestnet ? "Testnet" : "Mainnet", walletAddress, removableTrackingHash);
			} catch {
				// The source transaction hash remains available in the explorer link.
			}
		}
		depositPreflightIdRef.current += 1;
		resetDeposit();
		cctpWithdrawal.reset();
		legacyWithdrawal.reset();
		setDepositAmount("");
		setWithdrawAmount("");
		setWithdrawDestination("");
		setWithdrawalAttempt(null);
		setWithdrawalRouteChanged(false);
		setDepositRoutingPreflightFailed(false);
		setDepositCctpPreflightError(null);
		setWithdrawalRoutingPreflightFailed(false);
		setIsDepositPreflighting(false);
		setIsWithdrawalPreflighting(false);
		cctpPreTransferReviewRef.current = null;
		observedWithdrawalRouteRef.current = null;
		close();
	}

	function handlePendingClose() {
		close();
	}

	function handleModalOpenChange(nextOpen: boolean) {
		if (!nextOpen) handleClose();
	}

	function handleReconnectWallet() {
		handleClose();
		void reconnectWallet();
	}

	async function handleDepositSubmit() {
		if (!depositValidation.valid || !canUseDeposit || isDepositPending || !depositRouteReady) return;

		setDepositCctpPreflightError(null);
		const preflightId = depositPreflightIdRef.current + 1;
		depositPreflightIdRef.current = preflightId;
		setIsDepositPreflighting(true);
		try {
			const freshRouting = await fetchFreshUsdcRouting();
			if (depositPreflightIdRef.current !== preflightId) return;
			if (!freshRouting) {
				setDepositRoutingPreflightFailed(true);
				return;
			}
			setDepositRoutingPreflightFailed(false);
			if (freshRouting.depositRoute !== selectedDepositRoute) return;
			if (selectedDepositRoute === "cctp") {
				const reviewedCalculation = cctpDepositFeeQuery.calculation;
				if (!reviewedCalculation || depositAmountRaw === undefined) return;
				const freshFeeResult = await cctpDepositFeeQuery.refetch();
				if (depositPreflightIdRef.current !== preflightId) return;
				if (!freshFeeResult.data || freshFeeResult.isError) {
					setDepositCctpPreflightError(t`Unable to verify the current Circle CCTP fee and Fast Transfer capacity.`);
					return;
				}
				if (freshFeeResult.data.fastAllowanceRaw < depositAmountRaw) {
					setDepositCctpPreflightError(t`Circle Fast Transfer capacity is temporarily unavailable. Try again later.`);
					return;
				}
				const freshCalculation = calculateCctpDepositFee(depositAmountRaw, freshFeeResult.data.feeQuote);
				if (freshCalculation.maxFeeRaw !== reviewedCalculation.maxFeeRaw) {
					setDepositCctpPreflightError(t`Circle fees changed. Review the updated fee, then submit again.`);
					return;
				}
			}
			await deposit(depositAmount);
		} catch {
			if (depositPreflightIdRef.current === preflightId) setDepositRoutingPreflightFailed(true);
			return;
		} finally {
			if (depositPreflightIdRef.current === preflightId) setIsDepositPreflighting(false);
		}
	}

	function handleDepositAmountChange(value: string) {
		setDepositCctpPreflightError(null);
		setDepositAmount(value);
	}

	async function handleWithdrawSubmit() {
		if (!canSubmitWithdraw || !walletAddress || withdrawalRouteFee === null) return;
		const destination = requiresWithdrawDestination ? normalizedWithdrawDestination : walletAddress;
		if (!isAddress(destination)) return;

		setIsWithdrawalPreflighting(true);
		try {
			const expectedWithdrawalRoute = routedWithdrawalRoute;
			if (!expectedWithdrawalRoute) return;

			let cctpPreTransferReview: CctpPreTransferReview | null = null;
			if (expectedWithdrawalRoute === "arbitrum-cctp") {
				const reviewedPreTransferCheck = preTransferCheckQuery.data;
				if (!reviewedPreTransferCheck || reviewedPreTransferCheck.isSanctioned || !cctpUsdcSystemAddress) return;

				const spotMetaResult = await spotMetaQuery.refetch();
				if (!spotMetaResult.data || spotMetaResult.isError) return;
				let freshUsdcSystemAddress: Address;
				try {
					freshUsdcSystemAddress = getCanonicalSpotSystemAddress(spotMetaResult.data, "USDC");
				} catch {
					return;
				}
				if (freshUsdcSystemAddress.toLowerCase() !== cctpUsdcSystemAddress.toLowerCase()) return;

				const preTransferResult = await preTransferCheckQuery.refetch();
				if (!preTransferResult.data || preTransferResult.isError) return;
				try {
					assertPreTransferCheckMatchesReview(reviewedPreTransferCheck.fee, preTransferResult.data);
				} catch {
					return;
				}
				cctpPreTransferReview = {
					fee: preTransferResult.data.fee,
					params: { user: freshUsdcSystemAddress, source: walletAddress },
				};
			}

			let freshRouteFee = getWithdrawalRouteFee(expectedWithdrawalRoute, cctpFee);
			if (expectedWithdrawalRoute === "arbitrum-cctp") {
				const cctpFeeResult = await cctpFeeQuery.refetch();
				if (!cctpFeeResult.data || cctpFeeResult.isError) return;
				freshRouteFee = cctpFeeResult.data;
			}
			if (freshRouteFee === null) return;

			const freshValidation = validateWithdrawal({
				amount: withdrawAmount,
				available: withdrawable,
				route: expectedWithdrawalRoute,
				routeFee: freshRouteFee,
				activationFee: cctpPreTransferReview?.fee ?? "0",
			});
			if (!freshValidation.valid) return;

			const executionStatus = await executeWithFreshWithdrawalRoute(
				expectedWithdrawalRoute,
				fetchFreshUsdcRouting,
				async () => {
					setWithdrawalRouteChanged(false);
					setWithdrawalAttempt({
						activationFee: cctpPreTransferReview?.fee ?? "0",
						amount: withdrawAmount,
						route: expectedWithdrawalRoute,
						routeFee: freshRouteFee,
					});
					if (expectedWithdrawalRoute === "arbitrum-cctp") {
						if (!cctpPreTransferReview) throw new PreTransferCheckExecutionError("unavailable");
						cctpPreTransferReviewRef.current = cctpPreTransferReview;
						await cctpWithdrawal.mutateAsync(
							buildCctpWithdrawalParameters({
								amount: withdrawAmount,
								destination,
								sourceDex: getWithdrawalSourceDex(accountSummary.usesSpotStateForPerps),
							}),
						);
						return;
					}
					await legacyWithdrawal.mutateAsync({ destination, amount: withdrawAmount });
				},
			);
			if (executionStatus === "changed") {
				setWithdrawalRoutingPreflightFailed(false);
				setWithdrawalRouteChanged(true);
			} else if (executionStatus === "unavailable") {
				setWithdrawalRoutingPreflightFailed(true);
			} else {
				setWithdrawalRoutingPreflightFailed(false);
			}
		} catch {
			// Query and mutation state render the actionable error without duplicating the request.
		} finally {
			cctpPreTransferReviewRef.current = null;
			setIsWithdrawalPreflighting(false);
		}
	}

	async function handleWithdrawalPrerequisiteRetry() {
		const routingResult = await usdcRoutingQuery.refetch();
		const freshWithdrawalRoute = getWithdrawalRoute(routingResult.data);
		if (routingResult.isError || !freshWithdrawalRoute) {
			setWithdrawalRoutingPreflightFailed(true);
			return;
		}
		setWithdrawalRoutingPreflightFailed(false);
		if (freshWithdrawalRoute === "arbitrum-cctp") {
			const spotMetaResult = await spotMetaQuery.refetch();
			if (spotMetaResult.isError || !spotMetaResult.data) return;
			let freshUsdcSystemAddress: Address;
			try {
				freshUsdcSystemAddress = getCanonicalSpotSystemAddress(spotMetaResult.data, "USDC");
			} catch {
				return;
			}
			if (freshUsdcSystemAddress.toLowerCase() !== cctpUsdcSystemAddress?.toLowerCase()) return;
			await Promise.all([preTransferCheckQuery.refetch(), cctpFeeQuery.refetch()]);
		}
	}

	async function handleDepositRoutingRetry() {
		const result = await usdcRoutingQuery.refetch();
		setDepositRoutingPreflightFailed(result.isError || !result.data);
	}

	function handleWithdrawalErrorRetry() {
		cctpWithdrawal.reset();
		legacyWithdrawal.reset();
		setWithdrawalAttempt(null);
	}

	function handlePerpsSpotTransferClick() {
		openTransferModal("toPerp");
	}
	let depositPendingHeading = <Trans>Confirm in wallet</Trans>;
	if (walletResponseDelayed) depositPendingHeading = <Trans>Taking longer than expected</Trans>;
	if (depositStatus === "confirming") depositPendingHeading = <Trans>Waiting for chain confirmation</Trans>;
	const recoveredCctpDeposit = visibleTab === "deposit" && !depositHash ? cctpDepositTracking.recoveryRecord : null;

	if (recoveredCctpDeposit) {
		const forwardSubmitted = cctpDepositTracking.data?.status === "forward-submitted";
		return (
			<StatusScreen
				open={open}
				presentation={presentation}
				title={<Trans>Deposit</Trans>}
				icon={forwardSubmitted ? "success" : "loading"}
				heading={forwardSubmitted ? <Trans>Forward transaction submitted</Trans> : <Trans>Forwarding deposit</Trans>}
				description={
					forwardSubmitted ? (
						<Trans>
							Circle submitted the HyperEVM forwarding transaction. HyperCore credit may take additional time.
						</Trans>
					) : cctpDepositTracking.isError ? (
						<Trans>
							The Arbitrum transaction was submitted, but Circle status is temporarily unavailable. Tracking will resume
							when you return.
						</Trans>
					) : (
						<Trans>Circle is minting and forwarding USDC to Hyperliquid. Do not resubmit the same transfer.</Trans>
					)
				}
				txHash={recoveredCctpDeposit.sourceHash}
				txChain={depositTxChain}
				onClose={handleClose}
			>
				<Button onClick={handleClose} className="w-full">
					<Trans>Close</Trans>
				</Button>
			</StatusScreen>
		);
	}

	if (depositStatus === "success") {
		if (isCurrentCctpDeposit) {
			const forwardSubmitted = cctpDepositTracking.data?.status === "forward-submitted";
			return (
				<StatusScreen
					open={open}
					presentation={presentation}
					title={<Trans>Deposit</Trans>}
					icon={forwardSubmitted ? "success" : "loading"}
					heading={forwardSubmitted ? <Trans>Forward transaction submitted</Trans> : <Trans>Forwarding deposit</Trans>}
					description={
						cctpRecoveryUnavailable ? (
							<Trans>
								Recovery could not be saved in this browser. Record the Arbitrum transaction hash before closing.
							</Trans>
						) : forwardSubmitted ? (
							<Trans>
								Circle submitted the HyperEVM forwarding transaction. HyperCore credit may take additional time.
							</Trans>
						) : cctpDepositTracking.isError ? (
							<Trans>
								The Arbitrum transaction is confirmed, but Circle status is temporarily unavailable. You can close this
								window; tracking will resume when you return.
							</Trans>
						) : (
							<Trans>
								The Arbitrum transaction is confirmed. Circle is minting and forwarding USDC to Hyperliquid.
							</Trans>
						)
					}
					txHash={depositHash}
					txChain={depositTxChain}
					onClose={handleClose}
				>
					<Button onClick={handleClose} className="w-full">
						<Trans>Done</Trans>
					</Button>
				</StatusScreen>
			);
		}
		return (
			<StatusScreen
				open={open}
				presentation={presentation}
				title={<Trans>Deposit</Trans>}
				icon="success"
				heading={<Trans>Deposit submitted</Trans>}
				description={
					<>
						<span className="tabular-nums font-medium text-success">{displayedDepositAmount} USDC</span>{" "}
						<Trans>confirmed on Arbitrum. Hyperliquid credit usually arrives within a minute.</Trans>
					</>
				}
				txHash={depositHash}
				txChain={depositTxChain}
				onClose={handleClose}
			>
				<Button onClick={handleClose} className="w-full">
					<Trans>Done</Trans>
				</Button>
			</StatusScreen>
		);
	}

	if (depositStatus === "error") {
		const hasSubmittedDeposit = !!depositHash;
		const depositStatusUnknown = hasSubmittedDeposit && !isDefinitiveDepositSourceFailure(depositError);

		return (
			<StatusScreen
				open={open}
				presentation={presentation}
				title={<Trans>Deposit</Trans>}
				icon="error"
				heading={depositStatusUnknown ? <Trans>Deposit status unknown</Trans> : <Trans>Deposit failed</Trans>}
				description={
					depositStatusUnknown ? (
						<Trans>
							The Arbitrum transaction was submitted, but its final status could not be verified. Check the transaction
							before retrying.
						</Trans>
					) : (
						formatTransferError(depositError)
					)
				}
				txHash={depositHash}
				txChain={depositTxChain}
				onClose={handleClose}
			>
				{hasSubmittedDeposit ? (
					<Button onClick={handleClose} className="w-full">
						<Trans>Close</Trans>
					</Button>
				) : (
					<div className="flex w-full gap-2">
						<Button variant="outline" intent="neutral" onClick={handleClose} className="flex-1">
							<Trans>Cancel</Trans>
						</Button>
						<Button onClick={handleDepositRetry} className="flex-1">
							<Trans>Retry</Trans>
						</Button>
					</div>
				)}
			</StatusScreen>
		);
	}

	if (depositStatus === "pending" || depositStatus === "confirming") {
		return (
			<StatusScreen
				open={open}
				presentation={presentation}
				title={<Trans>Deposit</Trans>}
				icon="loading"
				heading={depositPendingHeading}
				description={
					<span className="flex flex-col gap-1">
						<span className="tabular-nums">{displayedDepositAmount} USDC → Hyperliquid</span>
						{walletResponseDelayed ? (
							<span className="flex flex-col gap-1">
								<Trans>
									Keep this window open and confirm or reject the request in your wallet. Do not submit another deposit.
								</Trans>
								<Trans>Closing this dialog will not cancel it.</Trans>
							</span>
						) : null}
					</span>
				}
				txHash={depositStatus === "confirming" ? depositHash : undefined}
				txChain={depositTxChain}
				closable={false}
			>
				{walletResponseDelayed ? (
					<Button variant="outline" intent="neutral" onClick={handlePendingClose} className="w-full">
						<Trans>Close</Trans>
					</Button>
				) : null}
			</StatusScreen>
		);
	}

	if (walletDepositProviderUnavailable) {
		return (
			<StatusScreen
				open={open}
				presentation={presentation}
				title={<Trans>Deposit</Trans>}
				icon="error"
				heading={<Trans>Wallet connection unavailable</Trans>}
				description={formatTransferError(walletProviderError)}
				onClose={handleClose}
			>
				<div className="flex w-full gap-2">
					<Button variant="outline" intent="neutral" onClick={handleClose} className="flex-1">
						<Trans>Cancel</Trans>
					</Button>
					<Button onClick={handleReconnectWallet} disabled={!walletsReady || isReconnecting} className="flex-1">
						<Trans>Reconnect wallet</Trans>
					</Button>
				</div>
			</StatusScreen>
		);
	}

	if (
		canUseFundsActions &&
		depositMode === "wallet" &&
		visibleTab === "deposit" &&
		walletProviderStatus === "ready" &&
		!isArbitrum
	) {
		return (
			<WrongNetworkScreen
				open={open}
				presentation={presentation}
				onClose={handleClose}
				onSwitch={switchToArbitrum}
				isSwitching={isSwitching}
				error={switchError}
			/>
		);
	}

	if (isWithdrawSuccess && withdrawalAttempt) {
		const withdrawNetReceived = getWithdrawalNetReceived(withdrawalAttempt.amount, withdrawalAttempt.routeFee);
		const isCctpWithdrawal = withdrawalAttempt.route === "arbitrum-cctp";

		return (
			<StatusScreen
				open={open}
				presentation={presentation}
				title={<Trans>Withdraw</Trans>}
				icon="success"
				heading={<Trans>Withdrawal submitted</Trans>}
				description={
					<div className="space-y-1">
						<div>
							<Trans>Net received</Trans>:{" "}
							<span className="tabular-nums font-medium text-success">
								${formatNumber(Number(withdrawNetReceived ?? 0), 2)}
							</span>
						</div>
						<div className="text-fg-muted">
							<Trans>Withdrawal fee</Trans>:{" "}
							<span className="tabular-nums">${formatNumber(Number(withdrawalAttempt.routeFee), 2)}</span>
						</div>
						{isPositiveDecimal(withdrawalAttempt.activationFee) ? (
							<div className="text-fg-muted">
								<Trans>One-time account activation fee</Trans>:{" "}
								<span className="tabular-nums">${formatNumber(Number(withdrawalAttempt.activationFee), 2)}</span>
							</div>
						) : null}
						<div className="text-fg-muted">
							{isCctpWithdrawal ? (
								<Trans>
									CCTP forwarding to Arbitrum usually completes in {ARBITRUM_NETWORK.estimatedWithdrawTime}.
								</Trans>
							) : (
								<Trans>will arrive in {ARBITRUM_NETWORK.estimatedWithdrawTime}</Trans>
							)}
						</div>
					</div>
				}
				onClose={handleClose}
			>
				<Button onClick={handleClose} className="w-full">
					<Trans>Done</Trans>
				</Button>
			</StatusScreen>
		);
	}

	if (withdrawError) {
		const isAmbiguousWithdrawal = isAmbiguousExchangeActionError(withdrawError);
		return (
			<StatusScreen
				open={open}
				presentation={presentation}
				title={<Trans>Withdraw</Trans>}
				icon="error"
				heading={isAmbiguousWithdrawal ? <Trans>Withdrawal status unknown</Trans> : <Trans>Withdrawal failed</Trans>}
				description={formatExchangeActionError(withdrawError, t`Withdrawal failed`)}
				onClose={handleClose}
			>
				{isAmbiguousWithdrawal ? (
					<Button onClick={handleClose} className="w-full">
						<Trans>Close</Trans>
					</Button>
				) : (
					<div className="flex w-full gap-2">
						<Button variant="outline" intent="neutral" onClick={handleClose} className="flex-1">
							<Trans>Cancel</Trans>
						</Button>
						<Button onClick={handleWithdrawalErrorRetry} className="flex-1">
							<Trans>Retry</Trans>
						</Button>
					</div>
				)}
			</StatusScreen>
		);
	}

	return (
		<PendingActionModal
			open={open}
			onOpenChange={handleModalOpenChange}
			isPending={isWithdrawPending || isDepositPreflighting}
			presentation={presentation}
			handleClassName={usesFundsRedesign ? "top-2.5 !rounded-[2px] bg-market-close-stroke-input" : undefined}
			overlayClassName={usesFundsRedesign ? "!bg-scrim/60 !backdrop-blur-none" : undefined}
			className={
				usesFundsRedesign
					? "font-market-close !border-0 !bg-modal !shadow-none max-[1000px]:!rounded-t-[20px] [&>button]:!top-5 [&>button]:!right-4 [&>button]:!rounded-[8px] [&>button]:text-market-close-muted [&>button:hover]:bg-market-close-hover [&>button:hover]:text-market-close-fg [&>button:active]:bg-market-close-hover min-[1001px]:!max-w-[28rem] min-[1001px]:!rounded-[16px] min-[1001px]:!shadow-overlay min-[1001px]:[&>button]:!top-6 min-[1001px]:[&>button]:!right-6 min-[1001px]:[&>button>svg]:size-[18px]"
					: undefined
			}
		>
			<ModalHeader
				divider={!usesFundsRedesign}
				className={
					usesFundsRedesign
						? "px-4 pt-7 pr-14 pb-0 text-left min-[1001px]:px-6 min-[1001px]:pr-14 min-[1001px]:pt-6"
						: undefined
				}
			>
				<ModalTitle
					className={
						usesFundsRedesign
							? "text-base leading-[22px] font-bold text-market-close-fg min-[1001px]:text-[17px] min-[1001px]:leading-6"
							: undefined
					}
				>
					{visibleTab === "deposit" ? (
						<Trans>Deposit</Trans>
					) : visibleTab === "withdraw" ? (
						<Trans>Withdraw</Trans>
					) : (
						<Trans>Bridge</Trans>
					)}
				</ModalTitle>
			</ModalHeader>

			<ModalContent
				className={
					usesFundsRedesign ? "px-4 pt-3.5 pb-5 min-[1001px]:px-6 min-[1001px]:pt-3.5 min-[1001px]:pb-6" : "space-y-4"
				}
			>
				<div className={usesFundsRedesign ? "flex flex-col" : "flex min-h-72 flex-col"}>
					{visibleTab === "deposit" &&
						(canUseDeposit ? (
							<DepositForm
								amount={depositAmount}
								onAmountChange={handleDepositAmountChange}
								balance={depositBalance}
								maxAmount={maxDepositAmount}
								maxDepositRaw={maxDepositRaw}
								balanceStatus={depositBalanceStatus}
								balanceError={depositBalanceError}
								validation={depositValidation}
								isPending={isDepositPending}
								onSubmit={handleDepositSubmit}
								routingStatus={depositRoutingStatus}
								depositRoute={usdcRoutingQuery.data?.depositRoute ?? null}
								onRetryRouting={handleDepositRoutingRetry}
								networkName={depositNetworkName}
								smartDepositEnabled={smartDepositEnabled}
								cctpFee={cctpDepositFee}
								cctpNetAmount={cctpDepositNetAmount}
								cctpFeeLoading={selectedDepositRoute === "cctp" && cctpDepositFeeQuery.isLoading}
								pendingCctpRecovery={
									!depositHash &&
									!!cctpDepositTracking.recoveryRecord &&
									cctpDepositTracking.data?.status !== "forward-submitted"
								}
								usesFundingAddressFlow={isEmbeddedDeposit}
								fundingAddressPending={isEmbeddedDeposit && !embeddedWalletError && !depositEmbeddedWalletAddress}
								fundingAddress={isEmbeddedDeposit ? depositEmbeddedWalletAddress : undefined}
								onDone={handleClose}
							/>
						) : (
							<WalletNotConnected onConnect={handleReconnectWallet} isConnecting={!walletsReady || isReconnecting} />
						))}

					{visibleTab === "withdraw" &&
						(!canUseFundsActions ? (
							<WalletNotConnected onConnect={handleReconnectWallet} isConnecting={!walletsReady || isReconnecting} />
						) : (
							<WithdrawForm
								amount={withdrawAmount}
								onAmountChange={setWithdrawAmount}
								destination={withdrawDestination}
								onDestinationChange={setWithdrawDestination}
								destinationRequired={requiresWithdrawDestination}
								destinationError={withdrawDestinationError}
								available={withdrawable}
								maxAmount={withdrawalMaxAmount}
								route={withdrawalRoute}
								routingStatus={withdrawalRoutingStatus}
								routeChanged={withdrawalRouteChanged}
								routeFee={withdrawalRouteFee}
								activationFee={withdrawalActivationFee}
								showActivationFee={isPositiveDecimal(withdrawalActivationFee)}
								prerequisitesPending={withdrawalPrerequisitesPending}
								prerequisiteError={withdrawalPrerequisiteError}
								canRetryPrerequisites={canRetryWithdrawalPrerequisites}
								onRetryPrerequisites={handleWithdrawalPrerequisiteRetry}
								validation={withdrawValidation}
								canSubmit={canSubmitWithdraw}
								isPending={isWithdrawPending}
								onSubmit={handleWithdrawSubmit}
								spotAvailable={accountSummary.spotUsdcAvailable}
								showSpotFundsNotice={showSpotFundsNotice}
								onTransferClick={handlePerpsSpotTransferClick}
							/>
						))}

					{visibleTab === "bridge" && showBridgeTab && (
						<Suspense fallback={null}>
							{canUseFundsActions ? (
								<LazyBridgeTab />
							) : (
								<WalletNotConnected onConnect={handleReconnectWallet} isConnecting={!walletsReady || isReconnecting} />
							)}
						</Suspense>
					)}
				</div>
			</ModalContent>
		</PendingActionModal>
	);
}
