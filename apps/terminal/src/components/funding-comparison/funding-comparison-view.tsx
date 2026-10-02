import { Trans, useLingui } from "@lingui/react/macro";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	CaretLeftIcon,
	CaretRightIcon,
	InfoIcon,
	MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import {
	Button,
	ButtonIcon,
	SearchInput,
	Select,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@sairn/ui";
import type { ReactNode } from "react";
import { AssetBadge } from "@/components/trade/components/asset-badge";
import { AssetDisplay } from "@/components/trade/components/asset-display";
import { TOUCH_PRESS_CLASS } from "@/components/ui/touch-press";
import {
	FUNDING_COMPARISON_COLUMN_LABELS,
	FUNDING_COMPARISON_MISSING_VALUE,
	FUNDING_COMPARISON_PERIOD_OPTIONS,
	FUNDING_COMPARISON_RATE_FORMAT,
	FUNDING_COMPARISON_ROWS_PER_PAGE_OPTIONS,
	FUNDING_COMPARISON_SORT_KEYS,
	FUNDING_COMPARISON_VENUE_NAMES,
} from "@/config/funding-comparison";
import type {
	FundingComparisonArb,
	FundingComparisonArbDirection,
	FundingComparisonCexVenue,
	FundingComparisonPageRow,
	FundingComparisonRate,
	FundingComparisonSortDirection,
	FundingComparisonSortKey,
	FundingComparisonTone,
} from "@/domain/market/funding-comparison";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { useNumberFormat } from "@/lib/format";
import type { Translate } from "@/lib/translate";
import type { FundingComparisonController } from "./use-funding-comparison-controller";

export type FundingComparisonViewProps = FundingComparisonController;

type ColumnLabels = Readonly<Record<FundingComparisonSortKey, string>>;

const TONE_CLASS: Readonly<Record<FundingComparisonTone, string>> = {
	positive: "text-success",
	negative: "text-error",
	neutral: "text-fg-muted",
};

const SKELETON_ROWS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"] as const;

function getColumnLabels(translate: Translate): ColumnLabels {
	return {
		market: translate(FUNDING_COMPARISON_COLUMN_LABELS.market),
		openInterest: translate(FUNDING_COMPARISON_COLUMN_LABELS.openInterest),
		HlPerp: FUNDING_COMPARISON_VENUE_NAMES.HlPerp,
		BinPerp: FUNDING_COMPARISON_VENUE_NAMES.BinPerp,
		binanceArb: translate(FUNDING_COMPARISON_COLUMN_LABELS.binanceArb),
		BybitPerp: FUNDING_COMPARISON_VENUE_NAMES.BybitPerp,
		bybitArb: translate(FUNDING_COMPARISON_COLUMN_LABELS.bybitArb),
	};
}

export function FundingComparisonView(props: FundingComparisonViewProps) {
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const columnLabels = getColumnLabels((descriptor) => t(descriptor));
	const periodOptions = FUNDING_COMPARISON_PERIOD_OPTIONS.map((option) => ({
		value: option.value,
		label: t(option.label),
	}));

	function handlePeriodChange(value: string | null) {
		const option = FUNDING_COMPARISON_PERIOD_OPTIONS.find((candidate) => candidate.value === value);
		if (option) props.onPeriodChange(option.value);
	}

	return (
		<section
			data-state={props.pageState}
			aria-busy={props.pageState === "loading"}
			className={cn(
				"mx-auto flex min-h-[var(--earn-page-min-height)] w-full max-w-[var(--earn-content-max)] flex-col bg-surface text-fg shadow-raised",
				!isMobile && "overflow-hidden rounded-24",
			)}
		>
			<header className={cn(isMobile ? "px-4 pt-4 pb-3" : "px-5 pt-4 pb-3")}>
				<h1 className={cn("font-bold tracking-heading-1", isMobile ? "text-xl" : "text-lg")}>
					<Trans>Funding Comparison</Trans>
				</h1>
				<p className="mt-1 text-xs text-fg-muted">
					<Trans>Funding rate differences across exchanges.</Trans>
				</p>
			</header>

			<div className={cn("flex items-center gap-2 pb-3", isMobile ? "px-4" : "justify-between px-5")}>
				<SearchInput
					size={isMobile ? "lg" : "md"}
					value={props.query}
					onChange={(event) => props.onQueryChange(event.target.value)}
					onClear={props.onClearQuery}
					clearLabel={t`Clear search`}
					placeholder={t`Search by market`}
					aria-label={t`Search markets`}
					className={isMobile ? "min-w-0 flex-1" : "max-w-[var(--earn-search-max)]"}
				/>
				<Select
					size={isMobile ? "lg" : "md"}
					value={props.period}
					onValueChange={handlePeriodChange}
					options={periodOptions}
					triggerAriaLabel={t`Funding period`}
					className="w-[var(--earn-mobile-sort-width)] shrink-0"
				/>
			</div>

			<FundingComparisonContent {...props} isMobile={isMobile} columnLabels={columnLabels} />

			<div
				className={cn(
					"mt-auto flex items-start gap-2 border-t border-stroke-weak py-3 text-xs leading-5 text-fg-muted",
					isMobile ? "px-4" : "px-5",
				)}
			>
				<InfoIcon className="mt-0.5 size-4 shrink-0" />
				<p>
					<Trans>
						Predicted rates for the next funding, converted to the selected period. Only Hyperliquid main perp markets
						are included. Differences do not include trading fees or payment timing.
					</Trans>
				</p>
			</div>
		</section>
	);
}

interface ContentProps extends FundingComparisonViewProps {
	isMobile: boolean;
	columnLabels: ColumnLabels;
}

function FundingComparisonContent(props: ContentProps) {
	if (props.pageState === "loading") return <FundingComparisonSkeleton isMobile={props.isMobile} />;
	if (props.pageState === "error") {
		return <FundingComparisonRetry isRetrying={props.isRetrying} onRetry={props.onRetry} />;
	}
	if (props.pageState === "empty" || props.pageState === "noResults") {
		return <FundingComparisonEmpty hasQuery={props.pageState === "noResults"} />;
	}
	if (props.isMobile) return <MobileFundingComparison {...props} />;
	return <DesktopFundingComparison {...props} />;
}

function DesktopFundingComparison(props: ContentProps) {
	const { formatUSD } = useNumberFormat();
	const { t } = useLingui();
	return (
		<div className="flex flex-1 flex-col">
			<Table scrollableRegionLabel={t`Funding comparison`} className="min-w-[56rem] tabular-nums">
				<caption className="sr-only">
					<Trans>Predicted funding rates by market and exchange</Trans>
				</caption>
				<TableHeader>
					<TableRow>
						{FUNDING_COMPARISON_SORT_KEYS.map((key) => (
							<SortableHead
								key={key}
								targetSortKey={key}
								label={props.columnLabels[key]}
								sortKey={props.sortKey}
								sortDirection={props.sortDirection}
								onSort={props.onSort}
							/>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{props.rows.map((row) => (
						<TableRow key={row.coin} className="transition-colors hover:bg-fill-hover">
							<TableCell size="dense" className="ps-5">
								<AssetBadge
									coin={row.coin}
									onClick={() => props.onSelectMarket(row.coin)}
									aria-label={t`Switch to ${row.coin} market`}
									className="h-auto min-h-0 border-0 bg-transparent p-0 shadow-none hover:bg-transparent"
									fit
								/>
							</TableCell>
							<NumericCell>
								<bdi dir="ltr" className="font-semibold text-fg">
									{row.openInterestUsd === null
										? FUNDING_COMPARISON_MISSING_VALUE
										: formatUSD(row.openInterestUsd, { compact: false, decimals: 0 })}
								</bdi>
							</NumericCell>
							<NumericCell>
								<RateValue rate={row.rates.HlPerp} />
							</NumericCell>
							<NumericCell>
								<RateValue rate={row.rates.BinPerp} />
							</NumericCell>
							<NumericCell>
								<ArbValue arb={row.arbs.BinPerp} venue="BinPerp" />
							</NumericCell>
							<NumericCell>
								<RateValue rate={row.rates.BybitPerp} />
							</NumericCell>
							<NumericCell last>
								<ArbValue arb={row.arbs.BybitPerp} venue="BybitPerp" />
							</NumericCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			<FundingComparisonPagination {...props} />
		</div>
	);
}

interface SortableHeadProps {
	label: string;
	targetSortKey: FundingComparisonSortKey;
	sortKey: FundingComparisonSortKey;
	sortDirection: FundingComparisonSortDirection;
	onSort: (sortKey: FundingComparisonSortKey) => void;
}

function SortableHead({ label, targetSortKey, sortKey, sortDirection, onSort }: SortableHeadProps) {
	const active = sortKey === targetSortKey;
	const isMarket = targetSortKey === "market";
	return (
		<TableHead
			size="dense"
			scope="col"
			aria-sort={active ? sortDirection : "none"}
			className={cn(isMarket ? "ps-5 text-start" : "text-right", targetSortKey === "bybitArb" && "pe-5")}
		>
			<button
				type="button"
				onClick={() => onSort(targetSortKey)}
				className={cn(
					"inline-flex items-center gap-1 rounded-8 px-1 py-1 text-fg-muted hover:bg-fill-hover hover:text-fg",
					isMarket && "-ms-1",
				)}
			>
				{label}
				{active ? <SortDirectionIcon direction={sortDirection} className="size-3" /> : null}
			</button>
		</TableHead>
	);
}

interface SortDirectionIconProps {
	direction: FundingComparisonSortDirection;
	className: string;
}

function SortDirectionIcon({ direction, className }: SortDirectionIconProps) {
	if (direction === "descending") return <ArrowDownIcon className={className} weight="bold" aria-hidden="true" />;
	return <ArrowUpIcon className={className} weight="bold" aria-hidden="true" />;
}

interface NumericCellProps {
	children: ReactNode;
	last?: boolean;
}

function NumericCell({ children, last = false }: NumericCellProps) {
	return (
		<TableCell size="dense" className={cn("text-right text-2sm whitespace-nowrap", last && "pe-5")}>
			{children}
		</TableCell>
	);
}

interface RateValueProps {
	rate: FundingComparisonRate;
}

function RateValue({ rate }: RateValueProps) {
	const { formatPercent } = useNumberFormat();
	return (
		<bdi dir="ltr" className={cn("font-semibold", TONE_CLASS[rate.tone])}>
			{rate.value === null
				? FUNDING_COMPARISON_MISSING_VALUE
				: formatPercent(rate.value, FUNDING_COMPARISON_RATE_FORMAT)}
		</bdi>
	);
}

interface ArbValueProps {
	arb: FundingComparisonArb | null;
	venue: FundingComparisonCexVenue;
}

function ArbValue({ arb, venue }: ArbValueProps) {
	const { formatPercent } = useNumberFormat();
	const { t } = useLingui();
	if (!arb) {
		return (
			<bdi dir="ltr" className="font-semibold text-fg-muted">
				{FUNDING_COMPARISON_MISSING_VALUE}
			</bdi>
		);
	}
	const venueName = FUNDING_COMPARISON_VENUE_NAMES[venue];
	const directionLabels: Readonly<Record<FundingComparisonArbDirection, string>> = {
		venueHigher: t`${venueName} rate higher`,
		hyperliquidHigher: t`Hyperliquid rate higher`,
		equal: t`Rates equal`,
	};
	return (
		<span className="inline-block text-right" data-arb-direction={arb.direction}>
			<bdi dir="ltr" className="block font-semibold text-fg">
				{formatPercent(arb.magnitude, { ...FUNDING_COMPARISON_RATE_FORMAT, signDisplay: "never" })}
			</bdi>
			<span className="block text-2xs text-fg-muted">{directionLabels[arb.direction]}</span>
		</span>
	);
}

function MobileFundingComparison(props: ContentProps) {
	const { t } = useLingui();
	const sortOptions = FUNDING_COMPARISON_SORT_KEYS.map((key) => ({ value: key, label: props.columnLabels[key] }));

	function handleSortChange(value: string | null) {
		const nextKey = FUNDING_COMPARISON_SORT_KEYS.find((key) => key === value);
		if (nextKey) props.onSort(nextKey);
	}

	return (
		<div className="flex flex-1 flex-col px-4">
			<div className="mb-3 flex items-center justify-between gap-3">
				<p className="text-2sm font-semibold text-fg">
					<Trans>Sort by</Trans>
				</p>
				<div className="flex items-center gap-1.5">
					<Select
						size="md"
						value={props.sortKey}
						onValueChange={handleSortChange}
						options={sortOptions}
						triggerAriaLabel={t`Sort markets`}
						className="min-w-[var(--earn-mobile-sort-width)]"
					/>
					<ButtonIcon
						type="button"
						variant="outline"
						intent="neutral"
						size="md"
						onClick={() => props.onSort(props.sortKey)}
						aria-label={
							props.sortDirection === "descending" ? t`Change to ascending order` : t`Change to descending order`
						}
					>
						<SortDirectionIcon direction={props.sortDirection} className="size-4" />
					</ButtonIcon>
				</div>
			</div>
			<div className="space-y-2.5">
				{props.rows.map((row) => (
					<MobileFundingCard
						key={row.coin}
						row={row}
						columnLabels={props.columnLabels}
						onSelectMarket={props.onSelectMarket}
					/>
				))}
			</div>
			<FundingComparisonPagination {...props} />
		</div>
	);
}

interface MobileFundingCardProps {
	row: FundingComparisonPageRow;
	columnLabels: ColumnLabels;
	onSelectMarket: (coin: string) => void;
}

function MobileFundingCard({ row, columnLabels, onSelectMarket }: MobileFundingCardProps) {
	const { formatUSD } = useNumberFormat();
	const { t } = useLingui();
	return (
		<article className="rounded-16 border border-stroke-weak">
			<button
				type="button"
				onClick={() => onSelectMarket(row.coin)}
				aria-label={t`Switch to ${row.coin} market`}
				className={cn(
					"flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-t-16 px-3 py-2 text-start",
					TOUCH_PRESS_CLASS,
				)}
			>
				<AssetDisplay coin={row.coin} iconClassName="size-5" nameClassName="text-sm font-semibold text-fg" />
				<CaretRightIcon className="size-4 shrink-0 text-icon rtl:rotate-180" aria-hidden="true" />
			</button>
			<dl className="border-t border-stroke-weak px-3 py-1.5">
				<MobileMetric label={columnLabels.openInterest}>
					<bdi dir="ltr" className="font-semibold text-fg">
						{row.openInterestUsd === null
							? FUNDING_COMPARISON_MISSING_VALUE
							: formatUSD(row.openInterestUsd, { compact: true })}
					</bdi>
				</MobileMetric>
				<MobileMetric label={columnLabels.HlPerp}>
					<RateValue rate={row.rates.HlPerp} />
				</MobileMetric>
				<MobileMetric label={columnLabels.BinPerp}>
					<RateValue rate={row.rates.BinPerp} />
				</MobileMetric>
				<MobileMetric label={columnLabels.binanceArb}>
					<ArbValue arb={row.arbs.BinPerp} venue="BinPerp" />
				</MobileMetric>
				<MobileMetric label={columnLabels.BybitPerp}>
					<RateValue rate={row.rates.BybitPerp} />
				</MobileMetric>
				<MobileMetric label={columnLabels.bybitArb}>
					<ArbValue arb={row.arbs.BybitPerp} venue="BybitPerp" />
				</MobileMetric>
			</dl>
		</article>
	);
}

interface MobileMetricProps {
	label: string;
	children: ReactNode;
}

function MobileMetric({ label, children }: MobileMetricProps) {
	return (
		<div className="flex items-center justify-between gap-4 py-1.5 text-xs">
			<dt className="text-fg-muted">{label}</dt>
			<dd className="text-right tabular-nums">{children}</dd>
		</div>
	);
}

function FundingComparisonPagination(props: ContentProps) {
	const { t } = useLingui();
	return (
		<div className={cn("flex flex-wrap items-center justify-end gap-3 py-3", props.isMobile ? "px-1" : "px-5")}>
			<Select
				size="sm"
				value={String(props.rowsPerPage)}
				onValueChange={(value) => value && props.onRowsPerPageChange(Number(value))}
				options={FUNDING_COMPARISON_ROWS_PER_PAGE_OPTIONS.map((value) => ({
					value: String(value),
					label: String(value),
				}))}
				triggerAriaLabel={t`Rows per page`}
				className="w-[var(--earn-rows-select-width)]"
			/>
			<span className="text-xs tabular-nums text-fg-muted">
				<bdi dir="ltr">
					{props.start}–{props.end} / {props.totalRows}
				</bdi>
			</span>
			<div className="flex gap-1.5">
				<ButtonIcon
					type="button"
					variant="outline"
					intent="neutral"
					size="sm"
					onClick={props.onPreviousPage}
					disabled={props.page <= 1}
					aria-label={t`Previous page`}
				>
					<CaretLeftIcon className="size-4 rtl:rotate-180" />
				</ButtonIcon>
				<ButtonIcon
					type="button"
					variant="outline"
					intent="neutral"
					size="sm"
					onClick={props.onNextPage}
					disabled={props.page >= props.totalPages}
					aria-label={t`Next page`}
				>
					<CaretRightIcon className="size-4 rtl:rotate-180" />
				</ButtonIcon>
			</div>
		</div>
	);
}

function FundingComparisonSkeleton({ isMobile }: { isMobile: boolean }) {
	return (
		<div
			data-testid="funding-comparison-skeleton"
			className={cn("flex-1 animate-pulse motion-reduce:animate-none", isMobile ? "space-y-2.5 px-4" : "px-5")}
			aria-busy="true"
		>
			<span className="sr-only">
				<Trans>Loading funding rates</Trans>
			</span>
			{SKELETON_ROWS.map((key) => (
				<div key={key} className={cn("bg-fill-weak", isMobile ? "h-56 rounded-16" : "mb-1 h-11 rounded-8")} />
			))}
		</div>
	);
}

interface FundingComparisonRetryProps {
	isRetrying: boolean;
	onRetry: () => void;
}

function FundingComparisonRetry({ isRetrying, onRetry }: FundingComparisonRetryProps) {
	return (
		<div data-testid="funding-comparison-retry" className="flex flex-1 items-center justify-center px-5 py-12">
			<Button type="button" size="md" variant="outline" intent="neutral" disabled={isRetrying} onClick={onRetry}>
				<Trans>Retry</Trans>
			</Button>
		</div>
	);
}

function FundingComparisonEmpty({ hasQuery }: { hasQuery: boolean }) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-12 text-center">
			<span className="grid size-11 place-items-center rounded-full bg-fill-weak text-icon">
				<MagnifyingGlassIcon className="size-5" />
			</span>
			<p className="text-sm font-bold text-fg">
				{hasQuery ? <Trans>No markets match your search</Trans> : <Trans>No funding comparison data</Trans>}
			</p>
		</div>
	);
}
