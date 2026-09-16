// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { Button, ButtonIcon, Drawer, DrawerTrigger, Dropdown, Tabs, TabsList, TabsTrigger } from "@gatu/ui";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { WalletIcon } from "@phosphor-icons/react";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TokenSelectorTriggerContent } from "@/components/trade/chart/token-selector-trigger";
import { HeaderIconButtonView } from "@/components/trade/header/header-icon-button-view";
import { LanguageSwitcher } from "@/components/trade/header/language-switcher";
import { MobileShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import {
	MOBILE_BOOK_PLACEHOLDER,
	MOBILE_HEADER_PLACEHOLDER,
	MOBILE_MARKET_PLACEHOLDER,
	MOBILE_NAV_PLACEHOLDER,
	MOBILE_ORDER_ENTRY_PLACEHOLDER,
	MOBILE_POSITIONS_PLACEHOLDER,
} from "@/components/trade/layout/mobile-placeholders";
import { MobileBookChromeView, MobileBookModeControlsView } from "@/components/trade/mobile/mobile-book-chrome-view";
import { MobileBottomNav } from "@/components/trade/mobile/mobile-bottom-nav";
import { MobileBottomNavView } from "@/components/trade/mobile/mobile-bottom-nav-view";
import { MobileHeaderView } from "@/components/trade/mobile/mobile-header-view";
import { MobileLoadingFallback } from "@/components/trade/mobile/mobile-loading-fallback";
import { MobileMarketBarView } from "@/components/trade/mobile/mobile-market-bar-view";
import { MobileOrderEntryPlaceholderView } from "@/components/trade/mobile/mobile-order-entry-placeholder-view";
import {
	MobilePositionsTabStripView,
	MobilePositionsTabsView,
	positionsTab,
	positionsTabs,
} from "@/components/trade/mobile/mobile-positions-tabs-view";
import { MobileTokenSelectorView } from "@/components/trade/mobile/mobile-token-selector-view";
import { ctaButton, ctaEmbeddedHeight } from "@/components/trade/mobile/mobile-trade-cta-frame-view";
import { MobileTradeSizeControl } from "@/components/trade/mobile/mobile-trade-size-control";
import { MobileWalletCtaView } from "@/components/trade/mobile/mobile-wallet-cta-view";
import { OrderbookGroupingTriggerView } from "@/components/trade/orderbook/orderbook-grouping-trigger-view";
import { SideToggle } from "@/components/trade/tradebox/side-toggle";
import { SideToggleView } from "@/components/trade/tradebox/side-toggle-view";
import { TradeCtaView } from "@/components/trade/tradebox/trade-cta-view";
import { TradeOptionCheckboxes } from "@/components/trade/tradebox/trade-option-checkboxes";
import { DESKTOP_NAV_LABELS } from "@/config/desktop-nav";
import { APP_BAR_BUTTON_HEIGHT_CLASS } from "@/config/layout";
import { TRADE_PANEL_LABELS } from "@/config/trade-panel-labels";
import { cn } from "@/lib/cn";
import { getTradingCtaClass, getTradingCtaIntent } from "@/lib/ui/trading-cta";

const route = vi.hoisted(() => ({ routeMarketName: undefined as string | undefined, routeDex: "xyz" }));
vi.mock("@/providers/exchange-scope", () => ({ useExchangeScope: () => route }));
vi.mock("@/lib/i18n", () => ({ dynamicActivate: vi.fn(async () => true) }));
const noop = () => {};
// Ignore semantic and Base UI measurement attributes only. Geometry classes and DOM tags remain exact.
const IGNORED_ATTRIBUTES = /^(?:role|id|aria-.*|data-.*|tabindex|hidden|style)$/;
function dom(node: ReactNode) {
	const root = document.createElement("div");
	root.innerHTML = renderToString(node);
	return root;
}
function required<T>(value: T | null | undefined): T {
	if (value == null) throw new Error("Missing element");
	return value;
}
function geometry(node: Element): unknown {
	return {
		tag: node.tagName,
		classes: [...node.classList].filter((c) => c !== "invisible").sort(),
		children: [...node.children].map(geometry),
	};
}
function primitive(node: Element): unknown {
	return {
		tag: node.tagName,
		attributes: [...node.attributes]
			.filter((a) => a.name !== "class" && !IGNORED_ATTRIBUTES.test(a.name))
			.map((a) => [a.name, a.value])
			.sort(),
		classes: [...node.classList].sort(),
		children: [...node.children].map(primitive),
	};
}
function translated(node: ReactNode) {
	return <I18nProvider i18n={setupI18n({ locale: "en", messages: { en: {} } })}>{node}</I18nProvider>;
}
function source(file: string) {
	return readFileSync(resolve(__dirname, "../../components/trade", file), "utf8");
}
const pureFiles = [
	"mobile-header",
	"mobile-market-bar",
	"mobile-token-selector",
	"mobile-terminal-frame",
	"mobile-trade-frame",
	"mobile-trade-header",
	"mobile-trade-size",
	"mobile-trade-available",
	"mobile-trade-summary",
	"mobile-trade-cta-frame",
	"mobile-book-chrome",
	"mobile-positions-tabs",
	"mobile-bottom-nav",
	"mobile-wallet-cta",
	"mobile-order-entry-placeholder",
];

describe("mobile surface single-source views", () => {
	it("shares header geometry with real translated slots", () => {
		expect(geometry(dom(<MobileHeaderView {...MOBILE_HEADER_PLACEHOLDER} />))).toEqual(
			geometry(
				dom(
					<MobileHeaderView
						{...MOBILE_HEADER_PLACEHOLDER}
						account={<MobileWalletCtaView label="连接钱包" onClick={noop} />}
					/>,
				),
			),
		);
	});
	it("shares market geometry with known route samples", () => {
		const placeholder = (
			<MobileMarketBarView
				{...MOBILE_MARKET_PLACEHOLDER}
				selector={<MobileTokenSelectorView {...MOBILE_MARKET_PLACEHOLDER.trigger} />}
			/>
		);
		const sample = (
			<MobileMarketBarView
				{...MOBILE_MARKET_PLACEHOLDER}
				priceText="$61,234.5"
				changeText="+100 / +1.00%"
				selector={<MobileTokenSelectorView pairName="BTC-USDC" kindBadge="Perp" leverageBadge="40x" isSpot={false} />}
			/>
		);
		expect(geometry(dom(placeholder))).toEqual(geometry(dom(sample)));
	});
	it("shares the order column with translated sample props", () => {
		const data = {
			...MOBILE_ORDER_ENTRY_PLACEHOLDER,
			availableValue: "123.45",
			sizeUnit: "BTC",
			cta: "连接钱包",
			labels: { ...MOBILE_ORDER_ENTRY_PLACEHOLDER.labels, available: "可用余额", size: "数量" },
		};
		expect(geometry(dom(<MobileOrderEntryPlaceholderView data={MOBILE_ORDER_ENTRY_PLACEHOLDER} />))).toEqual(
			geometry(dom(<MobileOrderEntryPlaceholderView data={data} />)),
		);
	});
	it("shares compact book chrome in each view mode", () => {
		for (const mode of ["both", "asks", "bids"] as const) {
			const props = {
				...MOBILE_BOOK_PLACEHOLDER,
				mode,
				grouping: <OrderbookGroupingTriggerView mobile label="-" />,
				modes: <MobileBookModeControlsView {...MOBILE_BOOK_PLACEHOLDER.modeControls} mode={mode} />,
			};
			expect(geometry(dom(<MobileBookChromeView {...props} />))).toEqual(
				geometry(dom(<MobileBookChromeView {...props} priceToken="USDC" sizeToken="BTC" midText="$60,000" />)),
			);
			const chrome = dom(<MobileBookChromeView {...props} />);
			expect(chrome.querySelector('[data-slot="compact-orderbook-mid"]') !== null).toBe(mode === "both");
		}
	});
	it("shares positions and navigation geometry with translated props", () => {
		const placeholder = (
			<MobilePositionsTabsView tabs={<MobilePositionsTabStripView {...MOBILE_POSITIONS_PLACEHOLDER} />} />
		);
		const sample = (
			<MobilePositionsTabsView
				tabs={
					<MobilePositionsTabStripView
						{...MOBILE_POSITIONS_PLACEHOLDER}
						tabs={MOBILE_POSITIONS_PLACEHOLDER.tabs.map((tab) => ({ ...tab, label: `译 ${tab.label}` }))}
					/>
				}
			/>
		);
		expect(geometry(dom(placeholder))).toEqual(geometry(dom(sample)));
		expect(geometry(dom(<MobileBottomNavView {...MOBILE_NAV_PLACEHOLDER} />))).toEqual(
			geometry(
				dom(
					<MobileBottomNavView
						{...MOBILE_NAV_PLACEHOLDER}
						items={MOBILE_NAV_PLACEHOLDER.items.map((item) => ({ ...item, label: `译 ${item.label}` }))}
					/>,
				),
			),
		);
	});
	it.each(["buy", "sell"] as const)("pins the mobile side toggle against SegmentedControls SSR (%s)", (side) => {
		expect(
			primitive(dom(<SideToggleView mobile side={side} labels={MOBILE_ORDER_ENTRY_PLACEHOLDER.sideLabels} />)),
		).toEqual(
			primitive(
				dom(
					<SideToggle
						mobile
						compact
						tradingPanel
						side={side}
						labels={MOBILE_ORDER_ENTRY_PLACEHOLDER.sideLabels}
						onSideChange={noop}
					/>,
				),
			),
		);
	});
	it("pins static content-sized tabs to Base UI SSR", () => {
		const placeholder = dom(<MobilePositionsTabStripView {...MOBILE_POSITIONS_PLACEHOLDER} />);
		const runtime = dom(
			<Tabs size="xxs" value="positions">
				<TabsList
					className={positionsTabs}
					indicatorClassName="bg-market-close-fg transition-[left] duration-[120ms] ease-linear"
				>
					{MOBILE_POSITIONS_PLACEHOLDER.tabs.map((tab) => (
						<TabsTrigger value={tab.value} key={tab.value} className={positionsTab}>
							<span>{tab.label}</span>
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>,
		);
		// Sole structural exception: the static underline is anchored to its active button; Base UI measures a sibling indicator.
		const underline = required(placeholder.querySelector('[role="presentation"]'));
		expect(underline.className).toBe("absolute inset-x-0 -bottom-0.5 h-0.5 bg-market-close-fg");
		expect(underline.parentElement?.getAttribute("data-mobile-account-tab")).toBe("positions");
		underline.remove();
		for (const button of placeholder.querySelectorAll("button")) button.classList.remove("relative");
		const list = required(runtime.querySelector('[role="tablist"]'));
		const indicator = required(list.querySelector('[role="presentation"]'));
		expect(indicator.getAttribute("style")).toContain("var(--active-tab-width)");
		indicator.remove();
		expect(primitive(required(placeholder.firstElementChild))).toEqual(primitive(list));
	});
	it("pins navigation to the translated runtime buttons and custom renderer", () => {
		const placeholder = dom(<MobileBottomNavView {...MOBILE_NAV_PLACEHOLDER} />);
		expect(primitive(placeholder)).toEqual(
			primitive(dom(translated(<MobileBottomNav activeTab="trade" onTabChange={noop} />))),
		);
		expect(primitive(placeholder)).toEqual(
			primitive(
				dom(<MobileBottomNavView {...MOBILE_NAV_PLACEHOLDER} renderItem={(_item, props) => <button {...props} />} />),
			),
		);
	});
	it.each([false, true])("pins mobile CTA to Button md/lg with disabled=%s", (disabled) => {
		for (const embedded of [false, true])
			for (const variant of ["cyan", "buy", "sell"] as const) {
				expect(
					primitive(
						dom(
							<TradeCtaView mobile embedded={embedded} label="Connect Wallet" variant={variant} disabled={disabled} />,
						),
					),
				).toEqual(
					primitive(
						dom(
							<Button
								variant="filled"
								size={embedded ? "md" : "lg"}
								disabled={disabled}
								intent={getTradingCtaIntent(variant)}
								className={cn(ctaButton, embedded && ctaEmbeddedHeight, getTradingCtaClass(variant))}
							>
								Connect Wallet
							</Button>,
						),
					),
				);
			}
	});
	it("keeps pending CTA spinner padding identical to Button", () => {
		for (const embedded of [false, true]) {
			const icon = <WalletIcon className="size-5" />;
			expect(
				primitive(
					dom(<TradeCtaView mobile embedded={embedded} label="Signing" variant="cyan" disabled iconLeft={icon} />),
				),
			).toEqual(
				primitive(
					dom(
						<Button
							variant="filled"
							size={embedded ? "md" : "lg"}
							disabled
							intent="brand"
							iconLeft={icon}
							className={cn(ctaButton, embedded && ctaEmbeddedHeight, getTradingCtaClass("cyan"))}
						>
							Signing
						</Button>,
					),
				),
			);
		}
	});
	it("pins the anonymous wallet frame and drawer icon against Button SSR", () => {
		expect(primitive(dom(<MobileWalletCtaView label="Connect Wallet" />))).toEqual(
			primitive(
				dom(
					<Button
						variant="outline"
						intent="neutral"
						size="sm"
						iconLeft={<WalletIcon className="size-3.5" />}
						className={cn(
							APP_BAR_BUTTON_HEIGHT_CLASS,
							"min-w-0 max-w-full",
							"px-3 transition-[color,background-color,border-color] duration-150 ease-out",
						)}
					>
						<span className="min-w-0 truncate">Connect Wallet</span>
					</Button>,
				),
			),
		);
		expect(
			primitive(dom(<HeaderIconButtonView size="md" className="touch-target" aria-label="Open navigation" />)),
		).toEqual(
			primitive(
				dom(
					<ButtonIcon
						size="md"
						variant="ghost"
						intent="neutral"
						className="touch-target"
						aria-label="Open navigation"
					/>,
				),
			),
		);
	});
	it("pins the language dropdown wrapper and trigger to runtime SSR", () => {
		expect(primitive(dom(MOBILE_HEADER_PLACEHOLDER.language))).toEqual(
			primitive(
				dom(
					translated(
						<LanguageSwitcher className="size-11 min-h-11 text-market-close-muted hover:text-market-close-fg" />,
					),
				),
			),
		);
	});
	it("shares the native market trigger and preserves Drawer event forwarding", () => {
		const view = <MobileTokenSelectorView {...MOBILE_MARKET_PLACEHOLDER.trigger} />;
		expect(primitive(dom(view))).toEqual(
			primitive(
				dom(
					translated(
						<Drawer>
							<DrawerTrigger
								render={<TokenSelectorTriggerContent mobile selectedMarket={undefined} showAssetIcon={false} />}
							/>
						</Drawer>,
					),
				),
			),
		);
		const onOpenChange = vi.fn();
		const onFocus = vi.fn();
		const container = document.createElement("div");
		document.body.append(container);
		const root = createRoot(container);
		try {
			act(() =>
				root.render(
					translated(
						<Drawer onOpenChange={onOpenChange}>
							<DrawerTrigger
								onFocus={onFocus}
								render={<TokenSelectorTriggerContent mobile selectedMarket={undefined} showAssetIcon={false} />}
							/>
						</Drawer>,
					),
				),
			);
			const button = required(container.querySelector("button"));
			act(() => button.focus());
			expect(onFocus).toHaveBeenCalledOnce();
			act(() => button.click());
			expect(onOpenChange).toHaveBeenCalledWith(true, expect.anything());
			expect(container.querySelectorAll("button")).toHaveLength(1);
		} finally {
			act(() => root.unmount());
			container.remove();
		}
	});
	it("keeps financial input direction fixed while the RTL slider reverses", () => {
		const shell = dom(
			<DirectionProvider direction="rtl">
				<MobileOrderEntryPlaceholderView data={{ ...MOBILE_ORDER_ENTRY_PLACEHOLDER, direction: "rtl" }} />
			</DirectionProvider>,
		);
		for (const input of shell.querySelectorAll('input[type="text"]')) expect(input.getAttribute("dir")).toBe("ltr");
		expect(shell.querySelector("[data-trade-slider-control]")?.parentElement?.getAttribute("dir")).toBe("rtl");
	});
	it("pins mobile grouping to the caret-free Dropdown primitive", () => {
		const runtime = dom(
			<Dropdown
				trigger="-"
				triggerVariant="minimal"
				triggerAriaLabel="Price precision"
				size="sm"
				hideCaret
				items={[]}
				triggerClassName="relative min-h-6 text-xs tabular-nums text-trading-panel-muted"
			/>,
		);
		expect(primitive(required(dom(<OrderbookGroupingTriggerView mobile label="-" />).firstElementChild))).toEqual(
			primitive(required(runtime.querySelector("button"))),
		);
	});
	it("pins disabled mobile options to the real checkbox primitives", () => {
		const option = { checked: false, disabled: true, onCheckedChange: noop };
		const shell = dom(<MobileOrderEntryPlaceholderView data={MOBILE_ORDER_ENTRY_PLACEHOLDER} />);
		const runtime = dom(
			translated(<TradeOptionCheckboxes tradingPanel mobile embedded reduceOnly={option} tpSl={option} />),
		);
		expect(primitive(required(shell.querySelector('[data-slot="trade-order-options"]')))).toEqual(
			primitive(required(runtime.firstElementChild)),
		);
	});
	it("renders the exact empty mobile size, slider and percent control", () => {
		const runtime = dom(
			<MobileTradeSizeControl
				canUsePercent={false}
				disabled
				interactionIdentity="test"
				maxAllowedDecimals={4}
				onPercentChange={noop}
				onPercentCancel={noop}
				onPercentCommit={noop}
				onSizeChange={noop}
				onSizeModeToggle={noop}
				percentAriaLabel="Size (%)"
				side="buy"
				sizeAriaLabel="Size"
				sizeInput=""
				sizeLabel="Size"
				sizeModeLabel="BTC"
				sliderValue={0}
			/>,
		);
		const shell = dom(
			<MobileOrderEntryPlaceholderView data={{ ...MOBILE_ORDER_ENTRY_PLACEHOLDER, sizeUnit: "BTC" }} />,
		);
		const frame = required(shell.querySelector('input[data-size="lg"]')?.parentElement?.parentElement);
		expect(geometry(frame)).toEqual(geometry(required(runtime.firstElementChild)));
		expect(shell.querySelector<HTMLInputElement>('input[data-size="lg"]')?.value).toBe("");
		expect(shell.querySelector<HTMLInputElement>('input[data-size="lg"]')?.placeholder).toBe("0.00");
		expect(shell.querySelector<HTMLInputElement>('input[data-size="sm"]')?.value).toBe("0");
		expect(shell.querySelectorAll("[data-percent]")).toHaveLength(5);
	});
	it.each(pureFiles)("keeps %s pure and deterministic", (name) => {
		expect(source(`mobile/${name}-view.tsx`)).not.toMatch(
			/@lingui|use[A-Z]\w*\(|@\/stores|window|document|Date\.|Math\.random/,
		);
	});
	it("wires real containers to views and removes the legacy source", () => {
		const pairs = [
			["mobile-header", "MobileHeaderView"],
			["mobile-market-bar", "MobileMarketBarView"],
			["mobile-bottom-nav", "MobileBottomNavView"],
			["mobile-terminal", "MobileTerminalFrameView"],
			["mobile-trade-layout", "MobilePageView"],
			["mobile-trade-view", "MobileTradeFrameView"],
			["mobile-trade-size-control", "MobileTradeSizeView"],
			["mobile-book-view", "MobileBookChromeView"],
			["mobile-positions-view", "MobilePositionsTabsView"],
		];
		for (const [file, view] of pairs) expect(source(`mobile/${file}.tsx`)).toContain(`<${view}`);
		expect(existsSync(resolve(__dirname, "../../components/trade/mobile/mobile-chrome-classes.ts"))).toBe(false);
		expect(source("chart/token-selector-trigger.tsx")).toContain("<MobileTokenSelectorView");
		expect(source("mobile/mobile-loading-fallback.tsx")).toContain("activePositionsTab={activePositionsTab}");
		expect(source("mobile/mobile-loading-fallback.tsx")).toContain("activeNavTab={activeNavTab}");
	});
	it("passes route names and asset units and preserves all DOM identities on en→zh", () => {
		route.routeMarketName = "BTC";
		const i18n = setupI18n({ locale: "en", messages: { en: {} } });
		i18n.load("zh", { [DESKTOP_NAV_LABELS.wallet.id]: "连接钱包", [TRADE_PANEL_LABELS.size.id]: "数量" });
		const container = document.createElement("div");
		const root = createRoot(container);
		try {
			act(() =>
				root.render(
					<I18nProvider i18n={i18n}>
						<MobileLoadingFallback />
					</I18nProvider>,
				),
			);
			expect(container.querySelector('[data-slot="mobile-market-selector"]')?.textContent).toContain("BTC-USDC");
			expect(container.querySelector('[data-slot="compact-orderbook-price-token"]')?.textContent).toBe("(USDC)");
			expect(container.querySelector('[data-slot="compact-orderbook-size-token"]')?.textContent).toBe("(BTC)");
			const nodes = [...container.querySelectorAll("*")];
			act(() => i18n.activate("zh"));
			expect(container.textContent).toContain("连接钱包");
			expect(container.textContent).toContain("数量");
			expect([...container.querySelectorAll("*")]).toEqual(nodes);
			for (const [index, node] of [...container.querySelectorAll("*")].entries()) expect(node).toBe(nodes[index]);
			expect(renderToString(<MobileShellSkeleton />)).toContain("Connect Wallet");
		} finally {
			act(() => root.unmount());
			route.routeMarketName = undefined;
		}
	});
});
