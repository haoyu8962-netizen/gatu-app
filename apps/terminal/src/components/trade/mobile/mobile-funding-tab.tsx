import { useLingui } from "@lingui/react/macro";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { Skeleton } from "boneyard-js/react";
import { useState } from "react";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { MAX_HISTORY_ROWS } from "@/config/trade";
import { getToolbarAbsoluteSize, getToolbarFundingTotal } from "@/domain/trade/trading-toolbar-metrics";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { buildCsvRows, downloadCsv } from "@/lib/csv";
import { formatDateTimeShort, formatPercent, formatToken, formatUSD } from "@/lib/format";
import { useMarkets, useSubscription } from "@/lib/hyperliquid";
import { toNumber } from "@/lib/trade/numbers";
import { getMarketCloseValueColorClass } from "@/lib/ui/value-color";
import { MobileDisclosureHeader } from "./mobile-disclosure-header";
import type { MobileDataScrollMode } from "./mobile-positions-view";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

interface Props {
	className?: string;
	scrollMode?: MobileDataScrollMode;
}

export function MobileFundingTab({ className, scrollMode = "contained" }: Props) {
	const { t } = useLingui();
	const { address, isConnected } = useWalletSession();
	const navigateToMarket = useMarketNavigation();
	const { setActiveTab } = useMobileTerminalTab();
	const {
		data: fundingEvent,
		status,
		error,
	} = useSubscription("userFundings", { user: address ?? "0x0" }, { enabled: isConnected && !!address });
	const markets = useMarkets();
	const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>({});

	const updates = fundingEvent?.fundings?.slice(0, MAX_HISTORY_ROWS).sort((a, b) => b.time - a.time) ?? [];
	const totalFunding = getToolbarFundingTotal(updates);
	const headerTotal =
		isConnected && status === "active"
			? formatUSD(totalFunding, { signDisplay: "exceptZero" })
			: FALLBACK_VALUE_PLACEHOLDER;
	const headerClass = getMarketCloseValueColorClass(totalFunding);
	const isPageScroll = scrollMode === "page";

	function handleSelectMarket(name: string) {
		navigateToMarket(name, undefined, { displayedContent: "trade" });
		setActiveTab("trade");
	}

	function handleSetAllExpanded(expanded: boolean) {
		setExpandedByKey(
			Object.fromEntries(
				updates.map((update) => [
					`${update.coin}-${update.time}-${update.szi}-${update.fundingRate}-${update.usdc}`,
					expanded,
				]),
			),
		);
	}

	function handleExportCsv() {
		downloadCsv(
			"funding_history.csv",
			buildCsvRows(updates, [
				{ header: t`Time`, getValue: (update) => formatDateTimeShort(update.time) },
				{ header: t`Asset`, getValue: (update) => update.coin },
				{
					header: t`Position`,
					getValue: (update) => {
						const market = markets.getMarket(update.coin);
						return formatToken(getToolbarAbsoluteSize(update.szi), {
							decimals: market?.szDecimals,
							symbol: market?.shortName,
						});
					},
				},
				{
					header: t`Rate`,
					getValue: (update) =>
						formatPercent(update.fundingRate, { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
				},
				{ header: t`Payment`, getValue: (update) => formatToken(update.usdc, { symbol: "USDC" }) },
			]),
		);
	}

	if (!isConnected) {
		return (
			<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">
				{t`Connect your wallet to view funding payments.`}
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className="flex flex-1 flex-col items-center justify-center p-6 text-sm text-market-close-danger">
				<span>{t`Failed to load funding history.`}</span>
				{error instanceof Error && <span className="mt-1 text-xs text-market-close-muted">{error.message}</span>}
			</div>
		);
	}

	if (status === "active" && updates.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">
				{t`No funding payments found.`}
			</div>
		);
	}

	return (
		<Skeleton name="funding-tab" loading={status === "subscribing" || status === "idle"}>
			<div className={cn("font-market-close min-h-0 flex flex-col", isPageScroll ? "min-h-0" : "flex-1", className)}>
				<div className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-market-close-stroke-card px-3.5">
					<span className="min-w-0 flex-1 truncate text-[11px] text-market-close-muted">
						{t`Cumulative funding`} <span className={cn("font-semibold tabular-nums", headerClass)}>{headerTotal}</span>
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
					{updates.map((update, index) => {
						const marketName = update.coin;
						const cardKey = `${update.coin}-${update.time}-${update.szi}-${update.fundingRate}-${update.usdc}`;
						const detailsId = `mobile-funding-history-${cardKey}`;
						const isExpanded = expandedByKey[cardKey] ?? index === 0;
						const market = markets.getMarket(update.coin);
						const szi = toNumber(update.szi);
						const rate = toNumber(update.fundingRate);
						const usdc = toNumber(update.usdc);
						const positionDisplay = formatToken(getToolbarAbsoluteSize(update.szi), {
							decimals: market?.szDecimals,
							symbol: market?.shortName,
						});

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
											{formatDateTimeShort(update.time)}
										</div>
									</div>
									<div className="min-w-0">
										<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Position`}</div>
										<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
											{positionDisplay}
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
														szi === null || szi === 0
															? "text-market-close-muted"
															: szi > 0
																? "text-market-close-success"
																: "text-market-close-danger",
													)}
												>
													{szi === null || szi === 0 ? FALLBACK_VALUE_PLACEHOLDER : szi > 0 ? t`Long` : t`Short`}
												</div>
											</div>
											<div className="min-w-0">
												<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Payment`}</div>
												<div
													className={cn(
														"truncate whitespace-nowrap text-xs font-semibold leading-[17px] tabular-nums",
														getMarketCloseValueColorClass(usdc),
													)}
												>
													{formatToken(usdc, { symbol: "USDC" })}
												</div>
											</div>
											<div className="min-w-0">
												<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Rate`}</div>
												<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
													{formatPercent(rate, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
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
					<div className="flex shrink-0 items-center gap-4" data-testid="mobile-funding-history-footer">
						<button
							type="button"
							onClick={handleExportCsv}
							className="inline-flex min-h-11 items-center gap-1.5 text-xs text-market-close-muted transition-colors duration-[120ms] active:text-market-close-fg focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
						>
							<DownloadSimpleIcon className="size-3.5" aria-hidden="true" />
							{t`Export CSV`}
						</button>
					</div>
				</div>
			</div>
		</Skeleton>
	);
}
