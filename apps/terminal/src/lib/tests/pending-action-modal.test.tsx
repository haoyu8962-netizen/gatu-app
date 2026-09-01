// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PendingActionModal } from "@/components/trade/components/pending-action-modal";
import { createI18nRoot } from "./harness/react";

const modalHarness = vi.hoisted(() => ({
	closeLabel: "",
	dismissible: true,
	onOpenChange: undefined as ((open: boolean) => void) | undefined,
	presentation: "modal" as "modal" | "drawer",
	showClose: true,
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({
		children,
		closeLabel,
		dismissible,
		onOpenChange,
		open,
		presentation,
		showClose,
	}: {
		children: ReactNode;
		closeLabel: string;
		dismissible: boolean;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		presentation: "modal" | "drawer";
		showClose: boolean;
	}) => {
		modalHarness.closeLabel = closeLabel;
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
		root = createI18nRoot(container);
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
		expect(modalHarness.closeLabel).toBe("Close");
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
