// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { act } from "react";
import type { Root } from "react-dom/client";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { MOBILE_BOTTOM_NAV_HEIGHT_PX } from "@/config/layout";
import { createI18nRoot } from "./harness/react";

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => viewport.mobile }));

function messageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

describe("Toaster configuration", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		viewport.mobile = false;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
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
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	it("names the notification region and close buttons in the active language", async () => {
		await act(async () => {
			toast.warning("Withdrawal status unknown", { duration: Infinity, closeButton: true });
			await vi.advanceTimersByTimeAsync(0);
		});
		const region = container.querySelector("section[aria-live]");
		const closeButton = container.querySelector("[data-close-button]");
		expect(region?.getAttribute("aria-label")).toMatch(/^Notifications /);
		expect(closeButton?.getAttribute("aria-label")).toBe("Dismiss");

		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: { [messageId("Notifications")]: "通知", [messageId("Dismiss")]: "关闭" },
			}),
		);

		expect(container.querySelector("section[aria-live]")?.getAttribute("aria-label")).toMatch(/^通知 /);
		expect(container.querySelector("[data-close-button]")).toBe(closeButton);
		expect(closeButton?.getAttribute("aria-label")).toBe("关闭");
	});

	it("marks each notification type with its Sairn status glyph", async () => {
		await act(async () => {
			toast.success("Copied", { id: "success" });
			toast.info("Heads up", { id: "info" });
			toast.warning("Check this", { id: "warning" });
			toast.error("Failed", { id: "error" });
			toast.loading("Working", { id: "loading" });
			await vi.advanceTimersByTimeAsync(0);
		});
		const glyphs = [...container.querySelectorAll("[data-sonner-toast]")].map((item) => ({
			type: item.getAttribute("data-type"),
			glyph: item.querySelector("[data-icon] svg")?.getAttribute("data-status-glyph"),
		}));
		expect(glyphs).toEqual(
			expect.arrayContaining([
				{ type: "success", glyph: "success" },
				{ type: "info", glyph: "info" },
				{ type: "warning", glyph: "warning" },
				{ type: "error", glyph: "error" },
				{ type: "loading", glyph: "pending" },
			]),
		);
		expect(container.querySelector("[data-sonner-toast] .animate-spin")).toBeNull();
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
	it("gives a toast a full period when its duration comes back from Infinity while the stack is held open", async () => {
		const showTimed = (duration: number) =>
			toast.custom(() => <span>Timed notification</span>, { id: "timed", duration });
		await act(async () => {
			toast.custom(() => <span>Other notification</span>, { id: "other", duration: Infinity });
			await vi.advanceTimersByTimeAsync(0);
		});
		await act(async () => {
			showTimed(10_000);
			await vi.advanceTimersByTimeAsync(0);
		});
		await act(() => vi.advanceTimersByTimeAsync(1_000));
		await act(async () => {
			showTimed(Infinity);
			await vi.advanceTimersByTimeAsync(0);
		});
		await act(() => vi.advanceTimersByTimeAsync(30_000));
		const stack = container.querySelector("[data-sonner-toaster]");
		if (!stack) throw new Error("Expected Sonner's toast list");

		await act(async () => {
			stack.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
		});
		await act(async () => {
			showTimed(10_000);
			await vi.advanceTimersByTimeAsync(0);
		});
		await act(async () => {
			stack.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
		});
		await act(() => vi.advanceTimersByTimeAsync(9_800));
		expect(container.textContent).toContain("Timed notification");
		await act(() => vi.advanceTimersByTimeAsync(1_000));
		expect(container.textContent).not.toContain("Timed notification");
		toast.dismiss("other");
	});

	it("replays notifications received before the lazy container mounted", async () => {
		act(() => root.unmount());
		toast.info("Recovered notification", { id: "pre-host", duration: Infinity });
		root = createI18nRoot(container);
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
