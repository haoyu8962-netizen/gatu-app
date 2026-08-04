// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradingActionButton } from "@/components/trade/components/trading-action-button";

const testState = vi.hoisted(() => ({
	enableTrading: vi.fn(),
	error: null as Error | null,
	guardAction: vi.fn(),
	isReady: false,
	needsTrading: true,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useTradingGuard: () => ({
		isReady: testState.isReady,
		isEnabling: false,
		needsTrading: testState.needsTrading,
		enableTrading: testState.enableTrading,
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
		testState.enableTrading.mockReset();
		testState.guardAction.mockReset();
		testState.isReady = false;
		testState.needsTrading = true;
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

	it("requires a second explicit action after enabling when requested", () => {
		const onClick = vi.fn();
		act(() => {
			root.render(
				<TradingActionButton onClick={onClick} requireReadyConfirmation>
					Market Close
				</TradingActionButton>,
			);
		});

		const button = container.querySelector("button");
		if (!(button instanceof HTMLButtonElement)) throw new Error("Trading action button not found");
		act(() => button.click());
		expect(testState.enableTrading).toHaveBeenCalledOnce();
		expect(testState.guardAction).not.toHaveBeenCalled();
		expect(onClick).not.toHaveBeenCalled();

		testState.isReady = true;
		testState.needsTrading = false;
		act(() => {
			root.render(
				<TradingActionButton onClick={onClick} requireReadyConfirmation>
					Market Close
				</TradingActionButton>,
			);
		});
		act(() => button.click());
		expect(testState.guardAction).toHaveBeenCalledWith(onClick);
	});
});
