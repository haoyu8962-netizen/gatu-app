// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { MOBILE_BOTTOM_NAV_HEIGHT_PX } from "@/config/layout";

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => viewport.mobile }));

describe("Toaster configuration", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		viewport.mobile = false;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(<Toaster />));
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

	it("offsets mobile toasts above the bottom navigation", async () => {
		await act(async () => {
			toast.success("Order placed");
			await vi.advanceTimersByTimeAsync(0);
		});

		const toaster = document.querySelector<HTMLOListElement>("[data-sonner-toaster]");
		expect(toaster).not.toBeNull();
		expect(toaster?.style.getPropertyValue("--mobile-offset-bottom")).toContain(
			`${MOBILE_BOTTOM_NAV_HEIGHT_PX}px + 12px`,
		);
		expect(toaster?.style.getPropertyValue("--mobile-offset-bottom")).toContain("safe-area-inset-bottom");
		expect(toaster?.style.getPropertyValue("--mobile-offset-left")).toBe("max(16px, var(--sal), var(--sar))");
		expect(toaster?.style.getPropertyValue("--mobile-offset-right")).toBe("max(16px, var(--sal), var(--sar))");
	});

	it("uses the application mobile boundary for desktop Sonner offsets as well", async () => {
		viewport.mobile = true;
		act(() => root.render(<Toaster />));
		await act(async () => {
			toast.info("Tablet notice");
			await vi.advanceTimersByTimeAsync(0);
		});
		const toaster = container.querySelector<HTMLOListElement>("[data-sonner-toaster]");
		expect(toaster?.style.getPropertyValue("--offset-bottom")).toContain("56px + 12px");
		expect(toaster?.style.zIndex).toBe("var(--z-toast)");
	});
	it("replays notifications received before the lazy container mounted", async () => {
		act(() => root.unmount());
		toast.info("Recovered notification", { id: "pre-host", duration: Infinity });
		root = createRoot(container);
		act(() => root.render(<Toaster />));
		await act(() => vi.advanceTimersByTimeAsync(0));
		expect(container.textContent).toContain("Recovered notification");
		expect(container.querySelectorAll("[data-sonner-toaster]")).toHaveLength(1);
	});

	it("renders semantic variants with rich token colors", async () => {
		await act(async () => {
			toast.error("Order rejected");
			await vi.advanceTimersByTimeAsync(0);
		});

		const toastEl = document.querySelector("[data-sonner-toast]");
		expect(toastEl?.getAttribute("data-rich-colors")).toBe("true");

		const toaster = document.querySelector<HTMLOListElement>("[data-sonner-toaster]");
		expect(toaster?.style.getPropertyValue("--success-text")).toBe("var(--text-success)");
		expect(toaster?.style.getPropertyValue("--error-text")).toBe("var(--text-error)");
		expect(toaster?.style.getPropertyValue("--warning-text")).toBe("var(--text-warning)");
		expect(toaster?.style.getPropertyValue("--info-text")).toBe("var(--text-info)");
	});
});
