/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoCloseSuccess } from "@/hooks/ui/use-auto-close-success";

interface HarnessProps {
	onClose: () => void;
}

function Harness({ onClose }: HarnessProps) {
	const { showSuccess, trigger, reset } = useAutoCloseSuccess(onClose, 100);

	return (
		<div>
			<span data-testid="status">{showSuccess ? "success" : "idle"}</span>
			<button type="button" onClick={trigger}>
				Trigger
			</button>
			<button type="button" onClick={reset}>
				Reset
			</button>
		</div>
	);
}

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
	if (!(button instanceof HTMLButtonElement)) throw new Error(`${label} button not found`);
	return button;
}

describe("useAutoCloseSuccess", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	it("cancels a pending close when the success session resets", () => {
		const onClose = vi.fn();
		act(() => root.render(<Harness onClose={onClose} />));

		act(() => getButton(container, "Trigger").click());
		expect(container.querySelector('[data-testid="status"]')?.textContent).toBe("success");

		act(() => getButton(container, "Reset").click());
		act(() => vi.advanceTimersByTime(100));

		expect(onClose).not.toHaveBeenCalled();
		expect(container.querySelector('[data-testid="status"]')?.textContent).toBe("idle");
	});

	it("clears the timer when its owner unmounts", () => {
		const onClose = vi.fn();
		act(() => root.render(<Harness onClose={onClose} />));

		act(() => getButton(container, "Trigger").click());
		act(() => root.render(null));
		act(() => vi.advanceTimersByTime(100));

		expect(onClose).not.toHaveBeenCalled();
	});

	it("closes once after the success delay", () => {
		const onClose = vi.fn();
		act(() => root.render(<Harness onClose={onClose} />));

		act(() => getButton(container, "Trigger").click());
		act(() => vi.advanceTimersByTime(100));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(container.querySelector('[data-testid="status"]')?.textContent).toBe("idle");
	});
});
