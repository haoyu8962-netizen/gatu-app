/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSizeSliderInteraction } from "@/hooks/trade/use-size-slider-interaction";

interface HarnessProps {
	identity: string;
	maxSize: number;
}

const testState: {
	setSizeInput: (value: string) => void;
	preview: (percent: number) => void;
	slider: ReturnType<typeof useSizeSliderInteraction> | null;
} = {
	setSizeInput: () => {},
	preview: () => {},
	slider: null,
};

function Harness({ identity, maxSize }: HarnessProps) {
	const [sizeInput, setSizeInput] = useState("1.2345");
	const applyPercent = (percent: number) => {
		if (maxSize <= 0) return;
		setSizeInput(percent === 80 ? "8" : String(percent));
	};
	const slider = useSizeSliderInteraction({
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
});
