/** @vitest-environment jsdom */

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	adaptiveProps: null as Record<string, unknown> | null,
	slippagePercent: 2.5,
	setMarketOrderSlippagePercent: vi.fn((value: number) => {
		testState.slippagePercent = value;
		return value;
	}),
}));

vi.mock("@sairn/ui", () => ({
	AdaptiveModal: ({ children, open, ...props }: { children: ReactNode; open: boolean } & Record<string, unknown>) => {
		testState.adaptiveProps = { open, ...props };
		return createElement("div", { role: "dialog" }, children);
	},
	Button: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("button", { type: "button", ...props }, children),
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
	ModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}));

vi.mock("@/components/ui/number-input", () => ({
	NumberInput: (props: Record<string, unknown>) =>
		createElement("input", {
			value: String(props.value ?? ""),
			"aria-label": props["aria-label"],
			"aria-describedby": props["aria-describedby"],
			"aria-invalid": props["aria-invalid"],
			onChange: props.onChange,
		}),
}));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	useGlobalSettingsActions: () => ({ setMarketOrderSlippagePercent: testState.setMarketOrderSlippagePercent }),
	useMarketOrderSlippagePercent: () => testState.slippagePercent,
}));

import { MaxSlippageModal } from "@/components/trade/tradebox/max-slippage-modal";

describe("MaxSlippageModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.adaptiveProps = null;
		testState.slippagePercent = 2.5;
		testState.setMarketOrderSlippagePercent.mockClear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function render(open: boolean, onOpenChange = vi.fn(), presentation: "modal" | "drawer" = "drawer") {
		act(() => root.render(<MaxSlippageModal open={open} onOpenChange={onOpenChange} presentation={presentation} />));
		return onOpenChange;
	}

	function input(): HTMLInputElement {
		const element = container.querySelector<HTMLInputElement>('input[aria-label="Max slippage"]');
		if (!element) throw new Error("Expected the max slippage input");
		return element;
	}

	function confirmButton(): HTMLButtonElement {
		const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(element) => element.textContent === "Confirm",
		);
		if (!button) throw new Error("Expected the Confirm button");
		return button;
	}

	it("opens on its own panel with the current max slippage and what it applies to", () => {
		render(true);

		expect(testState.adaptiveProps?.presentation).toBe("drawer");
		expect(container.querySelector("h2")?.textContent).toBe("Adjust Max Slippage");
		expect(container.textContent).toContain("closing or reversing a position at market");
		expect(container.textContent).toContain("Market TP/SL orders use a max slippage of 10%.");
		expect(container.textContent).toContain("0.1% – 5%");
		expect(input().value).toBe("2.5");
	});

	it("saves a value inside the allowed range and closes", () => {
		const onOpenChange = render(true, vi.fn(), "modal");

		changeInput(input(), "1.25");
		act(() => confirmButton().click());

		expect(testState.setMarketOrderSlippagePercent).toHaveBeenCalledWith(1.25);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("keeps Confirm disabled outside the allowed range or for an empty field", () => {
		render(true);

		for (const value of ["0.05", "5.01", ""]) {
			changeInput(input(), value);
			expect(confirmButton().disabled).toBe(true);
			expect(input().getAttribute("aria-invalid")).toBe("true");
		}
		changeInput(input(), "5");
		expect(confirmButton().disabled).toBe(false);
	});

	it("never saves while it is closing", () => {
		render(false);

		expect(confirmButton().disabled).toBe(true);
		act(() => confirmButton().click());
		expect(testState.setMarketOrderSlippagePercent).not.toHaveBeenCalled();
	});

	it("drops an unsaved edit when it is dismissed", () => {
		const onOpenChange = render(true);

		changeInput(input(), "4");
		act(() => (testState.adaptiveProps?.onOpenChange as (open: boolean) => void)(false));
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(testState.setMarketOrderSlippagePercent).not.toHaveBeenCalled();
		render(true, onOpenChange);
		expect(input().value).toBe("2.5");
	});
});

function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	act(() => {
		setter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}
