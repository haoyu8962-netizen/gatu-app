import { Button, ModalContent, ModalHeader, ModalTitle } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Suspense, useEffect, useRef, useState } from "react";
import { isAddress, zeroAddress } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { LIFI_BRIDGE_FEATURES, shouldShowLiFiBridgeTab } from "@/config/lifi-bridge";
import { NETWORKS } from "@/config/networks";
import { DEPOSIT_BALANCE_REFRESH_MS } from "@/config/time";
import { getAccountBalanceSummary } from "@/domain/trade/balances";
import { getUsdcRoutingQueryStatus, getWithdrawalRoute } from "@/domain/trade/usdc-routing";
import { useAccountAbstractionPreExecutionGuard } from "@/hooks/trade/use-account-abstraction-guard";
import { useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useCctpWithdrawalFee } from "@/hooks/trade/use-cctp-withdrawal-fee";
import { executeWithFreshWithdrawalRoute, useFreshUsdcRouting, useUsdcRouting } from "@/hooks/trade/use-usdc-routing";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEmailEmbeddedWallet } from "@/hooks/wallet/use-email-embedded-wallet";
import { useReconnectWallet, useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatExchangeActionError, formatTransferError, isAmbiguousExchangeActionError } from "@/lib/errors/format";
import { formatNumber } from "@/lib/format";
import { useExchange, useInfo } from "@/lib/hyperliquid";
import { useDeposit } from "@/lib/hyperliquid/use-deposit";
import { createLazyComponent } from "@/lib/lazy";
import { useHasExistingBridgeExecution } from "@/lib/lifi/bridge-execution-state";
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

const FUNDS_MODAL_MIN_HEIGHT = "min-h-72";

interface WithdrawalAttempt {
	activationFee: string;
	amount: string;
	route: WithdrawalRoute;
	routeFee: string;
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
	const [withdrawalRoutingPreflightFailed, setWithdrawalRoutingPreflightFailed] = useState(false);
	const [isDepositPreflighting, setIsDepositPreflighting] = useState(false);
	const [isWithdrawalPreflighting, setIsWithdrawalPreflighting] = useState(false);
	const depositPreflightIdRef = useRef(0);
	const observedWithdrawalRouteRef = useRef<WithdrawalRoute | null>(null);
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
	const bridgeDepositRouteReady = depositRoutingStatus === "ready" && usdcRoutingQuery.data?.depositRoute === "bridge";

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
		walletAddress: isEmbeddedDeposit ? depositEmbeddedWalletAddress : undefined,
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
	const depositValidation = !bridgeDepositRouteReady
		? { valid: false, error: null }
		: embeddedWalletValidationError
			? { valid: false, error: embeddedWalletValidationError }
			: isEmbeddedDeposit && !smartDepositEnabled
				? { valid: false, error: t`Smart wallet deposits are not enabled for this network.` }
				: baseDepositValidation;
	const canUseFundsActions = hasWalletAccess && !!walletAddress;
	const canUseDeposit = canUseFundsActions || isEmbeddedDeposit;
	const hasExistingBridgeExecution = useHasExistingBridgeExecution(walletAddress);
	const showBridgeTab = shouldShowLiFiBridgeTab({
		isEmbeddedDeposit,
		hasExistingExecution: hasExistingBridgeExecution,
		createNewRoute: LIFI_BRIDGE_FEATURES.createNewRoute,
	});
	const visibleTab = showBridgeTab || activeTab !== "bridge" ? activeTab : "deposit";
	const withdrawalQueriesEnabled =
		open &&
		visibleTab === "withdraw" &&
		canUseFundsActions &&
		accountSummary.isAvailable &&
		withdrawalRoutingStatus === "ready" &&
		!!routedWithdrawalRoute;
	const preTransferAddress = walletAddress ?? zeroAddress;
	const preTransferCheckQuery = useInfo(
		"preTransferCheck",
		{ user: preTransferAddress, source: preTransferAddress },
		{ enabled: withdrawalQueriesEnabled, staleTime: 30_000, refetchOnWindowFocus: true },
	);
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
	const withdrawalActivationFee = preTransferCheckQuery.data?.fee ?? "0";
	const withdrawalMaxAmount = preTransferCheckQuery.isSuccess
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
		preTransferCheckQuery.isFetching ||
		(withdrawalRoute === "arbitrum-cctp" && cctpFeeQuery.isFetching);
	let withdrawalPrerequisiteError: string | null = null;
	if (!accountSummary.isAvailable) {
		withdrawalPrerequisiteError = t`Select a supported account mode before moving funds.`;
	} else if (withdrawalRoutingStatus === "ready" && preTransferCheckQuery.data?.isSanctioned) {
		withdrawalPrerequisiteError = t`Withdrawals are unavailable for this address.`;
	} else if (withdrawalRoutingStatus === "ready" && preTransferCheckQuery.isError) {
		withdrawalPrerequisiteError = t`Unable to verify withdrawal eligibility.`;
	} else if (withdrawalRoutingStatus === "ready" && withdrawalRoute === "arbitrum-cctp" && cctpFeeQuery.isError) {
		withdrawalPrerequisiteError = t`Unable to load the current CCTP withdrawal fee.`;
	}
	const withdrawalPrerequisitesReady =
		accountSummary.isAvailable &&
		withdrawalRoutingStatus === "ready" &&
		!!routedWithdrawalRoute &&
		preTransferCheckQuery.isSuccess &&
		!preTransferCheckQuery.data.isSanctioned &&
		(withdrawalRoute === "arbitrum-legacy" || cctpFeeQuery.isSuccess);
	const canRetryWithdrawalPrerequisites =
		!preTransferCheckQuery.data?.isSanctioned &&
		withdrawalRoutingStatus === "ready" &&
		(preTransferCheckQuery.isError || (withdrawalRoute === "arbitrum-cctp" && cctpFeeQuery.isError));
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

	async function assertFreshWithdrawalExecution(expectedRoute: WithdrawalRoute, signal: AbortSignal) {
		await Promise.all([assertFreshWithdrawalRoute(expectedRoute, signal), assertAccountAbstraction(signal)]);
	}

	function handleClose() {
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
		setWithdrawalRoutingPreflightFailed(false);
		setIsDepositPreflighting(false);
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
		if (!depositValidation.valid || !canUseDeposit || isDepositPending || !bridgeDepositRouteReady) return;

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
			if (freshRouting.depositRoute !== "bridge") return;
			await deposit(depositAmount);
		} catch {
			if (depositPreflightIdRef.current === preflightId) setDepositRoutingPreflightFailed(true);
			return;
		} finally {
			if (depositPreflightIdRef.current === preflightId) setIsDepositPreflighting(false);
		}
	}

	async function handleWithdrawSubmit() {
		if (!canSubmitWithdraw || !walletAddress || withdrawalRouteFee === null) return;
		const destination = requiresWithdrawDestination ? normalizedWithdrawDestination : walletAddress;
		if (!isAddress(destination)) return;

		setIsWithdrawalPreflighting(true);
		try {
			const expectedWithdrawalRoute = routedWithdrawalRoute;
			if (!expectedWithdrawalRoute) return;

			const preTransferResult = await preTransferCheckQuery.refetch();
			if (!preTransferResult.data || preTransferResult.isError || preTransferResult.data.isSanctioned) return;

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
				activationFee: preTransferResult.data.fee,
			});
			if (!freshValidation.valid) return;

			const executionStatus = await executeWithFreshWithdrawalRoute(
				expectedWithdrawalRoute,
				fetchFreshUsdcRouting,
				async () => {
					setWithdrawalRouteChanged(false);
					setWithdrawalAttempt({
						activationFee: preTransferResult.data.fee,
						amount: withdrawAmount,
						route: expectedWithdrawalRoute,
						routeFee: freshRouteFee,
					});
					if (expectedWithdrawalRoute === "arbitrum-cctp") {
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
		await preTransferCheckQuery.refetch();
		if (freshWithdrawalRoute === "arbitrum-cctp") await cctpFeeQuery.refetch();
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

	if (depositStatus === "success") {
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

		return (
			<StatusScreen
				open={open}
				presentation={presentation}
				title={<Trans>Deposit</Trans>}
				icon="error"
				heading={<Trans>Deposit failed</Trans>}
				description={formatTransferError(depositError)}
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
		>
			<ModalHeader>
				<ModalTitle>
					{visibleTab === "deposit" ? (
						<Trans>Deposit</Trans>
					) : visibleTab === "withdraw" ? (
						<Trans>Withdraw</Trans>
					) : (
						<Trans>Bridge</Trans>
					)}
				</ModalTitle>
			</ModalHeader>

			<ModalContent className="space-y-4">
				<div className={`flex flex-col ${FUNDS_MODAL_MIN_HEIGHT}`}>
					{visibleTab === "deposit" &&
						(canUseDeposit ? (
							<DepositForm
								amount={depositAmount}
								onAmountChange={setDepositAmount}
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
