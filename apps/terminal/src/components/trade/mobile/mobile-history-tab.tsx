import { Plural, useLingui } from "@lingui/react/macro";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { Skeleton } from "boneyard-js/react";
import { useState } from "react";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useUserFills } from "@/hooks/trade/use-user-fills";
import { cn } from "@/lib/cn";
import { formatDateTimeShort, formatNumber, formatToken, formatUSD } from "@/lib/format";
import { getExplorerTxUrl, useMarkets } from "@/lib/hyperliquid";
import { toNumber } from "@/lib/trade/numbers";
import { getMarketCloseValueColorClass } from "@/lib/ui/value-color";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { MobileDisclosureHeader } from "./mobile-disclosure-header";
import type { MobileDataScrollMode } from "./mobile-positions-view";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

interface Props {
	className?: string;
	scrollMode?: MobileDataScrollMode;
}

export function MobileHistoryTab({ className, scrollMode = "contained" }: Props) {
	const { t } = useLingui();
	const { error, fills, isConnected, status } = useUserFills();
	const navigateToMarket = useMarketNavigation();
	const { setActiveTab } = useMobileTerminalTab();
	const markets = useMarkets();
	const isTestnet = useIsTestnet();
	const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>({});

	const headerCount = isConnected ? (
		<Plural value={fills.length} one="# trade" other="# trades" />
	) : (
		FALLBACK_VALUE_PLACEHOLDER
	);
	const isPageScroll = scrollMode === "page";

	function handleSelectMarket(name: string) {
		navigateToMarket(name, undefined, { displayedContent: "trade" });
		setActiveTab("trade");
	}

	function handleSetAllExpanded(expanded: boolean) {
		setExpandedByKey(Object.fromEntries(fills.map((fill) => [`${fill.hash}-${fill.tid}`, expanded])));
	}

	if (!isConnected) {
		return (
			<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">
				{t`Connect your wallet to view trade history.`}
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className="flex flex-1 flex-col items-center justify-center p-6 text-sm text-market-close-danger">
				<span>{t`Failed to load trade history.`}</span>
				{error instanceof Error && <span className="mt-1 text-xs text-market-close-muted">{error.message}</span>}
			</div>
		);
	}

	if (status === "ready" && fills.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">
				{t`No fills found.`}
			</div>
		);
	}

	return (
		<Skeleton name="history-tab" loading={status === "loading" || status === "idle"}>
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
					{fills.map((fill, index) => {
						const marketName = fill.coin;
						const cardKey = `${fill.hash}-${fill.tid}`;
						const detailsId = `mobile-trade-history-${fill.hash}-${fill.tid}`;
						const isExpanded = expandedByKey[cardKey] ?? index === 0;
						const closedPnl = toNumber(fill.closedPnl);
						const showPnl = closedPnl !== null && closedPnl !== 0;
						const isLiquidation = !!fill.liquidation;
						const isBuy = fill.dir.startsWith("Open Long") || fill.dir.startsWith("Close Short");
						const directionLabel =
							fill.dir === "Open Long"
								? t`Open Long`
								: fill.dir === "Close Long"
									? t`Close Long`
									: fill.dir === "Open Short"
										? t`Open Short`
										: fill.dir === "Close Short"
											? t`Close Short`
											: fill.dir;
						const explorerUrl = getExplorerTxUrl(fill.hash, isTestnet);
						const sizeDisplay = formatNumber(fill.sz, markets.getSzDecimals(fill.coin));

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
										aria-label={t`Switch to ${marketName} market`}
										className="pointer-events-auto relative z-10 flex min-h-11 min-w-0 flex-col justify-center text-left focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-control"
									>
										<span className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Market`}</span>
										<span className="truncate text-xs font-bold leading-[17px] text-market-close-fg">{marketName}</span>
									</button>
									<div className="min-w-0">
										<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Time`}</div>
										<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
											{formatDateTimeShort(fill.time)}
										</div>
									</div>
									<div className="min-w-0">
										<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Size`}</div>
										<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
											{sizeDisplay} {marketName}
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
														isLiquidation
															? "text-market-close-danger"
															: isBuy
																? "text-market-close-success"
																: "text-market-close-danger",
													)}
												>
													{isLiquidation ? t`Liquidated` : directionLabel}
												</div>
											</div>
											<div className="min-w-0">
												<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Price`}</div>
												<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
													{formatUSD(fill.px)}
												</div>
											</div>
											<div className="min-w-0">
												<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Size`}</div>
												<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
													{sizeDisplay}
												</div>
											</div>
											<div className="min-w-0">
												<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Realized PNL`}</div>
												<div
													className={cn(
														"truncate whitespace-nowrap text-xs font-semibold leading-[17px] tabular-nums",
														showPnl ? getMarketCloseValueColorClass(closedPnl) : "text-market-close-muted",
													)}
												>
													{showPnl ? formatUSD(closedPnl, { signDisplay: "exceptZero" }) : FALLBACK_VALUE_PLACEHOLDER}
												</div>
											</div>
											<div className="min-w-0">
												<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Fee`}</div>
												<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
													{formatToken(fill.fee, { symbol: fill.feeToken })}
												</div>
											</div>
										</div>
										<div className="flex min-h-11 items-center justify-between border-t border-market-close-stroke-card">
											{explorerUrl ? (
												<a
													href={explorerUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-market-close-fg focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-control"
												>
													{t`Explorer`}
													<ArrowSquareOutIcon className="size-3" aria-hidden="true" />
												</a>
											) : (
												<span />
											)}
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
