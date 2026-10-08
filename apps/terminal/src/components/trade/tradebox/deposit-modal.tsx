import { Trans, useLingui } from "@lingui/react/macro";
import { CaretLeftIcon } from "@phosphor-icons/react";
import { Button, ButtonIcon, ModalContent, ModalHeader, ModalTitle } from "@sairn/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type Address, formatUnits, isAddress, parseUnits, zeroAddress } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { StatusGlyph } from "@/components/brand/status-glyph";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import {
	CCTP_MAX_DEPOSIT_USDC,
	CCTP_TESTNET_MAX_DEPOSIT_USDC,
	isCctpExternalDepositEnabled,
	isCctpSponsoredDepositEnabled,
} from "@/config/cctp-deposit";
import { LIFI_BRIDGE_FEATURES, shouldShowLiFiBridgeTab } from "@/config/lifi-bridge";
import { isPrivyFiatFundingEnabled } from "@/config/privy-fiat-funding";
import { DEPOSIT_BALANCE_REFRESH_MS, FUNDS_OUTCOME_TOAST_DURATION_MS } from "@/config/time";
import {
	getAccountBalanceSummary,
	getSpotBalance,
	getSpotTransferableValue,
	isQuoteBalanceSharedWithPerps,
} from "@/domain/trade/balances";
import { getFundsAvailabilityNotice } from "@/domain/trade/data-presentation";
import { assertFreshFundsAmountWithFee, FundsExecutionError } from "@/domain/trade/funds-execution-guard";
import {
	assertPreTransferCheckMatchesReview,
	getCanonicalSpotSystemAddress,
	normalizePreTransferCheck,
	PreTransferCheckExecutionError,
} from "@/domain/trade/pre-transfer-check";
import { getUsdcRoutingQueryStatus, getWithdrawalRoute } from "@/domain/trade/usdc-routing";
import {
	AccountAbstractionExecutionError,
	useAccountAbstractionPreExecutionGuard,
} from "@/hooks/trade/use-account-abstraction-guard";
import { useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useCctpDepositFee } from "@/hooks/trade/use-cctp-deposit-fee";
import { useCctpDepositTracking } from "@/hooks/trade/use-cctp-deposit-tracking";
import { useCctpWithdrawalFee } from "@/hooks/trade/use-cctp-withdrawal-fee";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { FundsActionGeoExecutionError, useFundsActionAvailability } from "@/hooks/trade/use-funds-action-availability";
import { usePrivyFiatFundingOffer } from "@/hooks/trade/use-privy-fiat-funding-offer";
import {
	executeWithFreshWithdrawalRoute,
	UsdcDepositRouteError,
	useFreshUsdcRouting,
	useUsdcRouting,
} from "@/hooks/trade/use-usdc-routing";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEmailEmbeddedWallet } from "@/hooks/wallet/use-email-embedded-wallet";
import { useReconnectWallet, useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { STATUS_GLYPH_UNKNOWN } from "@/lib/brand/status-glyph.gen";
import { formatExchangeActionError, formatTransferError, isAmbiguousExchangeActionError } from "@/lib/errors/format";
import { useNumberFormat } from "@/lib/format";
import { infoQueryOptions, useExchange, useHyperliquid, useInfo } from "@/lib/hyperliquid";
import { isDefinitiveDepositSourceFailure } from "@/lib/hyperliquid/deposit-source-error";
import { useDeposit } from "@/lib/hyperliquid/use-deposit";
import { createLazyComponent } from "@/lib/lazy";
import { useHasExistingBridgeExecution } from "@/lib/lifi/bridge-execution-state";
import { calculateCctpDepositFee, getAmountIndependentCctpMaxFeeRaw } from "@/lib/trade/cctp-deposit";
import { removeCctpDepositTrackingRecord } from "@/lib/trade/cctp-deposit-tracking";
import {
	FundsActionFeedbackCause,
	type FundsActionFeedbackCode,
	formatFundsActionFeedback,
	fundsActionFeedbackCause,
} from "@/lib/trade/funds-action-feedback";
import { toBig, toPlainDecimal } from "@/lib/trade/numbers";
import { warmPrivyFiatFundingHost } from "@/lib/trade/privy-fiat-funding-launch";
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
import { getPrivyEmailAddress } from "@/lib/wallet/privy-wagmi";
import {
	useDepositModalActions,
	useDepositModalOpen,
	useDepositModalTab,
	useTransferModalActions,
} from "@/stores/use-global-modal-store";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { PendingActionModal } from "../components/pending-action-modal";
import { DepositForm } from "./deposit/deposit-form";
import { DepositMethodChooser } from "./deposit/deposit-method-chooser";
import { StatusScreen, WalletNotConnected } from "./deposit/shared-ui";
import { WithdrawForm } from "./deposit/withdraw-form";
import { DepositExplorerLink } from "./deposit-explorer-link";

const LazyBridgeTab = createLazyComponent(() => import("./bridge/bridge-tab"), "BridgeTab");

interface CctpPreTransferReview {
	fee: string;
	params: {
		source: Address;
		user: Address;
	};
}

interface WithdrawalPreflightAttempt {
	controller: AbortController;
	contextIdentity: string;
}

interface WithdrawalExecutionReview {
	amount: string;
	attempt: WithdrawalPreflightAttempt;
	cctpPreTransfer: CctpPreTransferReview | null;
	route: WithdrawalRoute;
}

function normalizeError(error: unknown, fallbackMessage: string): Error {
	if (error instanceof Error) return error;
	return new Error(typeof error === "string" ? error : fallbackMessage);
}

export function DepositModal() {
	const { t } = useLingui();
	const numberFormat = useNumberFormat();
	const { formatNumber } = numberFormat;
	const open = useDepositModalOpen();
	const activeTab = useDepositModalTab();
	const { close } = useDepositModalActions();
	const { open: openTransferModal } = useTransferModalActions();
	const isMobile = useIsMobile();
	const presentation = isMobile ? "drawer" : "modal";

	const [depositAmount, setDepositAmount] = useState("");
	const [withdrawAmount, setWithdrawAmount] = useState("");
	const [withdrawDestination, setWithdrawDestination] = useState("");
	const [withdrawalRouteChanged, setWithdrawalRouteChanged] = useState(false);
	const [depositRoutingPreflightErrorCode, setDepositRoutingPreflightErrorCode] = useState<
		"changed" | "unavailable" | null
	>(null);
	const depositRoutingPreflightError = depositRoutingPreflightErrorCode
		? formatFundsActionFeedback(
				depositRoutingPreflightErrorCode === "changed" ? "deposit-route-changed" : "deposit-route-unavailable",
				(descriptor) => t(descriptor),
			)
		: null;
	const [depositCctpPreflightErrorCode, setDepositCctpPreflightErrorCode] = useState<
		"capacity-unavailable" | "fee-changed" | "verification-unavailable" | "balance-unavailable" | null
	>(null);
	const depositCctpPreflightError =
		depositCctpPreflightErrorCode === "balance-unavailable"
			? formatFundsActionFeedback("balance-unavailable", (descriptor) => t(descriptor))
			: depositCctpPreflightErrorCode === "verification-unavailable"
				? t`Unable to verify the current Circle CCTP fee and Fast Transfer capacity.`
				: depositCctpPreflightErrorCode === "capacity-unavailable"
					? t`Circle Fast Transfer capacity is temporarily unavailable. Try again later.`
					: depositCctpPreflightErrorCode === "fee-changed"
						? t`Circle fees changed. Review the updated fee, then submit again.`
						: null;
	const [withdrawalRoutingPreflightFailed, setWithdrawalRoutingPreflightFailed] = useState(false);
	const [withdrawalPreflightFeedback, setWithdrawalPreflightFeedback] = useState<{
		contextIdentity: string;
		code: FundsActionFeedbackCode;
	} | null>(null);
	const [isDepositPreflighting, setIsDepositPreflighting] = useState(false);
	const [depositStep, setDepositStep] = useState<"methods" | "transfer">("transfer");
	const [depositStepOpen, setDepositStepOpen] = useState(false);
	const [depositMethodsOffered, setDepositMethodsOffered] = useState(false);
	const [isDepositDataRetrying, setIsDepositDataRetrying] = useState(false);
	const [isWithdrawalPreflighting, setIsWithdrawalPreflighting] = useState(false);
	const depositPreflightIdRef = useRef(0);
	const withdrawalPreflightRef = useRef<WithdrawalPreflightAttempt | null>(null);
	const withdrawalRetryEpochRef = useRef(0);
	const withdrawalExecutionReviewRef = useRef<WithdrawalExecutionReview | null>(null);
	const withdrawalRequestReviewsRef = useRef(new WeakMap<object, WithdrawalExecutionReview>());
	const observedWithdrawalRouteRef = useRef<WithdrawalRoute | null>(null);
	const queryClient = useQueryClient();
	const { clientKey, env, info, sessionMode } = useHyperliquid();
	const isTestnet = useIsTestnet();
	const depositAvailability = useDepositAvailability();
	const depositTxChain = isTestnet ? arbitrumSepolia : arbitrum;
	const usdcRoutingQuery = useUsdcRouting(open);
	const fetchFreshUsdcRouting = useFreshUsdcRouting();
	const usdcRoutingStatus = getUsdcRoutingQueryStatus({
		data: usdcRoutingQuery.data,
		isError: usdcRoutingQuery.isError,
		isFetching: usdcRoutingQuery.isFetching,
	});
	const depositRoutingStatus = depositRoutingPreflightErrorCode === "unavailable" ? "error" : usdcRoutingStatus;
	const withdrawalRoutingStatus = withdrawalRoutingPreflightFailed ? "error" : usdcRoutingStatus;
	const routedWithdrawalRoute = getWithdrawalRoute(usdcRoutingQuery.data);
	const withdrawalRoute = routedWithdrawalRoute ?? "arbitrum-cctp";
	const selectedDepositRoute = usdcRoutingQuery.data?.depositRoute ?? "cctp";
	const depositRouteReady = depositRoutingStatus === "ready" && !!usdcRoutingQuery.data?.depositRoute;
	const cctpExternalDepositEnabled = isCctpExternalDepositEnabled(isTestnet);
	const cctpSponsoredDepositEnabled = isCctpSponsoredDepositEnabled(isTestnet);

	const { walletAddress, hasWalletAccess, user, embeddedWalletAddress, walletIntent } = useWalletSession();
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
	const walletIdentityResolved = walletIntent === "embedded" || walletIntent === "external";
	const isEmbeddedDeposit = !!emailAddress && walletIntent === "embedded" && shouldUseEmailEmbeddedWallet;
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
			open &&
			depositAvailability.available &&
			depositRouteReady &&
			selectedDepositRoute === "cctp" &&
			walletIntent === "external" &&
			cctpExternalDepositEnabled,
		isTestnet,
	});

	const {
		balance: depositBalance,
		maxAmount: maxDepositAmount,
		maxDepositRaw,
		balanceStatus: depositBalanceStatus,
		refreshBalance: refreshDepositBalance,
		status: depositStatus,
		error: depositError,
		hash: depositHash,
		executionAmount: depositExecutionAmount,
		executionRoute: depositExecutionRoute,
		cctpRecoveryUnavailable,
		submissionOutcomeUnknown,
		walletResponseDelayed,
		networkSwitchPending,
		deposit,
		walletProviderStatus,
		walletProviderError,
		validate: validateDeposit,
		reset: resetDeposit,
		networkName: depositNetworkName,
		sponsoredCctpEnabled,
		sponsoredCctpReadiness,
	} = useDeposit({
		balanceEnabled: open && walletIdentityResolved,
		balancePollIntervalMs: isEmbeddedDeposit ? DEPOSIT_BALANCE_REFRESH_MS : undefined,
		mode: depositMode,
		depositRoute: selectedDepositRoute,
		expectedCctpMaxFeeRaw: cctpDepositFeeQuery.calculation?.maxFeeRaw,
		walletAddress: isEmbeddedDeposit ? depositEmbeddedWalletAddress : undefined,
		sponsoredReadinessEnabled:
			open &&
			depositAvailability.available &&
			depositRouteReady &&
			selectedDepositRoute === "cctp" &&
			isEmbeddedDeposit,
	});
	const embeddedCctpDepositFeeQuery = useCctpDepositFee({
		amountRaw: maxDepositRaw,
		enabled:
			open &&
			depositAvailability.available &&
			depositRouteReady &&
			selectedDepositRoute === "cctp" &&
			isEmbeddedDeposit &&
			sponsoredCctpEnabled &&
			sponsoredCctpReadiness.status === "ready",
		isTestnet,
	});
	const displayedCctpDepositFeeQuery = isEmbeddedDeposit ? embeddedCctpDepositFeeQuery : cctpDepositFeeQuery;
	const cctpTrackingOwner = isEmbeddedDeposit ? depositEmbeddedWalletAddress : walletAddress;
	const cctpDepositTracking = useCctpDepositTracking({
		enabled: open && !!cctpTrackingOwner,
		env: isTestnet ? "Testnet" : "Mainnet",
		owner: cctpTrackingOwner,
		poll: !isEmbeddedDeposit,
		sourceHash: depositExecutionRoute === "cctp" ? depositHash : undefined,
	});
	const defaultBalances = useDefaultDexBalances();
	const accountAbstraction = defaultBalances.accountAbstraction;
	const assertAccountAbstraction = useAccountAbstractionPreExecutionGuard(accountAbstraction, walletAddress);
	const {
		marginSummary,
		perpSummary,
		spotBalances,
		spotAvailableAfterMaintenance,
		withdrawable: perpWithdrawable,
		spotStateStatus,
		perpStateStatus,
		isDataStale: isBalanceDataStale,
		hasError: hasBalanceError,
	} = defaultBalances;
	const withdrawalBalanceReady =
		spotStateStatus === "success" && perpStateStatus === "success" && !isBalanceDataStale && !hasBalanceError;
	const withdrawalBalanceReadyRef = useRef(withdrawalBalanceReady);
	withdrawalBalanceReadyRef.current = withdrawalBalanceReady;
	const accountSummary = getAccountBalanceSummary({
		accountAbstraction,
		marginSummary,
		perpSummary,
		withdrawable: perpWithdrawable,
		spotBalances,
		spotAvailableAfterMaintenance,
	});
	const fundsActionAvailability = useFundsActionAvailability({
		accountDataReady: withdrawalBalanceReady,
		accountAbstraction,
		fundsActionsEnabled: accountSummary.isAvailable,
		hasWalletAccess,
		internalTransfersEnabled: !isQuoteBalanceSharedWithPerps(accountAbstraction),
	});
	const exactWithdrawable = withdrawalBalanceReady
		? accountSummary.usesSpotStateForPerps
			? getSpotTransferableValue(getSpotBalance(spotBalances, DEFAULT_QUOTE_TOKEN))
			: String(perpWithdrawable)
		: "0";
	const withdrawalBalanceExecutionRef = useRef({
		available: exactWithdrawable,
		receivedAt: accountSummary.usesSpotStateForPerps
			? defaultBalances.spotStateReceivedAt
			: defaultBalances.perpStateReceivedAt,
	});
	withdrawalBalanceExecutionRef.current = {
		available: exactWithdrawable,
		receivedAt: accountSummary.usesSpotStateForPerps
			? defaultBalances.spotStateReceivedAt
			: defaultBalances.perpStateReceivedAt,
	};
	const showSpotFundsNotice =
		withdrawalBalanceReady &&
		!accountSummary.usesSpotStateForPerps &&
		accountSummary.hasSpotFundsWhenPerpWithdrawableZero;

	const reviewedDepositAmount = isEmbeddedDeposit ? maxDepositAmount : depositAmount;
	const reviewedDepositAmountRaw = isEmbeddedDeposit ? maxDepositRaw : depositAmountRaw;
	const baseDepositValidation = validateDeposit(reviewedDepositAmount, (descriptor) => t(descriptor));
	const embeddedWalletValidationError =
		isEmbeddedDeposit && embeddedWalletError
			? formatTransferError(normalizeError(embeddedWalletError, t`Unknown error`), (descriptor) => t(descriptor))
			: isEmbeddedDeposit && (needsEmbeddedWallet || isCreatingEmbeddedWallet || !depositEmbeddedWalletAddress)
				? t`Creating your wallet. Please wait...`
				: null;
	const cctpDepositFeeUnavailable =
		selectedDepositRoute === "cctp" &&
		(!isEmbeddedDeposit || !isTestnet) &&
		(displayedCctpDepositFeeQuery.isLoading ||
			displayedCctpDepositFeeQuery.isError ||
			!displayedCctpDepositFeeQuery.calculation ||
			displayedCctpDepositFeeQuery.hasSufficientFastAllowance === false);
	const displayedCctpDepositFeeRaw =
		selectedDepositRoute === "cctp"
			? (displayedCctpDepositFeeQuery.calculation?.maxFeeRaw ??
				(displayedCctpDepositFeeQuery.data?.feeQuote
					? getAmountIndependentCctpMaxFeeRaw(displayedCctpDepositFeeQuery.data.feeQuote)
					: null))
			: null;
	const cctpDepositFee = displayedCctpDepositFeeRaw !== null ? formatUnits(displayedCctpDepositFeeRaw, 6) : null;
	const cctpDepositAmountLimitError =
		selectedDepositRoute === "cctp" &&
		reviewedDepositAmountRaw !== undefined &&
		reviewedDepositAmountRaw > CCTP_MAX_DEPOSIT_USDC
			? t`Circle CCTP deposits are limited to 10,000,000 USDC per transfer.`
			: selectedDepositRoute === "cctp" &&
					isTestnet &&
					reviewedDepositAmountRaw !== undefined &&
					reviewedDepositAmountRaw > CCTP_TESTNET_MAX_DEPOSIT_USDC
				? t`Circle testnet deposits are limited to 1,000 USDC per transfer.`
				: null;
	const unresolvedWalletValidation = walletIdentityResolved
		? null
		: { valid: false, error: depositAvailability.unavailableReason };
	const depositValidation =
		unresolvedWalletValidation ??
		(!depositRouteReady
			? { valid: false, error: null }
			: !depositAvailability.available
				? { valid: false, error: depositAvailability.unavailableReason }
				: embeddedWalletValidationError
					? { valid: false, error: embeddedWalletValidationError }
					: selectedDepositRoute === "bridge"
						? {
								valid: false,
								error: t`Legacy Bridge2 deposits are no longer accepted. Deposits are paused.`,
							}
						: !isEmbeddedDeposit && !cctpExternalDepositEnabled
							? {
									valid: false,
									error: t`CCTP deposits are awaiting funded end-to-end verification for this network.`,
								}
							: isEmbeddedDeposit && !cctpSponsoredDepositEnabled
								? { valid: false, error: t`Gas-sponsored CCTP deposits are not enabled for this network.` }
								: isEmbeddedDeposit && sponsoredCctpReadiness.status !== "ready"
									? { valid: false, error: null }
									: cctpDepositAmountLimitError
										? { valid: false, error: cctpDepositAmountLimitError }
										: cctpDepositFeeUnavailable
											? {
													valid: false,
													error: displayedCctpDepositFeeQuery.isError
														? t`Unable to verify the current Circle CCTP fee and Fast Transfer capacity.`
														: displayedCctpDepositFeeQuery.hasSufficientFastAllowance === false
															? t`Circle Fast Transfer capacity is temporarily unavailable. Try again later.`
															: null,
												}
											: { ...baseDepositValidation, error: depositCctpPreflightError ?? baseDepositValidation.error });
	const canUseFundsActions = walletIdentityResolved && hasWalletAccess && !!walletAddress;
	const canUseDeposit = canUseFundsActions || isEmbeddedDeposit;
	const hasExistingBridgeExecution = useHasExistingBridgeExecution(walletAddress);
	const showBridgeTab = shouldShowLiFiBridgeTab({
		isEmbeddedDeposit,
		hasExistingExecution: hasExistingBridgeExecution,
		createNewRoute: LIFI_BRIDGE_FEATURES.createNewRoute,
	});
	const visibleTab = showBridgeTab || activeTab !== "bridge" ? activeTab : "deposit";
	const fundsModalContextIdentity = `${env}:${clientKey.toLowerCase()}:${sessionMode}:${walletAddress?.toLowerCase() ?? "disconnected"}:${depositEmbeddedWalletAddress?.toLowerCase() ?? "none"}:${walletIntent}:${accountAbstraction ?? "unavailable"}:${open ? "open" : "closed"}:${visibleTab}:${selectedDepositRoute}:${withdrawalRoute}`;
	const fundsModalContextIdentityRef = useRef<string | null>(null);
	const usesFundsRedesign = visibleTab !== "bridge";
	const withdrawalQueriesEnabled =
		open &&
		visibleTab === "withdraw" &&
		fundsActionAvailability.withdrawal.available &&
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
		executionGuard: (params) => assertWithdrawalExecution("arbitrum-cctp", params),
		preExecutionGuard: (params, signal) => assertFreshWithdrawalExecution("arbitrum-cctp", params.amount, signal),
	});
	const legacyWithdrawal = useExchange("withdraw3", {
		executionGuard: (params) => assertWithdrawalExecution("arbitrum-legacy", params),
		preExecutionGuard: (params, signal) => assertFreshWithdrawalExecution("arbitrum-legacy", params.amount, signal),
	});
	useLayoutEffect(() => {
		withdrawalRetryEpochRef.current += 1;
		fundsModalContextIdentityRef.current = fundsModalContextIdentity;
		depositPreflightIdRef.current += 1;
		withdrawalPreflightRef.current?.controller.abort();
		withdrawalPreflightRef.current = null;
		withdrawalExecutionReviewRef.current = null;
		setIsDepositPreflighting(false);
		setIsDepositDataRetrying(false);
		setIsWithdrawalPreflighting(false);
		setWithdrawalPreflightFeedback(null);
		return () => {
			if (fundsModalContextIdentityRef.current !== fundsModalContextIdentity) return;
			withdrawalRetryEpochRef.current += 1;
			fundsModalContextIdentityRef.current = null;
			depositPreflightIdRef.current += 1;
			withdrawalPreflightRef.current?.controller.abort();
			withdrawalPreflightRef.current = null;
			withdrawalExecutionReviewRef.current = null;
		};
	}, [fundsModalContextIdentity]);
	const isWithdrawPending = isWithdrawalPreflighting || cctpWithdrawal.isPending || legacyWithdrawal.isPending;
	const cctpFee = cctpFeeQuery.data ?? null;
	const withdrawalRouteFee = getWithdrawalRouteFee(withdrawalRoute, cctpFee);
	const withdrawalActivationFee = withdrawalRoute === "arbitrum-cctp" ? (preTransferCheckQuery.data?.fee ?? "0") : "0";
	const withdrawalMaxAmount =
		withdrawalRoute === "arbitrum-legacy" || preTransferCheckQuery.isSuccess
			? getMaximumWithdrawal(exactWithdrawable, withdrawalActivationFee)
			: "0";
	const withdrawValidation = validateWithdrawal(
		{
			amount: withdrawAmount,
			available: exactWithdrawable,
			route: withdrawalRoute,
			routeFee: withdrawalRouteFee,
			activationFee: withdrawalActivationFee,
		},
		(descriptor) => t(descriptor),
		numberFormat,
	);
	const isDepositPending = isDepositPreflighting || depositStatus === "pending" || depositStatus === "confirming";
	const fiatFundingOffer = usePrivyFiatFundingOffer({
		enabled: isPrivyFiatFundingEnabled(isTestnet),
		available: open && depositAvailability.available && !isDepositPending && !isWithdrawPending,
		onBeforeStart: handleClose,
	});
	if (depositStepOpen !== open) {
		setDepositStepOpen(open);
		if (open) {
			setDepositMethodsOffered(fiatFundingOffer !== null);
			setDepositStep(fiatFundingOffer !== null ? "methods" : "transfer");
		}
	}
	const showsDepositMethods = visibleTab === "deposit" && depositMethodsOffered && depositStep === "methods";
	const canReturnToDepositMethods =
		visibleTab === "deposit" && canUseDeposit && depositMethodsOffered && depositStep === "transfer";
	const depositMethodChoice = fiatFundingOffer ?? {
		walletKind: walletIntent === "external" ? ("external" as const) : ("embedded" as const),
		disabled: true,
		start: () => undefined,
	};
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
	const withdrawalPreflightErrorCode =
		withdrawalPreflightFeedback?.contextIdentity === fundsModalContextIdentity
			? withdrawalPreflightFeedback.code
			: null;
	let withdrawalPrerequisiteError = withdrawalPreflightErrorCode
		? formatFundsActionFeedback(withdrawalPreflightErrorCode, (descriptor) => t(descriptor))
		: null;
	if (!fundsActionAvailability.withdrawal.available) {
		withdrawalPrerequisiteError =
			getFundsAvailabilityNotice(fundsActionAvailability.withdrawal) ?? withdrawalPrerequisiteError;
	} else if (
		withdrawalRoutingStatus === "ready" &&
		withdrawalRoute === "arbitrum-cctp" &&
		preTransferCheckQuery.data?.isSanctioned
	) {
		withdrawalPrerequisiteError = t`Withdrawals are unavailable for this address.`;
	}
	const withdrawalPrerequisitesReady =
		fundsActionAvailability.withdrawal.available &&
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
		(spotMetaQuery.isError ||
			cctpSpotMetaInvalid ||
			preTransferCheckQuery.isError ||
			cctpFeeQuery.isError ||
			withdrawalPreflightErrorCode !== null);
	const canSubmitWithdraw = withdrawValidation.valid && isWithdrawDestinationValid && withdrawalPrerequisitesReady;

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

	async function assertFreshWithdrawalRoute(expectedRoute: WithdrawalRoute, signal?: AbortSignal) {
		let freshRoute: WithdrawalRoute | null;
		try {
			freshRoute = getWithdrawalRoute(await fetchFreshUsdcRouting(signal));
		} catch (error) {
			if (signal?.aborted) throw signal.reason ?? error;
			throw fundsActionFeedbackCause("withdrawal-route-unavailable");
		}
		if (!freshRoute) throw fundsActionFeedbackCause("withdrawal-route-unavailable");
		if (freshRoute !== expectedRoute) {
			throw fundsActionFeedbackCause("withdrawal-route-changed");
		}
	}

	async function assertFreshWithdrawalAccountMode(signal: AbortSignal) {
		try {
			await assertAccountAbstraction(signal);
		} catch (error) {
			if (signal.aborted) throw signal.reason ?? error;
			if (error instanceof AccountAbstractionExecutionError) {
				throw fundsActionFeedbackCause(
					error.reason === "changed" ? "account-mode-changed" : "account-mode-unavailable",
				);
			}
			throw error;
		}
	}

	async function assertFreshWithdrawalGeo(signal: AbortSignal) {
		try {
			await fundsActionAvailability.assertFreshGeoAllowed(signal);
		} catch (error) {
			if (signal.aborted) throw signal.reason ?? error;
			if (error instanceof FundsActionGeoExecutionError) {
				throw fundsActionFeedbackCause(error.reason === "restricted" ? "geo-restricted" : "geo-unavailable");
			}
			throw error;
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

	async function assertFreshCctpPreTransferCheck(review: CctpPreTransferReview, signal: AbortSignal) {
		try {
			const current = await fetchFreshPreTransferCheck(review, signal);
			assertPreTransferCheckMatchesReview(review.fee, current);
		} catch (error) {
			if (signal.aborted) throw signal.reason ?? error;
			if (error instanceof PreTransferCheckExecutionError) {
				throw fundsActionFeedbackCause(
					error.reason === "changed"
						? "withdrawal-activation-fee-changed"
						: error.reason === "sanctioned"
							? "withdrawal-sanctioned"
							: "withdrawal-eligibility-unavailable",
				);
			}
			throw error;
		}
	}

	function assertCurrentWithdrawalExecutionReview(
		expectedRoute: WithdrawalRoute,
		amount: unknown,
	): WithdrawalExecutionReview {
		const review = withdrawalExecutionReviewRef.current;
		const submittedAmount = typeof amount === "string" ? toBig(amount) : null;
		const reviewedAmount = review ? toBig(review.amount) : null;
		if (
			!review ||
			review.attempt !== withdrawalPreflightRef.current ||
			review.attempt.contextIdentity !== fundsModalContextIdentityRef.current ||
			review.attempt.controller.signal.aborted ||
			review.route !== expectedRoute ||
			!submittedAmount ||
			!reviewedAmount?.eq(submittedAmount)
		) {
			throw fundsActionFeedbackCause("withdrawal-conditions-changed");
		}
		return review;
	}

	function assertCurrentWithdrawalBalance(review: WithdrawalExecutionReview): void {
		if (!withdrawalBalanceReadyRef.current) {
			throw fundsActionFeedbackCause("balance-unavailable");
		}
		if (review.route === "arbitrum-cctp" && !review.cctpPreTransfer) {
			throw fundsActionFeedbackCause("withdrawal-eligibility-unavailable");
		}
		const balance = withdrawalBalanceExecutionRef.current;
		try {
			assertFreshFundsAmountWithFee({
				amount: review.amount,
				fee: review.route === "arbitrum-cctp" ? review.cctpPreTransfer?.fee : "0",
				available: balance.available,
				receivedAt: balance.receivedAt,
			});
		} catch (error) {
			if (!(error instanceof FundsExecutionError)) throw error;
			throw fundsActionFeedbackCause(error.reason === "balance-changed" ? "balance-changed" : "balance-unavailable");
		}
	}

	function assertWithdrawalExecution(expectedRoute: WithdrawalRoute, params: { amount: unknown }): void {
		const review = assertCurrentWithdrawalExecutionReview(expectedRoute, params.amount);
		const requestReview = withdrawalRequestReviewsRef.current.get(params);
		if (requestReview && requestReview !== review) {
			throw fundsActionFeedbackCause("withdrawal-conditions-changed");
		}
		assertCurrentWithdrawalBalance(review);
		withdrawalRequestReviewsRef.current.set(params, review);
	}

	async function assertFreshWithdrawalExecution(expectedRoute: WithdrawalRoute, amount: unknown, signal: AbortSignal) {
		const review = assertCurrentWithdrawalExecutionReview(expectedRoute, amount);
		assertCurrentWithdrawalBalance(review);
		const guards = [
			assertFreshWithdrawalRoute(expectedRoute, signal),
			assertFreshWithdrawalAccountMode(signal),
			assertFreshWithdrawalGeo(signal),
		];
		if (expectedRoute === "arbitrum-cctp") {
			if (!review.cctpPreTransfer) throw fundsActionFeedbackCause("withdrawal-eligibility-unavailable");
			guards.push(assertFreshCctpPreTransferCheck(review.cctpPreTransfer, signal));
		}
		await Promise.all(guards);
		signal.throwIfAborted();
		if (assertCurrentWithdrawalExecutionReview(expectedRoute, amount) !== review) {
			throw fundsActionFeedbackCause("withdrawal-conditions-changed");
		}
		assertCurrentWithdrawalBalance(review);
	}

	function beginWithdrawalPreflight(): WithdrawalPreflightAttempt | null {
		const contextIdentity = fundsModalContextIdentityRef.current;
		if (contextIdentity !== fundsModalContextIdentity) return null;
		withdrawalPreflightRef.current?.controller.abort();
		const attempt = { contextIdentity, controller: new AbortController() };
		withdrawalPreflightRef.current = attempt;
		withdrawalExecutionReviewRef.current = null;
		return attempt;
	}

	function assertWithdrawalPreflightCurrent(attempt: WithdrawalPreflightAttempt): void {
		attempt.controller.signal.throwIfAborted();
		if (
			withdrawalPreflightRef.current !== attempt ||
			fundsModalContextIdentityRef.current !== attempt.contextIdentity
		) {
			throw new Error("Withdrawal preflight is no longer active");
		}
	}

	function invalidateWithdrawalPreflight(): void {
		withdrawalRetryEpochRef.current += 1;
		withdrawalPreflightRef.current?.controller.abort();
		withdrawalPreflightRef.current = null;
		withdrawalExecutionReviewRef.current = null;
	}

	function handleClose() {
		const completedTrackingHash =
			cctpDepositTracking.data?.status === "forward-submitted" ? cctpDepositTracking.trackedSourceHash : undefined;
		const definitivelyFailedTrackingHash =
			depositExecutionRoute === "cctp" && depositHash && isDefinitiveDepositSourceFailure(depositError)
				? depositHash
				: undefined;
		const removableTrackingHash = completedTrackingHash ?? definitivelyFailedTrackingHash;
		if (removableTrackingHash && cctpTrackingOwner) {
			try {
				removeCctpDepositTrackingRecord(isTestnet ? "Testnet" : "Mainnet", cctpTrackingOwner, removableTrackingHash);
			} catch {
				// The source transaction hash remains available in the explorer link.
			}
		}
		depositPreflightIdRef.current += 1;
		invalidateWithdrawalPreflight();
		resetDeposit();
		cctpWithdrawal.reset();
		legacyWithdrawal.reset();
		setDepositAmount("");
		setWithdrawAmount("");
		setWithdrawDestination("");
		setWithdrawalRouteChanged(false);
		setDepositRoutingPreflightErrorCode(null);
		setDepositCctpPreflightErrorCode(null);
		setWithdrawalRoutingPreflightFailed(false);
		setWithdrawalPreflightFeedback(null);
		setIsDepositPreflighting(false);
		setIsDepositDataRetrying(false);
		setIsWithdrawalPreflighting(false);
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
		if (
			!depositAvailability.available ||
			!depositValidation.valid ||
			!canUseDeposit ||
			isDepositPending ||
			isDepositDataRetrying ||
			!depositRouteReady
		) {
			return;
		}

		setDepositCctpPreflightErrorCode(null);
		setDepositRoutingPreflightErrorCode(null);
		const preflightId = depositPreflightIdRef.current + 1;
		const preflightContextIdentity = fundsModalContextIdentityRef.current;
		if (preflightContextIdentity !== fundsModalContextIdentity) return;
		depositPreflightIdRef.current = preflightId;
		const isCurrentPreflight = () =>
			depositPreflightIdRef.current === preflightId &&
			fundsModalContextIdentityRef.current === preflightContextIdentity;
		setIsDepositPreflighting(true);
		try {
			const freshRouting = await fetchFreshUsdcRouting();
			if (!isCurrentPreflight()) return;
			if (!freshRouting) {
				setDepositRoutingPreflightErrorCode("unavailable");
				return;
			}
			if (freshRouting.depositRoute !== selectedDepositRoute) {
				setDepositRoutingPreflightErrorCode("changed");
				return;
			}
			if (selectedDepositRoute === "cctp") {
				const reviewedCalculation = displayedCctpDepositFeeQuery.calculation;
				if (!reviewedCalculation || reviewedDepositAmountRaw === undefined) return;
				const freshFeeResult = await displayedCctpDepositFeeQuery.refetch();
				if (!isCurrentPreflight()) return;
				if (!freshFeeResult.data || freshFeeResult.isError) {
					setDepositCctpPreflightErrorCode("verification-unavailable");
					return;
				}
				if (freshFeeResult.data.fastAllowanceRaw < reviewedDepositAmountRaw) {
					setDepositCctpPreflightErrorCode("capacity-unavailable");
					return;
				}
				const freshCalculation = calculateCctpDepositFee(reviewedDepositAmountRaw, freshFeeResult.data.feeQuote);
				if (freshCalculation.maxFeeRaw !== reviewedCalculation.maxFeeRaw) {
					setDepositCctpPreflightErrorCode("fee-changed");
					return;
				}
			}
			if (!isCurrentPreflight()) return;
			await deposit(reviewedDepositAmount, {
				expectedBalanceRaw: isEmbeddedDeposit ? reviewedDepositAmountRaw : undefined,
				expectedCctpMaxFeeRaw: displayedCctpDepositFeeQuery.calculation?.maxFeeRaw,
			});
		} catch {
			if (isCurrentPreflight()) setDepositRoutingPreflightErrorCode("unavailable");
			return;
		} finally {
			if (isCurrentPreflight()) setIsDepositPreflighting(false);
		}
	}

	function handleDepositAmountChange(value: string) {
		setDepositCctpPreflightErrorCode(null);
		setDepositAmount(value);
	}

	async function handleWithdrawSubmit() {
		if (!canSubmitWithdraw || !walletAddress || withdrawalRouteFee === null) return;
		const destination = requiresWithdrawDestination ? normalizedWithdrawDestination : walletAddress;
		if (!isAddress(destination)) return;
		withdrawalRetryEpochRef.current += 1;

		const attempt = beginWithdrawalPreflight();
		if (!attempt) return;
		const reviewedAmount = withdrawAmount;
		setWithdrawalPreflightFeedback(null);
		setIsWithdrawalPreflighting(true);
		let mutationStarted = false;
		let mutationSucceeded = false;
		let mutationError: unknown = null;
		let submittedRouteFee = "0";
		let submittedActivationFee = "0";
		let preflightFailureCode: FundsActionFeedbackCode = "withdrawal-eligibility-unavailable";
		const reportPreflightFailure = (code: FundsActionFeedbackCode) => {
			assertWithdrawalPreflightCurrent(attempt);
			setWithdrawalPreflightFeedback({ contextIdentity: attempt.contextIdentity, code });
		};
		try {
			const expectedWithdrawalRoute = routedWithdrawalRoute;
			if (!expectedWithdrawalRoute) return;
			assertWithdrawalPreflightCurrent(attempt);

			let cctpPreTransferReview: CctpPreTransferReview | null = null;
			if (expectedWithdrawalRoute === "arbitrum-cctp") {
				const reviewedPreTransferCheck = preTransferCheckQuery.data;
				if (!reviewedPreTransferCheck || reviewedPreTransferCheck.isSanctioned || !cctpUsdcSystemAddress) return;

				const spotMetaResult = await spotMetaQuery.refetch();
				assertWithdrawalPreflightCurrent(attempt);
				if (!spotMetaResult.data || spotMetaResult.isError) {
					reportPreflightFailure("withdrawal-eligibility-unavailable");
					return;
				}
				let freshUsdcSystemAddress: Address;
				try {
					freshUsdcSystemAddress = getCanonicalSpotSystemAddress(spotMetaResult.data, "USDC");
				} catch {
					reportPreflightFailure("withdrawal-eligibility-unavailable");
					return;
				}
				if (freshUsdcSystemAddress.toLowerCase() !== cctpUsdcSystemAddress.toLowerCase()) {
					reportPreflightFailure("withdrawal-conditions-changed");
					return;
				}

				const preTransferResult = await preTransferCheckQuery.refetch();
				assertWithdrawalPreflightCurrent(attempt);
				if (!preTransferResult.data || preTransferResult.isError) {
					reportPreflightFailure("withdrawal-eligibility-unavailable");
					return;
				}
				try {
					assertPreTransferCheckMatchesReview(reviewedPreTransferCheck.fee, preTransferResult.data);
				} catch (error) {
					reportPreflightFailure(
						error instanceof PreTransferCheckExecutionError && error.reason === "sanctioned"
							? "withdrawal-sanctioned"
							: error instanceof PreTransferCheckExecutionError && error.reason === "changed"
								? "withdrawal-activation-fee-changed"
								: "withdrawal-eligibility-unavailable",
					);
					return;
				}
				cctpPreTransferReview = {
					fee: preTransferResult.data.fee,
					params: { user: freshUsdcSystemAddress, source: walletAddress },
				};
			}

			let freshRouteFee = getWithdrawalRouteFee(expectedWithdrawalRoute, cctpFee);
			preflightFailureCode = "withdrawal-fee-unavailable";
			if (expectedWithdrawalRoute === "arbitrum-cctp") {
				const cctpFeeResult = await cctpFeeQuery.refetch();
				assertWithdrawalPreflightCurrent(attempt);
				if (!cctpFeeResult.data || cctpFeeResult.isError) {
					reportPreflightFailure("withdrawal-fee-unavailable");
					return;
				}
				freshRouteFee = cctpFeeResult.data;
			}
			if (freshRouteFee === null) {
				reportPreflightFailure("withdrawal-fee-unavailable");
				return;
			}

			const freshValidation = validateWithdrawal(
				{
					amount: reviewedAmount,
					available: exactWithdrawable,
					route: expectedWithdrawalRoute,
					routeFee: freshRouteFee,
					activationFee: cctpPreTransferReview?.fee ?? "0",
				},
				(descriptor) => t(descriptor),
				numberFormat,
			);
			if (!freshValidation.valid) {
				reportPreflightFailure("withdrawal-conditions-changed");
				return;
			}

			preflightFailureCode = "withdrawal-route-unavailable";
			const executionStatus = await executeWithFreshWithdrawalRoute(
				expectedWithdrawalRoute,
				fetchFreshUsdcRouting,
				async () => {
					assertWithdrawalPreflightCurrent(attempt);
					setWithdrawalRouteChanged(false);
					submittedRouteFee = freshRouteFee;
					submittedActivationFee = cctpPreTransferReview?.fee ?? "0";
					withdrawalExecutionReviewRef.current = {
						amount: reviewedAmount,
						attempt,
						cctpPreTransfer: cctpPreTransferReview,
						route: expectedWithdrawalRoute,
					};
					if (expectedWithdrawalRoute === "arbitrum-cctp") {
						if (!cctpPreTransferReview) throw new PreTransferCheckExecutionError("unavailable");
						mutationStarted = true;
						await cctpWithdrawal.mutateAsync(
							buildCctpWithdrawalParameters({
								amount: reviewedAmount,
								destination,
								sourceDex: getWithdrawalSourceDex(accountSummary.usesSpotStateForPerps),
							}),
						);
						mutationSucceeded = true;
						return;
					}
					mutationStarted = true;
					await legacyWithdrawal.mutateAsync({ destination, amount: reviewedAmount });
					mutationSucceeded = true;
				},
				attempt.controller.signal,
			);
			assertWithdrawalPreflightCurrent(attempt);
			if (executionStatus === "changed") {
				setWithdrawalRoutingPreflightFailed(false);
				setWithdrawalRouteChanged(true);
			} else if (executionStatus === "unavailable") {
				setWithdrawalRoutingPreflightFailed(true);
			} else {
				setWithdrawalRoutingPreflightFailed(false);
			}
		} catch (error) {
			if (mutationStarted && !mutationSucceeded) mutationError = error;
			if (
				!mutationStarted &&
				!attempt.controller.signal.aborted &&
				withdrawalPreflightRef.current === attempt &&
				fundsModalContextIdentityRef.current === attempt.contextIdentity
			) {
				reportPreflightFailure(error instanceof FundsActionFeedbackCause ? error.code : preflightFailureCode);
			}
		} finally {
			const attemptIsCurrent =
				withdrawalPreflightRef.current === attempt && fundsModalContextIdentityRef.current === attempt.contextIdentity;
			if (withdrawalPreflightRef.current === attempt) {
				withdrawalPreflightRef.current = null;
				withdrawalExecutionReviewRef.current = null;
				setIsWithdrawalPreflighting(false);
			}
			if (mutationStarted && attemptIsCurrent) {
				if (mutationSucceeded) {
					notifyWithdrawalSubmitted(reviewedAmount, submittedRouteFee, submittedActivationFee);
				} else {
					notifyWithdrawalFailure(mutationError);
				}
				handleClose();
			}
		}
	}

	function notifyWithdrawalSubmitted(amount: string, routeFee: string, activationFee: string) {
		const netReceived = formatNumber(getWithdrawalNetReceived(amount, routeFee) ?? "0", 2);
		const chargedActivationFee = isPositiveDecimal(activationFee) ? formatNumber(activationFee, 2) : null;
		toast.success(t`Withdrawal submitted`, {
			description: (
				<span className="flex flex-col gap-1 tabular-nums">
					<span>
						<Trans>
							You'll receive <bdi dir="ltr">${netReceived}</bdi> on Arbitrum after confirmation.
						</Trans>
					</span>
					{chargedActivationFee ? (
						<span>
							{t`One-time account activation fee`}: <bdi dir="ltr">${chargedActivationFee}</bdi>
						</span>
					) : null}
				</span>
			),
			duration: FUNDS_OUTCOME_TOAST_DURATION_MS,
		});
	}

	function notifyWithdrawalFailure(error: unknown) {
		if (error instanceof FundsActionFeedbackCause) {
			toast.error(formatFundsActionFeedback(error.code, (descriptor) => t(descriptor)));
			return;
		}
		if (isAmbiguousExchangeActionError(error)) {
			toast.warning(t`Withdrawal status unknown`, {
				icon: <StatusGlyph glyph={STATUS_GLYPH_UNKNOWN} />,
				description: t`Check your balances and the Deposits & Withdrawals history before retrying.`,
				duration: Infinity,
				closeButton: true,
			});
			return;
		}
		toast.error(formatExchangeActionError(error, t`Withdrawal failed`, (descriptor) => t(descriptor)));
	}

	async function handleWithdrawalPrerequisiteRetry() {
		const contextIdentity = fundsModalContextIdentityRef.current;
		if (contextIdentity !== fundsModalContextIdentity) return;
		const retryEpoch = ++withdrawalRetryEpochRef.current;
		const isCurrentRetry = () =>
			withdrawalRetryEpochRef.current === retryEpoch && fundsModalContextIdentityRef.current === contextIdentity;
		setWithdrawalPreflightFeedback(null);
		let failureCode: FundsActionFeedbackCode = "withdrawal-route-unavailable";
		try {
			const routingResult = await usdcRoutingQuery.refetch();
			if (!isCurrentRetry()) return;
			const freshWithdrawalRoute = getWithdrawalRoute(routingResult.data);
			if (routingResult.isError || !freshWithdrawalRoute) {
				setWithdrawalRoutingPreflightFailed(true);
				return;
			}
			setWithdrawalRoutingPreflightFailed(false);
			if (freshWithdrawalRoute === "arbitrum-cctp") {
				failureCode = "withdrawal-eligibility-unavailable";
				const spotMetaResult = await spotMetaQuery.refetch();
				if (!isCurrentRetry()) return;
				if (spotMetaResult.isError || !spotMetaResult.data) {
					setWithdrawalPreflightFeedback({ contextIdentity, code: "withdrawal-eligibility-unavailable" });
					return;
				}
				let freshUsdcSystemAddress: Address;
				try {
					freshUsdcSystemAddress = getCanonicalSpotSystemAddress(spotMetaResult.data, "USDC");
				} catch {
					setWithdrawalPreflightFeedback({ contextIdentity, code: "withdrawal-eligibility-unavailable" });
					return;
				}
				if (freshUsdcSystemAddress.toLowerCase() !== cctpUsdcSystemAddress?.toLowerCase()) {
					setWithdrawalPreflightFeedback({ contextIdentity, code: "withdrawal-conditions-changed" });
					return;
				}
				const [preTransferResult, feeResult] = await Promise.all([
					preTransferCheckQuery.refetch(),
					cctpFeeQuery.refetch(),
				]);
				if (!isCurrentRetry()) return;
				if (preTransferResult.isError || !preTransferResult.data) {
					setWithdrawalPreflightFeedback({ contextIdentity, code: "withdrawal-eligibility-unavailable" });
				} else if (feeResult.isError || !feeResult.data) {
					setWithdrawalPreflightFeedback({ contextIdentity, code: "withdrawal-fee-unavailable" });
				}
			}
		} catch {
			if (!isCurrentRetry()) return;
			if (failureCode === "withdrawal-route-unavailable") {
				setWithdrawalRoutingPreflightFailed(true);
			} else {
				setWithdrawalPreflightFeedback({ contextIdentity, code: failureCode });
			}
		}
	}

	async function handleDepositDataRetry() {
		const contextIdentity = fundsModalContextIdentityRef.current;
		if (contextIdentity !== fundsModalContextIdentity || isDepositPending || isDepositDataRetrying) return;
		const retryId = ++depositPreflightIdRef.current;
		const isCurrent = () =>
			fundsModalContextIdentityRef.current === contextIdentity && depositPreflightIdRef.current === retryId;
		setIsDepositDataRetrying(true);
		let failureCode: "balance-unavailable" | "verification-unavailable" = "balance-unavailable";
		try {
			const balance = await refreshDepositBalance();
			if (!isCurrent()) return;
			if (balance === undefined) {
				setDepositCctpPreflightErrorCode("balance-unavailable");
				return;
			}
			failureCode = "verification-unavailable";
			const fee = await displayedCctpDepositFeeQuery.refetch();
			if (!isCurrent()) return;
			if (fee.isError || !fee.data) {
				setDepositCctpPreflightErrorCode("verification-unavailable");
				return;
			}
			const amountRaw = isEmbeddedDeposit ? balance : reviewedDepositAmountRaw;
			setDepositCctpPreflightErrorCode(
				amountRaw !== undefined && fee.data.fastAllowanceRaw < amountRaw ? "capacity-unavailable" : null,
			);
		} catch {
			if (isCurrent()) setDepositCctpPreflightErrorCode(failureCode);
		} finally {
			if (isCurrent()) setIsDepositDataRetrying(false);
		}
	}

	async function handleDepositRoutingRetry() {
		const contextIdentity = fundsModalContextIdentityRef.current;
		if (contextIdentity !== fundsModalContextIdentity || isDepositPending || isDepositDataRetrying) return;
		const retryId = ++depositPreflightIdRef.current;
		const isCurrent = () =>
			fundsModalContextIdentityRef.current === contextIdentity && depositPreflightIdRef.current === retryId;
		try {
			const result = await usdcRoutingQuery.refetch();
			if (isCurrent()) setDepositRoutingPreflightErrorCode(result.isError || !result.data ? "unavailable" : null);
		} catch {
			if (isCurrent()) setDepositRoutingPreflightErrorCode("unavailable");
		}
	}

	function handlePerpsSpotTransferClick() {
		openTransferModal("toPerp");
	}
	const reportedDepositOutcomeRef = useRef<string | null>(null);
	useEffect(() => {
		if (depositStatus !== "success" && depositStatus !== "error") {
			reportedDepositOutcomeRef.current = null;
			return;
		}
		const outcomeKey = `${depositStatus}:${depositHash ?? "no-hash"}`;
		if (reportedDepositOutcomeRef.current === outcomeKey) return;
		reportedDepositOutcomeRef.current = outcomeKey;
		reportDepositOutcome();
	});

	function reportDepositOutcome() {
		const explorerLink = (
			<DepositExplorerLink txHash={depositHash} txChain={depositTxChain} label={t`View on explorer`} />
		);
		if (depositStatus === "success") {
			if (cctpRecoveryUnavailable) {
				toast.warning(t`Forwarding deposit`, {
					description: (
						<span className="flex flex-col gap-1">
							<span>
								{t`Recovery could not be saved in this browser. Record the Arbitrum transaction hash before closing.`}
							</span>
							<bdi dir="ltr" className="break-all font-mono">
								{depositHash}
							</bdi>
							{explorerLink}
						</span>
					),
					duration: Number.POSITIVE_INFINITY,
					closeButton: true,
				});
			}
			handleClose();
			return;
		}

		const hasSubmittedDeposit = !!depositHash;
		const depositStatusUnknown =
			submissionOutcomeUnknown || (hasSubmittedDeposit && !isDefinitiveDepositSourceFailure(depositError));
		if (depositStatusUnknown) {
			toast.warning(t`Deposit status unknown`, {
				icon: <StatusGlyph glyph={STATUS_GLYPH_UNKNOWN} />,
				description: (
					<span className="flex flex-col gap-1">
						<span>
							{t`The Arbitrum transaction was submitted, but its final status could not be verified. Check the transaction before retrying.`}
						</span>
						{explorerLink}
					</span>
				),
				duration: Number.POSITIVE_INFINITY,
				closeButton: true,
			});
			handleClose();
			return;
		}

		const depositFailureMessage = getDepositFailureMessage();
		if (hasSubmittedDeposit) {
			toast.error(t`Deposit failed`, {
				description: (
					<span className="flex flex-col gap-1">
						<span>{depositFailureMessage}</span>
						{explorerLink}
					</span>
				),
				duration: Number.POSITIVE_INFINITY,
				closeButton: true,
			});
			handleClose();
			return;
		}
		toast.error(depositFailureMessage);
		resetDeposit();
	}

	function getDepositFailureMessage(): string {
		if (depositError instanceof UsdcDepositRouteError) {
			return formatFundsActionFeedback(
				depositError.reason === "changed" ? "deposit-route-changed" : "deposit-route-unavailable",
				(descriptor) => t(descriptor),
			);
		}
		return formatTransferError(depositError, (descriptor) => t(descriptor), t`Deposit failed`);
	}

	let depositPendingHeading = <Trans>Confirm in wallet</Trans>;
	if (networkSwitchPending) depositPendingHeading = <Trans>Switching network</Trans>;
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
				icon={forwardSubmitted ? "success" : "awaiting"}
				heading={forwardSubmitted ? <Trans>Deposit submitted to Hyperliquid</Trans> : <Trans>Forwarding deposit</Trans>}
				description={
					forwardSubmitted ? (
						<Trans>Your balance updates once Hyperliquid credits it.</Trans>
					) : cctpDepositTracking.isError ? (
						<Trans>
							The Arbitrum transaction was submitted, but Circle status is temporarily unavailable. Tracking will resume
							when you return.
						</Trans>
					) : (
						<Trans>Circle is forwarding your USDC to Hyperliquid. Do not submit this deposit again.</Trans>
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

	if (depositStatus === "pending" || depositStatus === "confirming") {
		return (
			<StatusScreen
				open={open}
				presentation={presentation}
				title={<Trans>Deposit</Trans>}
				icon={depositStatus === "confirming" ? "awaiting" : "wallet"}
				heading={depositPendingHeading}
				description={
					<span className="flex flex-col gap-1">
						<span className="tabular-nums">
							{numberFormat.formatDecimalString(toPlainDecimal(displayedDepositAmount))} USDC → Hyperliquid
						</span>
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
				description={formatTransferError(
					walletProviderError,
					(descriptor) => t(descriptor),
					t`Wallet connection failed. Unlock your wallet, approve the connection, then retry.`,
				)}
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

	function renderDepositContent() {
		if (!canUseDeposit) {
			return <WalletNotConnected onConnect={handleReconnectWallet} isConnecting={!walletsReady || isReconnecting} />;
		}
		if (showsDepositMethods) {
			return (
				<DepositMethodChooser
					fiat={{ walletKind: depositMethodChoice.walletKind, disabled: depositMethodChoice.disabled }}
					notice={getFundsAvailabilityNotice(depositAvailability)}
					onTransfer={() => setDepositStep("transfer")}
					onBuy={depositMethodChoice.start}
					onBuyAvailable={warmPrivyFiatFundingHost}
				/>
			);
		}
		return (
			<DepositForm
				amount={depositAmount}
				onAmountChange={handleDepositAmountChange}
				balance={depositBalance}
				maxAmount={maxDepositAmount}
				maxDepositRaw={maxDepositRaw}
				balanceStatus={isDepositDataRetrying ? "loading" : depositBalanceStatus}
				validation={depositValidation}
				preflightError={depositCctpPreflightError}
				onRetryData={handleDepositDataRetry}
				amountError={cctpDepositAmountLimitError ?? baseDepositValidation.error}
				isPending={isDepositPending}
				onSubmit={handleDepositSubmit}
				routingStatus={depositRoutingStatus}
				routingPreflightError={depositRoutingPreflightError}
				depositRoute={usdcRoutingQuery.data?.depositRoute ?? null}
				onRetryRouting={handleDepositRoutingRetry}
				networkName={depositNetworkName}
				sponsoredCctpEnabled={sponsoredCctpEnabled}
				sponsoredCctpReadiness={sponsoredCctpReadiness}
				depositUnavailableReason={
					getFundsAvailabilityNotice(depositAvailability) ??
					(depositRouteReady && selectedDepositRoute === "cctp" && !isEmbeddedDeposit && !cctpExternalDepositEnabled
						? t`CCTP deposits are awaiting funded end-to-end verification for this network.`
						: null)
				}
				requiresExplicitFundingDeposit={isEmbeddedDeposit && !isTestnet}
				cctpFee={cctpDepositFee}
				cctpFeeLoading={
					isDepositDataRetrying || (selectedDepositRoute === "cctp" && displayedCctpDepositFeeQuery.isLoading)
				}
				cctpFeeError={selectedDepositRoute === "cctp" && displayedCctpDepositFeeQuery.isError}
				pendingCctpRecovery={
					!depositHash &&
					!!cctpDepositTracking.recoveryRecord &&
					cctpDepositTracking.data?.status !== "forward-submitted"
				}
				usesFundingAddressFlow={isEmbeddedDeposit}
				fundingAddressPending={
					depositAvailability.available && isEmbeddedDeposit && !embeddedWalletError && !depositEmbeddedWalletAddress
				}
				fundingAddressError={embeddedWalletError ? embeddedWalletValidationError : null}
				fundingAddress={
					depositAvailability.available && isEmbeddedDeposit && sponsoredCctpReadiness.status === "ready"
						? depositEmbeddedWalletAddress
						: undefined
				}
				onRetryFundingAddress={() => {
					void ensureEmailEmbeddedWallet().catch(() => {});
				}}
				onDone={handleClose}
			/>
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
					? "font-market-close max-[1000px]:!border-0 !bg-modal !shadow-none max-[1000px]:!rounded-t-[20px] [&>button]:!top-5 [&>button]:!right-4 [&>button]:!rounded-[8px] [&>button]:text-market-close-muted [&>button:hover]:bg-market-close-hover [&>button:hover]:text-market-close-fg [&>button:active]:bg-market-close-hover min-[1001px]:!max-w-[28rem] min-[1001px]:!rounded-[16px] min-[1001px]:!shadow-overlay min-[1001px]:[&>button]:!top-6 min-[1001px]:[&>button]:!right-6 min-[1001px]:[&>button>svg]:size-[18px]"
					: undefined
			}
		>
			<ModalHeader
				divider={!usesFundsRedesign}
				className={
					usesFundsRedesign
						? "px-4 pt-7 pr-14 pb-0 text-start min-[1001px]:px-6 min-[1001px]:pr-14 min-[1001px]:pt-6"
						: undefined
				}
			>
				{canReturnToDepositMethods ? (
					<ButtonIcon
						type="button"
						variant="ghost"
						intent="neutral"
						size="sm"
						onClick={() => setDepositStep("methods")}
						disabled={isDepositPending}
						aria-label={t`Back`}
						className="absolute top-5 left-4 rounded-16 text-trading-panel-muted hover:bg-transparent not-data-disabled:hover:bg-trading-panel-hover not-data-disabled:hover:text-trading-panel-fg min-[1001px]:top-6 min-[1001px]:left-6"
					>
						<CaretLeftIcon className="size-4 rtl:rotate-180" aria-hidden="true" />
					</ButtonIcon>
				) : null}
				<ModalTitle className={usesFundsRedesign ? "sr-only" : undefined}>
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
					{visibleTab === "deposit" && renderDepositContent()}

					{visibleTab === "withdraw" &&
						(!canUseFundsActions ? (
							<WalletNotConnected onConnect={handleReconnectWallet} isConnecting={!walletsReady || isReconnecting} />
						) : (
							<WithdrawForm
								amount={withdrawAmount}
								onAmountChange={setWithdrawAmount}
								destination={requiresWithdrawDestination ? withdrawDestination : (walletAddress ?? "")}
								onDestinationChange={setWithdrawDestination}
								destinationRequired={requiresWithdrawDestination}
								destinationError={withdrawDestinationError}
								available={exactWithdrawable}
								maxAmount={withdrawalMaxAmount}
								route={withdrawalRoute}
								routingStatus={withdrawalRoutingStatus}
								routingPreflightFailed={withdrawalRoutingPreflightFailed}
								routeChanged={withdrawalRouteChanged}
								routeFee={withdrawalRouteFee}
								activationFee={withdrawalActivationFee}
								showActivationFee={isPositiveDecimal(withdrawalActivationFee)}
								prerequisitesPending={withdrawalPrerequisitesPending}
								prerequisiteError={withdrawalPrerequisiteError}
								canRetryPrerequisites={canRetryWithdrawalPrerequisites}
								onRetryPrerequisites={handleWithdrawalPrerequisiteRetry}
								validation={{
									...withdrawValidation,
									error:
										withdrawalPrerequisitesReady && !withdrawalPrerequisitesPending ? withdrawValidation.error : null,
								}}
								canSubmit={canSubmitWithdraw}
								isPending={isWithdrawPending}
								onSubmit={handleWithdrawSubmit}
								spotAvailable={accountSummary.spotUsdcAvailable}
								showSpotFundsNotice={showSpotFundsNotice}
								onTransferClick={
									fundsActionAvailability.internalTransfer.available ? handlePerpsSpotTransferClick : undefined
								}
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
