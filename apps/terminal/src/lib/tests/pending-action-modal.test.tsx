// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PendingActionModal } from "@/components/trade/components/pending-action-modal";

const modalHarness = vi.hoisted(() => ({
	disablePointerDismissal: false,
	onOpenChange: undefined as ((open: boolean, eventDetails: { cancel: () => void }) => void) | undefined,
	showClose: true,
}));

vi.mock("@gatu/ui", () => ({
	Modal: ({
		children,
		disablePointerDismissal,
		onOpenChange,
		open,
	}: {
		children: ReactNode;
		disablePointerDismissal: boolean;
		onOpenChange: (open: boolean, eventDetails: { cancel: () => void }) => void;
		open: boolean;
	}) => {
		modalHarness.disablePointerDismissal = disablePointerDismissal;
		modalHarness.onOpenChange = onOpenChange;
		return open ? createElement("div", null, children) : null;
	},
	ModalPopup: ({ children, showClose }: { children: ReactNode; showClose: boolean }) => {
		modalHarness.showClose = showClose;
		return createElement("section", null, children);
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

		expect(modalHarness.disablePointerDismissal).toBe(true);
		expect(modalHarness.showClose).toBe(false);
		const cancel = vi.fn();
		act(() => modalHarness.onOpenChange?.(false, { cancel }));
		expect(cancel).toHaveBeenCalledOnce();
		expect(onOpenChange).not.toHaveBeenCalled();
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

		expect(modalHarness.disablePointerDismissal).toBe(false);
		expect(modalHarness.showClose).toBe(true);
		const cancel = vi.fn();
		act(() => modalHarness.onOpenChange?.(false, { cancel }));
		expect(cancel).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
