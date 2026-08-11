/** @vitest-environment jsdom */

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeverageModal } from "@/components/trade/tradebox/leverage-modal";
import { createI18nRoot } from "./harness/react";

const modalHarness = vi.hoisted(() => ({
	editorProps: null as Record<string, unknown> | null,
	popupRenders: 0,
}));

vi.mock("@gatu/ui", () => ({
	Button: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("button", { ...props, type: "button" }, children),
	Modal: ({ children, open }: { children: ReactNode; open: boolean }) => (open ? children : null),
	ModalContent: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("div", props, children),
	ModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalPopup: ({ children }: { children: ReactNode }) => {
		modalHarness.popupRenders += 1;
		return createElement("section", null, children);
	},
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({ children, containerClassName: _containerClassName, ...props }: Record<string, unknown>) =>
		createElement("button", { ...props, type: "button" }, children as ReactNode),
}));

vi.mock("@/components/trade/tradebox/leverage-editor", () => ({
	LeverageEditor: (props: Record<string, unknown>) => {
		modalHarness.editorProps = props;
		return createElement("div", { "data-testid": "leverage-editor" });
	},
}));

vi.mock("@/hooks/ui/use-auto-close-success", () => ({
	useAutoCloseSuccess: () => ({ showSuccess: false, trigger: vi.fn() }),
}));

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(label));
	if (!(button instanceof HTMLButtonElement)) throw new Error(`${label} button not found`);
	return button;
}

describe("LeverageModal", () => {
	let container: HTMLDivElement;
	let root: Root;
	let onPendingLeverageChange: ReturnType<typeof vi.fn<(value: number) => void>>;
	let onApply: ReturnType<typeof vi.fn<(value: number) => Promise<void>>>;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		onPendingLeverageChange = vi.fn<(value: number) => void>();
		onApply = vi.fn<(value: number) => Promise<void>>().mockResolvedValue(undefined);
		modalHarness.editorProps = null;
		modalHarness.popupRenders = 0;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function renderModal(pendingLeverage: number | null = null, open = true) {
		act(() => {
			root.render(
				<LeverageModal
					open={open}
					onOpenChange={vi.fn()}
					currentLeverage={3}
					pendingLeverage={pendingLeverage}
					maxLeverage={10}
					onPendingLeverageChange={onPendingLeverageChange}
					isUpdating={false}
					updateError={null}
					onApply={onApply}
				/>,
			);
		});
	}

	it("updates only the modal content while dragging and calls the API boundary only on confirm", async () => {
		renderModal();
		expect(modalHarness.popupRenders).toBe(1);

		const onDraftChange = modalHarness.editorProps?.onDraftChange as ((value: number | null) => void) | undefined;
		const onChange = modalHarness.editorProps?.onChange as ((value: number) => void) | undefined;

		act(() => {
			onDraftChange?.(4);
			onDraftChange?.(5);
			onDraftChange?.(6);
		});

		expect(container.querySelector("h2")?.textContent).toContain("6x");
		expect(modalHarness.popupRenders).toBe(1);
		expect(onPendingLeverageChange).not.toHaveBeenCalled();
		expect(onApply).not.toHaveBeenCalled();

		act(() => onChange?.(6));

		expect(modalHarness.popupRenders).toBe(1);
		expect(onPendingLeverageChange).toHaveBeenCalledTimes(1);
		expect(onPendingLeverageChange).toHaveBeenCalledWith(6);
		expect(onApply).not.toHaveBeenCalled();

		renderModal(6);
		await act(async () => getButton(container, "Confirm").click());

		expect(onApply).toHaveBeenCalledTimes(1);
		expect(onApply).toHaveBeenCalledWith(6);
	});

	it("submits at most once before the pending state can rerender", async () => {
		let resolveApply: (() => void) | undefined;
		onApply.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveApply = resolve;
				}),
		);
		renderModal(6);

		const confirm = getButton(container, "Confirm");
		act(() => {
			confirm.click();
			confirm.click();
		});

		expect(onApply).toHaveBeenCalledTimes(1);
		expect(onApply).toHaveBeenCalledWith(6);

		await act(async () => resolveApply?.());
	});
});
