import { Select } from "@gatu/ui";
import { Plural, useLingui } from "@lingui/react/macro";
import type { UserFillsResponse } from "@nktkas/hyperliquid";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { MOBILE_FILTER_CHIP_CLASS } from "@/components/trade/mobile/mobile-filter-chip";
import { DataPendingState } from "@/components/ui/data-pending-state";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { RECENT_ACCOUNT_HISTORY_ROWS } from "@/config/trade";
import { getToolbarNonZeroPnl } from "@/domain/trade/trading-toolbar-metrics";
import { useUserFillsCsvExport } from "@/hooks/trade/use-history-csv-export";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useUserFills } from "@/hooks/trade/use-user-fills";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { buildCsvRows } from "@/lib/csv";
import { formatDateTimeShort, formatNumber, formatToken, formatUSD } from "@/lib/format";
import { getExplorerTxUrl, useMarkets } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { toNumber } from "@/lib/trade/numbers";
import { getUserFillKey, hasUserFillExplorerTransaction } from "@/lib/trade/user-fills";
import { getMarketCloseValueColorClass } from "@/lib/ui/value-color";
import { useIsTestnet } from "@/stores/use-global-settings-store";
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

type TradeHistoryTypeFilter = "all" | "trade" | "liquidation";
type TradeHistoryDirectionFilter = "all" | "buy" | "sell";
type TradeHistoryRoleFilter = "all" | "maker" | "taker";
type UserFill = UserFillsResponse[number];

const filterTriggerClassName = MOBILE_FILTER_CHIP_CLASS;
const footerActionClassName =
	"relative inline-flex h-[38px] min-h-0 items-center text-xs text-market-close-muted transition-colors duration-[120ms] after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] active:text-market-close-fg focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus disabled:cursor-not-allowed disabled:text-market-close-subtle";

function getTradeHistoryType(fill: UserFill): Exclude<TradeHistoryTypeFilter, "all"> {
	if (fill.liquidation) return "liquidation";
	return "trade";
}

function isTradeHistoryTypeFilter(value: string | null): value is TradeHistoryTypeFilter {
	return value === "all" || value === "trade" || value === "liquidation";
}

function isTradeHistoryDirectionFilter(value: string | null): value is TradeHistoryDirectionFilter {
	return value === "all" || value === "buy" || value === "sell";
}

function isTradeHistoryRoleFilter(value: string | null): value is TradeHistoryRoleFilter {
	return value === "all" || value === "maker" || value === "taker";
}

export function MobileHistoryTab(props: Props) {
	const { address, isConnected } = useWalletSession();
	const ownerKey = isConnected && address ? address.toLowerCase() : "disconnected";

	return <MobileHistoryTabContent key={ownerKey} address={address} ownerKey={ownerKey} {...props} />;
}

interface MobileHistoryTabContentProps extends Props {
	address?: `0x${string}`;
	ownerKey: string;
}

function MobileHistoryTabContent({
	address,
	className,
	disclosureState,
	ownerKey,
	scrollMode = "contained",
}: MobileHistoryTabContentProps) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const { error, fills, isConnected, isOffline, isStale, status } = useUserFills();
	const navigateToMarket = useMarketNavigation();
	const { setActiveTab } = useMobileTerminalTab();
	const markets = useMarkets();
	const isTestnet = useIsTestnet();
	const [typeFilter, setTypeFilter] = useState<TradeHistoryTypeFilter>("all");
	const [directionFilter, setDirectionFilter] = useState<TradeHistoryDirectionFilter>("all");
	const [roleFilter, setRoleFilter] = useState<TradeHistoryRoleFilter>("all");

	const filteredFills = fills
		.filter(
			(fill) =>
				(typeFilter === "all" || getTradeHistoryType(fill) === typeFilter) &&
				(directionFilter === "all" || (directionFilter === "buy") === (fill.side === "B")) &&
				(roleFilter === "all" || (roleFilter === "taker") === fill.crossed),
		)
		.slice(0, RECENT_ACCOUNT_HISTORY_ROWS);
	const filteredFillKeys = filteredFills.map(getUserFillKey);
	const disclosure = useMobileDisclosureSet(
		`${isTestnet ? "Testnet" : "Mainnet"}:${ownerKey}`,
		filteredFillKeys,
		disclosureState,
	);
	const { expandedKeys, setExpanded } = disclosure;
	const typeOptions = [
		{ value: "all", label: t`Type` },
		...(["trade", "liquidation"] as const).map((value) => ({ value, label: getTypeFilterLabel(value) })),
	];
	const directionOptions = [
		{ value: "all", label: t`Direction` },
		{ value: "buy", label: t`Buy` },
		{ value: "sell", label: t`Sell` },
	];
	const roleOptions = [
		{ value: "all", label: t`Role` },
		{ value: "maker", label: t`Maker` },
		{ value: "taker", label: t`Taker` },
	];

	const headerCount = isConnected ? (
		<Plural value={filteredFills.length} one="# trade" other="# trades" />
	) : (
		FALLBACK_VALUE_PLACEHOLDER
	);
	const isPageScroll = scrollMode === "page";

	function handleSelectMarket(name: string) {
		navigateToMarket(name, undefined, { displayedContent: "trade" });
		setActiveTab("trade");
	}

	function getTypeFilterLabel(filter: Exclude<TradeHistoryTypeFilter, "all">) {
		if (filter === "liquidation") return t`Liquidated`;
		return t`Trade`;
	}

	function getDirectionLabel(direction: string) {
		if (direction === "Open Long") return t`Open Long`;
		if (direction === "Close Long") return t`Close Long`;
		if (direction === "Open Short") return t`Open Short`;
		if (direction === "Close Short") return t`Close Short`;
		return direction;
	}

	const { exportCsv, isExporting } = useUserFillsCsvExport({
		filename: "trade_history.csv",
		buildRows: (exportFills) =>
			buildCsvRows(
				exportFills.filter(
					(fill) =>
						(typeFilter === "all" || getTradeHistoryType(fill) === typeFilter) &&
						(directionFilter === "all" || (directionFilter === "buy") === (fill.side === "B")) &&
						(roleFilter === "all" || (roleFilter === "taker") === fill.crossed),
				),
				[
					{ header: t`Time`, getValue: (fill) => formatDateTimeShort(fill.time) },
					{ header: t`Asset`, getValue: (fill) => fill.coin },
					{
						header: t`Direction`,
						getValue: (fill) => (fill.liquidation ? t`Liquidated` : getDirectionLabel(fill.dir)),
					},
					{ header: t`Type`, getValue: () => t`Trade` },
					{ header: t`Price`, getValue: (fill) => formatUSD(fill.px) },
					{ header: t`Size`, getValue: (fill) => formatNumber(fill.sz, markets.getSzDecimals(fill.coin)) },
					{ header: t`Fee`, getValue: (fill) => formatToken(fill.fee, { symbol: fill.feeToken }) },
					{
						header: t`PNL`,
						getValue: (fill) => {
							const closedPnl = getToolbarNonZeroPnl(fill.closedPnl);
							return closedPnl ? formatUSD(closedPnl, { signDisplay: "exceptZero" }) : FALLBACK_VALUE_PLACEHOLDER;
						},
					},
					{
						header: t`Transaction`,
						getValue: (fill) => (hasUserFillExplorerTransaction(fill) ? fill.hash : FALLBACK_VALUE_PLACEHOLDER),
					},
				],
			),
	});
	const exportFooter = (
		<div className="flex h-[38px] shrink-0 items-center gap-4 px-3.5" data-testid="mobile-trade-history-footer">
			{address ? (
				<Link to="/tradeHistory/$address" params={{ address }} className={footerActionClassName}>
					{t`View all`}
				</Link>
			) : null}
			<button type="button" disabled={isExporting} onClick={() => void exportCsv()} className={footerActionClassName}>
				{t`Export CSV`}
			</button>
		</div>
	);

	function renderFilterRow(disabled: boolean) {
		return (
			<div
				data-testid="mobile-trade-history-filter-row"
				className="flex h-9 shrink-0 items-center overflow-x-auto border-b border-market-close-stroke-card px-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				<span className="sr-only" aria-live="polite">
					{headerCount}
				</span>
				<div className="flex shrink-0 items-center gap-1.5">
					<Select
						disabled={disabled}
						size="xxs"
						label={t`Type`}
						value={typeFilter}
						onValueChange={(value) => {
							if (isTradeHistoryTypeFilter(value)) setTypeFilter(value);
						}}
						options={typeOptions}
						className="w-auto shrink-0 [&>label]:sr-only"
						triggerClassName={filterTriggerClassName}
					/>
					<Select
						disabled={disabled}
						size="xxs"
						label={t`Direction`}
						value={directionFilter}
						onValueChange={(value) => {
							if (isTradeHistoryDirectionFilter(value)) setDirectionFilter(value);
						}}
						options={directionOptions}
						className="w-auto shrink-0 [&>label]:sr-only"
						triggerClassName={filterTriggerClassName}
					/>
					<Select
						disabled={disabled}
						size="xxs"
						label={t`Role`}
						value={roleFilter}
						onValueChange={(value) => {
							if (isTradeHistoryRoleFilter(value)) setRoleFilter(value);
						}}
						options={roleOptions}
						className="w-auto shrink-0 [&>label]:sr-only"
						triggerClassName={filterTriggerClassName}
					/>
				</div>
				<MobileBulkDisclosureActions
					keys={disabled ? [] : filteredFillKeys}
					controller={disclosure}
					className="ms-auto ps-3"
				/>
			</div>
		);
	}

	if (!isConnected) {
		return (
			<div className={cn("font-market-close min-h-0 flex flex-col", isPageScroll ? "min-h-0" : "flex-1", className)}>
				{renderFilterRow(true)}
				<div className={cn("min-h-0", !isPageScroll && "flex-1")} />
			</div>
		);
	}

	if (status !== "ready" || ((error || isOffline || isStale) && fills.length === 0)) {
		return (
			<div className={cn("flex min-h-0 flex-1 flex-col", className)}>
				<DataPendingState loading={status === "loading" || status === "idle"} />
				{exportFooter}
			</div>
		);
	}

	if (status === "ready" && fills.length === 0) {
		return (
			<div className={cn("font-market-close min-h-0 flex flex-1 flex-col", className)}>
				<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">
					{t`No fills found.`}
				</div>
				{exportFooter}
			</div>
		);
	}

	return (
		<div className={cn("font-market-close min-h-0 flex flex-col", isPageScroll ? "min-h-0" : "flex-1", className)}>
			{renderFilterRow(false)}
			<div
				data-testid="mobile-trade-history-list"
				className={cn("min-h-0", !isPageScroll && "flex-1 overflow-y-auto overscroll-y-contain")}
			>
				<div className="flex flex-col gap-2.5 px-3.5 pt-3">
					{filteredFills.length === 0 ? (
						<div className="flex min-h-28 items-center justify-center text-center text-sm text-market-close-muted">
							{t`No fills match these filters.`}
						</div>
					) : null}
					<MobileProgressiveList key={`${typeFilter}:${directionFilter}:${roleFilter}`} items={filteredFills}>
						{(visibleFills) =>
							visibleFills.map((fill) => {
								const marketName = fill.coin;
								const cardKey = getUserFillKey(fill);
								const detailsId = `mobile-trade-history-${fill.hash}-${fill.tid}`;
								const isExpanded = expandedKeys.has(cardKey);
								const closedPnl = toNumber(fill.closedPnl);
								const showPnl = closedPnl !== null && closedPnl !== 0;
								const isLiquidation = !!fill.liquidation;
								const isBuy = fill.side === "B";
								const directionLabel = getDirectionLabel(fill.dir);
								const explorerUrl = hasUserFillExplorerTransaction(fill)
									? getExplorerTxUrl(fill.hash, isTestnet)
									: null;
								const sizeDisplay = formatNumber(fill.sz, markets.getSzDecimals(fill.coin));

								function handleToggle() {
									setExpanded(cardKey, !isExpanded);
								}

								return (
									<article
										key={cardKey}
										className="overflow-hidden rounded-[14px] border border-market-close-stroke-card bg-surface"
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
												<span className="truncate text-3xs leading-[14px] text-market-close-subtle">{t`Market`}</span>
												<span className="truncate text-xs font-bold leading-[17px] text-market-close-fg">
													{marketName}
												</span>
											</button>
											<div className="min-w-0">
												<div className="truncate text-3xs leading-[14px] text-market-close-subtle">{t`Time`}</div>
												<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
													{formatDateTimeShort(fill.time)}
												</div>
											</div>
											<div className="min-w-0">
												<div className="truncate text-3xs leading-[14px] text-market-close-subtle">{t`Size`}</div>
												<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
													{sizeDisplay} {marketName}
												</div>
											</div>
										</MobileDisclosureHeader>

										{isExpanded ? (
											<div id={detailsId} className="flex flex-col gap-2.5 px-3.5 py-3">
												<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-x-2.5 gap-y-3">
													<div className="min-w-0">
														<div className="truncate text-3xs leading-[14px] text-market-close-subtle">
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
														<div className="truncate text-3xs leading-[14px] text-market-close-subtle">{t`Price`}</div>
														<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
															{formatUSD(fill.px)}
														</div>
													</div>
													<div className="min-w-0">
														<div className="truncate text-3xs leading-[14px] text-market-close-subtle">{t`Size`}</div>
														<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
															{sizeDisplay}
														</div>
													</div>
													<div className="min-w-0">
														<div className="truncate text-3xs leading-[14px] text-market-close-subtle">{t`Realized PNL`}</div>
														<div
															className={cn(
																"truncate whitespace-nowrap text-xs font-semibold leading-[17px] tabular-nums",
																showPnl ? getMarketCloseValueColorClass(closedPnl) : "text-market-close-muted",
															)}
														>
															{showPnl
																? formatUSD(closedPnl, { signDisplay: "exceptZero" })
																: FALLBACK_VALUE_PLACEHOLDER}
														</div>
													</div>
													<div className="min-w-0">
														<div className="truncate text-3xs leading-[14px] text-market-close-subtle">{t`Fee`}</div>
														<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
															{formatToken(fill.fee, { symbol: fill.feeToken })}
														</div>
													</div>
												</div>
												{explorerUrl ? (
													<div className="flex min-h-11 items-center border-t border-market-close-stroke-card">
														<a
															href={explorerUrl}
															target="_blank"
															rel="noopener noreferrer"
															className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-market-close-fg focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-focus"
														>
															{t`Explorer`}
															<ArrowSquareOutIcon className="size-3" aria-hidden="true" />
														</a>
													</div>
												) : null}
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
