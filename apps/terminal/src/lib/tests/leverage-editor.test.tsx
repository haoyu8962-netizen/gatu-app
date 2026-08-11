/** @vitest-environment jsdom */

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeverageEditor } from "@/components/trade/tradebox/leverage-editor";
import { createI18nRoot } from "./harness/react";

const sliderHarness = vi.hoisted(() => ({
	props: null as Record<string, unknown> | null,
}));

vi.mock("@gatu/ui", () => ({
	Slider: (props: Record<string, unknown>) => {
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

		const onValueChange = sliderHarness.props?.onValueChange as ((value: number) => void) | undefined;
		const onValueCommitted = sliderHarness.props?.onValueCommitted as ((value: number) => void) | undefined;

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

	it("uses center alignment with an equivalent inset control and opts out of drawer swipes", () => {
		renderEditor(vi.fn(), vi.fn(), "sheet");

		expect(sliderHarness.props?.thumbAlignment).toBe("center");
		expect(sliderHarness.props?.controlClassName).toContain("mx-3");
		expect(sliderHarness.props?.controlClassName).toContain("w-auto");
		expect(sliderHarness.props?.trackClassName).not.toContain("mx-");
		expect(sliderHarness.props?.["data-base-ui-swipe-ignore"]).toBe("");

		renderEditor(vi.fn(), vi.fn(), "modal");

		expect(sliderHarness.props?.controlClassName).toContain("mx-2.5");
		expect(sliderHarness.props?.controlClassName).toContain("h-8");
		expect(sliderHarness.props?.trackClassName).not.toContain("mx-");
	});
});
