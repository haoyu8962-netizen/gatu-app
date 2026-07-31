// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IsolatedMarginPositionRef } from "@/components/trade/positions/position-dialog-types";
import { PositionIsolatedMarginModal } from "@/components/trade/positions/position-isolated-margin-modal";
import type { Position } from "@/lib/hyperliquid";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	position: {
		dex: "xyz",
		coin: "xyz:CXMT",
		szi: "205.9",
		entryPx: "7.79995",
		positionValue: "1559.84",
		unrealizedPnl: "-46.18",
		returnOnEquity: "-0.3366",
		liquidationPx: "7.27304",
		marginUsed: "137.19",
		maxLeverage: 10,
		leverage: { type: "isolated", value: 10, rawUsd: "-18.794" },
		cumFunding: { allTime: "-22.59", sinceChange: "0", sinceOpen: "-22.59" },
	} as Position | null,
	positionLoading: false,
	positionError: false,
	updateMargin: vi.fn(),
	topUpMargin: vi.fn(),
}));

vi.mock("@gatu/ui", async () => {
	const React = await import("react");
	const SegmentedContext = React.createContext<((value: string) => void) | null>(null);

	return {
		Button: ({
			children,
			iconLeft: _iconLeft,
			iconRight: _iconRight,
			intent: _intent,
			variant: _variant,
			...props
		}: {
			children: ReactNode;
			[key: string]: unknown;
		}) => createElement("button", { ...props, type: "button" }, children),
		Modal: ({ children, open }: { children: ReactNode; open: boolean }) => (open ? children : null),
		ModalContent: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
			createElement("div", props, children),
		ModalDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
		ModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
		ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
		ModalPopup: ({
			children,
			showClose: _showClose,
			size: _size,
			...props
		}: {
			children: ReactNode;
			[key: string]: unknown;
		}) => createElement("section", props, children),
		ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
		SegmentedControls: ({ children, onValueChange }: { children: ReactNode; onValueChange: (value: string) => void }) =>
			createElement(SegmentedContext.Provider, { value: onValueChange }, children),
		SegmentedControlItem: ({
			children,
			disabled,
			value,
		}: {
			children: ReactNode;
			disabled?: boolean;
			value: string;
		}) => {
			const onValueChange = React.useContext(SegmentedContext);
			return createElement(
				"button",
				{
					type: "button",
					disabled,
					onClick: () => onValueChange?.(value),
				},
				children,
			);
		},
	};
});

vi.mock("@/components/ui/info-row", () => ({
	InfoRow: ({ label, value }: { label: ReactNode; value: ReactNode }) =>
		createElement("div", null, createElement("span", null, label), createElement("span", null, value)),
}));

vi.mock("@/components/ui/number-input", () => ({
	NumberInput: ({
		"aria-label": ariaLabel,
		onChange,
		value,
	}: {
		"aria-label": string;
		onChange: (event: { target: { value: string } }) => void;
		value: string;
	}) => createElement("input", { "aria-label": ariaLabel, onChange, value }),
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("button", { ...props, type: "button" }, children),
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: (method: string) => ({
		isPending: false,
		mutateAsync: method === "updateIsolatedMargin" ? testState.updateMargin : testState.topUpMargin,
	}),
	useUserPositions: () => ({
		getPosition: () => testState.position,
		hasError: testState.positionError,
		isLoading: testState.positionLoading,
	}),
}));

const basePositionRef: IsolatedMarginPositionRef = {
	coin: "xyz:CXMT",
	dex: "xyz",
	assetId: 120_031,
	isLong: true,
	szDecimals: 1,
	marginConstraint: "noCross",
	marginUsed: "137.19",
	positionValue: "1559.84",
	liquidationPx: "7.27304",
};

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
	if (!(button instanceof HTMLButtonElement)) throw new Error(`${label} button not found`);
	return button;
}

function getInput(container: HTMLElement, label: string): HTMLInputElement {
	const input = container.querySelector(`input[aria-label="${label}"]`);
	if (!(input instanceof HTMLInputElement)) throw new Error(`${label} input not found`);
	return input;
}

function setInputValue(input: HTMLInputElement, value: string) {
	const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	if (!valueSetter) throw new Error("Native input value setter not found");
	valueSetter.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function getLiveTestPosition(): Position {
	if (!testState.position) throw new Error("Live test position is not configured");
	return testState.position;
}

describe("PositionIsolatedMarginModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		testState.positionLoading = false;
		testState.positionError = false;
		testState.position = {
			dex: "xyz",
			coin: "xyz:CXMT",
			szi: "205.9",
			entryPx: "7.79995",
			positionValue: "1559.84",
			unrealizedPnl: "-46.18",
			returnOnEquity: "-0.3366",
			liquidationPx: "7.27304",
			marginUsed: "137.19",
			maxLeverage: 10,
			leverage: { type: "isolated", value: 10, rawUsd: "-18.794" },
			cumFunding: { allTime: "-22.59", sinceChange: "0", sinceOpen: "-22.59" },
		};
		testState.updateMargin.mockReset().mockResolvedValue({ status: "ok", response: { type: "default" } });
		testState.topUpMargin.mockReset().mockResolvedValue({ status: "ok", response: { type: "default" } });
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function renderModal(position: IsolatedMarginPositionRef = basePositionRef) {
		const onOpenChange = vi.fn();
		act(() => {
			root.render(
				createElement(PositionIsolatedMarginModal, {
					open: true,
					onOpenChange,
					position,
				}),
			);
		});
		return onOpenChange;
	}

	it("submits an exact HIP-3 micro-USDC margin addition", async () => {
		const onOpenChange = renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "12.345678"));
		await act(async () => {
			getButton(container, "Add Margin").click();
		});

		expect(testState.updateMargin).toHaveBeenCalledWith({
			asset: 120_031,
			isBuy: true,
			ntli: 12_345_678,
		});
		expect(testState.topUpMargin).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("uses the current live position side when building the action", async () => {
		testState.position = {
			...getLiveTestPosition(),
			szi: "-205.9",
		};
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));
		await act(async () => {
			getButton(container, "Add Margin").click();
		});

		expect(testState.updateMargin).toHaveBeenCalledWith({
			asset: 120_031,
			isBuy: false,
			ntli: 1_000_000,
		});
	});

	it("uses the dedicated isolated-only target leverage action", async () => {
		renderModal();

		act(() => getButton(container, "Target Leverage").click());
		act(() => setInputValue(getInput(container, "Target leverage"), "5.0"));
		await act(async () => {
			getButton(container, "Add to Target").click();
		});

		expect(testState.topUpMargin).toHaveBeenCalledWith({
			asset: 120_031,
			leverage: "5",
		});
		expect(testState.updateMargin).not.toHaveBeenCalled();
	});

	it("keeps isolated margin removal unavailable while the risk gate is closed", async () => {
		renderModal();

		expect(getButton(container, "Remove").disabled).toBe(true);
		expect(container.textContent).toContain("Removing isolated margin is temporarily unavailable");

		expect(testState.updateMargin).not.toHaveBeenCalled();
	});

	it("disables removal for strict isolated markets", () => {
		renderModal({ ...basePositionRef, marginConstraint: "strictIsolated" });

		expect(getButton(container, "Remove").disabled).toBe(true);
		expect(container.textContent).toContain(
			"This strict isolated market does not allow margin to be removed from an open position.",
		);
	});

	it("blocks submission when the live position is no longer isolated", () => {
		testState.position = {
			...getLiveTestPosition(),
			leverage: { type: "cross", value: 10 },
		};
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));

		expect(getButton(container, "Add Margin").disabled).toBe(true);
		expect(container.textContent).toContain("This position is no longer using isolated margin.");
	});
});
