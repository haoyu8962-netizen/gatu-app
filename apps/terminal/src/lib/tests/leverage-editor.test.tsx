/** @vitest-environment jsdom */

import { DirectionProvider } from "@base-ui/react/direction-provider";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeverageEditor } from "@/components/trade/tradebox/leverage-editor";
import { createI18nRoot } from "./harness/react";

const sliderHarness = vi.hoisted(() => ({
	props: null as Record<string, unknown> | null,
}));

vi.mock("@/components/trade/tradebox/leverage-slider", () => ({
	LeverageSlider: (props: Record<string, unknown>) => {
		sliderHarness.props = props;
		return createElement("div", { "data-testid": "leverage-slider" });
	},
}));

describe("LeverageEditor", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		sliderHarness.props = null;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function renderEditor(
		onChange: (value: number) => void,
		onDraftChange: (value: number | null) => void,
		variant: "sheet" | "modal" = "sheet",
	) {
		act(() => {
			root.render(
				<LeverageEditor
					value={5}
					max={20}
					disabled={false}
					onChange={onChange}
					onDraftChange={onDraftChange}
					variant={variant}
				/>,
			);
		});
	}

	it("keeps drag values in the modal draft and commits once on pointer release", () => {
		const onChange = vi.fn();
		const onDraftChange = vi.fn();
		renderEditor(onChange, onDraftChange);

		const onValueChange = sliderHarness.props?.onChange as ((value: number) => void) | undefined;
		const onValueCommitted = sliderHarness.props?.onCommit as ((value: number) => void) | undefined;

		act(() => {
			onValueChange?.(11);
			onValueChange?.(12);
			onValueChange?.(13);
		});

		expect(onDraftChange).toHaveBeenNthCalledWith(1, 11);
		expect(onDraftChange).toHaveBeenNthCalledWith(2, 12);
		expect(onDraftChange).toHaveBeenNthCalledWith(3, 13);
		expect(onChange).not.toHaveBeenCalled();

		act(() => onValueCommitted?.(13));

		expect(onDraftChange).toHaveBeenLastCalledWith(null);
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith(13);
	});

	it("clears the transient draft when a pointer interaction is cancelled", () => {
		const onChange = vi.fn();
		const onDraftChange = vi.fn();
		renderEditor(onChange, onDraftChange);

		const onValueChange = sliderHarness.props?.onChange as ((value: number) => void) | undefined;
		const onCancel = sliderHarness.props?.onCancel as (() => void) | undefined;

		act(() => onValueChange?.(12));
		act(() => onCancel?.());

		expect(onDraftChange).toHaveBeenNthCalledWith(1, 12);
		expect(onDraftChange).toHaveBeenNthCalledWith(2, null);
		expect(onChange).not.toHaveBeenCalled();
	});

	it("keeps the visual control inset aligned with the thumb radius", () => {
		renderEditor(vi.fn(), vi.fn(), "sheet");

		expect(sliderHarness.props?.controlClassName).toContain("mx-3");
		expect(sliderHarness.props?.controlClassName).toContain("w-auto");
		expect(sliderHarness.props?.trackClassName).not.toContain("mx-");

		renderEditor(vi.fn(), vi.fn(), "modal");

		expect(sliderHarness.props?.controlClassName).toContain("mx-2.5");
		expect(sliderHarness.props?.controlClassName).toContain("h-8");
		expect(sliderHarness.props?.trackClassName).not.toContain("mx-");
	});

	it("does not mount the high leverage warning for an uncommitted drag value", () => {
		act(() => {
			root.render(
				<LeverageEditor
					value={12}
					riskValue={9}
					max={20}
					disabled={false}
					onChange={vi.fn()}
					onDraftChange={vi.fn()}
				/>,
			);
		});

		expect(container.textContent).not.toContain("High leverage significantly increases liquidation risk");
	});

	it("mirrors tick labels and positions in RTL", () => {
		act(() => {
			root.render(
				<DirectionProvider direction="rtl">
					<LeverageEditor value={5} max={20} disabled={false} onChange={vi.fn()} onDraftChange={vi.fn()} />
				</DirectionProvider>,
			);
		});

		const buttons = [...container.querySelectorAll("button")];
		const minimum = buttons.find((button) => button.textContent === "1x");
		const maximum = buttons.find((button) => button.textContent === "20x");
		const quarter = buttons.find((button) => button.textContent === "6x");
		expect(minimum?.className).toContain("right-0");
		expect(maximum?.className).toContain("left-0");
		expect(Number.parseFloat(quarter?.style.left ?? "0")).toBeGreaterThan(70);
	});
});
