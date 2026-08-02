import { Button, ModalContent, ModalHeader, ModalTitle, SegmentedControlItem, SegmentedControls } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { ArrowLineDownIcon, ArrowLineUpIcon, ArrowsLeftRightIcon } from "@phosphor-icons/react";
import { Suspense, useEffect, useState } from "react";
import { isAddress } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { WITHDRAWAL_FEE_USD } from "@/config/contracts";
import { LIFI_BRIDGE_FEATURES, shouldShowLiFiBridgeTab } from "@/config/lifi-bridge";
import { NETWORKS } from "@/config/networks";
import { DEPOSIT_BALANCE_REFRESH_MS } from "@/config/time";
import { getAccountBalanceSummary } from "@/domain/trade/balances";
import { useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useEmailEmbeddedWallet } from "@/hooks/wallet/use-email-embedded-wallet";
import { useReconnectWallet, useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatExchangeActionError, formatTransferError } from "@/lib/errors/format";
import { formatNumber } from "@/lib/format";
import { useExchange } from "@/lib/hyperliquid";
import { useDeposit } from "@/lib/hyperliquid/use-deposit";
import { createLazyComponent } from "@/lib/lazy";
import { useHasExistingBridgeExecution } from "@/lib/lifi/bridge-execution-state";
import { toSafeBig } from "@/lib/trade/numbers";
import { validateWithdraw } from "@/lib/trade/withdraw-validation";
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

const DEPOSIT_TAB_MIN_HEIGHT = "min-h-72";

function normalizeError(error: unknown): Error {
	if (error instanceof Error) return error;
	return new Error(typeof error === "string" ? error : t`Unknown error`);
}

export function DepositModal() {
	const open = useDepositModalOpen();
	const activeTab = useDepositModalTab();
	const { close, setTab } = useDepositModalActions();
	const { open: openTransferModal } = useTransferModalActions();

	const [depositAmount, setDepositAmount] = useState("");
	const [withdrawAmount, setWithdrawAmount] = useState("");
	const [withdrawDestination, setWithdrawDestination] = useState("");
	const isTestnet = useIsTestnet();
	const depositTxChain = isTestnet ? arbitrumSepolia : arbitrum;

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
		balancePollIntervalMs: isEmbeddedDeposit ? DEPOSIT_BALANCE_REFRESH_MS : undefined,
		mode: depositMode,
		walletAddress: isEmbeddedDeposit ? depositEmbeddedWalletAddress : undefined,
	});

	const defaultBalances = useDefaultDexBalances();
	const accountAbstraction = defaultBalances.accountAbstraction;
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
	const withdrawableNum = accountSummary.withdrawable;
	const showSpotFundsNotice =
		!accountSummary.usesSpotStateForPerps && accountSummary.hasSpotFundsWhenPerpWithdrawableZero;

	const {
		mutate: withdraw,
		isPending: isWithdrawPending,
		isSuccess: isWithdrawSuccess,
		error: withdrawError,
		reset: resetWithdraw,
	} = useExchange("withdraw3");

	const baseDepositValidation = validateDeposit(depositAmount);
	const embeddedWalletValidationError =
		isEmbeddedDeposit && embeddedWalletError
			? formatTransferError(normalizeError(embeddedWalletError))
			: isEmbeddedDeposit && (needsEmbeddedWallet || isCreatingEmbeddedWallet || !depositEmbeddedWalletAddress)
				? t`Creating your wallet. Please wait...`
				: null;
	const depositValidation = embeddedWalletValidationError
		? { valid: false, error: embeddedWalletValidationError }
		: isEmbeddedDeposit && !smartDepositEnabled
			? { valid: false, error: t`Smart wallet deposits are not enabled for this network.` }
			: baseDepositValidation;
	const withdrawValidation = validateWithdraw(withdrawAmount, withdrawableNum);
	const canUseFundsActions = hasWalletAccess && !!walletAddress;
	const canUseDeposit = canUseFundsActions || isEmbeddedDeposit;
	const hasExistingBridgeExecution = useHasExistingBridgeExecution(walletAddress);
	const showBridgeTab = shouldShowLiFiBridgeTab({
		isEmbeddedDeposit,
		hasExistingExecution: hasExistingBridgeExecution,
		createNewRoute: LIFI_BRIDGE_FEATURES.createNewRoute,
	});
	const visibleTab = showBridgeTab || activeTab !== "bridge" ? activeTab : "deposit";
	const isDepositPending = depositStatus === "pending" || depositStatus === "confirming";
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
	const canSubmitWithdraw = withdrawValidation.valid && isWithdrawDestinationValid;

	useEffect(() => {
		if (!open || visibleTab !== "deposit" || !needsEmbeddedWallet) return;
		void ensureEmailEmbeddedWallet().catch(() => {});
	}, [ensureEmailEmbeddedWallet, needsEmbeddedWallet, open, visibleTab]);

	function handleDepositRetry() {
		resetDeposit();
	}

	function handleClose() {
		resetDeposit();
		resetWithdraw();
		setDepositAmount("");
		setWithdrawAmount("");
		setWithdrawDestination("");
		close();
	}

	function handleModalOpenChange(nextOpen: boolean) {
		if (!nextOpen) handleClose();
	}

	function handleReconnectWallet() {
		handleClose();
		void reconnectWallet();
	}

	function handleDepositSubmit() {
		if (depositValidation.valid && canUseDeposit && !isDepositPending) {
			deposit(depositAmount);
		}
	}

	function handleWithdrawSubmit() {
		if (!canSubmitWithdraw || !walletAddress) return;
		const destination = requiresWithdrawDestination ? normalizedWithdrawDestination : walletAddress;
		if (destination) {
			withdraw({ destination, amount: withdrawAmount });
		}
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
				title={<Trans>Deposit</Trans>}
				icon="success"
				heading={<Trans>Deposit submitted</Trans>}
				description={
					<>
						<span className="tabular-nums font-medium text-success">{depositAmount} USDC</span>{" "}
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
				title={<Trans>Deposit</Trans>}
				icon="loading"
				heading={depositPendingHeading}
				description={
					<span className="flex flex-col gap-1">
						<span className="tabular-nums">{depositAmount} USDC → Hyperliquid</span>
						{walletResponseDelayed ? (
							<span>
								<Trans>
									Keep this window open and confirm or reject the request in your wallet. Do not submit another deposit.
								</Trans>
							</span>
						) : null}
					</span>
				}
				txHash={depositStatus === "confirming" ? depositHash : undefined}
				txChain={depositTxChain}
				closable={false}
			/>
		);
	}

	if (walletDepositProviderUnavailable) {
		return (
			<StatusScreen
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
				open
				onClose={handleClose}
				onSwitch={switchToArbitrum}
				isSwitching={isSwitching}
				error={switchError}
			/>
		);
	}

	if (isWithdrawSuccess) {
		const withdrawNetReceived = Math.max(toSafeBig(withdrawAmount).minus(WITHDRAWAL_FEE_USD).toNumber(), 0);

		return (
			<StatusScreen
				title={<Trans>Withdraw</Trans>}
				icon="success"
				heading={<Trans>Withdrawal submitted</Trans>}
				description={
					<div className="space-y-1">
						<div>
							<Trans>Net received</Trans>:{" "}
							<span className="tabular-nums font-medium text-success">${formatNumber(withdrawNetReceived, 2)}</span>
						</div>
						<div className="text-fg-muted">
							<Trans>Network fee</Trans>: <span className="tabular-nums">${formatNumber(WITHDRAWAL_FEE_USD, 2)}</span>
						</div>
						<div className="text-fg-muted">
							<Trans>will arrive in {ARBITRUM_NETWORK.estimatedWithdrawTime}</Trans>
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
		return (
			<StatusScreen
				title={<Trans>Withdraw</Trans>}
				icon="error"
				heading={<Trans>Withdrawal failed</Trans>}
				description={formatExchangeActionError(withdrawError, t`Withdrawal failed`)}
				onClose={handleClose}
			>
				<div className="flex w-full gap-2">
					<Button variant="outline" intent="neutral" onClick={handleClose} className="flex-1">
						<Trans>Cancel</Trans>
					</Button>
					<Button onClick={resetWithdraw} className="flex-1">
						<Trans>Retry</Trans>
					</Button>
				</div>
			</StatusScreen>
		);
	}

	return (
		<PendingActionModal open={open} onOpenChange={handleModalOpenChange} isPending={isWithdrawPending}>
			<ModalHeader>
				<ModalTitle>
					<Trans>Transfer</Trans>
				</ModalTitle>
			</ModalHeader>

			<ModalContent className="space-y-4">
				<SegmentedControls
					value={visibleTab}
					onValueChange={(v: string) => setTab(v as "deposit" | "withdraw" | "bridge")}
					fullWidth
					disabled={isWithdrawPending}
				>
					<SegmentedControlItem value="deposit" icon={<ArrowLineDownIcon className="size-3" />}>
						<Trans>Deposit</Trans>
					</SegmentedControlItem>
					<SegmentedControlItem value="withdraw" icon={<ArrowLineUpIcon className="size-3" />}>
						<Trans>Withdraw</Trans>
					</SegmentedControlItem>
					{showBridgeTab ? (
						<SegmentedControlItem value="bridge" icon={<ArrowsLeftRightIcon className="size-3" />}>
							<Trans>Bridge</Trans>
						</SegmentedControlItem>
					) : null}
				</SegmentedControls>

				<div className={`flex flex-col ${DEPOSIT_TAB_MIN_HEIGHT}`}>
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
								networkName={depositNetworkName}
								smartDepositEnabled={smartDepositEnabled}
								autoBridgeEnabled={isEmbeddedDeposit}
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
