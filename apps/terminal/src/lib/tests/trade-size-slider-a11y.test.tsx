/** @vitest-environment jsdom */

import { DirectionProvider } from "@base-ui/react/direction-provider";
import { act, type ComponentProps, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeSlider } from "@/components/trade/components/trade-slider";
import { getSizeForPercent, getSliderValue } from "@/domain/trade/order/size";

type Props = ComponentProps<typeof TradeSlider>;

function PrecisionFixture({ onCommit }: { onCommit: (value: number) => void }) {
	const [size, setSize] = useState("0");
	const [revision, setRevision] = useState(0);
	function commit(percent: number) {
		onCommit(percent);
		setSize(
			getSizeForPercent({
				pct: percent,
				isSpotMarket: false,
				side: "buy",
				sizeMode: "base",
				price: 1_380,
				maxSize: 0.012,
				spotBalance: { baseAvailable: 0, quoteAvailable: 0, baseName: "HYPE", quoteName: "USDC" },
				szDecimals: 3,
			}),
		);
		setRevision((current) => current + 1);
	}
	return (
		<>
			<TradeSlider
				value={getSliderValue(Number(size), 0.012)}
				min={0}
				max={100}
				ariaLabel="Size (%)"
				onPreview={() => setRevision(revision + 1)}
				onCommit={commit}
				onCancel={vi.fn()}
			/>
			<output data-testid="quantity">{size}</output>
			<output data-testid="revision">{revision}</output>
		</>
	);
}

describe("TradeSlider native accessibility and discrete input", () => {
	let container: HTMLDivElement;
	let root: Root;
	let props: Props;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		props = {
			value: 50,
			min: 0,
			max: 100,
			ariaLabel: "Size (%)",
			onPreview: vi.fn(),
			onCommit: vi.fn(),
			onCancel: vi.fn(),
		};
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
	});

	function render(overrides: Partial<Props> = {}, direction: "ltr" | "rtl" = "ltr") {
		props = { ...props, ...overrides };
		act(() =>
			root.render(
				<DirectionProvider direction={direction}>
					<TradeSlider {...props} />
					<p id={props.ariaDescribedBy}>Close percentage is invalid</p>
				</DirectionProvider>,
			),
		);
		const input = container.querySelector<HTMLInputElement>('input[type="range"]');
		if (!input) throw new Error("Expected a native range input");
		return input;
	}

	function key(input: HTMLInputElement, value: string) {
		act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })));
	}

	function nativeInput(input: HTMLInputElement, value: number) {
		act(() => {
			input.value = String(value);
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
	}

	it("exposes a labelled native range, effective value description, and error relationship", () => {
		const input = render({
			ariaLabel: "Close percentage",
			ariaValueText: "50% requested; 46.6% after size precision",
			ariaDescribedBy: "close-error",
			ariaInvalid: true,
		});
		expect(input.labels?.[0]?.textContent).toBe("Close percentage");
		expect(input.labels?.[0]?.classList.contains("sr-only")).toBe(true);
		expect(input.min).toBe("0");
		expect(input.max).toBe("100");
		expect(input.step).toBe("1");
		expect(input.value).toBe("50");
		expect(input.getAttribute("aria-valuetext")).toBe("50% requested; 46.6% after size precision");
		expect(input.getAttribute("aria-describedby")).toBe("close-error");
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(input.closest("[data-trade-slider-thumb]")?.className).toContain("has-[input:focus-visible]:outline-2");
	});

	it("commits one integer per arrow key, ten per page key, and uses the endpoints", () => {
		const input = render({ value: 20 });
		for (const name of ["ArrowRight", "ArrowUp", "PageUp", "PageDown", "ArrowLeft", "ArrowDown", "End", "Home"])
			key(input, name);
		expect(vi.mocked(props.onCommit).mock.calls.map(([value]) => value)).toEqual([21, 22, 32, 22, 21, 20, 100, 0]);
		expect(props.onPreview).not.toHaveBeenCalled();
		expect(vi.mocked(props.onCommit).mock.calls.every(([, details]) => details.reason === "keyboard")).toBe(true);
	});

	it("accumulates keyboard intent while real quantity precision still yields zero", () => {
		const onCommit = vi.fn();
		act(() => root.render(<PrecisionFixture onCommit={onCommit} />));
		const input = container.querySelector<HTMLInputElement>('input[type="range"]');
		if (!input) throw new Error("Expected a native range input");
		act(() => input.focus());
		for (let count = 0; count < 8; count++) key(input, "ArrowRight");
		expect(container.querySelector("[data-testid=quantity]")?.textContent).toBe("0");
		expect(onCommit.mock.calls.map(([value]) => value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		key(input, "ArrowRight");
		expect(onCommit).toHaveBeenLastCalledWith(9);
		expect(container.querySelector("[data-testid=quantity]")?.textContent).toBe("0.001");
	});

	it("accepts assistive technology native input once and ignores a matching change event", () => {
		const input = render({ value: 25 });
		nativeInput(input, 63);
		act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(63, expect.objectContaining({ reason: "input-change" }));
		expect(props.onPreview).not.toHaveBeenCalled();
		expect(input.value).toBe("63");
	});

	it("accumulates native input steps across rounded quantity updates", () => {
		const onCommit = vi.fn();
		act(() => root.render(<PrecisionFixture onCommit={onCommit} />));
		const input = container.querySelector<HTMLInputElement>('input[type="range"]');
		if (!input) throw new Error("Expected a native range input");
		for (let count = 0; count < 9; count++) nativeInput(input, Number(input.value) + 1);
		expect(onCommit.mock.calls.map(([value]) => value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
		expect(container.querySelector("[data-testid=quantity]")?.textContent).toBe("0.001");
	});

	it("respects an absolute native range value after keyboard intent survived precision rounding", () => {
		const onCommit = vi.fn();
		act(() => root.render(<PrecisionFixture onCommit={onCommit} />));
		const input = container.querySelector<HTMLInputElement>('input[type="range"]');
		if (!input) throw new Error("Expected a native range input");
		for (let count = 0; count < 8; count++) key(input, "ArrowRight");
		nativeInput(input, 80);
		expect(onCommit).toHaveBeenLastCalledWith(80);
		expect(container.querySelector("[data-testid=quantity]")?.textContent).toBe("0.009");
	});

	it("uses RTL horizontal keyboard direction while preserving logical vertical direction", () => {
		const input = render({ value: 50 }, "rtl");
		for (const name of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]) key(input, name);
		expect(vi.mocked(props.onCommit).mock.calls.map(([value]) => value)).toEqual([49, 50, 51, 50]);
	});

	it.each([{ disabled: true }, { min: 50, max: 50 }, { min: Number.NaN }, { max: Number.POSITIVE_INFINITY }])(
		"disables invalid or unavailable native ranges: %j",
		(overrides) => {
			const input = render(overrides);
			expect(input.disabled).toBe(true);
			key(input, "ArrowRight");
			nativeInput(input, 60);
			expect(props.onCommit).not.toHaveBeenCalled();
			expect(props.onPreview).not.toHaveBeenCalled();
		},
	);

	it("resets accumulated intent on blur before a new keyboard interaction", () => {
		const input = render({ value: 0 });
		act(() => input.focus());
		key(input, "ArrowRight");
		key(input, "ArrowRight");
		act(() => input.blur());
		render({ value: 40 });
		act(() => input.focus());
		key(input, "ArrowRight");
		expect(vi.mocked(props.onCommit).mock.calls.map(([value]) => value)).toEqual([1, 2, 41]);
	});
});
