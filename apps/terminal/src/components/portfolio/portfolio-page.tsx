import { Button, Tooltip } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowsLeftRightIcon, DownloadSimpleIcon, PaperPlaneTiltIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { Suspense } from "react";
import { APP_HEADER_OFFSET_CLASS, APP_HEADER_PLUS_BANNER_OFFSET_CLASS } from "@/config/layout";
import { isQuoteBalanceSharedWithPerps } from "@/domain/trade/balances";
import { useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
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
import { PortfolioOverview } from "./portfolio-overview";

const FooterBar = createLazyComponent(() => import("../trade/footer/footer-bar"), "FooterBar");
const GlobalModals = createLazyComponent(() => import("../trade/components/global-modals"), "GlobalModals");
const PositionsPanel = createLazyComponent(() => import("../trade/positions/positions-panel"), "PositionsPanel");

export function PortfolioPage() {
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const isTestnet = useIsTestnet();
	const { hasWalletAccess, isConnected } = useWalletSession();
	const { tradeRestricted } = useGeoRestriction();
	const { accountAbstraction } = useDefaultDexBalances();
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openTransferModal } = useTransferModalActions();
	const { open: openSendModal } = useSendModalActions();
	const { openStablecoins: openStablecoinSwapModal } = useSwapModalActions();
	const fundsActionsDisabled = !hasWalletAccess || tradeRestricted;
	const internalTransferDisabledReason = isQuoteBalanceSharedWithPerps(accountAbstraction)
		? t`Transfers between Spot and Perps are unavailable in unified account mode.`
		: null;
	const transferDisabled = fundsActionsDisabled || !!internalTransferDisabledReason;

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
							<Button
								variant="outline"
								intent="brand"
								size="sm"
								disabled={fundsActionsDisabled}
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
								disabled={fundsActionsDisabled}
								onClick={() => openSendModal()}
								iconLeft={<PaperPlaneTiltIcon className="size-3.5" />}
							>
								<Trans>Send</Trans>
							</Button>
							<Button
								variant="outline"
								intent="brand"
								size="sm"
								disabled={fundsActionsDisabled}
								onClick={() => openDepositModal("withdraw")}
								iconLeft={<UploadSimpleIcon className="size-3.5" />}
							>
								<Trans>Withdraw</Trans>
							</Button>
							<Button
								variant="filled"
								intent="brand"
								size="sm"
								disabled={fundsActionsDisabled}
								onClick={() => openDepositModal("deposit")}
								iconLeft={<DownloadSimpleIcon className="size-3.5" />}
							>
								<Trans>Deposit</Trans>
							</Button>
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
							<div className={isConnected ? "h-[420px]" : "h-24"}>
								<Suspense fallback={<AccountPanelSkeleton />}>
									<PositionsPanel includeTransfers />
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
	return <div className="h-full animate-pulse bg-surface" />;
}
