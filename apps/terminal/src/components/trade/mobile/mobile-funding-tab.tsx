import { Select } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { FUNDING_SKELETON_DELAY_MS } from "@/config/trade";
import { getToolbarAbsoluteSize, getToolbarFundingTotal } from "@/domain/trade/trading-toolbar-metrics";
import { useFundingHistoryCsvExport } from "@/hooks/trade/use-history-csv-export";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useUserFunding } from "@/hooks/trade/use-user-funding";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { buildCsvRows } from "@/lib/csv";
import { formatDateTimeShort, formatPercent, formatToken, formatUSD } from "@/lib/format";
import { useHyperliquid, useMarkets } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import {
	type FundingHistorySideFilter,
	getFundingHistorySide,
	isFundingHistorySideFilter,
} from "@/lib/trade/funding-history";
import { isMalformedHistoryPageError } from "@/lib/trade/history-pagination";
import { getUserFundingKey } from "@/lib/trade/user-funding";
import { getMarketCloseValueColorClass } from "@/lib/ui/value-color";
import { MobileBulkDisclosureActions } from "./mobile-bulk-disclosure-actions";
import { MobileDisclosureHeader } from "./mobile-disclosure-header";
import type { MobileDataScrollMode } from "./mobile-positions-view";
import { MobileProgressiveList } from "./mobile-progressive-list";
import { type MobileDisclosureSetState, useMobileDisclosureSet } from "./use-mobile-disclosure-set";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

interface Props {
	className?: string;
	disclosureState?: MobileDisclosureSetState;
	scrollMode?: MobileDataScrollMode;
}

const filterTriggerClassName =
	"relative h-[27px] min-h-0 !rounded-[7px] border-market-close-stroke-card bg-modal text-xs leading-4 text-market-close-muted after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] focus-visible:border-market-close-focus focus-visible:outline-none active:not-data-disabled:scale-100 data-popup-open:border-market-close-control data-popup-open:text-market-close-fg";
const footerActionClassName =
	"relative inline-flex h-[38px] min-h-0 items-center text-xs text-market-close-muted transition-colors duration-[120ms] after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] active:text-market-close-fg focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus disabled:cursor-not-allowed disabled:text-market-close-subtle";
interface FundingLoadingStateProps {
	className?: string;
	isPageScroll: boolean;
}

function FundingLoadingState({ className, isPageScroll }: FundingLoadingStateProps) {
	const { t } = useLingui();
	const [showSkeleton, setShowSkeleton] = useState(false);

	useEffect(() => {
		const timeoutId = window.setTimeout(() => setShowSkeleton(true), FUNDING_SKELETON_DELAY_MS);
		return () => window.clearTimeout(timeoutId);
	}, []);

	return (
		<div
			className={cn(
				"font-market-close min-h-64 flex min-w-0 flex-col",
				isPageScroll ? "min-h-64" : "flex-1",
				className,
			)}
		>
			<output aria-live="polite" className="sr-only">
				{t`Loading funding payments.`}
			</output>
			{showSkeleton ? (
				<div data-testid="funding-loading-skeleton" className="min-h-64 flex-1">
					<Skeleton name="funding-tab" loading>
						<div className="min-h-64 w-full" />
					</Skeleton>
				</div>
			) : null}
		</div>
	);
}

export function MobileFundingTab(props: Props) {
	const { address, isConnected } = useWalletSession();
	const { env } = useHyperliquid();
	const hasConnectedOwner = isConnected && !!address;
	const ownerKey = hasConnectedOwner ? address.toLowerCase() : "disconnected";

	return (
		<MobileFundingTabContent
			key={ownerKey}
			address={hasConnectedOwner ? address : undefined}
			disclosureIdentity={`${env}:${ownerKey}`}
			isConnected={hasConnectedOwner}
			{...props}
		/>
	);
}

interface MobileFundingTabContentProps extends Props {
	address?: `0x${string}`;
	disclosureIdentity: string;
	isConnected: boolean;
}

function MobileFundingTabContent({
	address,
	className,
	disclosureIdentity,
	disclosureState,
	isConnected,
	scrollMode = "contained",
}: MobileFundingTabContentProps) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const navigateToMarket = useMarketNavigation();
	const { setActiveTab } = useMobileTerminalTab();
	const { error, fundings: updates, isOffline, isStale, status } = useUserFunding();
	const markets = useMarkets();
	const malformedHistory = isMalformedHistoryPageError(error);
	const [directionFilter, setDirectionFilter] = useState<FundingHistorySideFilter>("all");

	const filteredUpdates = updates.filter(
		(update) => directionFilter === "all" || getFundingHistorySide(update.szi) === directionFilter,
	);
	const filteredUpdateKeys = filteredUpdates.map(getUserFundingKey);
	const disclosure = useMobileDisclosureSet(disclosureIdentity, filteredUpdateKeys, disclosureState);
	const { expandedKeys, setExpanded } = disclosure;
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

	const { exportCsv, isExporting } = useFundingHistoryCsvExport({
		filename: "funding_history.csv",
		buildRows: (fundings) =>
			buildCsvRows(fundings, [
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
	});
	const exportFooter = (
		<div className="flex h-[38px] shrink-0 items-center gap-4 px-3.5" data-testid="mobile-funding-history-footer">
			{address ? (
				<Link to="/fundingHistory/$address" params={{ address }} className={footerActionClassName}>
					{t`View all`}
				</Link>
			) : null}
			<button type="button" disabled={isExporting} onClick={() => void exportCsv()} className={footerActionClassName}>
				{t`Export CSV`}
			</button>
		</div>
	);
	const updateWarning =
		error || isOffline || isStale ? (
			<output
				aria-live="polite"
				className="flex h-8 shrink-0 items-center border-b border-market-close-stroke-card px-3.5 text-xs text-market-close-danger"
			>
				{isOffline ? t`You are offline.` : t`Funding updates paused.`}
			</output>
		) : null;

	if (!isConnected) {
		return (
			<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">
				{t`Connect your wallet to view funding payments.`}
			</div>
		);
	}

	if (status === "offline") {
		return (
			<div className={cn("font-market-close min-h-0 flex flex-1 flex-col", className)}>
				<output
					aria-live="polite"
					className="flex flex-1 items-center justify-center p-6 text-center text-sm text-market-close-muted"
				>
					{t`You are offline. Funding payments will load when the connection returns.`}
				</output>
				{exportFooter}
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className={cn("font-market-close min-h-0 flex flex-1 flex-col", className)}>
				<div className="flex flex-1 flex-col items-center justify-center p-6 text-sm text-market-close-danger">
					<span>{t`Failed to load funding payments.`}</span>
					{malformedHistory ? (
						<span className="mt-1 text-center text-xs text-market-close-muted">
							{t`Funding data could not be validated. Refresh and try again.`}
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
				{updateWarning}
				<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">
					{t`No funding payments found.`}
				</div>
				{exportFooter}
			</div>
		);
	}

	if (status === "loading" || status === "idle") {
		return <FundingLoadingState className={className} isPageScroll={isPageScroll} />;
	}

	return (
		<div className={cn("font-market-close min-h-0 flex flex-col", isPageScroll ? "min-h-0" : "flex-1", className)}>
			{updateWarning}
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
							if (isFundingHistorySideFilter(value)) setDirectionFilter(value);
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
				<MobileBulkDisclosureActions keys={filteredUpdateKeys} controller={disclosure} className="ms-auto ps-3" />
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
							visibleUpdates.map((update) => {
								const marketName = update.coin;
								const cardKey = getUserFundingKey(update);
								const detailsId = `mobile-funding-history-${cardKey}`;
								const isExpanded = expandedKeys.has(cardKey);
								const market = markets.getMarket(update.coin);
								const fundingDirection = getFundingHistorySide(update.szi);
								const positionDisplay = formatToken(getToolbarAbsoluteSize(update.szi), {
									decimals: market?.szDecimals,
									symbol: market?.shortName,
								});

								function handleToggle() {
									setExpanded(cardKey, !isExpanded);
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
											className="h-[54px] grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_16px] gap-2.5 px-3.5"
										>
											<button
												type="button"
												onClick={() => handleSelectMarket(marketName)}
												aria-label={t`Switch to ${marketName} market`}
												className="pointer-events-auto relative z-10 flex min-h-11 min-w-0 flex-col justify-center text-left focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-focus"
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
	);
}
