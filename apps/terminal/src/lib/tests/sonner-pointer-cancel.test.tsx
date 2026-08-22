// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster, toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_TOAST_DURATION_MS = 100;
const TOAST_EXIT_DURATION_MS = 300;

describe("Sonner pointer cancellation", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(<Toaster duration={TEST_TOAST_DURATION_MS} />));
	});

	afterEach(() => {
		toast.dismiss();
		act(() => {
			vi.runAllTimers();
			root.unmount();
		});
		container.remove();
		vi.useRealTimers();
	});

	it("resumes auto-dismiss when a touch gesture is cancelled", async () => {
		await act(async () => {
			toast.success("Close order submitted");
			await vi.advanceTimersByTimeAsync(0);
		});

		const toaster = document.querySelector<HTMLOListElement>("[data-sonner-toaster]");
		expect(toaster).not.toBeNull();
		expect(document.querySelector("[data-sonner-toast]")).not.toBeNull();

		act(() => {
			toaster?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
			toaster?.dispatchEvent(new Event("pointercancel", { bubbles: true }));
		});

		await act(() => vi.advanceTimersByTimeAsync(TEST_TOAST_DURATION_MS + TOAST_EXIT_DURATION_MS));

		expect(document.querySelector("[data-sonner-toast]")).toBeNull();
	});
});
