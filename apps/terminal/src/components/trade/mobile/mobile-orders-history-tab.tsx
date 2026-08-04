import { Plural, useLingui } from "@lingui/react/macro";
import { Skeleton } from "boneyard-js/react";
import { useState } from "react";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { isCanceledOrderStatus } from "@/domain/trade/order-tracking";
import { useHistoricalOrders } from "@/hooks/trade/use-historical-orders";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { cn } from "@/lib/cn";
import { formatDateTime, formatToken } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { HistoricalOrderPrice } from "../components/historical-order-price";
import { MobileDisclosureHeader } from "./mobile-disclosure-header";
import type { MobileDataScrollMode } from "./mobile-positions-view";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

interface Props {
	className?: string;
	scrollMode?: MobileDataScrollMode;
}

export function MobileOrdersHistoryTab({ className, scrollMode = "contained" }: Props) {
	const { t } = useLingui();
	const { getHistoricalOrderStatusLabel, getOrderSideLabel, getOrderTypeLabel } = useOrderDisplayLabels();
	const { error, isConnected, orders, status } = useHistoricalOrders();
	const navigateToMarket = useMarketNavigation();
	const { setActiveTab } = useMobileTerminalTab();
	const markets = useMarkets();
	const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>({});

	const headerCount = isConnected ? (
		<Plural value={orders.length} one="# order" other="# orders" />
	) : (
		FALLBACK_VALUE_PLACEHOLDER
	);
	const isPageScroll = scrollMode === "page";

	function handleSelectMarket(name: string) {
		navigateToMarket(name, undefined, { displayedContent: "trade" });
		setActiveTab("trade");
	}

	function handleSetAllExpanded(expanded: boolean) {
		setExpandedByKey(
			Object.fromEntries(orders.map((entry) => [`${entry.order.oid}-${entry.statusTimestamp}`, expanded])),
		);
	}

	if (!isConnected) {
		return (
			<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">
				{t`Connect your wallet to view order history.`}
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className="flex flex-1 flex-col items-center justify-center p-6 text-sm text-market-close-danger">
				<span>{t`Failed to load order history.`}</span>
				{error instanceof Error && <span className="mt-1 text-xs text-market-close-muted">{error.message}</span>}
			</div>
		);
	}

	if (status === "ready" && orders.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">
				{t`No order history found.`}
			</div>
		);
	}

	return (
		<Skeleton name="orders-history-tab" loading={status === "loading" || status === "idle"}>
			<div className={cn("font-market-close min-h-0 flex flex-col", isPageScroll ? "min-h-0" : "flex-1", className)}>
				<div className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-market-close-stroke-card px-3.5">
					<span className="min-w-0 flex-1 truncate text-[11px] text-market-close-muted tabular-nums">
						{headerCount}
					</span>
					<div className="flex shrink-0 items-center gap-3">
						<button
							type="button"
							onClick={() => handleSetAllExpanded(true)}
							className="min-h-11 whitespace-nowrap text-xs font-semibold text-market-close-fg focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-control"
						>
							{t`Expand all`}
						</button>
						<button
							type="button"
							onClick={() => handleSetAllExpanded(false)}
							className="min-h-11 whitespace-nowrap text-xs text-market-close-muted focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-control"
						>
							{t`Collapse all`}
						</button>
					</div>
				</div>
				<div
					className={cn(
						"flex flex-col gap-2.5 px-3.5 py-3",
						!isPageScroll && "min-h-0 flex-1 overflow-y-auto overscroll-y-contain",
					)}
				>
					{orders.map((entry, index) => {
						const { order } = entry;
						const marketName = order.coin;
						const cardKey = `${order.oid}-${entry.statusTimestamp}`;
						const detailsId = `mobile-order-history-${order.oid}-${entry.statusTimestamp}`;
						const isExpanded = expandedByKey[cardKey] ?? index === 0;
						const market = markets.getMarket(order.coin);
						const isLong = order.side === "B";
						const orderTypeLabel = getOrderTypeLabel(order.orderType);

						function handleToggle() {
							setExpandedByKey((current) => ({ ...current, [cardKey]: !isExpanded }));
						}

						return (
							<article
								key={cardKey}
								className="overflow-hidden rounded-[14px] border border-market-close-stroke-card bg-modal"
							>
								<MobileDisclosureHeader
									expanded={isExpanded}
									label={
										isExpanded ? t`Collapse ${marketName} history details` : t`Expand ${marketName} history details`
									}
									controls={detailsId}
									onToggle={handleToggle}
									className="min-h-[54px] grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_16px] gap-2.5 px-3.5"
								>
									<button
										type="button"
										onClick={() => handleSelectMarket(marketName)}
										aria-label={
											isLong
												? t`Switch to ${marketName} market, long order`
												: t`Switch to ${marketName} market, short order`
										}
										className="pointer-events-auto relative z-10 flex min-h-11 min-w-0 flex-col justify-center text-left focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-control"
									>
										<span className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Market`}</span>
										<span className="truncate text-xs font-bold leading-[17px] text-market-close-fg">{marketName}</span>
									</button>
									<div className="min-w-0">
										<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Time`}</div>
										<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
											{formatDateTime(order.timestamp, { dateStyle: "short", timeStyle: "short" })}
										</div>
									</div>
									<div className="min-w-0">
										<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Type`}</div>
										<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg">
											{orderTypeLabel}
										</div>
									</div>
								</MobileDisclosureHeader>

								{isExpanded ? (
									<div id={detailsId} className="flex flex-col gap-2.5 px-3.5 py-3">
										<div className="grid min-w-0 grid-cols-3 gap-x-2.5 gap-y-3">
											<div className="min-w-0">
												<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">
													{t`Direction`}
												</div>
												<div
													className={cn(
														"truncate whitespace-nowrap text-xs font-semibold leading-[17px]",
														isLong ? "text-market-close-success" : "text-market-close-danger",
													)}
												>
													{getOrderSideLabel(order.side, market?.kind)}
												</div>
											</div>
											<div className="min-w-0">
												<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Price`}</div>
												<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
													<HistoricalOrderPrice align="start" order={order} />
												</div>
											</div>
											<div className="min-w-0">
												<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Size`}</div>
												<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
													{formatToken(order.origSz, market?.szDecimals)}
												</div>
											</div>
											<div className="min-w-0">
												<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Status`}</div>
												<div
													className={cn(
														"inline-flex max-w-full truncate rounded-[4px] px-[7px] py-0.5 text-[10px] font-bold",
														entry.status === "filled"
															? "bg-success-soft text-success"
															: isCanceledOrderStatus(entry.status)
																? "bg-error-soft text-error"
																: "bg-market-close-hover text-market-close-muted",
													)}
												>
													{getHistoricalOrderStatusLabel(entry.status)}
												</div>
											</div>
											<div className="col-span-2 min-w-0">
												<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Updated`}</div>
												<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
													{formatDateTime(entry.statusTimestamp, { dateStyle: "short", timeStyle: "short" })}
												</div>
											</div>
										</div>
										<div className="flex min-h-11 items-center justify-end border-t border-market-close-stroke-card">
											<button
												type="button"
												aria-label={t`Collapse ${marketName} history details`}
												aria-controls={detailsId}
												onClick={handleToggle}
												className="-mr-3.5 inline-flex size-11 shrink-0 items-center justify-center rounded-xs text-market-close-subtle focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-control"
											>
												<svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
													<path
														d="M3.5 10 8 5.5l4.5 4.5"
														stroke="currentColor"
														strokeWidth="1.5"
														strokeLinecap="round"
														strokeLinejoin="round"
													/>
												</svg>
											</button>
										</div>
									</div>
								) : null}
							</article>
						);
					})}
				</div>
			</div>
		</Skeleton>
	);
}
