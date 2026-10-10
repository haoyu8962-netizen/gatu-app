import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowsLeftRightIcon, DownloadSimpleIcon, PaperPlaneTiltIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { Button, Tooltip } from "@sairn/ui";
import { Suspense, useCallback, useId, useState } from "react";
import { DashboardHeader, FooterBar, GlobalModals } from "@/components/dashboard/dashboard-chrome";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { depositModalIntentProps } from "@/components/trade/components/deposit-modal-intent";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";
import { isQuoteBalanceSharedWithPerps } from "@/domain/trade/balances";
import { getFundsAvailabilityNotice } from "@/domain/trade/data-presentation";
import {
	type SelectableAccountAbstraction,
	useAccountAbstractionControl,
} from "@/hooks/trade/use-account-abstraction-control";
import { isSupportedAccountAbstraction, useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { useFundsActionAvailability } from "@/hooks/trade/use-funds-action-availability";
import { useIsMobile } from "@/hooks/use-mobile";
import { useReconnectWallet, useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatList } from "@/lib/format";
import { createLazyComponent } from "@/lib/lazy";
import {
	useDepositModalActions,
	useSendModalActions,
	useSwapModalActions,
	useTransferModalActions,
} from "@/stores/use-global-modal-store";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { AccountActivityFeedOwner } from "../trade/account-activity-feed-owner";
import { MobileAccountTransfersTab } from "../trade/mobile/mobile-account-transfers-tab";
import { MobileBalancesTab } from "../trade/mobile/mobile-balances-tab";
import { MobilePositionsView } from "../trade/mobile/mobile-positions-view";
import { AccountModeModal } from "../trade/tradebox/account-mode-modal";
import { PortfolioOverview } from "./portfolio-overview";

const PositionsPanel = createLazyComponent(() => import("../trade/positions/positions-panel"), "PositionsPanel");

export function PortfolioPage() {
	const { i18n, t } = useLingui();
	const locale = i18n.locale;
	const isMobile = useIsMobile();
	const unavailableActionsId = useId();
	const isTestnet = useIsTestnet();
	const { hasWalletAccess, isConnected } = useWalletSession();
	const { reconnectWallet } = useReconnectWallet();
	const depositAvailability = useDepositAvailability();
	const defaultBalances = useDefaultDexBalances();
	const { accountAbstraction } = defaultBalances;
	const accountModeControl = useAccountAbstractionControl(accountAbstraction);
	const [accountModeModalOpen, setAccountModeModalOpen] = useState(false);
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openTransferModal } = useTransferModalActions();
	const { open: openSendModal } = useSendModalActions();
	const { openStablecoins: openStablecoinSwapModal } = useSwapModalActions();
	const accountModeReady = isSupportedAccountAbstraction(accountAbstraction);
	const accountDataReady =
		defaultBalances.spotStateStatus === "success" &&
		defaultBalances.perpStateStatus === "success" &&
		!defaultBalances.isDataStale &&
		!defaultBalances.hasError;
	const fundsActionAvailability = useFundsActionAvailability({
		accountDataReady,
		accountAbstraction,
		fundsActionsEnabled: true,
		hasWalletAccess,
		internalTransfersEnabled: !isQuoteBalanceSharedWithPerps(accountAbstraction),
	});
	const geoBlocked =
		fundsActionAvailability.withdrawal.reason === "geo-restricted" ||
		fundsActionAvailability.withdrawal.reason === "geo-unresolved";
	const fundsActionsDisabled = !hasWalletAccess || geoBlocked;
	const depositDisabled = !depositAvailability.available;
	const modeDependentFundsActionsDisabled = fundsActionsDisabled || !accountModeReady;
	const internalTransferDisabledReason = isMobile
		? getFundsAvailabilityNotice(fundsActionAvailability.internalTransfer)
		: fundsActionAvailability.internalTransfer.unavailableReason;
	const withdrawalNotice = isMobile
		? getFundsAvailabilityNotice(fundsActionAvailability.withdrawal)
		: fundsActionAvailability.withdrawal.unavailableReason;
	const depositNotice = isMobile
		? getFundsAvailabilityNotice(depositAvailability)
		: depositAvailability.unavailableReason;
	const transferDisabled = !fundsActionAvailability.internalTransfer.available;
	const modeDependentFundsActionsDisabledReason = modeDependentFundsActionsDisabled ? withdrawalNotice : null;
	const transferDisabledReason = transferDisabled ? internalTransferDisabledReason : null;
	const withdrawalDisabledReason = fundsActionAvailability.withdrawal.available ? null : withdrawalNotice;
	const depositDisabledReason = depositDisabled ? depositNotice : null;
	const unavailableActionGroups = groupUnavailableActions([
		{
			actions: [t`Swap Stablecoins`, t`Send`],
			reason: modeDependentFundsActionsDisabledReason,
		},
		{ actions: [t`Perps / Spot`], reason: transferDisabledReason },
		{ actions: [t`Withdraw`], reason: withdrawalDisabledReason },
		{ actions: [t`Deposit`], reason: depositDisabledReason },
	]);
	const getUnavailableReasonId = (reason: string | null) => {
		const index = reason ? unavailableActionGroups.findIndex((group) => group.reason === reason) : -1;
		return index >= 0 ? `${unavailableActionsId}-${index}` : undefined;
	};
	const handleAccountModeChange = useCallback(
		async (nextMode: SelectableAccountAbstraction) => {
			await accountModeControl.setAccountAbstraction(nextMode);
		},
		[accountModeControl.setAccountAbstraction],
	);

	return (
		<>
			<AccountActivityFeedOwner />
			<DashboardFrameView
				{...DASHBOARD_FRAMES["/portfolio"]}
				isMobile={isMobile}
				bannerOffset={isTestnet}
				testnet={isTestnet}
				header={<DashboardHeader isMobile={isMobile} />}
				main={
					<>
						<div className="mb-6 flex flex-wrap items-start justify-between gap-4 min-[1001px]:mb-8">
							<h1 className="text-2xl font-normal tracking-tight text-fg">
								<Trans>Portfolio</Trans>
							</h1>
							<div className="flex max-w-full flex-col items-end gap-2">
								<div className="flex flex-wrap items-center justify-end gap-2">
									<Button variant="outline" intent="neutral" size="sm" onClick={() => setAccountModeModalOpen(true)}>
										<Trans>Account mode</Trans>
									</Button>
									<Button
										variant="outline"
										intent="brand"
										size="sm"
										disabled={modeDependentFundsActionsDisabled}
										focusableWhenDisabled
										aria-describedby={getUnavailableReasonId(modeDependentFundsActionsDisabledReason)}
										onClick={openStablecoinSwapModal}
										iconLeft={<ArrowsLeftRightIcon className="size-3.5" />}
									>
										<Trans>Swap Stablecoins</Trans>
									</Button>
									<Tooltip content={internalTransferDisabledReason} side="top">
										<span className="inline-flex">
											<Button
												variant="outline"
												intent="brand"
												size="sm"
												disabled={transferDisabled}
												focusableWhenDisabled
												aria-describedby={getUnavailableReasonId(transferDisabledReason)}
												onClick={
													fundsActionAvailability.internalTransfer.available
														? () => openTransferModal("toPerp")
														: undefined
												}
												iconLeft={<ArrowsLeftRightIcon className="size-3.5" />}
											>
												<Trans>Perps / Spot</Trans>
											</Button>
										</span>
									</Tooltip>
									<Button
										variant="outline"
										intent="brand"
										size="sm"
										disabled={modeDependentFundsActionsDisabled}
										focusableWhenDisabled
										aria-describedby={getUnavailableReasonId(modeDependentFundsActionsDisabledReason)}
										onClick={() => openSendModal()}
										iconLeft={<PaperPlaneTiltIcon className="size-3.5" />}
									>
										<Trans>Send</Trans>
									</Button>
									<Tooltip content={withdrawalNotice} side="top">
										<span className="inline-flex">
											<Button
												variant="outline"
												intent="brand"
												size="sm"
												disabled={!fundsActionAvailability.withdrawal.available}
												focusableWhenDisabled
												aria-describedby={getUnavailableReasonId(withdrawalDisabledReason)}
												onClick={
													fundsActionAvailability.withdrawal.available ? () => openDepositModal("withdraw") : undefined
												}
												{...(fundsActionAvailability.withdrawal.available ? depositModalIntentProps : undefined)}
												iconLeft={<UploadSimpleIcon className="size-3.5" />}
											>
												<Trans>Withdraw</Trans>
											</Button>
										</span>
									</Tooltip>
									<Tooltip content={depositNotice} side="top">
										<span className="inline-flex">
											<Button
												variant="filled"
												intent="brand"
												size="sm"
												disabled={depositDisabled}
												focusableWhenDisabled
												aria-describedby={getUnavailableReasonId(depositDisabledReason)}
												onClick={depositAvailability.available ? () => openDepositModal("deposit") : undefined}
												{...(depositAvailability.available ? depositModalIntentProps : undefined)}
												aria-label={
													depositAvailability.available || isMobile ? undefined : depositAvailability.unavailableLabel
												}
												title={depositNotice ?? undefined}
												iconLeft={<DownloadSimpleIcon className="size-3.5" />}
											>
												{depositAvailability.available || isMobile ? (
													<Trans>Deposit</Trans>
												) : (
													depositAvailability.unavailableLabel
												)}
											</Button>
										</span>
									</Tooltip>
								</div>
								{unavailableActionGroups.length ? (
									<div
										aria-live="polite"
										className="max-w-2xl space-y-0.5 text-start text-2xs leading-4 text-fg-muted min-[1001px]:text-end"
									>
										<p className="font-semibold text-fg-muted">
											<Trans>Unavailable actions</Trans>
										</p>
										{unavailableActionGroups.map((group, index) => (
											<p id={`${unavailableActionsId}-${index}`} key={group.reason}>
												<span className="font-semibold">{formatList(group.actions, { locale })}:</span> {group.reason}
											</p>
										))}
									</div>
								) : null}
							</div>
						</div>

						<PortfolioOverview />

						<section
							className="mt-2 overflow-hidden rounded-24 bg-surface shadow-raised"
							aria-label={t`Account activity`}
						>
							{isMobile ? (
								<MobilePositionsView
									className="min-h-80 py-1 [&_[data-account-card]]:rounded-16"
									scrollMode="page"
									includeBottomNavSpacer={false}
									balancesContent={<MobileBalancesTab />}
									transfersContent={<MobileAccountTransfersTab scrollMode="page" />}
								/>
							) : (
								<div className={cn(!isConnected && "h-24")}>
									<Suspense fallback={<AccountPanelSkeleton />}>
										<PositionsPanel includeTransfers autoHeight={isConnected} />
									</Suspense>
								</div>
							)}
						</section>
					</>
				}
				footer={
					!isMobile && (
						<Suspense fallback={null}>
							<FooterBar />
						</Suspense>
					)
				}
			/>
			<AccountModeModal
				open={accountModeModalOpen}
				onOpenChange={setAccountModeModalOpen}
				currentMode={accountAbstraction}
				isLoading={accountModeControl.isLoading}
				isUpdating={accountModeControl.isUpdating}
				canChange={accountModeControl.canSet}
				portfolioMarginActivationEnabled={accountModeControl.portfolioMarginActivationEnabled}
				onConnect={() => void reconnectWallet()}
				onApply={handleAccountModeChange}
			/>
			<Suspense fallback={null}>
				<GlobalModals
					enableHip3Disclaimer
					enableLegalGate
					enablePositionMarketClose
					enableSelectedMarketHip3Disclaimer={false}
				/>
			</Suspense>
		</>
	);
}

function groupUnavailableActions(
	entries: readonly { actions: readonly string[]; reason: string | null }[],
): Array<{ actions: string[]; reason: string }> {
	const groups = new Map<string, string[]>();
	for (const entry of entries) {
		if (!entry.reason) continue;
		groups.set(entry.reason, [...(groups.get(entry.reason) ?? []), ...entry.actions]);
	}
	return [...groups].map(([reason, actions]) => ({ actions, reason }));
}

function AccountPanelSkeleton() {
	return <div className="h-full min-h-64 animate-pulse bg-surface" />;
}
