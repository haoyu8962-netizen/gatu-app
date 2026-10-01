import { useLingui } from "@lingui/react/macro";
import { Dropdown } from "@sairn/ui";
import { orderControl } from "@/components/trade/mobile/mobile-trade-header-view";
import { ADVANCED_ORDER_TYPES, type OrderType, SPOT_ALLOWED_TYPES } from "@/config/trade";
import { TRADE_PANEL_LABELS } from "@/config/trade-panel-labels";
import type { SideLabels } from "@/config/ui-text";
import type { AccountAbstraction } from "@/hooks/trade/use-account-balances";
import { useAccountModeLabels } from "@/hooks/trade/use-account-mode-labels";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { cn } from "@/lib/cn";
import type { MarketKind } from "@/lib/hyperliquid";
import type { MarginMode } from "@/lib/trade/margin-mode";
import { getTabsOrderType } from "@/lib/trade/order-types";
import type { Side } from "@/lib/trade/types";
import { tradingPanelDropdownPopupClass } from "@/lib/ui/trading-dropdown";
import { MobileOrderTypeTriggerView, MobileTradeHeaderView } from "../mobile/mobile-trade-header-view";
import { OrderTypeTabView } from "./order-type-tab-view";
import { SideToggle } from "./side-toggle";
import { TradeControlButtonView } from "./trade-control-button-view";
import { TradeHeaderView } from "./trade-header-view";

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
	const modes = useAccountModeLabels();
	const { getAdvancedOrderLabel, getAdvancedOrderTypeLabel } = useOrderDisplayLabels();
	const tabsOrderType = getTabsOrderType(orderType);
	const orderTypeIndex = tabsOrderType === "market" ? 0 : tabsOrderType === "limit" ? 1 : 2;
	const orderTypeLabel =
		tabsOrderType === "advanced"
			? getAdvancedOrderLabel(orderType, t(TRADE_PANEL_LABELS.other))
			: tabsOrderType === "market"
				? t(TRADE_PANEL_LABELS.market)
				: t(TRADE_PANEL_LABELS.limit);

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
		{
			label: t(TRADE_PANEL_LABELS.market),
			active: orderType === "market",
			onSelect: () => onOrderTypeChange("market"),
		},
		{ label: t(TRADE_PANEL_LABELS.limit), active: orderType === "limit", onSelect: () => onOrderTypeChange("limit") },
		...advancedOrderTypeItems,
	];

	const marginLabel = marginMode === "isolated" ? t`Isolated` : t(TRADE_PANEL_LABELS.cross);
	const accountModeLabel =
		accountMode === "portfolioMargin"
			? modes.portfolio.short
			: accountMode === "unifiedAccount"
				? modes.unified.short
				: accountMode === "disabled"
					? modes.manual.short
					: isAccountModeLoading
						? t(TRADE_PANEL_LABELS.account)
						: accountMode === "default"
							? t`Select mode`
							: accountMode === "dexAbstraction"
								? t`Legacy DEX`
								: t(TRADE_PANEL_LABELS.account);
	const compactAccountModeLabel =
		accountMode === "dexAbstraction"
			? t`Legacy`
			: accountMode === "default" || accountMode == null
				? t(TRADE_PANEL_LABELS.account)
				: accountModeLabel;
	const handleMarginModeClick = onMarginModeClick ?? onMarginLeverageClick;
	const handleLeverageClick = onLeverageClick ?? onMarginLeverageClick;
	const mobileControlClass = cn(
		orderControl,
		"transition-opacity active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trading-panel-focus",
		"disabled:cursor-not-allowed disabled:text-fg-disabled",
	);

	if (layout === "mobile")
		return (
			<MobileTradeHeaderView
				isLeveraged={isLeveraged}
				marginLabel={marginLabel}
				leverage={leverage}
				onMarginClick={handleMarginModeClick}
				onLeverageClick={handleLeverageClick}
				orderTypeControl={
					<Dropdown
						renderTrigger={<MobileOrderTypeTriggerView label={orderTypeLabel} />}
						items={mobileOrderTypeItems}
						size="sm"
						align="start"
						hideCaret
						triggerVariant="minimal"
						triggerAriaLabel={t(TRADE_PANEL_LABELS.orderType)}
						triggerClassName={cn(mobileControlClass, "w-full justify-start")}
						popupClassName={tradingPanelDropdownPopupClass}
						className="min-w-0"
					/>
				}
				sideToggle={
					<SideToggle
						side={side}
						onSideChange={onSideChange}
						labels={sideLabels}
						compact={compact}
						tradingPanel
						mobile
					/>
				}
			/>
		);

	return (
		<TradeHeaderView
			compact={!!compact}
			orderTypeIndex={orderTypeIndex}
			controls={
				<>
					{isLeveraged && (
						<>
							<TradeControlButtonView
								compact={!!compact}
								labelFull={t(TRADE_PANEL_LABELS.marginMode)}
								labelCompact={t(TRADE_PANEL_LABELS.margin)}
								value={marginLabel}
								onClick={handleMarginModeClick}
								aria-haspopup="dialog"
								title={marginLabel}
							/>
							<TradeControlButtonView
								compact={!!compact}
								labelFull={t(TRADE_PANEL_LABELS.leverage)}
								value={`${leverage ?? 1}x`}
								valueClassName={cn("tabular-nums", getLeverageToneClass(leverage ?? 1))}
								onClick={handleLeverageClick}
								aria-haspopup="dialog"
								title={`${leverage ?? 1}x`}
							/>
						</>
					)}
					<TradeControlButtonView
						compact={!!compact}
						labelFull={t(TRADE_PANEL_LABELS.accountMode)}
						labelCompact={t(TRADE_PANEL_LABELS.account)}
						value={accountModeLabel}
						valueCompact={compactAccountModeLabel}
						loading={isAccountModeLoading || isAccountModeUpdating}
						spinnerClassName="animate-spin"
						spanAll={!isLeveraged}
						onClick={onAccountModeClick}
						disabled={isAccountModeLoading || isAccountModeUpdating}
						aria-label={t(TRADE_PANEL_LABELS.accountMode)}
						aria-haspopup="dialog"
						title={accountModeLabel}
					/>
				</>
			}
			tabs={
				<>
					<OrderTypeTabView
						active={tabsOrderType === "market"}
						onClick={() => onOrderTypeChange("market")}
						label={t(TRADE_PANEL_LABELS.market)}
					/>
					<OrderTypeTabView
						active={tabsOrderType === "limit"}
						onClick={() => onOrderTypeChange("limit")}
						label={t(TRADE_PANEL_LABELS.limit)}
					/>
					<Dropdown
						renderTrigger={
							<OrderTypeTabView
								active={tabsOrderType === "advanced"}
								label={
									tabsOrderType === "advanced"
										? getAdvancedOrderLabel(orderType, t(TRADE_PANEL_LABELS.advanced))
										: t(TRADE_PANEL_LABELS.advanced)
								}
								labelCompact={
									tabsOrderType === "advanced"
										? getAdvancedOrderLabel(orderType, t(TRADE_PANEL_LABELS.other))
										: t(TRADE_PANEL_LABELS.other)
								}
							/>
						}
						items={advancedOrderTypeItems}
						disabled={advancedOrderTypeItems.length === 0}
						size="sm"
						align="end"
						hideCaret
						triggerVariant="minimal"
						triggerAriaLabel={t(TRADE_PANEL_LABELS.advancedOrderTypes)}
						popupClassName={tradingPanelDropdownPopupClass}
						className="min-w-0"
					/>
				</>
			}
			sideToggle={
				<SideToggle side={side} onSideChange={onSideChange} labels={sideLabels} compact={compact} tradingPanel />
			}
		/>
	);
}

function getLeverageToneClass(leverage: number): string {
	if (leverage >= 20) return "text-trading-panel-error";
	if (leverage > 10) return "text-trading-panel-warning";
	return "text-trading-panel-fg";
}
