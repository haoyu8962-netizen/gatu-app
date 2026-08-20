/** @vitest-environment jsdom */

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { type ReactNode, act, createElement, useState } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	PositionCloseSizingControls,
	createPositionCloseSizingViewModel,
} from "@/components/trade/positions/position-close-dialog-ui";
import {
	type PositionCloseSizingIntent,
	resolvePositionMarketClosePercent,
} from "@/domain/trade/position-market-close";
import { createI18nRoot } from "@/lib/tests/harness/react";

const sliderState = vi.hoisted(() => ({
	props: null as null | {
		onPercentCancel: (value: number) => void;
		onPercentChange: (value: number) => void;
		onPercentInteractionStart?: (value: number) => void;
	},
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	Button: ({
		children,
		intent: _intent,
		size: _size,
		variant: _variant,
		...props
	}: Record<string, unknown>) => createElement("button", { ...props, type: "button" }, children as ReactNode),
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
				"طُلب ",
				["requestedPercent"],
				"٪؛ ",
				["effectivePercent"],
				"٪ بعد تطبيق دقة الحجم",
			],
		},
		expected: "طُلب 50٪؛ 46.6٪ بعد تطبيق دقة الحجم",
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

	it("A3 identifies the requested 50% and the effective 46.6% without contradicting aria-valuenow", () => {
		renderSizingControls(root);

		const slider = container.querySelector('[role="slider"]');
		expect(slider?.getAttribute("aria-valuenow")).toBe("50");
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
					intent={intent}
					resolution={resolution}
					viewModel={viewModel}
					szDecimals={4}
					symbol="BTC"
					disabled={false}
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

function renderSizingControls(root: Root) {
	const intent = { kind: "percent", value: "50" } as const;
	const resolution = resolvePositionMarketClosePercent({
		signedPositionSize: "0.015",
		percent: intent.value,
		szDecimals: 3,
	});
	const viewModel = createPositionCloseSizingViewModel(intent, resolution, 3);

	act(() => {
		root.render(
			<PositionCloseSizingControls
				testId="close-sizing"
				sliderTestId="close-slider"
				intent={intent}
				resolution={resolution}
				viewModel={viewModel}
				szDecimals={3}
				symbol="BTC"
				disabled={false}
				hasDescribedError={false}
				visibleSizingError={null}
				priceLabel="$100,000"
				onIntentChange={() => {}}
			/>,
		);
	});
}
