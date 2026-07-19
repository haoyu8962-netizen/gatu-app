// @vitest-environment jsdom

import { AdaptiveModal, ModalTitle } from "@gatu/ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function dispatchEscape() {
	act(() => {
		document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
	});
}

describe("AdaptiveModal dismissal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockReturnValue({
				addEventListener: vi.fn(),
				matches: false,
				removeEventListener: vi.fn(),
			}),
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("preserves Escape dismissal for existing modal callers", () => {
		const onOpenChange = vi.fn();
		act(() => {
			root.render(
				<AdaptiveModal
					onOpenChange={onOpenChange}
					overlayClassName="test-modal-overlay"
					open
					presentation="modal"
					showClose={false}
				>
					<ModalTitle>Dismissible modal</ModalTitle>
				</AdaptiveModal>,
			);
		});

		expect(document.querySelector(".test-modal-overlay")).not.toBeNull();
		dispatchEscape();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("cancels Escape dismissal for blocking modal callers", () => {
		const onOpenChange = vi.fn();
		act(() => {
			root.render(
				<AdaptiveModal dismissible={false} onOpenChange={onOpenChange} open presentation="modal" showClose={false}>
					<ModalTitle>Blocking modal</ModalTitle>
				</AdaptiveModal>,
			);
		});

		dispatchEscape();
		expect(onOpenChange).not.toHaveBeenCalled();
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
	});

	it("keeps drawer presentations fixed to the viewport", () => {
		act(() => {
			root.render(
				<AdaptiveModal
					onOpenChange={vi.fn()}
					overlayClassName="test-drawer-overlay"
					open
					presentation="drawer"
					showClose={false}
				>
					<ModalTitle>Mobile drawer</ModalTitle>
				</AdaptiveModal>,
			);
		});

		expect(document.querySelector(".test-drawer-overlay")).not.toBeNull();
		const dialog = document.querySelector('[role="dialog"]');
		expect(dialog).not.toBeNull();
		expect(dialog?.classList.contains("fixed")).toBe(true);
		expect(dialog?.classList.contains("relative")).toBe(false);
		expect(dialog?.classList.contains("outline-none")).toBe(true);
	});
});
