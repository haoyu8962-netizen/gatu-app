// @vitest-environment jsdom

import { AdaptiveModal } from "@gatu/ui";
import { act, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface DrawerChangeEventDetails {
	cancel: () => void;
	reason: "swipe";
}

interface DrawerRootProps {
	children?: ReactNode;
	disablePointerDismissal?: boolean;
	onOpenChange?: (open: boolean, eventDetails: DrawerChangeEventDetails) => void;
}

const drawerHarness = vi.hoisted(() => ({
	disablePointerDismissal: undefined as boolean | undefined,
	requestOpenChange: undefined as DrawerRootProps["onOpenChange"],
}));

vi.mock("@base-ui/react/drawer", async () => {
	const React = await import("react");

	function Root({ children, disablePointerDismissal, onOpenChange }: DrawerRootProps) {
		drawerHarness.disablePointerDismissal = disablePointerDismissal;
		drawerHarness.requestOpenChange = onOpenChange;
		return React.createElement(React.Fragment, null, children);
	}

	function Portal({ children }: { children?: ReactNode }) {
		return React.createElement(React.Fragment, null, children);
	}

	const Popup = React.forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>((props, ref) =>
		React.createElement("div", { ...props, ref, role: "dialog" }),
	);
	const Backdrop = React.forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>((props, ref) =>
		React.createElement("div", { ...props, ref }),
	);
	const Button = React.forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>((props, ref) =>
		React.createElement("button", { ...props, ref }),
	);
	const Title = React.forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>((props, ref) =>
		React.createElement("h2", { ...props, ref }),
	);
	const Description = React.forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>((props, ref) =>
		React.createElement("p", { ...props, ref }),
	);

	return {
		Drawer: {
			Backdrop,
			Close: Button,
			Description,
			Popup,
			Portal,
			Root,
			Title,
			Trigger: Button,
		},
	};
});

describe("AdaptiveModal drawer dismissal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockReturnValue({
				addEventListener: vi.fn(),
				matches: true,
				removeEventListener: vi.fn(),
			}),
		});
		drawerHarness.disablePointerDismissal = undefined;
		drawerHarness.requestOpenChange = undefined;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("cancels swipe dismissal for blocking drawers", () => {
		const onOpenChange = vi.fn();
		act(() => {
			root.render(
				<AdaptiveModal dismissible={false} onOpenChange={onOpenChange} open presentation="drawer" showClose={false}>
					<div>Blocking drawer</div>
				</AdaptiveModal>,
			);
		});

		const cancel = vi.fn();
		act(() => {
			drawerHarness.requestOpenChange?.(false, { cancel, reason: "swipe" });
		});

		expect(drawerHarness.disablePointerDismissal).toBe(true);
		expect(cancel).toHaveBeenCalledOnce();
		expect(onOpenChange).not.toHaveBeenCalled();
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
	});

	it("can hide the visual drawer handle without disabling dismissal", () => {
		act(() => {
			root.render(
				<AdaptiveModal onOpenChange={vi.fn()} open presentation="drawer" showClose={false} showHandle={false}>
					<div>Handle-free drawer</div>
				</AdaptiveModal>,
			);
		});

		expect(drawerHarness.disablePointerDismissal).toBe(false);
		expect(document.querySelector('[data-slot="drawer-handle"]')).toBeNull();
	});
});
