/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeSlider } from "@/components/trade/components/trade-slider";
import { useSizeSliderInteraction } from "@/hooks/trade/use-size-slider-interaction";
import { useOrderEntryActions, useOrderSize } from "@/stores/use-order-entry-store";

interface HarnessProps {
	identity: string;
	maxSize: number;
}

const testState: {
	setSizeInput: (value: string) => void;
	preview: (percent: number) => void;
	slider: ReturnType<typeof useSizeSliderInteraction> | null;
	onInteractionChange: ReturnType<typeof vi.fn<(active: boolean) => void>>;
} = {
	setSizeInput: () => {},
	preview: () => {},
	slider: null,
	onInteractionChange: vi.fn<(active: boolean) => void>(),
};

function Harness({ identity, maxSize }: HarnessProps) {
	const [sizeInput, setSizeInput] = useState("1.2345");
	const applyPercent = (percent: number) => {
		if (maxSize <= 0) return;
		setSizeInput(percent === 80 ? "8" : String(percent));
	};
	const slider = useSizeSliderInteraction({
		onInteractionChange: testState.onInteractionChange,
		applyPercent,
		interactionIdentity: identity,
		setSizeInput,
		sizeInput,
	});
	testState.preview = applyPercent;
	testState.setSizeInput = setSizeInput;
	testState.slider = slider;
	return <output>{sizeInput}</output>;
}

function StoreHarness({ identity }: { identity: string }) {
	const sizeInput = useOrderSize();
	const { setSize, resetForm } = useOrderEntryActions();
	const applyPercent = (percent: number) => setSize(String(percent));
	const slider = useSizeSliderInteraction({
		applyPercent,
		interactionIdentity: identity,
		setSizeInput: setSize,
		sizeInput,
	});
	testState.setSizeInput = setSize;
	testState.slider = slider;
	return (
		<>
			<TradeSlider
				value={Number(sizeInput) || 0}
				min={0}
				max={100}
				interactionIdentity={identity}
				ariaLabel="Size (%)"
				onPreview={applyPercent}
				onCommit={slider.onPercentCommit}
				onCancel={slider.onPercentCancel}
				onInteractionStart={slider.onPercentInteractionStart}
				onInteractionEnd={slider.onPercentInteractionEnd}
			/>
			<button type="button" onClick={resetForm}>
				Reset market form
			</button>
			<output>{sizeInput}</output>
		</>
	);
}

describe("useSizeSliderInteraction", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.slider = null;
		testState.onInteractionChange.mockClear();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("restores the exact size even after percent application becomes unavailable", () => {
		act(() => root.render(<Harness identity="account-a:BTC:base" maxSize={10} />));
		act(() => testState.slider?.onPercentInteractionStart());
		act(() => testState.preview(80));
		expect(container.textContent).toBe("8");

		act(() => root.render(<Harness identity="account-a:BTC:base" maxSize={0} />));
		act(() => testState.preview(25));
		expect(container.textContent).toBe("8");
		act(() => testState.slider?.onPercentCancel());
		expect(container.textContent).toBe("1.2345");
	});

	it("does not write an old interaction snapshot into a new identity", () => {
		act(() => root.render(<Harness identity="account-a:BTC:base" maxSize={10} />));
		act(() => testState.slider?.onPercentInteractionStart());
		act(() => testState.preview(80));

		act(() => root.render(<Harness identity="account-b:BTC:base" maxSize={10} />));
		act(() => testState.setSizeInput("2.5"));
		act(() => testState.slider?.onPercentCancel());
		expect(container.textContent).toBe("2.5");
	});

	it("rejects a pointer commit that started under a different identity", () => {
		act(() => root.render(<Harness identity="account-a:BTC:base" maxSize={10} />));
		act(() => testState.slider?.onPercentInteractionStart());
		act(() => testState.preview(80));

		act(() => root.render(<Harness identity="account-b:BTC:base" maxSize={10} />));
		act(() => testState.setSizeInput("2.5"));
		act(() => testState.slider?.onPercentCommit(50));
		expect(container.textContent).toBe("2.5");
	});

	it("locks submission synchronously on start and unlocks after committing the final amount", () => {
		act(() => root.render(<Harness identity="account-a:BTC:base" maxSize={10} />));
		act(() => {
			testState.slider?.onPercentInteractionStart();
			expect(testState.onInteractionChange).toHaveBeenCalledExactlyOnceWith(true);
		});
		act(() => testState.preview(80));
		act(() => testState.slider?.onPercentCommit(50));

		expect(container.textContent).toBe("50");
		expect(testState.onInteractionChange.mock.calls).toEqual([[true]]);
		act(() => testState.slider?.onPercentInteractionEnd());
		expect(testState.onInteractionChange.mock.calls).toEqual([[true], [false]]);
		act(() => testState.slider?.onPercentCancel());
		expect(container.textContent).toBe("50");
	});

	it("restores the original quantity before ending a canceled interaction", () => {
		act(() => root.render(<Harness identity="account-a:BTC:base" maxSize={10} />));
		act(() => testState.slider?.onPercentInteractionStart());
		act(() => testState.preview(80));
		act(() => testState.slider?.onPercentCancel());

		expect(container.textContent).toBe("1.2345");
		expect(testState.onInteractionChange.mock.calls).toEqual([[true]]);
		act(() => testState.slider?.onPercentInteractionEnd());
		expect(testState.onInteractionChange.mock.calls).toEqual([[true], [false]]);
	});

	it("ends a motionless interaction and clears its snapshot before later edits", () => {
		act(() => root.render(<Harness identity="account-a:BTC:base" maxSize={10} />));
		act(() => testState.slider?.onPercentInteractionStart());
		act(() => testState.slider?.onPercentInteractionEnd());

		expect(container.textContent).toBe("1.2345");
		expect(testState.onInteractionChange.mock.calls).toEqual([[true], [false]]);
		act(() => testState.setSizeInput("2.5000"));
		act(() => testState.slider?.onPercentCancel());
		expect(container.textContent).toBe("2.5000");
	});

	it("unlocks the current account without restoring the previous account's quantity", () => {
		act(() => root.render(<Harness identity="account-a:BTC:base" maxSize={10} />));
		act(() => testState.slider?.onPercentInteractionStart());
		act(() => testState.preview(80));
		act(() => root.render(<Harness identity="account-b:BTC:base" maxSize={10} />));
		act(() => testState.setSizeInput("2.5000"));
		act(() => testState.slider?.onPercentCancel());
		act(() => testState.slider?.onPercentInteractionEnd());

		expect(container.textContent).toBe("2.5000");
		expect(testState.onInteractionChange.mock.calls).toEqual([[true], [false]]);
		act(() => testState.slider?.onPercentCommit(25));
		expect(container.textContent).toBe("25");
	});

	it("applies a discrete keyboard amount without opening a pointer interaction", () => {
		act(() => root.render(<Harness identity="account-a:BTC:base" maxSize={10} />));
		act(() => testState.slider?.onPercentCommit(25));

		expect(container.textContent).toBe("25");
		expect(testState.onInteractionChange).not.toHaveBeenCalled();
	});

	it.each([false, true])("keeps a market reset empty when the old keyed slider unmounts, preview=%s", (preview) => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn(() => 1),
		);
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
		act(() => root.render(<StoreHarness key="BTC" identity="account-a:BTC:base" />));
		act(() => testState.setSizeInput("1.2345"));
		const control = container.querySelector<HTMLDivElement>("[data-trade-slider-control]");
		const thumb = container.querySelector<HTMLDivElement>("[data-trade-slider-thumb]");
		if (!control || !thumb) throw new Error("Expected slider controls");
		Object.defineProperty(control, "getBoundingClientRect", {
			value: () => ({ left: 0, width: 100, height: 33 }),
		});
		const pointerDown = new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 1.2345 });
		Object.defineProperties(pointerDown, { pointerId: { value: 1 }, isPrimary: { value: true } });
		act(() => thumb.dispatchEvent(pointerDown));
		if (preview) {
			const move = new MouseEvent("pointermove", { bubbles: true, button: 0, clientX: 80 });
			Object.defineProperties(move, { pointerId: { value: 1 }, isPrimary: { value: true } });
			act(() => control.dispatchEvent(move));
			act(() => vi.advanceTimersByTime(15));
			expect(container.querySelector("output")?.textContent).toBe("80");
		}
		act(() => {
			container.querySelector<HTMLButtonElement>("button")?.click();
			root.render(<StoreHarness key="HYPE" identity="account-a:HYPE:base" />);
		});
		expect(container.querySelector("output")?.textContent).toBe("");
		act(() => vi.advanceTimersByTime(100));
		expect(container.querySelector("output")?.textContent).toBe("");
	});

	it("ignores stale callbacks after a new keyed form owns the shared quantity", () => {
		act(() => root.render(<StoreHarness key="BTC" identity="account-a:BTC:base" />));
		act(() => testState.setSizeInput("1.2345"));
		const previous = testState.slider;
		act(() => previous?.onPercentInteractionStart());
		act(() => root.render(<StoreHarness key="HYPE" identity="account-a:HYPE:base" />));
		act(() => testState.setSizeInput("2.5000"));
		act(() => {
			previous?.onPercentCancel();
			previous?.onPercentCommit(50);
			previous?.onPercentInteractionStart();
			previous?.onPercentCancel();
		});
		expect(container.querySelector("output")?.textContent).toBe("2.5000");
	});
});
