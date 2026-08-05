import { Select } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { Skeleton } from "boneyard-js/react";
import { useState } from "react";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { getToolbarAbsoluteSize, getToolbarFundingTotal } from "@/domain/trade/trading-toolbar-metrics";
import { useFundingHistoryCsvExport } from "@/hooks/trade/use-history-csv-export";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useUserFunding } from "@/hooks/trade/use-user-funding";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { buildCsvRows } from "@/lib/csv";
import { formatDateTimeShort, formatPercent, formatToken, formatUSD } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { isIncompleteHistorySnapshotError, isMalformedHistoryPageError } from "@/lib/trade/history-pagination";
import { toBig } from "@/lib/trade/numbers";
import { getMarketCloseValueColorClass } from "@/lib/ui/value-color";
import { MobileDisclosureHeader } from "./mobile-disclosure-header";
import type { MobileDataScrollMode } from "./mobile-positions-view";
import { MobileProgressiveList } from "./mobile-progressive-list";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

interface Props {
	className?: string;
	scrollMode?: MobileDataScrollMode;
}

type FundingDirectionFilter = "all" | "long" | "short";

const filterTriggerClassName =
	"relative h-[27px] min-h-0 !rounded-[7px] border-market-close-stroke-card bg-modal text-xs leading-4 text-market-close-muted after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] focus-visible:border-market-close-control focus-visible:outline-none active:not-data-disabled:scale-100 data-popup-open:border-market-close-control data-popup-open:text-market-close-fg";
const filterActionClassName =
	"relative inline-flex h-[27px] min-h-0 items-center whitespace-nowrap text-xs after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-control active:scale-100";
const footerActionClassName =
	"relative inline-flex h-[38px] min-h-0 items-center text-xs text-market-close-muted transition-colors duration-[120ms] after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] active:text-market-close-fg focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:text-market-close-subtle";

function getFundingDirection(szi: string): Exclude<FundingDirectionFilter, "all"> | null {
	const size = toBig(szi);
	if (!size || size.eq(0)) return null;
	return size.gt(0) ? "long" : "short";
}

function isFundingDirectionFilter(value: string | null): value is FundingDirectionFilter {
	return value === "all" || value === "long" || value === "short";
}

export function MobileFundingTab(props: Props) {
	const { address, isConnected } = useWalletSession();
	const ownerKey = isConnected && address ? address.toLowerCase() : "disconnected";

	return <MobileFundingTabContent key={ownerKey} isConnected={isConnected} {...props} />;
}

interface MobileFundingTabContentProps extends Props {
	isConnected: boolean;
}

function MobileFundingTabContent({ isConnected, className, scrollMode = "contained" }: MobileFundingTabContentProps) {
	const { t } = useLingui();
	const navigateToMarket = useMarketNavigation();
	const { setActiveTab } = useMobileTerminalTab();
	const { error, fundings: updates, status } = useUserFunding();
	const markets = useMarkets();
	const historyLimitReached = isIncompleteHistorySnapshotError(error);
	const malformedHistory = isMalformedHistoryPageError(error);
	const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>({});
	const [directionFilter, setDirectionFilter] = useState<FundingDirectionFilter>("all");

	const filteredUpdates = updates.filter(
		(update) => directionFilter === "all" || getFundingDirection(update.szi) === directionFilter,
	);
	const totalFunding = getToolbarFundingTotal(filteredUpdates);
	const headerTotal =
		isConnected && status === "ready"
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
				filteredUpdates.map((update) => [
					`${update.coin}-${update.time}-${update.szi}-${update.fundingRate}-${update.usdc}`,
					expanded,
				]),
			),
		);
	}

	const { exportCsv, isExporting } = useFundingHistoryCsvExport({
		filename: "funding_history.csv",
		buildRows: (fundings) =>
			buildCsvRows(
				fundings.filter((update) => directionFilter === "all" || getFundingDirection(update.szi) === directionFilter),
				[
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
				],
			),
	});
	const exportFooter = (
		<div className="flex h-[38px] shrink-0 items-center gap-4 px-3.5" data-testid="mobile-funding-history-footer">
			<button type="button" disabled={isExporting} onClick={() => void exportCsv()} className={footerActionClassName}>
				{t`Export CSV`}
			</button>
		</div>
	);

	if (!isConnected) {
		return (
			<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">
				{t`Connect your wallet to view funding payments.`}
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className={cn("font-market-close min-h-0 flex flex-1 flex-col", className)}>
				<div className="flex flex-1 flex-col items-center justify-center p-6 text-sm text-market-close-danger">
					<span>{t`Failed to load funding history.`}</span>
					{historyLimitReached ? (
						<span className="mt-1 text-center text-xs text-market-close-muted">
							{t`Recent history exceeds the safe display limit. Export CSV to retrieve a larger range.`}
						</span>
					) : malformedHistory ? (
						<span className="mt-1 text-center text-xs text-market-close-muted">
							{t`History data could not be validated. Refresh and try again.`}
						</span>
					) : (
						error instanceof Error && <span className="mt-1 text-xs text-market-close-muted">{error.message}</span>
					)}
				</div>
				{exportFooter}
			</div>
		);
	}

	if (status === "ready" && updates.length === 0) {
		return (
			<div className={cn("font-market-close min-h-0 flex flex-1 flex-col", className)}>
				<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">
					{t`No funding payments found.`}
				</div>
				{exportFooter}
			</div>
		);
	}

	return (
		<Skeleton name="funding-tab" loading={status === "loading" || status === "idle"}>
			<div className={cn("font-market-close min-h-0 flex flex-col", isPageScroll ? "min-h-0" : "flex-1", className)}>
				<div
					data-testid="mobile-funding-history-filter-row"
					className="flex h-12 shrink-0 items-center overflow-x-auto border-b border-market-close-stroke-card px-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				>
					<div className="flex shrink-0 items-center gap-1.5">
						<Select
							size="xxs"
							label={t`Direction`}
							value={directionFilter}
							onValueChange={(value) => {
								if (isFundingDirectionFilter(value)) setDirectionFilter(value);
							}}
							options={[
								{ value: "all", label: t`All Directions` },
								{ value: "long", label: t`Long` },
								{ value: "short", label: t`Short` },
							]}
							className="w-28 shrink-0 [&>label]:sr-only"
							triggerClassName={filterTriggerClassName}
						/>
					</div>
					<span className="sr-only" aria-live="polite">
						{t`Funding shown`} <span className={cn("font-semibold tabular-nums", headerClass)}>{headerTotal}</span>
					</span>
					<div className="ml-auto flex shrink-0 items-center gap-3 pl-3">
						<button
							type="button"
							onClick={() => handleSetAllExpanded(true)}
							className={cn(filterActionClassName, "font-semibold text-market-close-fg")}
						>
							{t`Expand all`}
						</button>
						<button
							type="button"
							onClick={() => handleSetAllExpanded(false)}
							className={cn(filterActionClassName, "text-market-close-muted")}
						>
							{t`Collapse all`}
						</button>
					</div>
				</div>
				<div className={cn("min-h-0", !isPageScroll && "flex-1 overflow-y-auto overscroll-y-contain")}>
					<div className="flex flex-col gap-2.5 px-3.5 pt-3">
						{filteredUpdates.length === 0 ? (
							<div className="flex min-h-28 items-center justify-center text-center text-sm text-market-close-muted">
								{t`No funding payments match this direction.`}
							</div>
						) : null}
						<MobileProgressiveList key={directionFilter} items={filteredUpdates}>
							{(visibleUpdates) =>
								visibleUpdates.map((update, index) => {
									const marketName = update.coin;
									const cardKey = `${update.coin}-${update.time}-${update.szi}-${update.fundingRate}-${update.usdc}`;
									const detailsId = `mobile-funding-history-${cardKey}`;
									const isExpanded = expandedByKey[cardKey] ?? index === 0;
									const market = markets.getMarket(update.coin);
									const fundingDirection = getFundingDirection(update.szi);
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
													isExpanded
														? t`Collapse ${marketName} history details`
														: t`Expand ${marketName} history details`
												}
												controls={detailsId}
												onToggle={handleToggle}
												className="h-[54px] grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_16px] gap-2.5 px-3.5"
											>
												<button
													type="button"
													onClick={() => handleSelectMarket(marketName)}
													aria-label={t`Switch to ${marketName} market`}
													className="pointer-events-auto relative z-10 flex min-h-11 min-w-0 flex-col justify-center text-left focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-control"
												>
													<span className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Market`}</span>
													<span className="truncate text-xs font-bold leading-[17px] text-market-close-fg">
														{marketName}
													</span>
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
													<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-x-2.5 gap-y-3">
														<div className="min-w-0">
															<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">
																{t`Direction`}
															</div>
															<div
																className={cn(
																	"truncate whitespace-nowrap text-xs font-semibold leading-[17px]",
																	fundingDirection === null
																		? "text-market-close-muted"
																		: fundingDirection === "long"
																			? "text-market-close-success"
																			: "text-market-close-danger",
																)}
															>
																{fundingDirection === null
																	? FALLBACK_VALUE_PLACEHOLDER
																	: fundingDirection === "long"
																		? t`Long`
																		: t`Short`}
															</div>
														</div>
														<div className="min-w-0">
															<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Payment`}</div>
															<div
																className={cn(
																	"truncate whitespace-nowrap text-xs font-semibold leading-[17px] tabular-nums",
																	getMarketCloseValueColorClass(update.usdc),
																)}
															>
																{formatToken(update.usdc, { symbol: "USDC" })}
															</div>
														</div>
														<div className="min-w-0">
															<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Rate`}</div>
															<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
																{formatPercent(update.fundingRate, {
																	minimumFractionDigits: 4,
																	maximumFractionDigits: 4,
																})}
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
																	strokeWidth="2"
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
								})
							}
						</MobileProgressiveList>
					</div>
					{exportFooter}
				</div>
			</div>
		</Skeleton>
	);
}
