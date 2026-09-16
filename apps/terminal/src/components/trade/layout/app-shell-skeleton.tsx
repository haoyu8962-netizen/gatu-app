import { CaretDownIcon, GearIcon, GlobeIcon, ListIcon, MoonIcon, SunIcon, WalletIcon } from "@phosphor-icons/react";
import { GatuLogo } from "@/components/brand/gatu-logo";
import * as mobileChrome from "@/components/trade/mobile/mobile-chrome-classes";
import { MOBILE_BOTTOM_NAV_HEIGHT_PX } from "@/config/layout";
import { MOBILE_NAV_ITEMS, type MobileTab } from "@/config/nav";
import { MOBILE_POSITIONS_TABS, type MobilePositionsTabValue } from "@/config/trade";
import { cn } from "@/lib/cn";
import { tradingInputFrameClass } from "@/lib/ui/trading-input";
import { TokenSelectorTriggerView } from "../chart/token-selector-trigger-view";
import { AssetIconSlotView } from "../components/asset-icon-slot-view";
import { FooterBarView } from "../footer/footer-bar-view";
import { FavoritesStripView } from "../header/favorites-strip-view";
import { TopNavView } from "../header/top-nav-view";
import { MarketOverviewView } from "../market-overview-view";
import {
	ORDERBOOK_PANEL_CLASS,
	ORDERBOOK_TAB_CONTENT_CLASS,
	OrderbookPanelView,
} from "../orderbook/orderbook-panel-view";
import { OrderbookTabsView } from "../orderbook/orderbook-tabs-view";
import { type DesktopGridLoadingPanelId, DesktopGridLoadingSurface } from "./desktop-grid-loading-surface";
import {
	FAVORITES_PLACEHOLDER,
	FOOTER_PLACEHOLDER,
	MARKET_HEADER_PLACEHOLDER,
	ORDERBOOK_PLACEHOLDER,
	TOP_NAV_PLACEHOLDER,
} from "./desktop-placeholders";
import { DesktopTerminalFrameView } from "./desktop-terminal-frame-view";
import { MarketHeaderView } from "./market-header-view";

// The boot placeholder is prerendered once for every market and hydrated before any catalog other
// than English is active, so its labels are English source strings, never translations: a translated
// label would differ from the prerendered HTML and force React to discard the shell. The real page
// replaces the whole frame in the persisted locale as soon as the runtime mounts.
const VALUE_PLACEHOLDER = "-";
const NAME_PLACEHOLDER = "—";

export interface PanelFrameLabels {
	size: string;
	orderControls: readonly (readonly [label: string, value: string])[];
	orderTypeTabs: readonly string[];
	long: string;
	short: string;
	available: string;
	orderOptions: readonly string[];
	connectWallet: string;
	orderSummaryRows: readonly string[];
	accountTabs: readonly string[];
	deposit: string;
	withdraw: string;
	accountSummary: string;
	accountSummaryRows: readonly string[];
}

export const DEFAULT_PANEL_FRAME_LABELS: PanelFrameLabels = {
	size: "Size",
	orderControls: [
		["Margin", "Cross"],
		["Leverage", NAME_PLACEHOLDER],
		["Account", "Account"],
	],
	orderTypeTabs: ["Market", "Limit", "Advanced"],
	long: "Long",
	short: "Short",
	available: "Available",
	orderOptions: ["Reduce Only", "TP/SL"],
	connectWallet: "Connect Wallet",
	orderSummaryRows: ["Liq. Price", "Order Value", "Margin Req.", "Est. Slippage", "Slippage", "Fees"],
	accountTabs: ["Balances", "Positions", "Open Orders", "TWAP", "Trade History", "Funding Payments", "Order History"],
	deposit: "Deposit",
	withdraw: "Withdraw",
	accountSummary: "Account Summary",
	accountSummaryRows: ["Account Margin Ratio", "Portfolio Value", "Cross Account Leverage"],
};
const CONTROL_BUTTON_CLASS =
	"flex h-[34px] min-h-[34px] items-center justify-center rounded-[10px] px-4 font-market-close text-[13px] leading-[18px] font-bold";
const UNDERLINE_TAB_CLASS = "whitespace-nowrap px-2.5 py-2 text-xs font-medium";
const SUMMARY_ROW_CLASS = "flex items-center justify-between gap-2 text-xs";

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
								renderPanel={renderDesktopPanelFrame}
							/>
						</main>
					}
					footer={<FooterBarView {...FOOTER_PLACEHOLDER} />}
				/>
			</div>
		</div>
	);
}

export function renderDesktopPanelFrame(
	panelId: DesktopGridLoadingPanelId,
	labels = DEFAULT_PANEL_FRAME_LABELS,
	orderbook = ORDERBOOK_PLACEHOLDER,
) {
	switch (panelId) {
		case "favoriteCoins":
			return <FavoritesFrame />;
		case "coinInfo":
			return <MarketHeaderFrame />;
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
			return <TradePanelFrame labels={labels} />;
		case "accountTable":
			return <AccountTableFrame labels={labels} />;
		case "accountInfo":
			return <AccountInfoFrame labels={labels} />;
	}
}

interface FrameProps {
	labels: PanelFrameLabels;
}

function FavoritesFrame() {
	return <FavoritesStripView {...FAVORITES_PLACEHOLDER} />;
}

function MarketHeaderFrame() {
	return (
		<MarketHeaderView
			head={
				<>
					<AssetIconSlotView interactive icon={<span className="size-[26px] rounded-full bg-fill-weak" />} />
					<TokenSelectorTriggerView {...MARKET_HEADER_PLACEHOLDER.trigger} />
				</>
			}
			overview={
				<MarketOverviewView stats={MARKET_HEADER_PLACEHOLDER.stats} ariaLabel={MARKET_HEADER_PLACEHOLDER.ariaLabel} />
			}
		/>
	);
}

function ChartFrame() {
	return (
		<div className="flex h-full items-center justify-center">
			<GatuLogo variant="mark" micro className="size-7 opacity-40" />
		</div>
	);
}

function TradePanelFrame({ labels }: FrameProps) {
	return (
		<div className="flex h-full flex-col gap-3 overflow-hidden p-3">
			<div className="grid grid-cols-3 gap-1.5">
				{labels.orderControls.map(([label, value]) => (
					<div key={label} className="rounded-8 border border-trading-panel-stroke-card px-2 py-1.5">
						<div className="text-3xs text-trading-panel-muted">{label}</div>
						<div className="flex items-center justify-between gap-1 text-xs font-medium text-fg">
							<span className="truncate">{value}</span>
							<CaretDownIcon className="size-3 shrink-0 text-trading-panel-subtle" />
						</div>
					</div>
				))}
			</div>
			<div className="flex border-b border-stroke-weak text-xs font-medium">
				{labels.orderTypeTabs.map((label, index) => (
					<span
						key={label}
						className={cn("flex-1 py-2 text-center", index === 0 ? "border-b-2 border-fg text-fg" : "text-fg-muted")}
					>
						{label}
					</span>
				))}
			</div>
			<div className="grid grid-cols-2 gap-1 rounded-8 border border-trading-panel-stroke-card p-1 text-xs font-semibold">
				<span className="rounded-6 border border-stroke-success-strong py-1.5 text-center text-success">
					{labels.long}
				</span>
				<span className="py-1.5 text-center text-fg-muted">{labels.short}</span>
			</div>
			<div className={SUMMARY_ROW_CLASS}>
				<span className="text-trading-panel-muted">{labels.available}</span>
				<span className="text-fg">{VALUE_PLACEHOLDER}</span>
			</div>
			<div className="flex items-center justify-between rounded-8 border border-trading-panel-stroke-input px-3 py-2 text-xs">
				<span className="text-trading-panel-muted">{labels.size}</span>
				<span className="flex items-center gap-1 text-fg-muted">
					0.00
					<span className="font-medium text-fg">{NAME_PLACEHOLDER}</span>
					<CaretDownIcon className="size-3" />
				</span>
			</div>
			<div className="flex items-center gap-3">
				<span className="h-1 flex-1 rounded-full bg-fill-weak" />
				<span className="rounded-6 border border-trading-panel-stroke-input px-2 py-1 text-xs text-fg-muted">0 %</span>
			</div>
			<div className="space-y-2 text-xs text-trading-panel-muted">
				{labels.orderOptions.map((label) => (
					<div key={label} className="flex items-center gap-2">
						<span className="size-3.5 rounded-6 border border-trading-panel-stroke-control" />
						{label}
					</div>
				))}
			</div>
			<div className="flex-1" />
			<span
				className={cn(
					CONTROL_BUTTON_CLASS,
					"h-10 min-h-10 bg-market-close-control text-2sm text-market-close-on-control",
				)}
			>
				{labels.connectWallet}
			</span>
			<div className="space-y-1.5">
				{labels.orderSummaryRows.map((label) => (
					<div key={label} className={SUMMARY_ROW_CLASS}>
						<span className="text-trading-panel-muted">{label}</span>
						<span className="text-fg">{VALUE_PLACEHOLDER}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function AccountTableFrame({ labels }: FrameProps) {
	return (
		<div className="flex h-full flex-col">
			<div className="flex gap-1 overflow-hidden border-b border-stroke-weak px-3">
				{labels.accountTabs.map((label, index) => (
					<span
						key={label}
						className={cn(UNDERLINE_TAB_CLASS, index === 1 ? "border-b-2 border-fg text-fg" : "text-fg-muted")}
					>
						{label}
					</span>
				))}
			</div>
		</div>
	);
}

function AccountInfoFrame({ labels }: FrameProps) {
	return (
		<div className="flex h-full flex-col gap-3 overflow-hidden p-3">
			<div className="grid grid-cols-2 gap-2 text-xs font-semibold">
				<span className="rounded-8 bg-fill-weak py-2 text-center text-fg">{labels.deposit}</span>
				<span className="rounded-8 border border-trading-panel-stroke-card py-2 text-center text-fg-muted">
					{labels.withdraw}
				</span>
			</div>
			<span className="text-2sm font-semibold text-fg">{labels.accountSummary}</span>
			<div className="space-y-1.5">
				{labels.accountSummaryRows.map((label) => (
					<div key={label} className={SUMMARY_ROW_CLASS}>
						<span className="text-fg-muted">{label}</span>
						<span className="text-fg">{VALUE_PLACEHOLDER}</span>
					</div>
				))}
			</div>
		</div>
	);
}

interface Props {
	labels?: MobilePanelFrameLabels;
	activePositionsTab?: MobilePositionsTabValue;
	activeNavTab?: MobileTab;
}

export interface MobilePanelFrameLabels {
	connectWallet: string;
	long: string;
	short: string;
	available: string;
	size: string;
	price: string;
	orderOptions: readonly string[];
	orderSummaryRows: readonly string[];
	accountTabs: readonly string[];
	nav: readonly string[];
}

export const DEFAULT_MOBILE_PANEL_FRAME_LABELS: MobilePanelFrameLabels = {
	connectWallet: "Connect Wallet",
	long: "Long",
	short: "Short",
	available: "Available",
	size: "Size",
	price: "Price",
	orderOptions: ["Reduce Only", "TP/SL"],
	orderSummaryRows: ["Liq. Price", "Order Value", "Margin Req.", "Slippage", "Est. Fee"],
	accountTabs: MOBILE_POSITIONS_TABS.map((tab) => tab.label.message),
	nav: MOBILE_NAV_ITEMS.map((item) => item.label.message ?? NAME_PLACEHOLDER),
};

export function MobileShellSkeleton({
	labels = DEFAULT_MOBILE_PANEL_FRAME_LABELS,
	activePositionsTab = "positions",
	activeNavTab = "trade",
}: Props) {
	const activePositionsTabIndex = MOBILE_POSITIONS_TABS.findIndex((tab) => tab.value === activePositionsTab);
	return (
		<div
			aria-hidden="true"
			data-shell-mobile
			className={cn(mobileChrome.terminal, "overflow-hidden overscroll-none min-[1001px]:hidden")}
		>
			<div className={cn(mobileChrome.headerSafeArea, mobileChrome.headerSurface, mobileChrome.headerBorder)}>
				<div data-slot="mobile-header-inner" className={mobileChrome.headerInner}>
					<div data-slot="mobile-header-brand" className={mobileChrome.headerBrand}>
						<span className={cn(mobileChrome.buttonIconGhostNeutralSm, "touch-target")}>
							<ListIcon className="size-4.5 text-trading-panel-fg" />
						</span>
						<span className={mobileChrome.headerLogo}>
							<GatuLogo variant="mark" micro className="size-[22px]" />
						</span>
					</div>
					<div data-slot="mobile-header-actions" className={mobileChrome.headerActions}>
						<div data-slot="mobile-header-account" className={mobileChrome.headerAccount}>
							<span className={cn(mobileChrome.buttonOutlineNeutralSm, mobileChrome.headerWalletFrame)}>
								<WalletIcon className="size-3.5" />
								<span className="min-w-0 truncate">{labels.connectWallet}</span>
							</span>
						</div>
						<span
							data-slot="mobile-header-theme"
							className={cn(mobileChrome.buttonIconGhostNeutralSm, mobileChrome.headerTheme)}
						>
							<SunIcon className="hidden size-4.5 dark:block" />
							<MoonIcon className="size-4.5 dark:hidden" />
						</span>
						<span
							className={cn(
								"inline-flex shrink-0 items-center justify-center rounded-[10px] bg-transparent font-market-close",
								mobileChrome.headerLanguage,
							)}
						>
							<GlobeIcon className="size-[18px] shrink-0" />
						</span>
						<span className={cn(mobileChrome.buttonIconGhostNeutralSm, mobileChrome.headerSettings)}>
							<GearIcon className="size-4.5" />
						</span>
					</div>
				</div>
			</div>
			<div className={mobileChrome.workspace}>
				<div className={cn(mobileChrome.pageSurface, mobileChrome.pageScroll)}>
					<div data-slot="mobile-market-bar" className={cn(mobileChrome.marketBar, "min-h-[61px]")}>
						<div className="min-w-0">
							<div className={mobileChrome.marketGrid}>
								<div className="flex min-w-0 items-center gap-0">
									<div className={mobileChrome.marketAsset}>
										<span className="inline-flex items-center justify-center">
											<span className="size-7 rounded-full bg-fill-weak" />
										</span>
									</div>
									<span data-slot="mobile-market-selector" className={cn(mobileChrome.marketSelector, "pl-1")}>
										<span className="flex min-w-0 shrink-0 flex-col items-start gap-1">
											<span className="flex min-w-0 items-center gap-1.5 max-[360px]:gap-1">
												<span className={mobileChrome.marketName}>{NAME_PLACEHOLDER}</span>
												<CaretDownIcon className="size-3 shrink-0 text-trading-panel-subtle" />
											</span>
											<span className="flex min-w-0 items-center gap-1">
												<span
													className={cn(mobileChrome.marketBadge, "bg-trading-panel-hover text-trading-panel-muted")}
												>
													{NAME_PLACEHOLDER}
												</span>
												<span
													className={cn(
														mobileChrome.marketBadge,
														"bg-trading-panel-hover text-trading-panel-muted tabular-nums",
													)}
												>
													{VALUE_PLACEHOLDER}
												</span>
											</span>
										</span>
									</span>
								</div>
								<div className={mobileChrome.marketQuote}>
									<div className="min-w-0 text-start">
										<div className="flex min-w-0 flex-col items-start">
											<span className={mobileChrome.marketPrice}>{VALUE_PLACEHOLDER}</span>
											<div className={cn(mobileChrome.marketChange, "invisible text-trading-panel-subtle")}>
												{VALUE_PLACEHOLDER}
											</div>
										</div>
									</div>
									<span
										className={cn(
											mobileChrome.marketExpand,
											"border-trading-panel-stroke-input text-trading-panel-muted",
										)}
									>
										<CaretDownIcon className="size-3.5" />
									</span>
								</div>
							</div>
						</div>
					</div>
					<div data-slot="mobile-trade-order-split" className={mobileChrome.tradeSplit}>
						<div className={cn(mobileChrome.tradeView, mobileChrome.tradeColumn)}>
							<div data-slot="mobile-order-entry-scroll" className={cn(mobileChrome.tradeScroll, "min-h-min")}>
								<div data-slot="mobile-order-entry-content" className={mobileChrome.tradeEmbeddedContent}>
									<div className="min-w-0 space-y-0.5">
										<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] bg-surface">
											{[0, 1, 2].map((index) => (
												<span
													key={index}
													className={cn(mobileChrome.orderControl, "justify-start", index === 2 && "pr-4")}
												>
													<span className="truncate">{index === 2 ? VALUE_PLACEHOLDER : NAME_PLACEHOLDER}</span>
													<CaretDownIcon viewBox="32 72 192 128" className={mobileChrome.orderCaret} />
												</span>
											))}
										</div>
										<div
											data-slot="mobile-side-toggle"
											className={cn("inline-flex w-full items-center border mb-0", mobileChrome.sideBox)}
										>
											{[labels.long, labels.short].map((label) => (
												<span
													key={label}
													className={cn(
														"relative inline-flex flex-1 items-center justify-center border border-transparent px-3 whitespace-nowrap rounded-[9px] font-bold text-trading-panel-muted",
														mobileChrome.sideMobile,
													)}
												>
													{label}
												</span>
											))}
										</div>
									</div>
									<div className={mobileChrome.available}>
										<span className="shrink-0 whitespace-nowrap">{labels.available}</span>
										<span className="tabular-nums text-trading-panel-fg">{VALUE_PLACEHOLDER}</span>
									</div>
									<div className="space-y-2">
										<div className={cn(tradingInputFrameClass, mobileChrome.sizeFrame)}>
											<span className={mobileChrome.sizeLabel}>{labels.size}</span>
											<span className={mobileChrome.sizeValue}>{VALUE_PLACEHOLDER}</span>
											<span className={mobileChrome.sizeUnit}>
												{NAME_PLACEHOLDER}
												<CaretDownIcon className="size-3 text-trading-panel-subtle" />
											</span>
										</div>
										<div className={mobileChrome.sizeSliderRow}>
											<div className="relative min-w-0 flex-1">
												<div data-slot="mobile-size-slider-frame" className={mobileChrome.sliderFrame}>
													<div className={cn(mobileChrome.sliderTrack, "bg-fill-weak")} />
												</div>
											</div>
											<span
												className={cn(
													tradingInputFrameClass,
													mobileChrome.sizePercent,
													"justify-end text-base tabular-nums text-trading-panel-fg",
												)}
											>
												{VALUE_PLACEHOLDER}
												<span className="text-2xs text-trading-panel-subtle">%</span>
											</span>
										</div>
									</div>
									<div
										className={cn(
											"flex flex-wrap items-center gap-y-1 gap-x-2 text-2xs max-[379px]:gap-x-1",
											mobileChrome.optionsGrid,
										)}
									>
										{labels.orderOptions.map((label, index) => (
											<span key={label} className={cn("inline-flex", mobileChrome.option, index === 1 && "col-span-2")}>
												<span className={cn("shrink-0 border bg-background", mobileChrome.optionControl)} />
												<span className={mobileChrome.optionLabel}>{label}</span>
											</span>
										))}
									</div>
									<div data-slot="mobile-order-summary" className={cn(mobileChrome.summary, "text-2xs")}>
										{labels.orderSummaryRows.map((label, index) => (
											<div
												key={label}
												className={cn(
													mobileChrome.summaryRow,
													index === 3 ? "gap-1 py-1" : mobileChrome.summaryCompactRow,
												)}
											>
												<span className={mobileChrome.summaryLabel}>{label}</span>
												<span className={cn(mobileChrome.summaryValue, "text-trading-panel-muted")}>
													{VALUE_PLACEHOLDER}
												</span>
											</div>
										))}
									</div>
								</div>
							</div>
							<div
								data-slot="mobile-order-cta"
								className={cn(mobileChrome.ctaWrapper, mobileChrome.ctaEmbeddedPadding)}
							>
								<span
									className={cn(
										mobileChrome.buttonFilledBrandMd,
										mobileChrome.ctaButton,
										mobileChrome.ctaEmbeddedHeight,
										mobileChrome.ctaConnect,
										mobileChrome.ctaConnectDark,
									)}
								>
									{labels.connectWallet}
								</span>
							</div>
						</div>
						<div className={mobileChrome.bookColumn}>
							<div className="absolute inset-0 flex min-h-0 flex-col bg-background">
								<div data-slot="compact-orderbook" className={mobileChrome.book}>
									<div className={mobileChrome.bookHeader}>
										<div className="min-w-0 truncate">
											{labels.price} <span className="orderbook-asset-heading normal-case">({NAME_PLACEHOLDER})</span>
										</div>
										<div className="min-w-0 truncate text-right">
											{labels.size} <span className="orderbook-asset-heading normal-case">({NAME_PLACEHOLDER})</span>
										</div>
									</div>
									<div className="flex min-h-0 flex-1 flex-col">
										<div className="relative min-h-0 flex-1 overflow-hidden" />
										<div className={mobileChrome.bookMid}>
											<span className="shrink-0 tabular-nums text-base text-trading-panel-fg">{VALUE_PLACEHOLDER}</span>
										</div>
										<div className="relative min-h-0 flex-1 overflow-hidden" />
									</div>
									<div className={mobileChrome.bookFooter}>
										<span className="relative min-h-6 px-2 text-xs tabular-nums text-trading-panel-muted">
											{VALUE_PLACEHOLDER}
										</span>
										<span className="min-w-0 flex-1" />
										<div className="flex shrink-0 items-center gap-1">
											{[0, 1, 2].map((index) => (
												<span
													key={index}
													className="grid h-[22px] w-6 place-items-center rounded-[5px] text-trading-panel-muted"
												>
													<span className="grid size-3 grid-rows-2 gap-px overflow-hidden rounded-[3px]">
														<span className="bg-fill-weak" />
														<span className="bg-fill-weak" />
													</span>
												</span>
											))}
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
					<div className={cn(mobileChrome.positionsWrapper, "font-market-close")}>
						<div className="relative min-w-0 shrink-0">
							<div className={mobileChrome.positionsScroll}>
								<div
									data-slot="mobile-positions-tabs"
									className={cn("relative flex items-center", mobileChrome.positionsTabs)}
								>
									{labels.accountTabs.map((label, index) => (
										<span
											key={label}
											data-active={index === activePositionsTabIndex ? "" : undefined}
											className={cn(
												"relative inline-flex h-full items-center justify-center whitespace-nowrap py-1 gap-1",
												mobileChrome.positionsTab,
											)}
										>
											{label}
											{index === activePositionsTabIndex && (
												<span className="absolute -bottom-px inset-x-0 h-0.5 bg-market-close-fg" />
											)}
										</span>
									))}
								</div>
							</div>
							<div className={mobileChrome.positionsFade} />
						</div>
					</div>
				</div>
			</div>
			<div className={cn(mobileChrome.nav, "[touch-action:pan-x_pinch-zoom]", mobileChrome.navSafeArea)}>
				<div className={mobileChrome.navInner}>
					{MOBILE_NAV_ITEMS.map(({ id, icon: Icon }, index) => (
						<div
							key={id}
							style={{ minHeight: `${MOBILE_BOTTOM_NAV_HEIGHT_PX}px` }}
							className={cn(
								mobileChrome.navItem,
								id === activeNavTab ? "text-trading-panel-fg" : "text-trading-panel-subtle",
							)}
						>
							<span className="relative">
								<Icon className="size-5" />
							</span>
							<span className={cn(mobileChrome.navLabel, id === activeNavTab ? "font-bold" : "font-medium")}>
								{labels.nav[index]}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
