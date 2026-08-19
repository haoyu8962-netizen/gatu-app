/** @vitest-environment jsdom */

import { type ReactNode, act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	PositionCloseSizingControls,
	createPositionCloseSizingViewModel,
} from "@/components/trade/positions/position-close-dialog-ui";
import { resolvePositionMarketClosePercent } from "@/domain/trade/position-market-close";
import { createI18nRoot } from "@/lib/tests/harness/react";

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
	TradeSizeSlider: (props: Record<string, unknown>) =>
		createElement("div", {
			role: "slider",
			"aria-label": props.ariaLabel,
			"aria-valuenow": props.value,
			"aria-valuetext": props.ariaValueText,
		}),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("position close slider effective aria contract", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("A3 identifies the requested 50% and the effective 46.6% without contradicting aria-valuenow", () => {
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

		const slider = container.querySelector('[role="slider"]');
		expect(slider?.getAttribute("aria-valuenow")).toBe("50");
		expect(slider?.getAttribute("aria-valuetext")).toBe("50% requested; 46.6% after size precision");
	});
});
