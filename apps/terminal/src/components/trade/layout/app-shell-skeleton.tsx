import {
	BookBookmarkIcon,
	CaretDownIcon,
	ChartBarIcon,
	CurrencyCircleDollarIcon,
	GearIcon,
	GlobeIcon,
	ListDashesIcon,
	SlidersHorizontalIcon,
	StarIcon,
	SunIcon,
	TrendUpIcon,
} from "@phosphor-icons/react";
import { GatuLogo } from "@/components/brand/gatu-logo";
import { APP_VERSION } from "@/config/app";
import { APP_FOOTER_HEIGHT_CLASS, APP_HEADER_HEIGHT_CLASS } from "@/config/layout";
import { cn } from "@/lib/cn";
import { type DesktopGridLoadingPanelId, DesktopGridLoadingSurface } from "./desktop-grid-loading-surface";

// The boot placeholder is prerendered once for every market and hydrated before any catalog other
// than English is active, so its labels are English source strings, never translations: a translated
// label would differ from the prerendered HTML and force React to discard the shell. The real page
// replaces the whole frame in the persisted locale as soon as the runtime mounts.
const VALUE_PLACEHOLDER = "-";
const NAME_PLACEHOLDER = "—";
const NAV_LABELS = ["Trade", "Portfolio", "Earn", "Vaults", "Staking", "Referrals", "Leaderboard", "More"] as const;
export interface PanelFrameLabels {
	marketStats: readonly string[];
	orderBook: string;
	trades: string;
	price: string;
	size: string;
	total: string;
	spread: string;
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
	marketStats: ["Mark", "ORACLE", "24h Change", "24H VOL", "OPEN INT", "FUNDING"],
	orderBook: "Order Book",
	trades: "Trades",
	price: "Price",
	size: "Size",
	total: "Total",
	spread: "Spread",
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
const FOOTER_LINKS = ["Docs", "Support", "Terms", "Privacy Policy", "Risk Disclosure"] as const;
const MOBILE_TABS = [
	{ label: "Markets", icon: ChartBarIcon },
	{ label: "Trade", icon: TrendUpIcon },
	{ label: "Account", icon: CurrencyCircleDollarIcon },
] as const;

const CONTROL_BUTTON_CLASS =
	"flex h-[34px] min-h-[34px] items-center justify-center rounded-[10px] px-4 font-market-close text-[13px] leading-[18px] font-bold";
const ICON_BUTTON_CLASS = "grid size-[34px] place-items-center rounded-[10px] text-market-close-muted";
const UNDERLINE_TAB_CLASS = "whitespace-nowrap px-2.5 py-2 text-xs font-medium";
const SUMMARY_ROW_CLASS = "flex items-center justify-between gap-2 text-xs";

export function AppShellSkeleton() {
	return (
		<div aria-busy="true" data-testid="app-shell-fallback">
			<output className="sr-only">Loading GATU...</output>
			<div aria-hidden="true">
				<style>{`
					[data-shell-mobile]{display:flex}
					[data-shell-desktop]{display:none}
					@media (min-width:1001px){
						[data-shell-mobile]{display:none}
						[data-shell-desktop]{display:flex}
					}
				`}</style>
				<MobileShellSkeleton />
				<div data-shell-desktop className="hidden h-screen w-full flex-col bg-background min-[1001px]:flex">
					<DesktopHeaderFrame />
					<div className="min-h-0 flex-1 overflow-hidden bg-grid-container">
						<DesktopGridLoadingSurface
							markShellPanels
							panelClassName="overflow-hidden bg-surface"
							renderPanel={renderDesktopPanelFrame}
						/>
					</div>
					<DesktopFooterFrame />
				</div>
			</div>
		</div>
	);
}

export function renderDesktopPanelFrame(panelId: DesktopGridLoadingPanelId, labels = DEFAULT_PANEL_FRAME_LABELS) {
	switch (panelId) {
		case "favoriteCoins":
			return <FavoritesFrame />;
		case "coinInfo":
			return <MarketHeaderFrame labels={labels} />;
		case "chart":
			return <ChartFrame />;
		case "marketData":
			return <OrderBookFrame labels={labels} />;
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

function DesktopHeaderFrame() {
	return (
		<div
			className={cn(
				APP_HEADER_HEIGHT_CLASS,
				"flex shrink-0 items-center border-b border-market-close-stroke-card bg-surface px-5 font-market-close",
			)}
		>
			<GatuLogo className="me-6 h-[18px] w-auto shrink-0" />
			<div className="flex items-center gap-0.5 text-[13px] leading-[18px] font-semibold">
				{NAV_LABELS.map((label, index) => (
					<span
						key={label}
						className={cn(
							"flex items-center gap-1 whitespace-nowrap rounded-[8px] px-2.5 py-2",
							index === 0 ? "text-market-close-fg" : "text-market-close-muted",
						)}
					>
						{label}
						{label === "Earn" && <span className="text-2xs font-medium">Soon</span>}
						{label === "More" && <CaretDownIcon className="size-[10px]" />}
					</span>
				))}
			</div>
			<div className="ms-auto flex items-center gap-2">
				<span className={cn(CONTROL_BUTTON_CLASS, "min-w-[9rem] bg-market-close-control text-market-close-on-control")}>
					Connect Wallet
				</span>
				<span className={ICON_BUTTON_CLASS}>
					<SunIcon className="size-[18px]" />
				</span>
				<span className="flex h-[34px] items-center gap-1.5 rounded-[10px] px-[9px] text-[13px] leading-[18px] font-semibold text-market-close-muted">
					<GlobeIcon className="size-[18px]" />
					English
				</span>
				<span className={ICON_BUTTON_CLASS}>
					<SlidersHorizontalIcon className="size-[18px]" />
				</span>
			</div>
		</div>
	);
}

function DesktopFooterFrame() {
	return (
		<div
			className={cn(
				APP_FOOTER_HEIGHT_CLASS,
				"relative flex shrink-0 items-center justify-between border-t border-stroke-weak bg-background px-4 text-3xs font-medium uppercase leading-none tracking-wide text-fg-muted",
			)}
		>
			<span className="flex items-center gap-1.5">
				<span className="size-1.5 rounded-full bg-fill-weak" />
				{NAME_PLACEHOLDER}
			</span>
			<span className="absolute left-1/2 -translate-x-1/2 rounded-6 border border-stroke-weak bg-sunken px-1 py-px font-sans">
				{"⌘K"}
			</span>
			<span className="flex items-center gap-2.5">
				<span className="flex items-center gap-2.5 normal-case">
					{FOOTER_LINKS.map((label) => (
						<span key={label}>{label}</span>
					))}
				</span>
				<span className="text-fg">{APP_VERSION}</span>
			</span>
		</div>
	);
}

function FavoritesFrame() {
	return (
		<div className="flex h-full items-center px-3">
			<StarIcon weight="fill" className="size-3 shrink-0 text-yellow" />
		</div>
	);
}

function MarketHeaderFrame({ labels }: FrameProps) {
	return (
		<div className="flex h-full min-w-0 items-center gap-6 overflow-hidden px-4">
			<div className="flex shrink-0 items-center gap-2">
				<span className="size-6 rounded-full bg-fill-weak" />
				<span className="text-sm font-semibold text-fg">{NAME_PLACEHOLDER}</span>
				<CaretDownIcon className="size-3 text-fg-muted" />
			</div>
			{labels.marketStats.map((label) => (
				<div key={label} className="flex shrink-0 flex-col gap-0.5">
					<span className="text-2xs tracking-wide text-fg-muted">{label}</span>
					<span className="text-xs font-medium tabular-nums text-fg">{VALUE_PLACEHOLDER}</span>
				</div>
			))}
		</div>
	);
}

function ChartFrame() {
	return (
		<div className="flex h-full items-center justify-center">
			<GatuLogo variant="mark" micro className="size-7 opacity-40" />
		</div>
	);
}

function OrderBookFrame({ labels }: FrameProps) {
	return (
		<div className="flex h-full flex-col">
			<div className="flex border-b border-stroke-weak text-xs font-medium">
				<span className="flex flex-1 items-center justify-center gap-1.5 border-b-2 border-fg px-2 py-2 text-fg">
					<BookBookmarkIcon className="size-3.5 shrink-0" />
					{labels.orderBook}
				</span>
				<span className="flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-fg-muted">
					<ListDashesIcon className="size-3.5 shrink-0" />
					{labels.trades}
				</span>
			</div>
			<div className="grid grid-cols-3 gap-1 border-b border-stroke-weak px-2 py-1.5 text-xs text-fg-muted">
				<span className="flex items-center gap-1">
					{labels.price}
					<CaretDownIcon className="size-3" />
				</span>
				<span className="text-right">
					{labels.size} ({NAME_PLACEHOLDER})
				</span>
				<span className="text-right">
					{labels.total} ({NAME_PLACEHOLDER})
				</span>
			</div>
			<div className="flex-1" />
			<div className="flex items-center justify-between bg-alternate px-2 py-1 text-xs text-fg-muted">
				<span>{labels.spread}</span>
				<span>{NAME_PLACEHOLDER}</span>
			</div>
			<div className="flex-1" />
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

export function MobileShellSkeleton() {
	return (
		<div
			aria-hidden="true"
			data-shell-mobile
			className="fixed inset-0 flex w-full flex-col overflow-hidden overscroll-none bg-background min-[1001px]:hidden"
		>
			<div className="pt-[env(safe-area-inset-top)] border-b border-stroke-weak/60">
				<div className="h-14 flex items-center justify-between pl-[max(0.625rem,var(--sal))] pr-[max(0.625rem,var(--sar))]">
					<div className="flex items-center gap-1.5">
						<div className="size-11 shrink-0" />
						<div className="grid size-11 shrink-0 place-items-center">
							<GatuLogo variant="mark" micro className="size-[22px]" />
						</div>
					</div>
					<div className="flex items-center gap-2">
						<span className="flex h-11 items-center rounded-8 border border-trading-panel-stroke-card px-2.5 text-xs font-semibold text-fg">
							Connect Wallet
						</span>
						<span className="grid size-11 place-items-center text-trading-panel-muted">
							<GearIcon className="size-4.5" />
						</span>
					</div>
				</div>
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-[3px] bg-grid-container py-[3px] pl-[max(3px,var(--sal))] pr-[max(3px,var(--sar))]">
				<div className="flex h-12 shrink-0 items-center justify-between bg-surface px-3">
					<span className="flex items-center gap-2 text-sm font-semibold text-fg">
						<span className="size-5 rounded-full bg-fill-weak" />
						{NAME_PLACEHOLDER}
						<CaretDownIcon className="size-3 text-fg-muted" />
					</span>
					<span className="text-sm font-medium tabular-nums text-fg">{VALUE_PLACEHOLDER}</span>
				</div>
				<div className="grid min-h-48 flex-[3] grid-cols-[3fr_2fr] gap-[3px]">
					<div className="flex flex-col gap-3 bg-surface p-3">
						<div className="grid grid-cols-2 gap-1 rounded-8 border border-trading-panel-stroke-card p-1 text-xs font-semibold">
							<span className="rounded-6 border border-stroke-success-strong py-1.5 text-center text-success">
								Long
							</span>
							<span className="py-1.5 text-center text-fg-muted">Short</span>
						</div>
						<div className={SUMMARY_ROW_CLASS}>
							<span className="text-trading-panel-muted">Available</span>
							<span className="text-fg">{VALUE_PLACEHOLDER}</span>
						</div>
						<div className="flex items-center justify-between rounded-8 border border-trading-panel-stroke-input px-3 py-2 text-xs">
							<span className="text-trading-panel-muted">Size</span>
							<span className="text-fg-muted">0.00</span>
						</div>
						<div className="flex-1" />
						<span
							className={cn(
								CONTROL_BUTTON_CLASS,
								"h-10 min-h-10 bg-market-close-control text-2sm text-market-close-on-control",
							)}
						>
							Connect Wallet
						</span>
					</div>
					<div className="flex flex-col bg-surface">
						<div className="grid grid-cols-2 gap-1 border-b border-stroke-weak px-2 py-1.5 text-2xs text-fg-muted">
							<span>Price</span>
							<span className="text-right">Size</span>
						</div>
						<div className="flex-1" />
						<div className="flex items-center justify-between bg-alternate px-2 py-1 text-2xs text-fg-muted">
							<span>Spread</span>
							<span>{NAME_PLACEHOLDER}</span>
						</div>
						<div className="flex-1" />
					</div>
				</div>
				<div className="flex min-h-36 flex-[2] flex-col bg-surface">
					<div className="flex gap-1 overflow-hidden border-b border-stroke-weak px-2">
						{DEFAULT_PANEL_FRAME_LABELS.accountTabs.slice(0, 4).map((label, index) => (
							<span
								key={label}
								className={cn(UNDERLINE_TAB_CLASS, index === 1 ? "border-b-2 border-fg text-fg" : "text-fg-muted")}
							>
								{label}
							</span>
						))}
					</div>
				</div>
			</div>
			<div className="border-t border-stroke-weak/60 bg-surface pb-[env(safe-area-inset-bottom)]">
				<div className="flex items-stretch pl-[var(--sal)] pr-[var(--sar)]">
					{MOBILE_TABS.map(({ label, icon: Icon }) => (
						<div
							key={label}
							className={cn(
								"flex h-14 flex-1 flex-col items-center justify-center gap-[3px] px-1 text-2xs font-medium",
								label === "Trade" ? "text-trading-panel-fg" : "text-trading-panel-subtle",
							)}
						>
							<Icon className="size-5" />
							{label}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
