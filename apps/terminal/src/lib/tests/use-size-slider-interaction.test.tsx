/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSizeSliderInteraction } from "@/hooks/trade/use-size-slider-interaction";

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
});
