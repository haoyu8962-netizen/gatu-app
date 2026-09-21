/** @vitest-environment jsdom */

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	adaptiveProps: null as Record<string, unknown> | null,
	enableTrading: vi.fn(),
	guardAction: vi.fn((action: () => void) => action()),
	isReady: true,
	isMobile: false,
	needsTrading: false,
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({ children, open, ...props }: { children: ReactNode; open: boolean } & Record<string, unknown>) => {
		testState.adaptiveProps = props;
		return open ? createElement("div", { role: "dialog" }, children) : null;
	},
	Button: ({
		children,
		focusableWhenDisabled: _focusableWhenDisabled,
		intent: _intent,
		size: _size,
		variant: _variant,
		...props
	}: { children: ReactNode } & Record<string, unknown>) =>
		createElement("button", { type: "button", ...props }, children),
	ModalContent: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("div", props, children),
	ModalDescription: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("p", props, children),
	ModalFooter: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("footer", props, children),
	ModalHeader: ({ children, divider: _divider, ...props }: { children: ReactNode; divider?: boolean }) =>
		createElement("header", props, children),
	ModalTitle: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("h2", props, children),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useTradingGuard: () => ({
		isReady: testState.isReady,
		isEnabling: false,
		needsTrading: testState.needsTrading,
		enableTrading: testState.enableTrading,
		guardAction: testState.guardAction,
		error: null,
	}),
}));

import { PositionReverseConfirmationModal } from "@/components/trade/positions/position-reverse-confirmation-modal";

describe("PositionReverseConfirmationModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.adaptiveProps = null;
		testState.enableTrading.mockReset();
		testState.guardAction.mockClear();
		testState.isReady = true;
		testState.isMobile = false;
		testState.needsTrading = false;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("renders a desktop long-to-short confirmation without inventing a liquidation estimate", () => {
		const onOpenChange = vi.fn();
		const onConfirm = vi.fn();

		act(() =>
			root.render(
				<PositionReverseConfirmationModal
					open
					marketLabel="AAPL"
					currentDirection="long"
					reverseSizeLabel="10.000 AAPL"
					onOpenChange={onOpenChange}
					onConfirm={onConfirm}
				/>,
			),
		);

		expect(testState.adaptiveProps?.presentation).toBe("modal");
		expect(testState.adaptiveProps?.dismissible).not.toBe(false);
		expect(testState.adaptiveProps?.showClose).not.toBe(false);
		expect(container.textContent).toContain("AAPL");
		expect(container.textContent).toContain("Long");
		expect(container.textContent).toContain("Short");
		expect(container.textContent).toContain("10.000 AAPL");
		expect(container.textContent).toContain("Unavailable");
		expect(container.textContent).toContain("reliable pre-trade liquidation price is not available");

		const unavailableValue = [...container.querySelectorAll<HTMLElement>("dl > div")]
			.find((row) => row.textContent?.includes("Estimated Liquidation Price"))
			?.querySelector("dd");
		const descriptionId = unavailableValue?.getAttribute("aria-describedby") ?? "";
		expect(descriptionId).toBeTruthy();
		expect(document.getElementById(descriptionId)?.getAttribute("role")).toBe("note");

		const confirm = getButton(container, "Sell / Short");
		expect(container.querySelectorAll("footer button")).toHaveLength(1);
		expect(confirm.className).toContain("!transition-none");
		expect(confirm.className).not.toContain("transition-colors");
		act(() => (testState.adaptiveProps?.onOpenChange as (open: boolean) => void)(false));
		expect(onOpenChange).toHaveBeenCalledWith(false);
		act(() => confirm.click());
		expect(testState.guardAction).toHaveBeenCalledOnce();
		expect(onConfirm).toHaveBeenCalledOnce();
	});

	it("renders the direction-aware buy action when reversing a short position", () => {
		act(() =>
			root.render(
				<PositionReverseConfirmationModal
					open
					marketLabel="TSLA"
					currentDirection="short"
					reverseSizeLabel="4.000 TSLA"
					onOpenChange={vi.fn()}
					onConfirm={vi.fn()}
				/>,
			),
		);

		expect(getButton(container, "Buy / Long")).toBeTruthy();
	});

	it("does not reverse on the same click that starts trading authorization", () => {
		testState.isReady = false;
		testState.needsTrading = true;
		const onConfirm = vi.fn();
		const render = () =>
			root.render(
				<PositionReverseConfirmationModal
					open
					marketLabel="BTC"
					currentDirection="long"
					reverseSizeLabel="0.020 BTC"
					onOpenChange={vi.fn()}
					onConfirm={onConfirm}
				/>,
			);

		act(render);
		act(() => getButton(container, "Enable").click());
		expect(testState.enableTrading).toHaveBeenCalledOnce();
		expect(testState.guardAction).not.toHaveBeenCalled();
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("keeps the mobile bottom sheet dismissible and never shows a submitting state", () => {
		testState.isMobile = true;
		const onOpenChange = vi.fn();
		const onConfirm = vi.fn();

		act(() =>
			root.render(
				<PositionReverseConfirmationModal
					open
					marketLabel="BTC"
					currentDirection="long"
					reverseSizeLabel="0.020 BTC"
					onOpenChange={onOpenChange}
					onConfirm={onConfirm}
				/>,
			),
		);

		expect(testState.adaptiveProps?.presentation).toBe("drawer");
		expect(testState.adaptiveProps?.dismissible).not.toBe(false);
		expect(testState.adaptiveProps?.showClose).not.toBe(false);
		expect(testState.adaptiveProps?.showHandle).toBe(true);
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.textContent).not.toContain("Reversing");
		expect(getButton(container, "Sell / Short").getAttribute("aria-busy")).toBeNull();

		act(() => (testState.adaptiveProps?.onOpenChange as (open: boolean) => void)(false));
		expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
	});

	it("does not confirm while the confirm control is disabled", () => {
		const onConfirm = vi.fn();

		act(() =>
			root.render(
				<PositionReverseConfirmationModal
					open
					marketLabel="BTC"
					currentDirection="long"
					reverseSizeLabel="0.020 BTC"
					isConfirmDisabled
					onOpenChange={vi.fn()}
					onConfirm={onConfirm}
				/>,
			),
		);

		const confirm = getButton(container, "Sell / Short");
		expect(confirm.disabled).toBe(true);
		act(() => confirm.click());
		expect(onConfirm).not.toHaveBeenCalled();
	});
});

function getButton(container: HTMLElement, text: string): HTMLButtonElement {
	const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
		(candidate) => candidate.textContent === text,
	);
	if (!button) {
		const available = [...container.querySelectorAll<HTMLButtonElement>("button")].map(
			(candidate) => candidate.textContent,
		);
		throw new Error(`Button not found: ${text}. Available: ${available.join(", ")}`);
	}
	return button;
}
