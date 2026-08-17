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

import { CancelAllOrdersModal } from "@/components/trade/positions/cancel-all-orders-modal";

describe("CancelAllOrdersModal", () => {
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

	it("renders a dismissible desktop modal and requires an explicit confirmation", () => {
		const onOpenChange = vi.fn();
		const onConfirm = vi.fn();
		act(() =>
			root.render(
				<CancelAllOrdersModal
					open
					orderCount={3}
					isSubmitting={false}
					onOpenChange={onOpenChange}
					onConfirm={onConfirm}
				/>,
			),
		);

		expect(testState.adaptiveProps?.presentation).toBe("modal");
		expect(testState.adaptiveProps?.dismissible).toBe(true);
		expect(container.textContent).toContain("all 3 open orders");
		expect(container.textContent).toContain("protective stop orders");
		const back = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent === "Back",
		);
		const confirm = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent === "Cancel All",
		);
		act(() => back?.click());
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onConfirm).not.toHaveBeenCalled();
		act(() => confirm?.click());
		expect(onConfirm).toHaveBeenCalledOnce();
	});

	it("uses a locked mobile drawer while cancellation is pending", () => {
		testState.isMobile = true;
		act(() =>
			root.render(
				<CancelAllOrdersModal
					open
					orderCount={3}
					isSubmitting
					errorMessage="Network failed"
					onOpenChange={vi.fn()}
					onConfirm={vi.fn()}
				/>,
			),
		);

		expect(testState.adaptiveProps?.presentation).toBe("drawer");
		expect(testState.adaptiveProps?.dismissible).toBe(false);
		expect(container.querySelector('[role="alert"]')?.textContent).toBe("Network failed");
		const buttons = container.querySelectorAll<HTMLButtonElement>("button");
		expect([...buttons].every((button) => button.disabled)).toBe(true);
		const canceling = [...buttons].find((button) => button.textContent === "Canceling...");
		expect(canceling?.getAttribute("aria-busy")).toBe("true");
		expect(canceling?.className).toContain("disabled:bg-market-close-danger-disabled");
		expect(canceling?.className).toContain("disabled:text-market-close-muted");
	});
});
