// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Button, Checkbox, Dropdown } from "@gatu/ui";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { act, createRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SizePercentInput } from "@/components/trade/components/size-percent-input";
import { TradeSlider } from "@/components/trade/components/trade-slider";
import { TradeSliderView } from "@/components/trade/components/trade-slider-view";
import { renderDesktopPanelFrame } from "@/components/trade/layout/app-shell-skeleton";
import { TRADE_PANEL_PLACEHOLDER } from "@/components/trade/layout/desktop-placeholders";
import { TerminalLoadingWorkspace } from "@/components/trade/layout/terminal-loading-workspace";
import * as mobileChrome from "@/components/trade/mobile/mobile-chrome-classes";
import { OrderSummary } from "@/components/trade/tradebox/order-summary";
import { OrderTypeTabView, orderTypeTabClass } from "@/components/trade/tradebox/order-type-tab-view";
import { SideToggle } from "@/components/trade/tradebox/side-toggle";
import { SideToggleView } from "@/components/trade/tradebox/side-toggle-view";
import { TradeCheckboxView } from "@/components/trade/tradebox/trade-checkbox-view";
import { TradeControlButtonView } from "@/components/trade/tradebox/trade-control-button-view";
import { TradeCtaView } from "@/components/trade/tradebox/trade-cta-view";
import { TradeFormFields } from "@/components/trade/tradebox/trade-form-fields";
import { TradeHeader } from "@/components/trade/tradebox/trade-header";
import { TRADE_INPUT_CLASS, TradeInputFrameView } from "@/components/trade/tradebox/trade-input-frame-view";
import { TRADE_PANEL_CLASS, TradePanelBodyView } from "@/components/trade/tradebox/trade-panel-body-view";
import { TRADE_PERCENT_INPUT_CLASS } from "@/components/trade/tradebox/trade-percent-frame-view";
import { NumberInput } from "@/components/ui/number-input";
import { DEFAULT_BUILDER_CONFIG } from "@/config/hyperliquid";
import { DEFAULT_MARKET_ORDER_SLIPPAGE_PERCENT, ORDER_FEE_RATE_MAKER, ORDER_FEE_RATE_TAKER } from "@/config/trade";
import { TRADE_PANEL_LABELS } from "@/config/trade-panel-labels";
import { buildOrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { cn } from "@/lib/cn";
import { getTradingCtaClass, getTradingCtaIntent } from "@/lib/ui/trading-cta";
import { useGlobalSettingsActions, useMarketOrderSlippagePercent } from "@/stores/use-global-settings-store";

const route = vi.hoisted(() => ({ routeMarketName: undefined as string | undefined, routeDex: "xyz" }));
vi.mock("@/providers/exchange-scope", () => ({ useExchangeScope: () => route }));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({ useWalletSession: () => ({ isConnected: false }) }));
vi.mock("@/lib/hyperliquid", () => ({ useSelectedMarketInfo: () => ({ data: undefined }) }));
vi.mock("@/lib/number-format-reactivity", () => ({ useNumberFormatRevision: () => 0 }));

// Primitive SSR comparisons ignore exactly these semantic/measurement attributes.
const IGNORED_ATTRIBUTES = /^(?:role|id|aria-.*|data-.*|tabindex|hidden|style)$/;
const VIEW_NAMES = [
	"trade-panel-body",
	"trade-control-button",
	"trade-header",
	"order-type-tab",
	"side-toggle",
	"trade-available-row",
	"trade-input-frame",
	"trade-size-slider-row",
	"trade-percent-frame",
	"trade-option-checkboxes",
	"trade-checkbox",
	"trade-cta",
	"trade-form-fields",
	"trade-panel-footer",
	"trade-size-unit",
];
function dom(node: ReactNode) {
	const root = document.createElement("div");
	root.innerHTML = renderToString(node);
	return root;
}
function geometry(node: Element | null | undefined): unknown {
	const element = required(node);
	return {
		tag: element.tagName,
		classes: [...element.classList].filter((c) => c !== "invisible").sort(),
		children: [...element.children].map(geometry),
	};
}
function required(element: Element | null | undefined): Element {
	if (!element) throw new Error("Expected a rendered element");
	return element;
}

function primitive(element: Element): unknown {
	return {
		tag: element.tagName,
		attributes: [...element.attributes]
			.filter((a) => a.name !== "class" && !IGNORED_ATTRIBUTES.test(a.name))
			.map((a) => [a.name, a.value])
			.sort(),
		classes: [...element.classList].sort(),
		children: [...element.children].map(primitive),
	};
}
function translated(node: ReactNode) {
	return <I18nProvider i18n={setupI18n({ locale: "en", messages: { en: {} } })}>{node}</I18nProvider>;
}
function source(path: string) {
	return readFileSync(resolve(__dirname, "../..", path), "utf8");
}
const noop = () => {};
const labels = TRADE_PANEL_PLACEHOLDER.sideLabels;
const data = {
	isSpotMarket: false,
	isAvailabilityBlocked: false,
	baseToken: "BTC",
	quoteToken: "USDC",
	capabilities: {
		allowsCrossMargin: true,
		hasFunding: true,
		hasMarginMode: true,
		hasReduceOnly: true,
		hasTpSl: true,
		isCanonical: null,
		isLeveraged: true,
		isOnlyIsolated: false,
		maxLeverage: 50,
	},
	availableBalance: 0,
	displayAvailableBalance: 0,
	displayAvailableBalanceToken: "USDC",
	leverage: 1,
	leverageInteractionIdentity: "disconnected",
	maxSize: 0,
	sizeValue: 0,
	sizeModeLabel: "BTC",
	szDecimals: 4,
};

describe("desktop trade panel single-source parity", () => {
	it.each(["buy", "sell"] as const)("pins static side toggle to primitive SSR (%s)", (side) => {
		const placeholder = dom(<SideToggleView side={side} labels={labels} />);
		const runtime = dom(<SideToggle side={side} labels={labels} onSideChange={noop} compact tradingPanel />);
		expect(primitive(placeholder)).toEqual(primitive(runtime));
		const indicator = placeholder.querySelector("span");
		expect(indicator?.style.left).toBe(side === "buy" ? "0%" : "50%");
		expect(indicator?.style.width).toBe("50%");
	});
	it("renders the disabled zero slider through the same view with identical SSR", () => {
		const runtime = dom(
			<TradeSlider
				value={0}
				min={0}
				max={100}
				disabled
				showTicks
				ariaLabel="Size (%)"
				ariaValueText="0%"
				onPreview={noop}
				onCancel={noop}
				onCommit={noop}
			/>,
		);
		const placeholder = dom(
			<TradeSliderView
				dir="ltr"
				ariaLabel="Size (%)"
				inputId={runtime.querySelector("input")?.id ?? ""}
				progress={0}
				rtl={false}
				unavailable
				showTicks
				ticks={[0, 25, 50, 75, 100]}
				inputProps={{ min: 0, max: 100, step: 1, defaultValue: 0, disabled: true, "aria-valuetext": "0%" }}
			/>,
		);
		expect(placeholder.innerHTML).toBe(runtime.innerHTML);
		expect(source("components/trade/components/trade-slider.tsx")).toContain("<TradeSliderView");
		const shell = dom(renderDesktopPanelFrame("tradingInterface"));
		const shellSlider = required(shell.querySelector("[data-trade-slider-control]")?.parentElement);
		const runtimeSlider = required(runtime.firstElementChild).cloneNode(true) as Element;
		runtimeSlider.querySelector("input")?.setAttribute("id", "trade-panel-size-slider");
		runtimeSlider.querySelector("label")?.setAttribute("for", "trade-panel-size-slider");
		expect(shellSlider.outerHTML).toBe(runtimeSlider.outerHTML);
		for (const root of [placeholder, runtime, shellSlider]) {
			expect(root.querySelector("input")?.value).toBe("0");
			expect(root.querySelector("[data-trade-slider-thumb]")?.getAttribute("style")).toBe(
				"left:clamp(9px, 0%, calc(100% - 9px));transform:translate3d(-50%, -50%, 0)",
			);
			expect(root.querySelectorAll("[data-percent]")).toHaveLength(5);
			expect([...root.querySelectorAll("[data-active]")].map((tick) => tick.getAttribute("data-active"))).toEqual([
				"true",
				"false",
				"false",
				"false",
				"false",
			]);
		}
	});
	it("shares the percent frame with SizePercentInput", () => {
		const shell = dom(renderDesktopPanelFrame("tradingInterface"));
		const runtime = dom(
			<SizePercentInput
				value={0}
				disabled
				ariaLabel="Size (%)"
				onPercentChange={noop}
				frameClassName="h-8 w-16 shrink-0 rounded-[8px] px-2 opacity-50"
			/>,
		);
		expect(geometry(shell.querySelector('input[data-size="sm"]')?.parentElement)).toEqual(
			geometry(runtime.firstElementChild),
		);
		expect(source("components/trade/components/size-percent-input.tsx")).toContain("<TradePercentFrameView");
	});
	it.each(["default", "sm"] as const)("uses NumberInput's exact class list for static %s inputs", (inputSize) => {
		const shell = dom(renderDesktopPanelFrame("tradingInterface"));
		const runtime = dom(
			<NumberInput
				value="0"
				inputSize={inputSize}
				className={
					inputSize === "default" ? TRADE_INPUT_CLASS : cn(TRADE_PERCENT_INPUT_CLASS, "text-trading-panel-subtle")
				}
			/>,
		);
		expect([...required(shell.querySelector(`input[data-size="${inputSize}"]`)).classList]).toEqual([
			...required(runtime.querySelector("input")).classList,
		]);
	});
	it.each([false, true])("pins static unchecked checkbox SSR (%s)", (spanAll) => {
		const props = { label: "TP/SL", ariaLabel: "Take Profit / Stop Loss", spanAll };
		const runtime = (
			<Checkbox
				checked={false}
				disabled
				aria-label={props.ariaLabel}
				label={props.label}
				className={cn(mobileChrome.option, spanAll && "col-span-2")}
				controlClassName={mobileChrome.optionControl}
				indicatorClassName="text-trading-panel-on-control"
				labelClassName={mobileChrome.optionLabel}
			/>
		);
		expect(geometry(dom(<TradeCheckboxView {...props} />))).toEqual(geometry(dom(runtime)));
	});
	it.each(["buy", "sell", "cyan", "restricted"] as const)(
		"pins resolved CTA classes including spinner and disabled state (%s)",
		(variant) => {
			for (const disabled of [false, true])
				for (const spinning of [false, true]) {
					const iconLeft = spinning ? <SpinnerGapIcon className="size-3 animate-spin" /> : undefined;
					const before = (
						<Button
							variant="filled"
							size="xs"
							intent={variant === "restricted" ? "neutral" : getTradingCtaIntent(variant)}
							disabled={disabled}
							iconLeft={iconLeft}
							className={cn(
								"w-full rounded-[12px] px-3 py-2.5 text-sm font-bold whitespace-nowrap shadow-none",
								variant === "restricted"
									? "data-disabled:bg-trading-panel-neutral-disabled-fill data-disabled:text-trading-panel-on-disabled"
									: cn("focus-visible:outline-offset-1", getTradingCtaClass(variant)),
							)}
						>
							Connect Wallet
						</Button>
					);
					expect(
						primitive(
							dom(<TradeCtaView label="Connect Wallet" variant={variant} disabled={disabled} iconLeft={iconLeft} />),
						),
					).toEqual(primitive(dom(before)));
				}
		},
	);
	it.each([false, true])("pins Advanced bare/renderTrigger/old trigger paths (%s)", (active) => {
		const view = <OrderTypeTabView active={active} label="Advanced" labelCompact="Other" />;
		const content = (
			<span className="inline-flex min-w-0 items-center justify-center">
				<span className="trade-full-label truncate">Advanced</span>
				<span className="trade-compact-label truncate">Other</span>
			</span>
		);
		const before = dom(
			<Dropdown
				triggerVariant="minimal"
				triggerAriaLabel="Advanced order types"
				size="sm"
				hideCaret
				trigger={content}
				triggerClassName={cn(
					orderTypeTabClass(active),
					"w-full rounded-none hover:text-trading-panel-fg data-[popup-open]:text-trading-panel-fg",
				)}
			/>,
		).querySelector("button");
		const after = dom(
			<Dropdown triggerVariant="minimal" triggerAriaLabel="Advanced order types" renderTrigger={view} />,
		).querySelector("button");
		expect(geometry(after)).toEqual(geometry(before));
		expect(geometry(dom(view).firstElementChild)).toEqual(geometry(after));
	});
	it("shares actual disconnected header and field geometry with the shell", () => {
		const shell = dom(renderDesktopPanelFrame("tradingInterface"));
		const header = dom(
			translated(
				<TradeHeader
					compact
					isLeveraged
					orderType="market"
					side="buy"
					sideLabels={labels}
					marketKind={undefined}
					onOrderTypeChange={noop}
					onSideChange={noop}
				/>,
			),
		);
		const fields = dom(
			translated(
				<TradeFormFields
					orderEntryData={data}
					visibleValidationErrors={[]}
					price={0}
					positionSize={0}
					swapTargetToken={null}
					onSizeModeToggle={noop}
					onSizePercentApply={noop}
					onSwapClick={noop}
				/>,
			),
		);
		expect(geometry(shell.querySelector('[data-slot="trade-panel-header"]')?.firstElementChild)).toEqual(
			geometry(header.firstElementChild),
		);
		expect(
			geometry(shell.querySelector('[data-slot="trade-panel-fields"]')?.firstElementChild?.firstElementChild),
		).toEqual(geometry(fields.firstElementChild));
		expect(shell.firstElementChild?.className).toBe(TRADE_PANEL_CLASS);
		expect(shell.querySelector("[title='1x']")?.textContent).toContain("1x");
		expect(shell.querySelector('[data-slot="trade-panel-fields"]')?.textContent).not.toContain("Position");
		expect(shell.querySelector('input[data-size="default"]')?.getAttribute("value")).toBe("");
		expect(shell.querySelector("[title='Account'] svg.animate-spin")).toBeNull();
		expect(shell.querySelectorAll(".invisible")).toHaveLength(1);
		expect([...shell.querySelectorAll(".invisible")].map((n) => n.textContent)).toEqual(["BTC"]);
		expect(shell.querySelector('[data-slot="trade-panel-footer"]')?.textContent).toContain(
			"Liq. Price-Order Value-Margin Req.-Est. Slippage-Slippage2.5%",
		);
	});
	it("mirrors the actual default disconnected Market summary including fee configuration", () => {
		const quoteInput = {
			orderValue: 0,
			builderFeeTenthsBps: DEFAULT_BUILDER_CONFIG?.f ?? 0,
			marketKind: "perp" as const,
			side: "buy" as const,
			execution: "order" as const,
		};
		const runtime = dom(
			translated(
				<OrderSummary
					compact
					liqPrice={null}
					liqWarning={false}
					orderValue={0}
					marginRequired={0}
					takerFeeQuote={buildOrderFeeQuote({ ...quoteInput, protocolRate: ORDER_FEE_RATE_TAKER })}
					makerFeeQuote={buildOrderFeeQuote({ ...quoteInput, protocolRate: ORDER_FEE_RATE_MAKER })}
					slippagePercent={DEFAULT_MARKET_ORDER_SLIPPAGE_PERCENT}
					szDecimals={undefined}
					onSlippageClick={noop}
					orderType="market"
				/>,
			),
		);
		const shell = dom(renderDesktopPanelFrame("tradingInterface"));
		const summary = shell.querySelector('[data-slot="trade-panel-footer"]')?.lastElementChild?.firstElementChild;
		expect(geometry(summary)).toEqual(geometry(runtime.firstElementChild));
		expect(required(summary).textContent).toBe(runtime.textContent);
		expect(required(summary).textContent).toContain("Fees0.0550% / 0.0250%");
	});
	it("shares input geometry with NumberInput while preserving the native ref", () => {
		const placeholder = dom(<TradeInputFrameView label="Size" value="" readOnly />);
		const runtime = dom(
			<TradeInputFrameView label="Size" input={<NumberInput value="10" className={TRADE_INPUT_CLASS} />} />,
		);
		expect(geometry(placeholder)).toEqual(geometry(runtime));
		const host = document.createElement("div");
		const root = createRoot(host);
		const ref = createRef<HTMLInputElement>();
		act(() => root.render(<TradeInputFrameView label="Size" ref={ref} value="" readOnly />));
		expect(ref.current?.tagName).toBe("INPUT");
		act(() => root.unmount());
	});
	it("keeps root slots and sample control structure identical", () => {
		const a = dom(
			<TradePanelBodyView header={<span>header</span>} fields={<span>fields</span>} footer={<span>footer</span>} />,
		);
		const b = dom(
			<TradePanelBodyView
				overlays={null}
				header={<span>real header</span>}
				fields={<span>real fields</span>}
				footer={<span>real footer</span>}
			/>,
		);
		expect(geometry(a)).toEqual(geometry(b));
		expect(
			geometry(dom(<TradeControlButtonView labelFull="Margin mode" labelCompact="Margin" value="Cross" />)),
		).toEqual(geometry(dom(<TradeControlButtonView labelFull="Margin mode" labelCompact="Margin" value="Isolated" />)));
	});
	it.each([
		["BTC", "BTC"],
		["xyz:TSLA", "TSLA"],
		["PURR/USDC", "PURR"],
		["@107", null],
		[undefined, null],
	])("uses route asset only when known (%s)", (name, asset) => {
		route.routeMarketName = name ?? undefined;
		const root = dom(translated(<TerminalLoadingWorkspace />));
		const panel = root.querySelector(".trade-panel-container");
		const unit = panel?.querySelector('[data-slot="trade-panel-fields"] button > span');
		expect(unit?.textContent).toBe(asset ?? "BTC");
		expect(unit?.classList.contains("invisible")).toBe(asset === null);
		expect(panel?.closest("[inert]")).not.toBeNull();
	});
	it("uses synchronous persisted slippage in runtime placeholders while the shell keeps its default", () => {
		const settings = { actions: null as ReturnType<typeof useGlobalSettingsActions> | null, percent: 0 };
		function SettingsProbe() {
			settings.actions = useGlobalSettingsActions();
			settings.percent = useMarketOrderSlippagePercent();
			return null;
		}
		const host = document.createElement("div");
		const root = createRoot(host);
		act(() => root.render(<SettingsProbe />));
		const actions = settings.actions;
		if (!actions) throw new Error("Expected global settings actions");
		const previous = settings.percent;
		try {
			act(() => actions.setMarketOrderSlippagePercent(1.25));
			act(() => root.render(translated(<TerminalLoadingWorkspace />)));
			const panel = required(host.querySelector(".trade-panel-container"));
			const footer = required(panel.querySelector('[data-slot="trade-panel-footer"]'));
			expect(footer.textContent).toContain("Slippage1.25%");
			act(() => actions.setMarketOrderSlippagePercent(3));
			expect(footer.textContent).toContain("Slippage3%");
			expect(host.querySelector(".trade-panel-container")).toBe(panel);
			expect(dom(renderDesktopPanelFrame("tradingInterface")).textContent).toContain("Slippage2.5%");
		} finally {
			act(() => root.unmount());
			actions.setMarketOrderSlippagePercent(previous);
		}
	});
	it("hot-switches labels en/zh without replacing panel, tabs, inputs or controls", () => {
		route.routeMarketName = "BTC";
		const i18n = setupI18n({
			locale: "en",
			messages: {
				en: {},
				zh: {
					[TRADE_PANEL_LABELS.market.id]: "市价",
					[TRADE_PANEL_LABELS.available.id]: "可用",
					[TRADE_PANEL_LABELS.size.id]: "数量",
				},
			},
		});
		const host = document.createElement("div");
		const root = createRoot(host);
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<TerminalLoadingWorkspace />
				</I18nProvider>,
			),
		);
		const panel = host.querySelector(".trade-panel-container");
		const nodes = [...required(panel).querySelectorAll("button,input")];
		act(() => i18n.activate("zh"));
		expect(panel?.textContent).toContain("市价");
		expect(panel?.textContent).toContain("可用");
		expect(host.querySelector(".trade-panel-container")).toBe(panel);
		expect([...required(panel).querySelectorAll("button,input")]).toEqual(nodes);
		act(() => i18n.activate("en"));
		expect(panel?.textContent).toContain("Market");
		act(() => root.unmount());
	});
	it("keeps placeholder and sample real presentation props geometrically identical", () => {
		const sample = {
			...TRADE_PANEL_PLACEHOLDER,
			margin: "Isolated",
			leverage: "20x",
			account: "Unified",
			sizeUnit: "ETH",
			labels: { ...TRADE_PANEL_PLACEHOLDER.labels, market: "市价", size: "数量" },
		};
		expect(geometry(dom(renderDesktopPanelFrame("tradingInterface")))).toEqual(
			geometry(dom(renderDesktopPanelFrame("tradingInterface", undefined, undefined, sample))),
		);
	});
	it("forwards control/CTA refs and events and Advanced keyboard behavior", async () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		const root = createRoot(host);
		const control = createRef<HTMLButtonElement>();
		const cta = createRef<HTMLButtonElement>();
		const tab = createRef<HTMLButtonElement>();
		const clicked = vi.fn();
		const selected = vi.fn();
		function controls(disabled: boolean) {
			return (
				<>
					<TradeControlButtonView
						ref={control}
						labelFull="Margin"
						value="Cross"
						disabled={disabled}
						onClick={clicked}
					/>
					<TradeCtaView ref={cta} label="Connect Wallet" variant="cyan" disabled={disabled} onClick={clicked} />
					<Dropdown
						triggerVariant="minimal"
						triggerAriaLabel="Advanced order types"
						disabled={disabled}
						renderTrigger={<OrderTypeTabView ref={tab} active={false} label="Advanced" labelCompact="Other" />}
						items={[{ label: "TWAP", onSelect: selected }]}
					/>
				</>
			);
		}
		try {
			await act(async () => root.render(controls(false)));
			act(() => {
				control.current?.click();
				cta.current?.click();
			});
			expect(clicked).toHaveBeenCalledTimes(2);
			await act(async () =>
				tab.current?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
			);
			expect(tab.current?.getAttribute("aria-expanded")).toBe("true");
			await act(async () => document.querySelector<HTMLButtonElement>('[role="menuitem"]')?.click());
			expect(selected).toHaveBeenCalledOnce();
			await act(async () => root.render(controls(true)));
			for (const ref of [control, cta, tab]) expect(ref.current?.disabled).toBe(true);
			act(() => {
				control.current?.click();
				cta.current?.click();
			});
			expect(clicked).toHaveBeenCalledTimes(2);
			expect(host.querySelector("button button")).toBeNull();
		} finally {
			await act(async () => root.unmount());
			host.remove();
		}
	});
	it("keeps views pure and all three callers wired", () => {
		for (const path of [
			...VIEW_NAMES.map((name) => `components/trade/tradebox/${name}-view.tsx`),
			"components/trade/components/trade-slider-view.tsx",
		]) {
			const view = source(path);
			expect(view).toContain("interface Props");
			expect(view).not.toMatch(
				/\buse[A-Z]\w*|@lingui|@gatu\/ui|stores\/|window|document|Date\.|Math\.random|useId|\/\/|\/\*/,
			);
		}
		expect(source("components/trade/layout/app-shell-skeleton.tsx")).not.toContain("TradePanelFrame");
		for (const [file, view] of [
			["trade-panel", "TradePanelBodyView"],
			["trade-panel", "TradeCtaView"],
			["trade-header", "TradeHeaderView"],
			["trade-form-fields", "TradeInputFrameView"],
			["trade-form-fields", "TradeSizeSliderRowView"],
			["trade-option-checkboxes", "TradeOptionCheckboxesView"],
		])
			expect(source(`components/trade/tradebox/${file}.tsx`)).toContain(`<${view}`);
		expect(source("components/trade/layout/terminal-loading-workspace.tsx")).toContain("...TRADE_PANEL_PLACEHOLDER");
	});
});
