/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileTradeSizeControl } from "@/components/trade/mobile/mobile-trade-size-control";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

interface RenderOverrides {
	canUsePercent?: boolean;
	disabled?: boolean;
	onPercentChange?: (percent: number) => void;
	onSizeChange?: (value: string) => void;
	onSizeModeToggle?: () => void;
	sizeInput?: string;
	sizeModeLabel?: string;
	sliderValue?: number;
}

describe("MobileTradeSizeControl", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function renderControl(overrides: RenderOverrides = {}) {
		act(() => {
			root.render(
				<MobileTradeSizeControl
					canUsePercent={overrides.canUsePercent ?? true}
					disabled={overrides.disabled ?? false}
					interactionIdentity="mainnet:0xabc:BTC:base"
					maxAllowedDecimals={8}
					onPercentChange={overrides.onPercentChange ?? vi.fn()}
					onPercentCancel={vi.fn()}
					onPercentCommit={overrides.onPercentChange ?? vi.fn()}
					onSizeChange={(event) => overrides.onSizeChange?.(event.target.value)}
					onSizeModeToggle={overrides.onSizeModeToggle ?? vi.fn()}
					percentAriaLabel="Order size percentage"
					side="buy"
					sizeAriaLabel="Order size"
					sizeInput={overrides.sizeInput ?? "0.12345678"}
					sizeLabel="Size"
					sizeModeLabel={overrides.sizeModeLabel ?? "USDC"}
					sliderValue={overrides.sliderValue ?? 25}
				/>,
			);
		});
	}

	it("preserves the financial size string and keeps the unit switch interactive", () => {
		const values: string[] = [];
		const onSizeModeToggle = vi.fn();
		renderControl({ onSizeChange: (value) => values.push(value), onSizeModeToggle });

		const sizeInput = getInput(container, "Order size");
		expect(sizeInput.value).toBe("0.12345678");

		changeInput(sizeInput, "4.33100001");
		expect(values).toEqual(["4.33100001"]);

		const unitButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
			button.textContent?.includes("USDC"),
		);
		expect(unitButton?.disabled).toBe(false);
		expect(unitButton?.className).toContain("min-w-11");
		expect(unitButton?.className).toContain("after:inset-0");
		expect(unitButton?.className).not.toContain("after:size-11");
		act(() => unitButton?.click());
		expect(onSizeModeToggle).toHaveBeenCalledOnce();
	});

	it("reserves a contained horizontal target slot for a one-character asset label", () => {
		renderControl({ sizeModeLabel: "H" });

		const unitButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
			button.textContent?.includes("H"),
		);
		expect(unitButton?.className).toContain("min-w-11");
		expect(unitButton?.className).toContain("after:inset-0");
	});

	it("clamps an entered percentage to the supported 0-100 range", () => {
		const onPercentChange = vi.fn();
		renderControl({ onPercentChange, sliderValue: 37.5 });

		const percentInput = getInput(container, "Order size percentage");
		expect(percentInput.value).toBe("38");

		changeInput(percentInput, "125");
		expect(onPercentChange).toHaveBeenLastCalledWith(100);
		expect(percentInput.value).toBe("100");

		changeInput(percentInput, "0");
		expect(onPercentChange).toHaveBeenLastCalledWith(0);
	});

	it("uses integer percentages while preserving mobile-safe width", () => {
		renderControl({ sliderValue: 80.7 });

		const percentInput = getInput(container, "Order size percentage");
		expect(percentInput.value).toBe("81");
		expect(percentInput.className).toContain("max-[1000px]:text-base");
		expect(percentInput.parentElement?.className).toContain("w-20");
		expect(percentInput.nextElementSibling?.textContent).toBe("%");

		changeInput(percentInput, "100");
		expect(percentInput.value).toBe("100");
	});

	it("disables percent-based sizing without disabling manual size entry or the unit switch", () => {
		const onSizeChange = vi.fn();
		const onSizeModeToggle = vi.fn();
		renderControl({ canUsePercent: false, onSizeChange, onSizeModeToggle });

		const sizeInput = getInput(container, "Order size");
		const percentInput = getInput(container, "Order size percentage");
		const slider = container.querySelector<HTMLInputElement>('input[type="range"]');
		const unitButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
			button.textContent?.includes("USDC"),
		);

		expect(sizeInput.disabled).toBe(false);
		expect(unitButton?.disabled).toBe(false);
		expect(percentInput.disabled).toBe(true);
		expect(slider?.disabled).toBe(true);

		changeInput(sizeInput, "2.5");
		act(() => unitButton?.click());
		expect(onSizeChange).toHaveBeenCalledWith("2.5");
		expect(onSizeModeToggle).toHaveBeenCalledOnce();
	});
});

function getInput(container: HTMLElement, ariaLabel: string): HTMLInputElement {
	const input = container.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`);
	if (!input) throw new Error(`Expected input labelled ${ariaLabel}`);
	return input;
}

function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	act(() => {
		setter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}
