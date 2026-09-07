import { Dropdown } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { CaretDownIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { ADVANCED_ORDER_TYPES, type OrderType, SPOT_ALLOWED_TYPES } from "@/config/trade";
import type { SideLabels } from "@/config/ui-text";
import type { AccountAbstraction } from "@/hooks/trade/use-account-balances";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { cn } from "@/lib/cn";
import type { MarketKind } from "@/lib/hyperliquid";
import type { MarginMode } from "@/lib/trade/margin-mode";
import { getTabsOrderType } from "@/lib/trade/order-types";
import type { Side } from "@/lib/trade/types";
import { tradingPanelDropdownPopupClass } from "@/lib/ui/trading-dropdown";
import { SideToggle } from "./side-toggle";

interface Props {
	orderType: OrderType;
	side: Side;
	sideLabels: SideLabels;
	marketKind: MarketKind | undefined;
	onOrderTypeChange: (type: OrderType) => void;
	onSideChange: (side: Side) => void;
	marginMode?: MarginMode;
	leverage?: number;
	onMarginLeverageClick?: () => void;
	onMarginModeClick?: () => void;
	onLeverageClick?: () => void;
	isLeveraged?: boolean;
	accountMode?: AccountAbstraction;
	isAccountModeLoading?: boolean;
	isAccountModeUpdating?: boolean;
	onAccountModeClick?: () => void;
	compact?: boolean;
	layout?: "desktop" | "mobile";
}

export function TradeHeader({
	orderType,
	side,
	sideLabels,
	marketKind,
	onOrderTypeChange,
	onSideChange,
	marginMode,
	leverage,
	onMarginLeverageClick,
	onMarginModeClick,
	onLeverageClick,
	isLeveraged,
	accountMode,
	isAccountModeLoading,
	isAccountModeUpdating,
	onAccountModeClick,
	compact,
	layout = "desktop",
}: Props) {
	const { t } = useLingui();
	const { getAdvancedOrderLabel, getAdvancedOrderTypeLabel } = useOrderDisplayLabels();
	const tabsOrderType = getTabsOrderType(orderType);
	const orderTypeIndex = tabsOrderType === "market" ? 0 : tabsOrderType === "limit" ? 1 : 2;
	const orderTypeLabel =
		tabsOrderType === "advanced"
			? getAdvancedOrderLabel(orderType, t`Other`)
			: tabsOrderType === "market"
				? t`Market`
				: t`Limit`;

	const isSpot = marketKind === "spot";
	const advancedOrderTypeItems = ADVANCED_ORDER_TYPES.filter((type) => {
		if (isSpot && !SPOT_ALLOWED_TYPES.includes(type)) return false;
		return true;
	}).map((type) => ({
		label: getAdvancedOrderTypeLabel(type),
		active: orderType === type,
		onSelect: () => onOrderTypeChange(type),
	}));
	const mobileOrderTypeItems = [
		{ label: t`Market`, active: orderType === "market", onSelect: () => onOrderTypeChange("market") },
		{ label: t`Limit`, active: orderType === "limit", onSelect: () => onOrderTypeChange("limit") },
		...advancedOrderTypeItems,
	];

	const marginLabel = marginMode === "isolated" ? t`Isolated` : t`Cross`;
	const accountModeLabel =
		accountMode === "portfolioMargin"
			? t`Portfolio`
			: accountMode === "unifiedAccount"
				? t`Unified`
				: accountMode === "disabled"
					? t`Separate`
					: isAccountModeLoading
						? t`Loading...`
						: accountMode === "default"
							? t`Select mode`
							: accountMode === "dexAbstraction"
								? t`Legacy DEX`
								: t`Unavailable`;
	const compactAccountModeLabel =
		accountMode === "dexAbstraction"
			? t`Legacy`
			: accountMode === "default" || accountMode == null
				? t`Account`
				: accountModeLabel;
	const handleMarginModeClick = onMarginModeClick ?? onMarginLeverageClick;
	const handleLeverageClick = onLeverageClick ?? onMarginLeverageClick;
	const controlButtonClass = cn(
		"trade-control-button group flex min-w-0 cursor-pointer flex-col items-start gap-px rounded-[10px] border border-trading-panel-stroke-card bg-surface py-1.5 text-start transition-colors",
		"hover:border-trading-panel-stroke-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
		"disabled:cursor-not-allowed disabled:text-fg-disabled",
		compact && "py-1",
	);
	const controlLabelClass = "w-full min-w-0 truncate text-3xs leading-snug text-trading-panel-subtle";
	const controlValueClass = "flex w-full min-w-0 items-center gap-0.5 text-2sm font-semibold text-trading-panel-fg";
	const mobileControlClass = cn(
		"relative flex h-[35px] min-w-0 items-center gap-1 whitespace-nowrap rounded-none bg-surface px-0 text-2sm font-semibold text-trading-panel-fg",
		"after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-['']",
		"transition-opacity active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trading-panel-focus",
		"disabled:cursor-not-allowed disabled:text-fg-disabled",
	);

	if (layout === "mobile") {
		return (
			<div className={compact ? "min-w-0 space-y-2" : "min-w-0 space-y-3"}>
				<div
					className={cn(
						"grid min-w-0 overflow-hidden bg-surface",
						isLeveraged
							? "grid-cols-[minmax(max-content,1.2fr)_minmax(max-content,1fr)_minmax(2.75rem,0.8fr)]"
							: "grid-cols-1",
					)}
				>
					<Dropdown
						trigger={
							<span className="inline-flex min-w-0 items-center justify-center gap-1">
								<span className="truncate">{orderTypeLabel}</span>
								<CaretDownIcon className="size-3 shrink-0 text-trading-panel-subtle" />
							</span>
						}
						items={mobileOrderTypeItems}
						size="sm"
						align="start"
						hideCaret
						triggerVariant="minimal"
						triggerAriaLabel={t`Order type`}
						triggerClassName={cn(mobileControlClass, "w-full justify-start")}
						popupClassName={tradingPanelDropdownPopupClass}
						className="min-w-0"
					/>
					{isLeveraged && (
						<>
							<button
								type="button"
								onClick={handleMarginModeClick}
								className={cn(mobileControlClass, "justify-center")}
								aria-haspopup="dialog"
							>
								<span className="truncate">{marginLabel}</span>
								<CaretDownIcon className="size-3 shrink-0 text-trading-panel-subtle" />
							</button>
							<button
								type="button"
								onClick={handleLeverageClick}
								className={cn(mobileControlClass, "justify-end")}
								aria-haspopup="dialog"
							>
								<span className="truncate tabular-nums">{leverage ?? 1}x</span>
								<CaretDownIcon className="size-3 shrink-0 text-trading-panel-subtle" />
							</button>
						</>
					)}
				</div>

				<SideToggle side={side} onSideChange={onSideChange} labels={sideLabels} compact={compact} tradingPanel />
			</div>
		);
	}

	return (
		<div className={compact ? "min-w-0 space-y-2" : "min-w-0 space-y-4"}>
			<div className={cn("trade-control-grid grid min-w-0 grid-cols-3", compact && "gap-1.5")}>
				{isLeveraged && (
					<>
						<button
							type="button"
							onClick={handleMarginModeClick}
							className={controlButtonClass}
							aria-haspopup="dialog"
							title={marginLabel}
						>
							<span className={cn(controlLabelClass, "trade-card-label-full")}>{t`Margin mode`}</span>
							<span className={cn(controlLabelClass, "trade-card-label-compact")}>{t`Margin`}</span>
							<span className={controlValueClass}>
								<span className="min-w-0 truncate">{marginLabel}</span>
								<CaretDownIcon className="size-2.5 shrink-0 text-trading-panel-subtle" />
							</span>
						</button>
						<button
							type="button"
							onClick={handleLeverageClick}
							className={controlButtonClass}
							aria-haspopup="dialog"
							title={`${leverage ?? 1}x`}
						>
							<span className={controlLabelClass}>{t`Leverage`}</span>
							<span className={controlValueClass}>
								<span className={cn("min-w-0 truncate tabular-nums", getLeverageToneClass(leverage ?? 1))}>
									{leverage ?? 1}x
								</span>
								<CaretDownIcon className="size-2.5 shrink-0 text-trading-panel-subtle" />
							</span>
						</button>
					</>
				)}
				<button
					type="button"
					onClick={onAccountModeClick}
					disabled={isAccountModeLoading || isAccountModeUpdating}
					className={cn(controlButtonClass, !isLeveraged && "col-span-3")}
					aria-label={t`Account mode`}
					aria-haspopup="dialog"
					title={accountModeLabel}
				>
					<span className={cn(controlLabelClass, "trade-card-label-full")}>{t`Account mode`}</span>
					<span className={cn(controlLabelClass, "trade-card-label-compact")}>{t`Account`}</span>
					<span className={controlValueClass}>
						{(isAccountModeLoading || isAccountModeUpdating) && (
							<SpinnerGapIcon className="size-3 shrink-0 animate-spin" />
						)}
						<span className="trade-account-value-full min-w-0 truncate">{accountModeLabel}</span>
						<span className="trade-account-value-compact min-w-0 truncate">{compactAccountModeLabel}</span>
						<CaretDownIcon className="size-2.5 shrink-0 text-trading-panel-subtle" />
					</span>
				</button>
			</div>

			<div className="relative grid min-w-0 grid-cols-3">
				<div
					className="pointer-events-none absolute bottom-0 left-0 z-10 h-0.5 w-1/3 bg-trading-panel-fg transition-transform duration-300 ease-out motion-reduce:transition-none"
					style={{ transform: `translateX(${orderTypeIndex * 100}%)` }}
				/>
				<OrderTypeTabButton active={tabsOrderType === "market"} onClick={() => onOrderTypeChange("market")}>
					{t`Market`}
				</OrderTypeTabButton>
				<OrderTypeTabButton active={tabsOrderType === "limit"} onClick={() => onOrderTypeChange("limit")}>
					{t`Limit`}
				</OrderTypeTabButton>
				<Dropdown
					trigger={
						<span className="inline-flex min-w-0 items-center justify-center">
							<span className="trade-full-label truncate">
								{tabsOrderType === "advanced" ? getAdvancedOrderLabel(orderType, t`Advanced`) : t`Advanced`}
							</span>
							<span className="trade-compact-label truncate">
								{tabsOrderType === "advanced" ? getAdvancedOrderLabel(orderType, t`Other`) : t`Other`}
							</span>
						</span>
					}
					items={advancedOrderTypeItems}
					disabled={advancedOrderTypeItems.length === 0}
					size="sm"
					align="end"
					hideCaret
					triggerVariant="minimal"
					triggerAriaLabel={t`Advanced order types`}
					triggerClassName={cn(
						orderTypeTabClass(tabsOrderType === "advanced"),
						"w-full rounded-none hover:text-trading-panel-fg data-[popup-open]:text-trading-panel-fg",
					)}
					popupClassName={tradingPanelDropdownPopupClass}
					className="min-w-0"
				/>
			</div>

			<SideToggle side={side} onSideChange={onSideChange} labels={sideLabels} compact={compact} tradingPanel />
		</div>
	);
}

function getLeverageToneClass(leverage: number): string {
	if (leverage >= 20) return "text-trading-panel-error";
	if (leverage > 10) return "text-trading-panel-warning";
	return "text-trading-panel-fg";
}

function orderTypeTabClass(active: boolean) {
	return cn(
		"trade-order-type-button min-w-0 border-b border-trading-panel-stroke-card pt-1.5 pb-2 text-sm transition-colors",
		"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
		active ? "font-bold text-trading-panel-fg" : "font-medium text-trading-panel-subtle hover:text-trading-panel-fg",
	);
}

function OrderTypeTabButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button type="button" aria-pressed={active} onClick={onClick} className={orderTypeTabClass(active)}>
			<span className="block truncate">{children}</span>
		</button>
	);
}
