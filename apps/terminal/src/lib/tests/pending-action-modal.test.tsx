// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PendingActionModal } from "@/components/trade/components/pending-action-modal";

const modalHarness = vi.hoisted(() => ({
	dismissible: true,
	onOpenChange: undefined as ((open: boolean) => void) | undefined,
	presentation: "modal" as "modal" | "drawer",
	showClose: true,
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({
		children,
		dismissible,
		onOpenChange,
		open,
		presentation,
		showClose,
	}: {
		children: ReactNode;
		dismissible: boolean;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		presentation: "modal" | "drawer";
		showClose: boolean;
	}) => {
		modalHarness.dismissible = dismissible;
		modalHarness.onOpenChange = onOpenChange;
		modalHarness.presentation = presentation;
		modalHarness.showClose = showClose;
		return open ? createElement("section", null, children) : null;
	},
}));

describe("PendingActionModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("blocks every dismissal path while the signed action is pending", () => {
		const onOpenChange = vi.fn();
		act(() => {
			root.render(
				<PendingActionModal isPending onOpenChange={onOpenChange} open>
					<span>Pending</span>
				</PendingActionModal>,
			);
		});

		expect(modalHarness.dismissible).toBe(false);
		expect(modalHarness.showClose).toBe(false);
		expect(modalHarness.presentation).toBe("modal");
	});

	it("forwards dismissal after the action settles", () => {
		const onOpenChange = vi.fn();
		act(() => {
			root.render(
				<PendingActionModal isPending={false} onOpenChange={onOpenChange} open>
					<span>Ready</span>
				</PendingActionModal>,
			);
		});

		expect(modalHarness.dismissible).toBe(true);
		expect(modalHarness.showClose).toBe(true);
		act(() => modalHarness.onOpenChange?.(false));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("uses the requested drawer presentation without changing action semantics", () => {
		const onOpenChange = vi.fn();
		act(() => {
			root.render(
				<PendingActionModal isPending={false} onOpenChange={onOpenChange} open presentation="drawer">
					<span>Ready</span>
				</PendingActionModal>,
			);
		});

		expect(modalHarness.presentation).toBe("drawer");
		expect(modalHarness.dismissible).toBe(true);
		expect(container.textContent).toBe("Ready");
	});
});
