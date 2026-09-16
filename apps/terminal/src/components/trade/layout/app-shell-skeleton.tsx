import { PencilIcon } from "@phosphor-icons/react";
import { GatuLogo } from "@/components/brand/gatu-logo";
import { getInputClassName } from "@/components/ui/input-styles";
import type { MobileTab } from "@/config/nav";
import type { MobilePositionsTabValue } from "@/config/trade";
import { cn } from "@/lib/cn";
import { TokenSelectorTriggerView } from "../chart/token-selector-trigger-view";
import { AssetIconSlotView } from "../components/asset-icon-slot-view";
import { SummaryRow } from "../components/summary-row-view";
import { TradeSliderView } from "../components/trade-slider-view";
import { FooterBarView } from "../footer/footer-bar-view";
import { FavoritesStripView } from "../header/favorites-strip-view";
import { TopNavView } from "../header/top-nav-view";
import { MarketOverviewView } from "../market-overview-view";
import {
	MobileBookChromeView,
	MobileBookFrameView,
	MobileBookModeControlsView,
} from "../mobile/mobile-book-chrome-view";
import { MobileBottomNavView } from "../mobile/mobile-bottom-nav-view";
import { MobileHeaderView } from "../mobile/mobile-header-view";
import { MobileMarketBarView } from "../mobile/mobile-market-bar-view";
import { MobileOrderEntryPlaceholderView } from "../mobile/mobile-order-entry-placeholder-view";
import {
	MobilePositionsFrameView,
	MobilePositionsPanelView,
	MobilePositionsTabStripView,
	MobilePositionsTabsView,
} from "../mobile/mobile-positions-tabs-view";
import { MobilePageView, MobileTerminalFrameView, MobileWorkspaceView } from "../mobile/mobile-terminal-frame-view";
import { MobileTokenSelectorView } from "../mobile/mobile-token-selector-view";
import { MobileTradeOrderSplitView } from "../mobile/mobile-trade-frame-view";
import { OrderbookGroupingTriggerView } from "../orderbook/orderbook-grouping-trigger-view";
import {
	ORDERBOOK_PANEL_CLASS,
	ORDERBOOK_TAB_CONTENT_CLASS,
	OrderbookPanelView,
} from "../orderbook/orderbook-panel-view";
import { OrderbookTabsView } from "../orderbook/orderbook-tabs-view";
import { AccountTabStripView } from "../positions/account-tab-strip-view";
import {
	ACCOUNT_TABLE_FIXED_CLASS,
	ACCOUNT_TABLE_PANEL_CLASS,
	ACCOUNT_TABLE_TABS_CLASS,
	AccountTableHeaderView,
} from "../positions/account-table-header-view";
import { AccountActionButtonView } from "../tradebox/account-action-button-view";
import { AccountOverviewView } from "../tradebox/account-overview-view";
import { AccountPanelFrameView } from "../tradebox/account-panel-frame-view";
import { OrderTypeTabView } from "../tradebox/order-type-tab-view";
import { SideToggleView } from "../tradebox/side-toggle-view";
import { TradeAvailableRowView } from "../tradebox/trade-available-row-view";
import { TradeCheckboxView } from "../tradebox/trade-checkbox-view";
import { TradeControlButtonView } from "../tradebox/trade-control-button-view";
import { TradeCtaView } from "../tradebox/trade-cta-view";
import { TradeFormFieldsView } from "../tradebox/trade-form-fields-view";
import { TradeHeaderView } from "../tradebox/trade-header-view";
import { TradeInputFrameView } from "../tradebox/trade-input-frame-view";
import { TradeOptionCheckboxesView } from "../tradebox/trade-option-checkboxes-view";
import { TradePanelBodyView } from "../tradebox/trade-panel-body-view";
import { TradePanelFooterView } from "../tradebox/trade-panel-footer-view";
import { TRADE_PERCENT_INPUT_CLASS, TradePercentFrameView } from "../tradebox/trade-percent-frame-view";
import { TradeSizeSliderRowView } from "../tradebox/trade-size-slider-row-view";
import { TradeSizeUnitView } from "../tradebox/trade-size-unit-view";
import { type DesktopGridLoadingPanelId, DesktopGridLoadingSurface } from "./desktop-grid-loading-surface";
import {
	DESKTOP_PANEL_PLACEHOLDER,
	type DesktopPanelPlaceholderProps,
	FOOTER_PLACEHOLDER,
	TOP_NAV_PLACEHOLDER,
} from "./desktop-placeholders";
import { DesktopTerminalFrameView } from "./desktop-terminal-frame-view";
import { MarketHeaderView } from "./market-header-view";
import {
	MOBILE_BOOK_PLACEHOLDER,
	MOBILE_HEADER_PLACEHOLDER,
	MOBILE_MARKET_PLACEHOLDER,
	MOBILE_NAV_PLACEHOLDER,
	MOBILE_ORDER_ENTRY_PLACEHOLDER,
	MOBILE_POSITIONS_PLACEHOLDER,
} from "./mobile-placeholders";

export function AppShellSkeleton() {
	return (
		<div aria-busy="true" data-testid="app-shell-fallback">
			<output className="sr-only">Loading GATU...</output>
			<div aria-hidden="true" inert>
				<style>{`
					[data-shell-mobile]{display:flex}
					[data-shell-desktop]{display:none}
					@media (min-width:1001px){
						[data-shell-mobile]{display:none}
						[data-shell-desktop]{display:flex}
					}
				`}</style>
				<MobileShellSkeleton />
				<DesktopTerminalFrameView
					data-shell-desktop
					className="hidden min-[1001px]:flex"
					header={<TopNavView {...TOP_NAV_PLACEHOLDER} />}
					workspace={
						<main className="min-h-0 flex-1 bg-grid-container">
							<DesktopGridLoadingSurface
								markShellPanels
								panelClassName="desktop-grid-panel overflow-hidden bg-surface"
								renderPanel={(panelId) => renderDesktopPanel(panelId, DESKTOP_PANEL_PLACEHOLDER)}
							/>
						</main>
					}
					footer={<FooterBarView {...FOOTER_PLACEHOLDER} />}
				/>
			</div>
		</div>
	);
}

export function renderDesktopPanel(panelId: DesktopGridLoadingPanelId, props: DesktopPanelPlaceholderProps) {
	const { favorites, marketHeader, orderbook, tradePanel, accountTable, accountOverview } = props;
	switch (panelId) {
		case "favoriteCoins":
			return <FavoritesStripView {...favorites} />;
		case "coinInfo":
			return (
				<MarketHeaderView
					head={
						<>
							<AssetIconSlotView interactive icon={<span className="size-[26px] rounded-full bg-fill-weak" />} />
							<TokenSelectorTriggerView {...marketHeader.trigger} />
						</>
					}
					overview={<MarketOverviewView stats={marketHeader.stats} ariaLabel={marketHeader.ariaLabel} />}
				/>
			);
		case "chart":
			return <ChartFrame />;
		case "marketData":
			return (
				<div className={ORDERBOOK_PANEL_CLASS}>
					<OrderbookTabsView labels={orderbook.labels} active={orderbook.active} />
					<div className={ORDERBOOK_TAB_CONTENT_CLASS}>
						<OrderbookPanelView {...orderbook} />
					</div>
				</div>
			);
		case "tradingInterface":
			return (
				<TradePanelBodyView
					header={
						<TradeHeaderView
							orderTypeIndex={["market", "limit", "advanced"].indexOf(tradePanel.active)}
							controls={
								<>
									<TradeControlButtonView
										labelFull={tradePanel.labels.marginMode}
										labelCompact={tradePanel.labels.margin}
										value={tradePanel.margin}
										title={tradePanel.margin}
										aria-haspopup="dialog"
									/>
									<TradeControlButtonView
										labelFull={tradePanel.labels.leverage}
										value={tradePanel.leverage}
										valueClassName="tabular-nums text-trading-panel-fg"
										title={tradePanel.leverage}
										aria-haspopup="dialog"
									/>
									<TradeControlButtonView
										labelFull={tradePanel.labels.accountMode}
										labelCompact={tradePanel.labels.account}
										value={tradePanel.account}
										valueCompact={tradePanel.account}
										loading={tradePanel.loading}
										title={tradePanel.account}
										aria-label={tradePanel.labels.accountMode}
										aria-haspopup="dialog"
									/>
								</>
							}
							tabs={
								<>
									<OrderTypeTabView active={tradePanel.active === "market"} label={tradePanel.labels.market} />
									<OrderTypeTabView active={false} label={tradePanel.labels.limit} />
									<div className="min-w-0">
										<OrderTypeTabView
											active={false}
											label={tradePanel.labels.advanced}
											labelCompact={tradePanel.labels.other}
											aria-label={tradePanel.labels.advancedOrderTypes}
										/>
									</div>
								</>
							}
							sideToggle={<SideToggleView side={tradePanel.side} labels={tradePanel.sideLabels} />}
						/>
					}
					fields={
						<TradeFormFieldsView
							available={
								<TradeAvailableRowView
									label={
										<span className="cursor-default whitespace-nowrap text-trading-panel-muted">
											{tradePanel.labels.available}
										</span>
									}
									value={tradePanel.available}
									positionValue={tradePanel.position}
								/>
							}
							size={
								<TradeInputFrameView
									label={tradePanel.labels.size}
									value=""
									placeholder="0.00"
									readOnly
									disabled
									frameClassName="opacity-50"
									trailing={<TradeSizeUnitView unit={tradePanel.sizeUnit} disabled />}
								/>
							}
							slider={
								<TradeSizeSliderRowView
									slider={
										<TradeSliderView
											dir="ltr"
											ariaLabel={`${tradePanel.labels.size} (%)`}
											inputId="trade-panel-size-slider"
											progress={0}
											rtl={false}
											unavailable
											showTicks
											ticks={[0, 25, 50, 75, 100]}
											inputProps={{
												min: 0,
												max: 100,
												step: 1,
												defaultValue: 0,
												disabled: true,
												"aria-valuetext": "0%",
											}}
										/>
									}
									percent={
										<TradePercentFrameView
											frameClassName="h-8 w-16 shrink-0 rounded-[8px] px-2 opacity-50"
											input={
												<input
													type="text"
													dir="ltr"
													inputMode="numeric"
													data-slot="input"
													data-size="sm"
													value="0"
													readOnly
													disabled
													aria-label={`${tradePanel.labels.size} (%)`}
													className={getInputClassName(
														"sm",
														cn("w-full", TRADE_PERCENT_INPUT_CLASS, "text-trading-panel-subtle"),
													)}
												/>
											}
										/>
									}
								/>
							}
							options={
								<div className="space-y-2 py-0.5">
									<TradeOptionCheckboxesView
										tradingPanel
										className="flex flex-wrap items-center gap-x-4 gap-y-2.5 text-xs"
										reduceOnly={
											<TradeCheckboxView
												checked={tradePanel.optionsChecked}
												label={tradePanel.labels.reduceOnly}
												ariaLabel={tradePanel.labels.reduceOnly}
											/>
										}
										tpSl={
											<TradeCheckboxView
												checked={tradePanel.optionsChecked}
												label={tradePanel.labels.tpSl}
												ariaLabel={tradePanel.labels.tpSlAria}
												spanAll
											/>
										}
									/>
								</div>
							}
						/>
					}
					footer={
						<TradePanelFooterView
							actions={<TradeCtaView variant="cyan" label={tradePanel.cta} aria-label={tradePanel.cta} />}
							summary={
								<div className="flex min-w-0 flex-col">
									{tradePanel.summaryRows.map((row) => (
										<SummaryRow key={row.id} compact label={tradePanel.labels[row.id]}>
											{row.id === "slippage" ? (
												<button
													type="button"
													className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap hover:opacity-80"
												>
													<span className="tabular-nums text-trading-panel-error">{row.value}</span>
													<PencilIcon className="size-2.5 text-trading-panel-subtle" />
												</button>
											) : row.id === "fees" ? (
												<span
													title={`${tradePanel.labels.taker} / ${tradePanel.labels.maker}`}
													className="cursor-help whitespace-nowrap border-b border-dashed border-trading-panel-stroke-control font-normal text-trading-panel-muted"
												>
													<span className="whitespace-nowrap">{row.value}</span>
												</span>
											) : (
												<span className="whitespace-nowrap font-normal text-trading-panel-muted">{row.value}</span>
											)}
										</SummaryRow>
									))}
								</div>
							}
						/>
					}
				/>
			);
		case "accountTable":
			return (
				<div className={cn(ACCOUNT_TABLE_PANEL_CLASS, ACCOUNT_TABLE_FIXED_CLASS)}>
					<div className={ACCOUNT_TABLE_TABS_CLASS}>
						<AccountTableHeaderView tabs={<AccountTabStripView {...accountTable} />} />
					</div>
				</div>
			);
		case "accountInfo":
			return (
				<AccountPanelFrameView title={accountOverview.accountTitle}>
					<AccountOverviewView
						title={accountOverview.title}
						rows={accountOverview.rows}
						deposit={<AccountActionButtonView {...accountOverview.deposit} />}
						withdraw={<AccountActionButtonView {...accountOverview.withdraw} />}
					/>
				</AccountPanelFrameView>
			);
	}
}

function ChartFrame() {
	return (
		<div className="flex h-full items-center justify-center">
			<GatuLogo variant="mark" micro className="size-7 opacity-40" />
		</div>
	);
}

interface Props {
	header?: typeof MOBILE_HEADER_PLACEHOLDER;
	market?: typeof MOBILE_MARKET_PLACEHOLDER;
	orderEntry?: typeof MOBILE_ORDER_ENTRY_PLACEHOLDER;
	orderbook?: typeof MOBILE_BOOK_PLACEHOLDER;
	positions?: typeof MOBILE_POSITIONS_PLACEHOLDER;
	navigation?: Omit<typeof MOBILE_NAV_PLACEHOLDER, "activeTab">;
	activePositionsTab?: MobilePositionsTabValue;
	activeNavTab?: MobileTab;
}
export function MobileShellSkeleton({
	header = MOBILE_HEADER_PLACEHOLDER,
	market = MOBILE_MARKET_PLACEHOLDER,
	orderEntry = MOBILE_ORDER_ENTRY_PLACEHOLDER,
	orderbook = MOBILE_BOOK_PLACEHOLDER,
	positions = MOBILE_POSITIONS_PLACEHOLDER,
	navigation = MOBILE_NAV_PLACEHOLDER,
	activePositionsTab = "positions",
	activeNavTab = "trade",
}: Props) {
	return (
		<MobileTerminalFrameView
			aria-hidden="true"
			inert
			data-shell-mobile
			className="overflow-hidden overscroll-none min-[1001px]:hidden"
			header={<MobileHeaderView {...header} />}
			content={
				<MobileWorkspaceView>
					<MobilePageView>
						<MobileMarketBarView
							{...market}
							className="min-h-[61px]"
							selector={<MobileTokenSelectorView {...market.trigger} />}
						/>
						<MobileTradeOrderSplitView
							orderbook={
								<MobileBookFrameView className="absolute inset-0">
									<MobileBookChromeView
										{...orderbook}
										grouping={
											<div>
												<OrderbookGroupingTriggerView
													mobile
													label={orderbook.groupingLabel}
													aria-label={orderbook.precisionLabel}
												/>
											</div>
										}
										modes={<MobileBookModeControlsView {...orderbook.modeControls} />}
									/>
								</MobileBookFrameView>
							}
						>
							<MobileOrderEntryPlaceholderView data={orderEntry} />
						</MobileTradeOrderSplitView>
						<MobilePositionsFrameView>
							<MobilePositionsPanelView isPageScroll>
								<MobilePositionsTabsView
									tabs={<MobilePositionsTabStripView {...positions} active={activePositionsTab} />}
								/>
							</MobilePositionsPanelView>
						</MobilePositionsFrameView>
					</MobilePageView>
				</MobileWorkspaceView>
			}
			nav={<MobileBottomNavView {...navigation} activeTab={activeNavTab} />}
		/>
	);
}
