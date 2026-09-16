// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Button, Dropdown } from "@gatu/ui";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { act, createRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SizePercentInput } from "@/components/trade/components/size-percent-input";
import { TradeSlider } from "@/components/trade/components/trade-slider";
import { TradeSliderView } from "@/components/trade/components/trade-slider-view";
import { OrderTypeTabView, orderTypeTabClass } from "@/components/trade/tradebox/order-type-tab-view";
import { TradeControlButtonView } from "@/components/trade/tradebox/trade-control-button-view";
import { TradeCtaView } from "@/components/trade/tradebox/trade-cta-view";
import { TRADE_INPUT_CLASS, TradeInputFrameView } from "@/components/trade/tradebox/trade-input-frame-view";
import { TRADE_PERCENT_INPUT_CLASS, TradePercentFrameView } from "@/components/trade/tradebox/trade-percent-frame-view";
import { getInputClassName } from "@/components/ui/input-styles";
import { NumberInput } from "@/components/ui/number-input";
import { cn } from "@/lib/cn";
import { getTradingCtaClass, getTradingCtaIntent } from "@/lib/ui/trading-cta";

function dom(node: ReactNode) {
	const host = document.createElement("div");
	host.innerHTML = renderToString(node);
	return host;
}
function required<T>(value: T | null | undefined): T {
	if (value == null) throw new Error("Missing element");
	return value;
}
function geometry(node: Element | null | undefined): unknown {
	const element = required(node);
	return {
		tag: element.tagName,
		classes: [...element.classList].filter((c) => c !== "invisible").sort(),
		children: [...element.children].map(geometry),
	};
}
function source(path: string) {
	return readFileSync(resolve(__dirname, "../..", path), "utf8");
}
const noop = () => {};

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
	for (const root of [placeholder, runtime]) {
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
	const frame = dom(
		<TradePercentFrameView
			frameClassName="h-8 w-16 shrink-0 rounded-[8px] px-2 opacity-50"
			input={
				<NumberInput
					value="0"
					disabled
					inputSize="sm"
					className={cn(TRADE_PERCENT_INPUT_CLASS, "text-trading-panel-subtle")}
				/>
			}
		/>,
	);
	const runtime = dom(
		<SizePercentInput
			value={0}
			disabled
			ariaLabel="Size (%)"
			onPercentChange={noop}
			frameClassName="h-8 w-16 shrink-0 rounded-[8px] px-2 opacity-50"
		/>,
	);
	expect(geometry(frame.firstElementChild)).toEqual(geometry(runtime.firstElementChild));
	expect(source("components/trade/components/size-percent-input.tsx")).toContain("<TradePercentFrameView");
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
				<TradeControlButtonView ref={control} labelFull="Margin" value="Cross" disabled={disabled} onClick={clicked} />
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
it.each(["default", "sm"] as const)("uses NumberInput's exact class list for %s inputs", (inputSize) => {
	const className =
		inputSize === "default" ? TRADE_INPUT_CLASS : cn(TRADE_PERCENT_INPUT_CLASS, "text-trading-panel-subtle");
	const runtime = dom(<NumberInput value="0" inputSize={inputSize} className={className} />);
	expect(runtime.querySelector("input")?.className).toBe(getInputClassName(inputSize, cn("w-full", className)));
});

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
