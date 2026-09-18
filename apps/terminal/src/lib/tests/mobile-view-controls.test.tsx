// @vitest-environment jsdom
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { Button, ButtonIcon, Drawer, DrawerTrigger, Dropdown } from "@gatu/ui";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { WalletIcon } from "@phosphor-icons/react";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { TokenSelectorTriggerContent } from "@/components/trade/chart/token-selector-trigger";
import { HeaderIconButtonView } from "@/components/trade/header/header-icon-button-view";
import { ctaButton, ctaEmbeddedHeight } from "@/components/trade/mobile/mobile-trade-cta-frame-view";
import { MobileTradeSizeControl } from "@/components/trade/mobile/mobile-trade-size-control";
import { MobileWalletCtaView } from "@/components/trade/mobile/mobile-wallet-cta-view";
import { OrderbookGroupingTriggerView } from "@/components/trade/orderbook/orderbook-grouping-trigger-view";
import { TradeCtaView } from "@/components/trade/tradebox/trade-cta-view";
import { APP_BAR_BUTTON_HEIGHT_CLASS } from "@/config/layout";
import { cn } from "@/lib/cn";
import { getTradingCtaClass, getTradingCtaIntent } from "@/lib/ui/trading-cta";

function required<T>(value: T | null | undefined): T {
	if (value == null) throw new Error("Missing element");
	return value;
}
function translated(node: ReactNode) {
	return <I18nProvider i18n={setupI18n({ locale: "en", messages: { en: {} } })}>{node}</I18nProvider>;
}

vi.mock("@/providers/exchange-scope", () => ({ useExchangeScope: () => ({ routeDex: "xyz" }) }));
it("shares the native market trigger and preserves Drawer event forwarding", () => {
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

function dom(node: ReactNode) {
	const host = document.createElement("div");
	host.innerHTML = renderToString(node);
	return host;
}
const noop = () => {};

function primitive(node: Element): unknown {
	return {
		tag: node.tagName,
		attributes: [...node.attributes]
			.filter((a) => a.name !== "class" && !/^(?:role|id|aria-.*|data-.*|tabindex|hidden|style)$/.test(a.name))
			.map((a) => [a.name, a.value])
			.sort(),
		classes: [...node.classList].sort(),
		children: [...node.children].map(primitive),
	};
}
it.each([false, true])("pins mobile CTA to Button md/lg with disabled=%s", (disabled) => {
	for (const embedded of [false, true])
		for (const variant of ["cyan", "buy", "sell"] as const) {
			expect(
				primitive(
					dom(<TradeCtaView mobile embedded={embedded} label="Connect Wallet" variant={variant} disabled={disabled} />),
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
	expect(primitive(dom(<MobileWalletCtaView label="Connect" />))).toEqual(
		primitive(
			dom(
				<Button
					variant="filled"
					intent="brand"
					size="sm"
					className={cn(APP_BAR_BUTTON_HEIGHT_CLASS, "min-w-0 max-w-full px-3.5")}
				>
					<span className="min-w-0 truncate">Connect</span>
				</Button>,
			),
		),
	);
	expect(
		primitive(dom(<HeaderIconButtonView size="md" className="touch-target" aria-label="Open navigation" />)),
	).toEqual(
		primitive(
			dom(
				<ButtonIcon size="md" variant="ghost" intent="neutral" className="touch-target" aria-label="Open navigation" />,
			),
		),
	);
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
	expect(runtime.querySelector<HTMLInputElement>('input[data-size="lg"]')?.value).toBe("");
	expect(runtime.querySelector<HTMLInputElement>('input[data-size="lg"]')?.placeholder).toBe("0.00");
	expect(runtime.querySelector<HTMLInputElement>('input[data-size="sm"]')?.value).toBe("0");
	expect(runtime.querySelectorAll("[data-percent]")).toHaveLength(5);
});
it("keeps real mobile financial inputs LTR while the slider uses RTL", () => {
	const runtime = dom(
		<DirectionProvider direction="rtl">
			<MobileTradeSizeControl
				canUsePercent={false}
				disabled
				interactionIdentity="rtl"
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
			/>
		</DirectionProvider>,
	);
	for (const input of runtime.querySelectorAll('input[type="text"]')) expect(input.getAttribute("dir")).toBe("ltr");
	expect(runtime.querySelector("[data-trade-slider-control]")?.parentElement?.getAttribute("dir")).toBe("rtl");
});
