import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@gatu/ui";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { WalletIcon } from "@phosphor-icons/react";
import { type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { PORTFOLIO_TRANSFERS_TAB } from "@/config/account-ledger";
import { HL_ALL_DEXS } from "@/config/app";
import { MOBILE_POSITIONS_TABS, type MobilePositionsTabValue } from "@/config/trade";
import { getReadyItemCount } from "@/domain/trade/position-toolbar";
import { useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { useSubscription, useUserPositions } from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { toBig } from "@/lib/trade/numbers";
import { useGlobalSettingsActions, usePositionsActiveTab } from "@/stores/use-global-settings-store";
import { MobileBottomNavSpacer } from "./mobile-bottom-nav";
import { MobileFundingTab } from "./mobile-funding-tab";
import { MobileHistoryTab } from "./mobile-history-tab";
import { MobileOrdersHistoryTab } from "./mobile-orders-history-tab";
import { MobileOrdersTab } from "./mobile-orders-tab";
import { MobilePositionsTab } from "./mobile-positions-tab";
import { MobileTwapTab } from "./mobile-twap-tab";
import { useMobileDisclosureSetState } from "./use-mobile-disclosure-set";

type TabValue = MobilePositionsTabValue | "transfers";
export type MobileDataScrollMode = "contained" | "page";

const WalletModal = createLazyComponent(() => import("../components/wallet-modal"), "WalletModal");
const MOBILE_POSITIONS_TAB_VALUES = new Set<string>(MOBILE_POSITIONS_TABS.map((tab) => tab.value));
const MOBILE_TAB_PREFERENCE_DELAY_MS = 120;
const MOBILE_TAB_EDGE_FADE_WIDTH_PX = 28;

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
	const hasTransfersTab = transfersContent != null;
	const [pendingActiveTab, setPendingActiveTab] = useState<TabValue | null>(null);
	const resolvedStoredActiveTab = resolveMobilePositionsTab(storedActiveTab, hasTransfersTab);
	const activeTab =
		pendingActiveTab === null ? resolvedStoredActiveTab : resolveMobilePositionsTab(pendingActiveTab, hasTransfersTab);
	const tabs = [...MOBILE_POSITIONS_TABS, ...(hasTransfersTab ? [PORTFOLIO_TRANSFERS_TAB] : [])];
	const { setPositionsActiveTab } = useGlobalSettingsActions();
	const tabScrollRef = useRef<HTMLDivElement>(null);
	const tabPreferenceTimerRef = useRef<number | null>(null);
	const pendingTabPreferenceRef = useRef<TabValue | null>(null);
	const { address, isConnected } = useWalletSession();
	const positionDisclosureState = useMobileDisclosureSetState(address?.toLowerCase() ?? null);
	const {
		perpSummary,
		spotBalances,
		hasAllDexsSnapshot,
		hasSpotStateSnapshot,
		hasError: balancesError,
		isLoading: balancesLoading,
	} = useDefaultDexBalances();
	const { positions, isLoading: isLoadingState, hasError: positionsError } = useUserPositions();
	const isPageScroll = scrollMode === "page";

	const {
		data: ordersEvent,
		status: ordersStatus,
		isStale: ordersStale,
	} = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const openOrders = ordersEvent?.orders;
	const {
		data: twapStatesEvent,
		status: twapStatesStatus,
		isStale: twapStatesStale,
	} = useSubscription(
		"twapStates",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const isLoadingOrders = ordersStatus === "subscribing" || ordersStatus === "idle";
	const isLoadingTwap = twapStatesStatus === "subscribing" || twapStatesStatus === "idle";

	useEffect(() => {
		if (storedActiveTab === activeTab) {
			pendingTabPreferenceRef.current = null;
			if (pendingActiveTab !== null) setPendingActiveTab(null);
			return;
		}

		pendingTabPreferenceRef.current = activeTab;
		const timerId = window.setTimeout(() => {
			if (pendingTabPreferenceRef.current !== activeTab) return;
			pendingTabPreferenceRef.current = null;
			tabPreferenceTimerRef.current = null;
			setPositionsActiveTab(activeTab);
			setPendingActiveTab((current) =>
				current !== null && resolveMobilePositionsTab(current, hasTransfersTab) === activeTab ? null : current,
			);
		}, MOBILE_TAB_PREFERENCE_DELAY_MS);
		tabPreferenceTimerRef.current = timerId;

		return () => {
			window.clearTimeout(timerId);
			if (tabPreferenceTimerRef.current === timerId) tabPreferenceTimerRef.current = null;
		};
	}, [activeTab, hasTransfersTab, pendingActiveTab, setPositionsActiveTab, storedActiveTab]);

	useEffect(() => {
		function flushPendingTabPreference() {
			const pendingTab = pendingTabPreferenceRef.current;
			if (pendingTab === null) return;
			if (tabPreferenceTimerRef.current !== null) window.clearTimeout(tabPreferenceTimerRef.current);
			tabPreferenceTimerRef.current = null;
			pendingTabPreferenceRef.current = null;
			setPositionsActiveTab(pendingTab);
		}
		function handleVisibilityChange() {
			if (document.visibilityState === "hidden") flushPendingTabPreference();
		}

		window.addEventListener("pagehide", flushPendingTabPreference);
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			window.removeEventListener("pagehide", flushPendingTabPreference);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			flushPendingTabPreference();
		};
	}, [setPositionsActiveTab]);

	const positionsCount = getReadyItemCount({
		isConnected,
		isReady: hasAllDexsSnapshot && !isLoadingState && !positionsError,
		count: positions.reduce((count, entry) => {
			const size = toBig(entry.szi);
			return size && !size.eq(0) ? count + 1 : count;
		}, 0),
	});
	const ordersCount = getReadyItemCount({
		isConnected,
		isReady: ordersStatus === "active" && !ordersStale && ordersEvent !== undefined,
		count: openOrders?.length ?? 0,
	});
	const twapCount = getReadyItemCount({
		isConnected,
		isReady: twapStatesStatus === "active" && !twapStatesStale && twapStatesEvent !== undefined,
		count: twapStatesEvent?.states?.length ?? 0,
	});
	const balancesCount = useMemo(() => {
		if (!isConnected || balancesError || !hasAllDexsSnapshot || !hasSpotStateSnapshot) return null;
		let count = 0;
		if (toBig(perpSummary?.accountValue)?.gt(0)) count++;
		for (const balance of spotBalances) {
			if (toBig(balance.total)?.gt(0)) count++;
		}
		return count;
	}, [balancesError, hasAllDexsSnapshot, hasSpotStateSnapshot, isConnected, perpSummary?.accountValue, spotBalances]);

	useEffect(() => {
		const scroller = tabScrollRef.current;
		if (!scroller) return;
		const scrollContainer: HTMLDivElement = scroller;

		function keepSelectedTabVisible() {
			const selectedTab = scrollContainer.querySelector<HTMLElement>(`[data-mobile-account-tab="${activeTab}"]`);
			if (!selectedTab) return;

			const scrollerRect = scrollContainer.getBoundingClientRect();
			const selectedTabRect = selectedTab.getBoundingClientRect();
			const visibleRight = scrollerRect.right - MOBILE_TAB_EDGE_FADE_WIDTH_PX;
			const horizontalDelta =
				selectedTabRect.left < scrollerRect.left
					? selectedTabRect.left - scrollerRect.left
					: selectedTabRect.right > visibleRight
						? selectedTabRect.right - visibleRight
						: 0;
			if (horizontalDelta === 0) return;

			if (typeof scrollContainer.scrollBy === "function") {
				scrollContainer.scrollBy({ left: horizontalDelta, top: 0, behavior: "auto" });
			} else {
				scrollContainer.scrollLeft += horizontalDelta;
			}
		}

		keepSelectedTabVisible();
		if (typeof ResizeObserver === "undefined") return;

		const resizeObserver = new ResizeObserver(keepSelectedTabVisible);
		for (const tab of scrollContainer.querySelectorAll<HTMLElement>("[data-mobile-account-tab]")) {
			resizeObserver.observe(tab);
		}
		return () => resizeObserver.disconnect();
	}, [activeTab]);

	function handleTabChange(value: string) {
		const nextTab = resolveMobilePositionsTab(value, hasTransfersTab);
		pendingTabPreferenceRef.current = nextTab === storedActiveTab ? null : nextTab;
		setPendingActiveTab(nextTab === resolvedStoredActiveTab ? null : nextTab);
	}

	function getTabCount(tabValue: TabValue): number | null {
		if (tabValue === "balances") return balancesCount;
		if (tabValue === "positions") return positionsCount;
		if (tabValue === "orders") return ordersCount;
		if (tabValue === "twap") return twapCount;
		return null;
	}

	function isTabLoading(tabValue: TabValue): boolean {
		if (!isConnected) return false;
		if (tabValue === "balances") return balancesLoading;
		if (tabValue === "positions") return isLoadingState;
		if (tabValue === "orders") return isLoadingOrders;
		if (tabValue === "twap") return isLoadingTwap;
		return false;
	}

	const tabContentClass = cn(isPageScroll ? "min-h-0 flex flex-col mt-0" : "flex-1 min-h-0 flex flex-col mt-0");

	return (
		<div
			className={cn(
				"font-market-close",
				isPageScroll ? "min-h-0 flex flex-col" : "flex-1 min-h-0 flex flex-col",
				className,
			)}
		>
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
				<div className="relative min-w-0 shrink-0">
					<div
						ref={tabScrollRef}
						data-testid="mobile-account-tabs-scroll"
						className="min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					>
						<TabsList
							className="h-[47px] min-w-max gap-0 border-b border-market-close-stroke-card px-3.5 pr-7"
							indicatorClassName="bg-market-close-fg duration-[120ms] ease-linear"
						>
							{tabs.map((tab) => {
								const count = getTabCount(tab.value);
								const loading = isTabLoading(tab.value);

								return (
									<TabsTrigger
										key={tab.value}
										value={tab.value}
										data-mobile-account-tab={tab.value}
										className="min-h-11 shrink-0 px-2.5 text-[13px] font-medium leading-none text-market-close-subtle transition-colors duration-[120ms] hover:text-market-close-fg focus-visible:outline-market-close-control data-active:font-bold data-active:text-market-close-fg"
									>
										<span>{_(tab.label)}</span>
										{loading ? (
											<Spinner className="size-3 shrink-0" />
										) : typeof count === "number" ? (
											<span className="shrink-0 tabular-nums">({count})</span>
										) : null}
									</TabsTrigger>
								);
							})}
						</TabsList>
					</div>
					<div
						data-testid="mobile-account-tabs-fade"
						aria-hidden="true"
						className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-linear-to-r from-transparent to-modal"
					/>
				</div>
				{!isConnected ? (
					<EmptyState activeTab={activeTab} description={emptyDescription} />
				) : (
					<>
						<TabsContent value="balances" className={tabContentClass}>
							{balancesContent}
						</TabsContent>
						<TabsContent value="positions" className={tabContentClass}>
							<MobilePositionsTab scrollMode={scrollMode} disclosureState={positionDisclosureState} />
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

function resolveMobilePositionsTab(value: string, hasTransfersTab: boolean): TabValue {
	if (hasTransfersTab && value === PORTFOLIO_TRANSFERS_TAB.value) return PORTFOLIO_TRANSFERS_TAB.value;
	return MOBILE_POSITIONS_TAB_VALUES.has(value) ? (value as TabValue) : "positions";
}

function EmptyState({ activeTab, description }: { activeTab: TabValue; description?: ReactNode }) {
	const [walletModalOpen, setWalletModalOpen] = useState(false);
	const defaultDescription = getDisconnectedDescription(activeTab);

	return (
		<>
			<div className="h-full flex flex-col items-center justify-center gap-2.5 p-3 text-center">
				<div className="size-10 rounded-full flex items-center justify-center bg-surface">
					<WalletIcon className="size-5 text-fg-muted" />
				</div>
				<p className="text-xs text-fg-muted max-w-xs text-pretty">{description ?? defaultDescription}</p>
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

function getDisconnectedDescription(activeTab: TabValue): ReactNode {
	if (activeTab === "balances") return <Trans>Connect your wallet to view balances.</Trans>;
	if (activeTab === "orders") return <Trans>Connect your wallet to view open orders.</Trans>;
	if (activeTab === "twap") return <Trans>Connect your wallet to view TWAP orders.</Trans>;
	if (activeTab === "history") return <Trans>Connect your wallet to view trade history.</Trans>;
	if (activeTab === "funding") return <Trans>Connect your wallet to view funding payments.</Trans>;
	if (activeTab === "orders-history") return <Trans>Connect your wallet to view order history.</Trans>;
	if (activeTab === "transfers") return <Trans>Connect your wallet to view deposits and withdrawals.</Trans>;
	return <Trans>Connect your wallet to view positions.</Trans>;
}
