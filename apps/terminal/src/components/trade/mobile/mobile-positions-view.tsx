import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { WalletIcon } from "@phosphor-icons/react";
import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";
import { HL_ALL_DEXS } from "@/config/app";
import { MOBILE_POSITIONS_TABS, type MobilePositionsTabValue } from "@/config/trade";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { useSubscription, useUserPositions } from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { toNumber } from "@/lib/trade/numbers";
import { useGlobalSettingsActions, usePositionsActiveTab } from "@/stores/use-global-settings-store";
import { MobileBalancesTab } from "./mobile-balances-tab";
import { MobileBottomNavSpacer } from "./mobile-bottom-nav";
import { MobileFundingTab } from "./mobile-funding-tab";
import { MobileHistoryTab } from "./mobile-history-tab";
import { MobileOrdersHistoryTab } from "./mobile-orders-history-tab";
import { MobileOrdersTab } from "./mobile-orders-tab";
import { MobilePositionsTab } from "./mobile-positions-tab";
import { MobileTwapTab } from "./mobile-twap-tab";

type TabValue = MobilePositionsTabValue;
export type MobileDataScrollMode = "contained" | "page";

const PAGE_SCROLL_OVERFLOW_THRESHOLD_PX = 24;
const WalletModal = createLazyComponent(() => import("../components/wallet-modal"), "WalletModal");

interface Props {
	className?: string;
	scrollMode?: MobileDataScrollMode;
	onNeedsPageScrollChange?: (needsPageScroll: boolean) => void;
}

export function MobilePositionsView({ className, scrollMode = "contained", onNeedsPageScrollChange }: Props) {
	const { i18n } = useLingui();
	const activeTab = usePositionsActiveTab() as TabValue;
	const { setPositionsActiveTab } = useGlobalSettingsActions();
	const [isPending, startTransition] = useTransition();
	const { address, isConnected } = useWalletSession();
	const { positions, isLoading: isLoadingState } = useUserPositions();
	const isPageScroll = scrollMode === "page";
	const contentViewportRef = useRef<HTMLDivElement>(null);

	const { data: ordersEvent, status: ordersStatus } = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const openOrders = ordersEvent?.orders;
	const isLoadingOrders = ordersStatus === "subscribing" || ordersStatus === "idle";

	const positionsCount = isConnected
		? positions.reduce((count, entry) => {
				const size = toNumber(entry.szi);
				return size ? count + 1 : count;
			}, 0)
		: 0;

	const ordersCount = isConnected ? (openOrders?.length ?? 0) : 0;

	function handleTabChange(value: string) {
		startTransition(() => setPositionsActiveTab(value));
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

	useEffect(() => {
		void activeTab;
		if (!onNeedsPageScrollChange) return;
		if (!isConnected) {
			onNeedsPageScrollChange(false);
			return;
		}
		if (isPageScroll) return;

		const container = contentViewportRef.current;
		if (!container) return;

		let frame = 0;
		const measure = () => {
			if (frame) cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				frame = 0;
				onNeedsPageScrollChange(hasActiveTabOverflow(container));
			});
		};

		measure();

		const resizeObserver =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver(() => {
						measure();
					});
		resizeObserver?.observe(container);

		const mutationObserver =
			typeof MutationObserver === "undefined"
				? null
				: new MutationObserver(() => {
						measure();
					});
		mutationObserver?.observe(container, { childList: true, subtree: true, characterData: true });

		window.addEventListener("resize", measure);

		return () => {
			if (frame) cancelAnimationFrame(frame);
			resizeObserver?.disconnect();
			mutationObserver?.disconnect();
			window.removeEventListener("resize", measure);
		};
	}, [activeTab, isConnected, isPageScroll, onNeedsPageScrollChange]);

	return (
		<div className={cn(isPageScroll ? "min-h-0 flex flex-col" : "flex-1 min-h-0 flex flex-col", className)}>
			<Tabs
				value={activeTab}
				onValueChange={handleTabChange}
				size="xxs"
				className={cn(isPageScroll ? "min-h-0 flex flex-col" : "flex-1 min-h-0 flex flex-col")}
			>
				<div className="shrink-0 min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					<TabsList className="w-full min-w-max justify-between px-1">
						{MOBILE_POSITIONS_TABS.map((tab) => {
							const count = getTabCount(tab.value);
							const loading = isTabLoading(tab.value);

							return (
								<TabsTrigger key={tab.value} value={tab.value} className="shrink-0 px-1 text-[10px] leading-7">
									<span>{i18n._(tab.label)}</span>
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
				<div
					ref={contentViewportRef}
					className={cn(isPageScroll ? "min-h-0 overflow-visible" : "flex-1 min-h-0 overflow-y-auto")}
				>
					{!isConnected ? (
						<EmptyState />
					) : (
						<>
							<TabsContent value="positions" className={tabContentClass}>
								<MobilePositionsTab scrollMode={scrollMode} />
							</TabsContent>
							<TabsContent value="orders" className={tabContentClass}>
								<MobileOrdersTab scrollMode={scrollMode} />
							</TabsContent>
							<TabsContent value="balances" className={tabContentClass}>
								<MobileBalancesTab scrollMode={scrollMode} />
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
						</>
					)}
					<MobileBottomNavSpacer />
				</div>
			</Tabs>
		</div>
	);
}

function hasActiveTabOverflow(container: HTMLDivElement) {
	const activePanel = Array.from(container.children).find((child): child is HTMLElement => {
		if (!(child instanceof HTMLElement)) return false;
		if (child.hidden || child.hasAttribute("hidden")) return false;
		return child.getBoundingClientRect().height > 0;
	});

	if (!activePanel) {
		return container.scrollHeight > container.clientHeight + PAGE_SCROLL_OVERFLOW_THRESHOLD_PX;
	}

	if (activePanel.scrollHeight > container.clientHeight + PAGE_SCROLL_OVERFLOW_THRESHOLD_PX) return true;

	const scrollableDescendants = Array.from(activePanel.querySelectorAll("*")).filter(
		(element): element is HTMLElement => element instanceof HTMLElement,
	);

	return scrollableDescendants.some((element) => {
		const overflowY = getComputedStyle(element).overflowY;
		if (overflowY !== "auto" && overflowY !== "scroll") return false;
		return element.scrollHeight > element.clientHeight + PAGE_SCROLL_OVERFLOW_THRESHOLD_PX;
	});
}

function EmptyState() {
	const [walletModalOpen, setWalletModalOpen] = useState(false);

	return (
		<>
			<div className="h-full flex flex-col items-center justify-center gap-2.5 p-3 text-center">
				<div className="size-10 rounded-full flex items-center justify-center bg-surface">
					<WalletIcon className="size-5 text-fg-muted" />
				</div>
				<p className="text-xs text-fg-muted max-w-xs text-pretty">{t`Connect wallet to view positions`}</p>
				<Button variant="outline" intent="brand" size="sm" onClick={() => setWalletModalOpen(true)}>
					{t`Connect Wallet`}
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
