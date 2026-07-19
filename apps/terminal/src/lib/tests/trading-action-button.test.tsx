// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradingActionButton } from "@/components/trade/components/trading-action-button";

const testState = vi.hoisted(() => ({
	error: null as Error | null,
	guardAction: vi.fn(),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useTradingGuard: () => ({
		isReady: false,
		isEnabling: false,
		needsTrading: true,
		guardAction: testState.guardAction,
		error: testState.error,
	}),
}));

describe("TradingActionButton", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.error = null;
		testState.guardAction.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("surfaces trading enablement errors next to the action", () => {
		testState.error = new Error("Selected wallet does not match the connected account.");

		act(() => {
			root.render(<TradingActionButton onClick={vi.fn()}>Swap</TradingActionButton>);
		});

		const alert = container.querySelector('[role="alert"]');
		expect(alert?.textContent).toContain("Selected wallet does not match");
	});
});
