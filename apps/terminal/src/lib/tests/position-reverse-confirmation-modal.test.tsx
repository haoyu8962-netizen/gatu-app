/** @vitest-environment jsdom */

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	adaptiveProps: null as Record<string, unknown> | null,
	isMobile: false,
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({ children, open, ...props }: { children: ReactNode; open: boolean } & Record<string, unknown>) => {
		testState.adaptiveProps = props;
		return open ? createElement("div", { role: "dialog" }, children) : null;
	},
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

import { PositionReverseConfirmationModal } from "@/components/trade/positions/position-reverse-confirmation-modal";

describe("PositionReverseConfirmationModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.adaptiveProps = null;
		testState.isMobile = false;
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
					isSubmitting={false}
					onOpenChange={onOpenChange}
					onConfirm={onConfirm}
				/>,
			),
		);

		expect(testState.adaptiveProps?.presentation).toBe("modal");
		expect(testState.adaptiveProps?.dismissible).toBe(true);
		expect(testState.adaptiveProps?.showClose).toBe(true);
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

		const back = getButton(container, "Back");
		const confirm = getButton(container, "Sell / Short");
		act(() => back.click());
		expect(onOpenChange).toHaveBeenCalledWith(false);
		act(() => confirm.click());
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
					isSubmitting={false}
					onOpenChange={vi.fn()}
					onConfirm={vi.fn()}
				/>,
			),
		);

		expect(getButton(container, "Buy / Long")).toBeTruthy();
	});

	it("locks the mobile bottom sheet and actions while submitting", () => {
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
					isSubmitting
					errorMessage="Network failed"
					onOpenChange={onOpenChange}
					onConfirm={onConfirm}
				/>,
			),
		);

		expect(testState.adaptiveProps?.presentation).toBe("drawer");
		expect(testState.adaptiveProps?.dismissible).toBe(false);
		expect(testState.adaptiveProps?.showClose).toBe(false);
		expect(testState.adaptiveProps?.showHandle).toBe(true);
		expect(container.querySelector('[role="alert"]')?.textContent).toBe("Network failed");
		const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];
		expect(buttons.every((button) => button.disabled)).toBe(true);
		expect(getButton(container, "Reversing...").getAttribute("aria-busy")).toBe("true");

		act(() => {
			(testState.adaptiveProps?.onOpenChange as (open: boolean) => void)(false);
			getButton(container, "Reversing...").click();
		});
		expect(onOpenChange).not.toHaveBeenCalled();
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("allows dismissal but keeps confirmation disabled while reconciling", () => {
		const onOpenChange = vi.fn();
		const onConfirm = vi.fn();

		act(() =>
			root.render(
				<PositionReverseConfirmationModal
					open
					marketLabel="BTC"
					currentDirection="long"
					reverseSizeLabel="0.020 BTC"
					isSubmitting={false}
					isConfirmDisabled
					errorMessage="Order submitted. Confirming exchange status; do not retry."
					onOpenChange={onOpenChange}
					onConfirm={onConfirm}
				/>,
			),
		);

		expect(testState.adaptiveProps?.dismissible).toBe(true);
		expect(getButton(container, "Back").disabled).toBe(false);
		const confirm = getButton(container, "Sell / Short");
		expect(confirm.disabled).toBe(true);
		act(() => {
			getButton(container, "Back").click();
			confirm.click();
		});
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onConfirm).not.toHaveBeenCalled();
	});
});

function getButton(container: HTMLElement, text: string): HTMLButtonElement {
	const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
		(candidate) => candidate.textContent === text,
	);
	if (!button) throw new Error(`Button not found: ${text}`);
	return button;
}
