import { Button, Tooltip } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowsLeftRightIcon, DownloadSimpleIcon, PaperPlaneTiltIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { Suspense, useCallback, useState } from "react";
import { toast } from "sonner";
import { APP_HEADER_OFFSET_CLASS, APP_HEADER_PLUS_BANNER_OFFSET_CLASS } from "@/config/layout";
import { isQuoteBalanceSharedWithPerps } from "@/domain/trade/balances";
import {
	type SelectableAccountAbstraction,
	useAccountAbstractionControl,
} from "@/hooks/trade/use-account-abstraction-control";
import { isSupportedAccountAbstraction, useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useIsMobile } from "@/hooks/use-mobile";
import { useReconnectWallet, useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { createLazyComponent } from "@/lib/lazy";
import {
	useDepositModalActions,
	useSendModalActions,
	useSwapModalActions,
	useTransferModalActions,
} from "@/stores/use-global-modal-store";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { TopNav } from "../trade/header/top-nav";
import { MobileAccountTransfersTab } from "../trade/mobile/mobile-account-transfers-tab";
import { MobileBalancesTab } from "../trade/mobile/mobile-balances-tab";
import { MobileHeader } from "../trade/mobile/mobile-header";
import { MobilePositionsView } from "../trade/mobile/mobile-positions-view";
import { TestnetBanner } from "../trade/testnet-banner";
import { AccountModeModal } from "../trade/tradebox/account-mode-modal";
import { PortfolioOverview } from "./portfolio-overview";

const FooterBar = createLazyComponent(() => import("../trade/footer/footer-bar"), "FooterBar");
const GlobalModals = createLazyComponent(() => import("../trade/components/global-modals"), "GlobalModals");
const PositionsPanel = createLazyComponent(() => import("../trade/positions/positions-panel"), "PositionsPanel");

export function PortfolioPage() {
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const isTestnet = useIsTestnet();
	const { hasWalletAccess, isConnected } = useWalletSession();
	const { reconnectWallet } = useReconnectWallet();
	const depositAvailability = useDepositAvailability();
	const { actionsBlocked: tradeRestricted } = useGeoRestriction();
	const { accountAbstraction } = useDefaultDexBalances();
	const accountModeControl = useAccountAbstractionControl(accountAbstraction);
	const [accountModeModalOpen, setAccountModeModalOpen] = useState(false);
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openTransferModal } = useTransferModalActions();
	const { open: openSendModal } = useSendModalActions();
	const { openStablecoins: openStablecoinSwapModal } = useSwapModalActions();
	const fundsActionsDisabled = !hasWalletAccess || tradeRestricted;
	const depositDisabled = !depositAvailability.available;
	const accountModeReady = isSupportedAccountAbstraction(accountAbstraction);
	const modeDependentFundsActionsDisabled = fundsActionsDisabled || !accountModeReady;
	const internalTransferDisabledReason = !accountModeReady
		? t`Select a supported account mode before moving funds.`
		: isQuoteBalanceSharedWithPerps(accountAbstraction)
			? t`Transfers between Spot and Perps are unavailable in unified account mode.`
			: null;
	const transferDisabled = fundsActionsDisabled || !!internalTransferDisabledReason;
	const handleAccountModeChange = useCallback(
		async (nextMode: SelectableAccountAbstraction) => {
			const didUpdate = await accountModeControl.setAccountAbstraction(nextMode);
			if (didUpdate) toast.success(t`Account mode updated`);
		},
		[accountModeControl.setAccountAbstraction, t],
	);

	return (
		<>
			<div
				className={cn(
					"min-h-dvh bg-portfolio-canvas text-fg font-sans",
					!isMobile && "pb-8",
					!isMobile && (isTestnet ? APP_HEADER_PLUS_BANNER_OFFSET_CLASS : APP_HEADER_OFFSET_CLASS),
					isTestnet && "testnet-bg",
				)}
			>
				{isMobile ? (
					<MobileHeader />
				) : (
					<>
						<TestnetBanner />
						<TopNav />
					</>
				)}

				<main className="mx-auto w-full max-w-[1440px] px-4 py-6 min-[1001px]:px-8 min-[1200px]:px-16 min-[1001px]:py-8">
					<div className="mb-6 flex flex-wrap items-center justify-between gap-4 min-[1001px]:mb-8">
						<h1 className="text-2xl font-normal tracking-tight text-fg">
							<Trans>Portfolio</Trans>
						</h1>
						<div className="flex flex-wrap items-center gap-2">
							<Button variant="outline" intent="neutral" size="sm" onClick={() => setAccountModeModalOpen(true)}>
								<Trans>Account mode</Trans>
							</Button>
							<Button
								variant="outline"
								intent="brand"
								size="sm"
								disabled={modeDependentFundsActionsDisabled}
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
										onClick={() => openTransferModal("toPerp")}
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
								onClick={() => openSendModal()}
								iconLeft={<PaperPlaneTiltIcon className="size-3.5" />}
							>
								<Trans>Send</Trans>
							</Button>
							<Button
								variant="outline"
								intent="brand"
								size="sm"
								disabled={modeDependentFundsActionsDisabled}
								onClick={() => openDepositModal("withdraw")}
								iconLeft={<UploadSimpleIcon className="size-3.5" />}
							>
								<Trans>Withdraw</Trans>
							</Button>
							<Tooltip content={depositAvailability.unavailableReason} side="top">
								<span className="inline-flex">
									<Button
										variant="filled"
										intent="brand"
										size="sm"
										disabled={depositDisabled}
										onClick={depositAvailability.available ? () => openDepositModal("deposit") : undefined}
										aria-label={depositAvailability.available ? undefined : depositAvailability.unavailableLabel}
										title={depositAvailability.unavailableReason ?? undefined}
										iconLeft={<DownloadSimpleIcon className="size-3.5" />}
									>
										{depositAvailability.available ? <Trans>Deposit</Trans> : depositAvailability.unavailableLabel}
									</Button>
								</span>
							</Tooltip>
						</div>
					</div>

					<PortfolioOverview />

					<section className="mt-2 overflow-hidden rounded-12 bg-surface" aria-label={t`Account activity`}>
						{isMobile ? (
							<MobilePositionsView
								className="min-h-80 py-1"
								scrollMode="page"
								includeBottomNavSpacer={false}
								balancesContent={<MobileBalancesTab />}
								transfersContent={<MobileAccountTransfersTab scrollMode="page" />}
								emptyDescription={<Trans>Connect wallet to view portfolio</Trans>}
							/>
						) : (
							<div className={cn(!isConnected && "h-24")}>
								<Suspense fallback={<AccountPanelSkeleton />}>
									<PositionsPanel includeTransfers autoHeight={isConnected} />
								</Suspense>
							</div>
						)}
					</section>
				</main>

				{!isMobile && (
					<Suspense fallback={null}>
						<FooterBar />
					</Suspense>
				)}
			</div>
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

function AccountPanelSkeleton() {
	return <div className="h-full min-h-64 animate-pulse bg-surface" />;
}
