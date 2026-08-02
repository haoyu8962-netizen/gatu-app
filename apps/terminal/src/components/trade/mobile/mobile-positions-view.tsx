import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@gatu/ui";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { WalletIcon } from "@phosphor-icons/react";
import { type ReactNode, Suspense, useEffect, useState, useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";
import { PORTFOLIO_TRANSFERS_TAB } from "@/config/account-ledger";
import { HL_ALL_DEXS } from "@/config/app";
import { MOBILE_POSITIONS_TABS, type MobilePositionsTabValue } from "@/config/trade";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { useSubscription, useUserPositions } from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { toNumber } from "@/lib/trade/numbers";
import { useGlobalSettingsActions, usePositionsActiveTab } from "@/stores/use-global-settings-store";
import { MobileBottomNavSpacer } from "./mobile-bottom-nav";
import { MobileFundingTab } from "./mobile-funding-tab";
import { MobileHistoryTab } from "./mobile-history-tab";
import { MobileOrdersHistoryTab } from "./mobile-orders-history-tab";
import { MobileOrdersTab } from "./mobile-orders-tab";
import { MobilePositionsTab } from "./mobile-positions-tab";
import { MobileTwapTab } from "./mobile-twap-tab";

type TabValue = MobilePositionsTabValue | "balances" | "transfers";
export type MobileDataScrollMode = "contained" | "page";

const WalletModal = createLazyComponent(() => import("../components/wallet-modal"), "WalletModal");
const MOBILE_POSITIONS_TAB_VALUES = new Set<string>(MOBILE_POSITIONS_TABS.map((tab) => tab.value));
const BALANCES_TAB = { value: "balances", label: msg`Balances` } as const;

interface Props {
	className?: string;
	scrollMode?: MobileDataScrollMode;
	includeBottomNavSpacer?: boolean;
	balancesContent?: ReactNode;
	transfersContent?: ReactNode;
	emptyDescription?: ReactNode;
}

export function MobilePositionsView({
	className,
	scrollMode = "contained",
	includeBottomNavSpacer = true,
	balancesContent,
	transfersContent,
	emptyDescription,
}: Props) {
	const { _ } = useLingui();
	const storedActiveTab = usePositionsActiveTab();
	const hasBalancesTab = balancesContent != null;
	const hasTransfersTab = transfersContent != null;
	const activeTab = resolveMobilePositionsTab(storedActiveTab, hasBalancesTab, hasTransfersTab);
	const tabs: ReadonlyArray<{ value: TabValue; label: MessageDescriptor }> = [
		...(hasBalancesTab ? [BALANCES_TAB] : []),
		...MOBILE_POSITIONS_TABS,
		...(hasTransfersTab ? [PORTFOLIO_TRANSFERS_TAB] : []),
	];
	const { setPositionsActiveTab } = useGlobalSettingsActions();
	const [isPending, startTransition] = useTransition();
	const { address, isConnected } = useWalletSession();
	const { positions, isLoading: isLoadingState } = useUserPositions();
	const isPageScroll = scrollMode === "page";

	const { data: ordersEvent, status: ordersStatus } = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const openOrders = ordersEvent?.orders;
	const isLoadingOrders = ordersStatus === "subscribing" || ordersStatus === "idle";

	useEffect(() => {
		if (storedActiveTab === activeTab) return;
		setPositionsActiveTab(activeTab);
	}, [activeTab, setPositionsActiveTab, storedActiveTab]);

	const positionsCount = isConnected
		? positions.reduce((count, entry) => {
				const size = toNumber(entry.szi);
				return size ? count + 1 : count;
			}, 0)
		: 0;

	const ordersCount = isConnected ? (openOrders?.length ?? 0) : 0;

	function handleTabChange(value: string) {
		startTransition(() => setPositionsActiveTab(resolveMobilePositionsTab(value, hasBalancesTab, hasTransfersTab)));
	}

	function getTabCount(tabValue: TabValue): number | null {
		if (tabValue === "positions") return positionsCount;
		if (tabValue === "orders") return ordersCount;
		return null;
	}

	function isTabLoading(tabValue: TabValue): boolean {
		if (!isConnected) return false;
		if (tabValue === "positions") return isLoadingState;
		if (tabValue === "orders") return isLoadingOrders;
		return false;
	}

	const tabContentClass = cn(
		isPageScroll ? "min-h-0 flex flex-col mt-0" : "flex-1 min-h-0 flex flex-col mt-0",
		isPending && "opacity-70",
	);

	return (
		<div className={cn(isPageScroll ? "min-h-0 flex flex-col" : "flex-1 min-h-0 flex flex-col", className)}>
			<Tabs
				value={activeTab}
				onValueChange={handleTabChange}
				size="xxs"
				className={cn(
					isPageScroll
						? "min-h-0 flex flex-col"
						: "flex-1 min-h-0 flex flex-col overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
				)}
			>
				<div className="shrink-0 min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					<TabsList className="w-full min-w-max justify-between px-1">
						{tabs.map((tab) => {
							const count = getTabCount(tab.value);
							const loading = isTabLoading(tab.value);

							return (
								<TabsTrigger key={tab.value} value={tab.value} className="shrink-0 px-1 text-3xs leading-7">
									<span>{_(tab.label)}</span>
									{loading ? (
										<Spinner className="size-3 shrink-0" />
									) : typeof count === "number" && count > 0 ? (
										<span className="shrink-0">({count})</span>
									) : null}
								</TabsTrigger>
							);
						})}
					</TabsList>
				</div>
				{!isConnected ? (
					<EmptyState description={emptyDescription} />
				) : (
					<>
						{balancesContent != null ? (
							<TabsContent value="balances" className={tabContentClass}>
								{balancesContent}
							</TabsContent>
						) : null}
						<TabsContent value="positions" className={tabContentClass}>
							<MobilePositionsTab scrollMode={scrollMode} />
						</TabsContent>
						<TabsContent value="orders" className={tabContentClass}>
							<MobileOrdersTab scrollMode={scrollMode} />
						</TabsContent>
						<TabsContent value="twap" className={tabContentClass}>
							<MobileTwapTab scrollMode={scrollMode} />
						</TabsContent>
						<TabsContent value="history" className={tabContentClass}>
							<MobileHistoryTab scrollMode={scrollMode} />
						</TabsContent>
						<TabsContent value="orders-history" className={tabContentClass}>
							<MobileOrdersHistoryTab scrollMode={scrollMode} />
						</TabsContent>
						<TabsContent value="funding" className={tabContentClass}>
							<MobileFundingTab scrollMode={scrollMode} />
						</TabsContent>
						{transfersContent != null ? (
							<TabsContent value="transfers" className={tabContentClass}>
								{transfersContent}
							</TabsContent>
						) : null}
					</>
				)}
				{includeBottomNavSpacer ? <MobileBottomNavSpacer /> : null}
			</Tabs>
		</div>
	);
}

function resolveMobilePositionsTab(value: string, hasBalancesTab: boolean, hasTransfersTab: boolean): TabValue {
	if (hasBalancesTab && value === "balances") return "balances";
	if (hasTransfersTab && value === PORTFOLIO_TRANSFERS_TAB.value) return PORTFOLIO_TRANSFERS_TAB.value;
	return MOBILE_POSITIONS_TAB_VALUES.has(value) ? (value as TabValue) : "positions";
}

function EmptyState({ description }: { description?: ReactNode }) {
	const [walletModalOpen, setWalletModalOpen] = useState(false);

	return (
		<>
			<div className="h-full flex flex-col items-center justify-center gap-2.5 p-3 text-center">
				<div className="size-10 rounded-full flex items-center justify-center bg-surface">
					<WalletIcon className="size-5 text-fg-muted" />
				</div>
				<p className="text-xs text-fg-muted max-w-xs text-pretty">
					{description ?? <Trans>Connect wallet to view positions</Trans>}
				</p>
				<Button variant="outline" intent="brand" size="sm" onClick={() => setWalletModalOpen(true)}>
					<Trans>Connect Wallet</Trans>
				</Button>
			</div>
			{walletModalOpen && (
				<Suspense fallback={null}>
					<WalletModal open onOpenChange={setWalletModalOpen} />
				</Suspense>
			)}
		</>
	);
}
