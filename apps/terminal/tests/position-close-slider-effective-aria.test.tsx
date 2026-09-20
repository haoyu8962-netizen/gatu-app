/** @vitest-environment jsdom */

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { act, createElement, type ReactNode, useState } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createPositionCloseSizingViewModel,
	PositionCloseSizingControls,
} from "@/components/trade/positions/position-close-dialog-ui";
import {
	type PositionCloseSizingIntent,
	resolvePositionMarketClosePercent,
	resolvePositionMarketCloseSize,
} from "@/domain/trade/position-market-close";
import { createI18nRoot } from "@/lib/tests/harness/react";

const sliderState = vi.hoisted(() => ({
	props: null as null | {
		onPercentCancel: (value: number) => void;
		onPercentChange: (value: number) => void;
		onPercentCommit: (value: number) => void;
		onPercentInteractionStart?: (value: number) => void;
	},
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	Button: ({ children, intent: _intent, size: _size, variant: _variant, ...props }: Record<string, unknown>) =>
		createElement("button", { ...props, type: "button" }, children as ReactNode),
	ModalContent: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("div", props, children),
	ModalFooter: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("footer", props, children),
	ModalHeader: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("header", props, children),
}));

vi.mock("@/components/ui/number-input", () => ({
	NumberInput: ({
		inputSize: _inputSize,
		maxAllowedDecimals: _maxAllowedDecimals,
		allowDecimals: _allowDecimals,
		mobileSafe: _mobileSafe,
		suffix: _suffix,
		suffixClassName: _suffixClassName,
		...props
	}: Record<string, unknown>) => createElement("input", props),
}));

vi.mock("@/components/trade/components/trade-size-slider", () => ({
	TradeSizeSlider: (props: Record<string, unknown>) => {
		sliderState.props = props as NonNullable<typeof sliderState.props>;
		return createElement("div", {
			role: "slider",
			"aria-label": props.ariaLabel,
			"aria-valuenow": props.value,
			"aria-valuetext": props.ariaValueText,
		});
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const EFFECTIVE_PERCENT_MESSAGE = "{requestedPercent}% requested; {effectivePercent}% after size precision";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const translatedEffectivePercentMessages: Array<{
	locale: string;
	messages: Messages;
	expected: string;
}> = [
	{
		locale: "ar",
		messages: {
			[getMessageId(EFFECTIVE_PERCENT_MESSAGE)]: [
				"طلب ",
				["requestedPercent"],
				"٪؛ ",
				["effectivePercent"],
				"٪ بعد تطبيق دقة الحجم",
			],
		},
		expected: "طلب 50٪؛ 46.6٪ بعد تطبيق دقة الحجم",
	},
	{
		locale: "fr",
		messages: {
			[getMessageId(EFFECTIVE_PERCENT_MESSAGE)]: [
				"",
				["requestedPercent"],
				" % demandé ; ",
				["effectivePercent"],
				" % après application de la précision de taille",
			],
		},
		expected: "50 % demandé ; 46.6 % après application de la précision de taille",
	},
];

describe("position close slider effective aria contract", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		sliderState.props = null;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("A3 identifies the requested 50% and the effective 46.6% alongside the actual aria-valuenow", () => {
		renderSizingControls(root);

		const slider = container.querySelector('[role="slider"]');
		expect(Number(slider?.getAttribute("aria-valuenow"))).toBeCloseTo(46.6667, 3);
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close percentage"]')?.value).toBe("47");
		expect(slider?.getAttribute("aria-valuetext")).toBe("50% requested; 46.6% after size precision");
	});

	it.each(translatedEffectivePercentMessages)(
		"renders requested and effective percentages in $locale",
		({ locale, messages, expected }) => {
			i18n.loadAndActivate({ locale, messages });
			renderSizingControls(root);

			expect(container.querySelector('[role="slider"]')?.getAttribute("aria-valuetext")).toBe(expected);
		},
	);

	it("shows rounded effective percentages without promoting a partial request to max on blur", () => {
		const onIntentChange = vi.fn();
		renderSizingControls(root, {
			intent: { kind: "size", value: "996" },
			signedPositionSize: "1000",
			onIntentChange,
		});
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Close percentage"]');
		expect(input?.value).toBe("100");
		expect(input?.min).toBe("0");
		expect(input?.max).toBe("100");
		expect(input?.step).toBe("1");
		expect(container.querySelector('[role="slider"]')?.getAttribute("aria-valuenow")).toBe("99.6");
		expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(0);

		act(() => input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
		expect(onIntentChange).not.toHaveBeenCalled();
	});

	it("retains an integer percentage draft until blur and accepts explicit 100% as max", () => {
		const onIntentChange = vi.fn();
		renderSizingControls(root, { onIntentChange });
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Close percentage"]');
		if (!input) throw new Error("Expected percentage input");
		const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		act(() => {
			valueSetter?.call(input, "50");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(input.value).toBe("50");
		expect(onIntentChange).toHaveBeenLastCalledWith({ kind: "percent", value: "50" });
		act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
		expect(input.value).toBe("47");

		act(() => {
			valueSetter?.call(input, "100");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(onIntentChange).toHaveBeenLastCalledWith({ kind: "max" });
	});

	it("commits a keyboard percentage without requiring a pointer-start event", () => {
		const onIntentChange = vi.fn();
		renderSizingControls(root, { onIntentChange });
		act(() => sliderState.props?.onPercentCommit(51));
		expect(onIntentChange).toHaveBeenCalledExactlyOnceWith({ kind: "percent", value: "51" });
		act(() => sliderState.props?.onPercentCommit(100));
		expect(onIntentChange).toHaveBeenLastCalledWith({ kind: "max" });
	});

	it.each(["cancel", "commit"])("does not restore or commit an old identity after %s", (action) => {
		const onIntentChange = vi.fn();
		renderSizingControls(root, {
			intent: { kind: "size", value: "0.0100" },
			interactionIdentity: "owner-a:mainnet:BTC:session-1",
			onIntentChange,
		});
		act(() => sliderState.props?.onPercentInteractionStart?.(66.6));
		act(() => sliderState.props?.onPercentChange(25));
		onIntentChange.mockClear();
		renderSizingControls(root, {
			intent: { kind: "size", value: "0.0050" },
			interactionIdentity: "owner-b:testnet:ETH:session-2",
			onIntentChange,
		});
		act(() => {
			if (action === "cancel") sliderState.props?.onPercentCancel(66.6);
			else sliderState.props?.onPercentCommit(75);
		});
		expect(onIntentChange).not.toHaveBeenCalled();
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close size"]')?.value).toBe("0.0050");
	});

	it("restores an exact manual close-size intent after a canceled drag", () => {
		function Harness() {
			const [intent, setIntent] = useState<PositionCloseSizingIntent>({ kind: "size", value: "1.0000" });
			let percent = "13.2";
			if (intent.kind === "max") percent = "100";
			else if (intent.kind === "percent") percent = intent.value;
			const resolution = resolvePositionMarketClosePercent({
				signedPositionSize: "7.5759",
				percent,
				szDecimals: 4,
			});
			const viewModel = createPositionCloseSizingViewModel(intent, resolution, 4);
			return (
				<PositionCloseSizingControls
					testId="close-sizing"
					sliderTestId="close-slider"
					interactionIdentity="owner:network:position-session"
					intent={intent}
					resolution={resolution}
					viewModel={viewModel}
					szDecimals={4}
					symbol="BTC"
					disabled={false}
					paused={false}
					hasDescribedError={false}
					visibleSizingError={null}
					priceLabel="$100,000"
					onIntentChange={setIntent}
				/>
			);
		}

		act(() => root.render(<Harness />));
		const beforeDrag = sliderState.props;
		if (!beforeDrag) throw new Error("Expected close slider props");
		act(() => beforeDrag.onPercentInteractionStart?.(13.2));
		act(() => beforeDrag.onPercentChange(50));
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close size"]')?.value).not.toBe("1.0000");

		const afterPreview = sliderState.props;
		if (!afterPreview) throw new Error("Expected preview slider props");
		act(() => afterPreview.onPercentCancel(13.2));
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close size"]')?.value).toBe("1.0000");
	});
});

function renderSizingControls(
	root: Root,
	{
		intent = { kind: "percent", value: "50" },
		signedPositionSize = "0.015",
		interactionIdentity = "owner:network:position-session",
		onIntentChange = () => {},
	}: {
		intent?: PositionCloseSizingIntent;
		signedPositionSize?: string;
		interactionIdentity?: string;
		onIntentChange?: (intent: PositionCloseSizingIntent) => void;
	} = {},
) {
	const resolution =
		intent.kind === "size"
			? resolvePositionMarketCloseSize({ signedPositionSize, closeSize: intent.value, szDecimals: 3 })
			: resolvePositionMarketClosePercent({
					signedPositionSize,
					percent: intent.kind === "max" ? "100" : intent.value,
					szDecimals: 3,
				});
	const viewModel = createPositionCloseSizingViewModel(intent, resolution, 3);

	act(() => {
		root.render(
			<PositionCloseSizingControls
				testId="close-sizing"
				sliderTestId="close-slider"
				interactionIdentity={interactionIdentity}
				intent={intent}
				resolution={resolution}
				viewModel={viewModel}
				szDecimals={3}
				symbol="BTC"
				disabled={false}
				paused={false}
				hasDescribedError={false}
				visibleSizingError={null}
				priceLabel="$100,000"
				onIntentChange={onIntentChange}
			/>,
		);
	});
}
