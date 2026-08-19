/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	useGlobalSettingsActions,
	useMarketOrderSlippagePercent,
} from "@/stores/use-global-settings-store";

let actions: ReturnType<typeof useGlobalSettingsActions> | null = null;
let storeValue = Number.NaN;

function Probe() {
	actions = useGlobalSettingsActions();
	storeValue = useMarketOrderSlippagePercent();
	return <output>{storeValue}</output>;
}

describe("global slippage canonical store path", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(<Probe />));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		actions = null;
		storeValue = Number.NaN;
	});

	it("returns and publishes the same clamped value for an out-of-range request", () => {
		if (!actions) throw new Error("Expected global settings actions");
		let committed = Number.NaN;

		act(() => {
			actions?.setMarketOrderSlippagePercent(0.5);
			committed = actions?.setMarketOrderSlippagePercent(9) ?? Number.NaN;
		});

		expect.soft(committed).toBe(5);
		expect.soft(storeValue).toBe(5);
		expect.soft(container.querySelector("output")?.textContent).toBe("5");
	});
});
