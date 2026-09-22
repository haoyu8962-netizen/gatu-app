// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createContext, isValidElement, StrictMode, useContext } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderNotificationGate } from "@/components/trade/order-notification-gate";
import { Toaster } from "@/components/ui/sonner";
import {
	addOrderQueueItem,
	dismissOrderQueueItem,
	getOrderQueueItem,
	getOrderQueueItems,
	type OrderQueueItem,
	removeOrderQueueItem,
	updateOrderQueueItem,
} from "@/stores/use-order-queue-store";

const identity = vi.hoisted(() => ({
	clientKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	env: "Mainnet" as const,
}));
const IdentityContext = createContext<{ clientKey: string; env: "Mainnet" | "Testnet" }>(identity);
vi.mock("@/lib/hyperliquid", () => ({ useHyperliquid: () => useContext(IdentityContext) }));

function Harness({ showGate = true, owner = identity.clientKey }: { showGate?: boolean; owner?: string }) {
	return (
		<StrictMode>
			<I18nProvider i18n={i18n}>
				<IdentityContext.Provider value={{ ...identity, clientKey: owner }}>
					<Toaster />
					{showGate && <OrderNotificationGate />}
				</IdentityContext.Provider>
			</I18nProvider>
		</StrictMode>
	);
}

describe("order notification lifecycle with real Sonner", () => {
	let container: HTMLDivElement;
	let root: Root;
	let frameId: number;
	let frames: Map<number, FrameRequestCallback>;

	beforeEach(async () => {
		vi.useFakeTimers();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		frameId = 0;
		frames = new Map();
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			const id = ++frameId;
			frames.set(id, callback);
			return id;
		});
		vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		await act(async () => root.render(<Harness />));
	});

	afterEach(async () => {
		await act(async () => {
			for (const item of getOrderQueueItems()) removeOrderQueueItem(item.id);
			toast.dismiss();
		});
		await settle();
		act(() => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	async function runFrames() {
		await act(async () => {
			const pending = [...frames.values()];
			frames.clear();
			for (const callback of pending) callback(performance.now());
		});
	}

	async function timers(milliseconds = 1) {
		await act(() => vi.advanceTimersByTimeAsync(milliseconds));
	}

	async function settle() {
		await timers();
		await runFrames();
		await runFrames();
		await timers(500);
		await runFrames();
		await runFrames();
		await timers(500);
	}

	async function addTask() {
		let id = "";
		await act(async () => {
			id = addOrderQueueItem({
				owner: identity.clientKey,
				env: identity.env,
				market: "HYPE",
				side: "buy",
				size: "1",
				status: "pending",
			});
		});
		await act(() => vi.dynamicImportSettled());
		return id;
	}

	async function warmGate() {
		const id = await addTask();
		await settle();
		await act(async () => removeOrderQueueItem(id));
		await settle();
		expect(container.querySelectorAll("[data-sonner-toast]")).toHaveLength(0);
	}

	it("renders one pending card and updates it in place after the gate mounts again", async () => {
		await warmGate();
		const id = await addTask();
		await timers();
		expect(container.querySelectorAll(`[data-order-feedback="${id}"]`)).toHaveLength(1);
		const card = container.querySelector(`[data-order-feedback="${id}"]`);
		await act(async () => updateOrderQueueItem(id, { status: "success", outcome: "filled" }));
		await timers();
		expect(container.querySelectorAll(`[data-order-feedback="${id}"]`)).toHaveLength(1);
		expect(container.querySelector(`[data-order-feedback="${id}"]`)).toBe(card);
		expect(card?.textContent).toContain("Filled");
		await timers(5100);
		await settle();
		expect(getOrderQueueItem(id)).toBeUndefined();
		expect(container.querySelectorAll("[data-sonner-toast]")).toHaveLength(0);
	});

	it("removes a late-inserted card when dismissal frames run before Sonner insertion timers", async () => {
		await warmGate();
		const id = await addTask();
		await act(async () => removeOrderQueueItem(id));
		// Sonner inserts with a timer, but dismisses through two animation frames.
		await runFrames();
		await runFrames();
		expect(toast.getToasts().some((notification) => String(notification.id).endsWith(id))).toBe(false);
		await timers();
		await settle();
		await timers(60_000);
		expect(container.querySelectorAll("[data-sonner-toast]")).toHaveLength(0);
	});

	it("cleans an unmounted host's delayed presentation while retaining the pending task", async () => {
		await warmGate();
		const id = await addTask();
		await act(async () => root.render(<Harness showGate={false} />));
		await runFrames();
		await runFrames();
		await timers();
		await settle();
		await timers(60_000);
		expect(getOrderQueueItem(id)).toMatchObject({ status: "pending" });
		expect(getOrderQueueItem(id)?.dismissed).not.toBe(true);
		expect(container.querySelectorAll("[data-sonner-toast]")).toHaveLength(0);
	});

	it("preserves the current account's result across a rapid account round trip and old dismissal callbacks", async () => {
		await warmGate();
		const id = await addTask();
		await settle();
		const previous = toast.getToasts().find((notification) => String(notification.id).endsWith(id));
		if (!previous || !("onDismiss" in previous)) throw new Error("Expected an active task notification");
		await act(async () => root.render(<Harness owner="0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" />));
		expect(container.textContent).not.toContain("HYPE");
		await act(async () => updateOrderQueueItem(id, { status: "success", outcome: "filled" }));
		await act(async () => root.render(<Harness />));
		await timers();
		await act(async () => {
			previous.onDismiss?.(previous);
			previous.onAutoClose?.(previous);
		});
		await settle();
		expect(getOrderQueueItem(id)).toMatchObject({ status: "success", dismissed: false });
		expect(container.querySelectorAll(`[data-order-feedback="${id}"]`)).toHaveLength(1);
		expect(container.textContent).toContain("Filled");
		expect(container.textContent).not.toContain("Submitting");
		await timers(5100);
		await settle();
		expect(getOrderQueueItem(id)).toBeUndefined();
		expect(container.querySelectorAll("[data-sonner-toast]")).toHaveLength(0);
	});

	it("keeps late success after a rapid soft hide and removes every toast after its lifetime", async () => {
		await warmGate();
		const id = await addTask();
		await timers();
		await act(async () => dismissOrderQueueItem(id));
		expect(getOrderQueueItem(id)).toMatchObject({ status: "pending", dismissed: true });
		await act(async () => updateOrderQueueItem(id, { status: "success", outcome: "filled" }));
		await settle();
		expect(getOrderQueueItem(id)).toMatchObject({ status: "success", dismissed: false });
		expect(container.querySelectorAll(`[data-order-feedback="${id}"]`)).toHaveLength(1);
		expect(container.textContent).toContain("Filled");
		expect(container.textContent).not.toContain("Submitting");
		await timers(5100);
		await settle();
		expect(getOrderQueueItem(id)).toBeUndefined();
		expect(container.querySelectorAll("[data-sonner-toast]")).toHaveLength(0);
	});

	it("ignores an old custom close handler after the same pending task receives a new presentation", async () => {
		await warmGate();
		const id = await addTask();
		await settle();
		const previous = toast.getToasts().find((notification) => String(notification.id).endsWith(id));
		if (
			!previous ||
			!("jsx" in previous) ||
			!isValidElement<{ onDismiss: (order: OrderQueueItem) => void }>(previous.jsx)
		) {
			throw new Error("Expected custom task notification content");
		}
		const previousClose = previous.jsx.props.onDismiss;
		const originalTask = getOrderQueueItem(id);
		if (!originalTask) throw new Error("Expected the pending task");
		await act(async () => root.render(<Harness owner="0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" />));
		await act(async () => root.render(<Harness />));
		await timers();
		await act(async () => previousClose(originalTask));
		await settle();
		expect(getOrderQueueItem(id)).toBe(originalTask);
		expect(getOrderQueueItem(id)?.dismissed).not.toBe(true);
		expect(container.querySelectorAll(`[data-order-feedback="${id}"]`)).toHaveLength(1);
		const currentClose = container.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]');
		if (!currentClose) throw new Error("Expected the current notification's close button");
		await act(async () => currentClose.click());
		await settle();
		expect(getOrderQueueItem(id)).toMatchObject({ status: "pending", dismissed: true });
		expect(container.querySelectorAll("[data-sonner-toast]")).toHaveLength(0);
	});

	it("keeps success received in the same update as clicking the pending notification's close button", async () => {
		await warmGate();
		const id = await addTask();
		await settle();
		const close = container.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]');
		if (!close) throw new Error("Expected the pending notification's close button");
		await act(async () => {
			close.click();
			updateOrderQueueItem(id, { status: "success", outcome: "filled" });
		});
		await settle();
		expect(getOrderQueueItem(id)).toMatchObject({ status: "success", dismissed: false });
		expect(container.querySelectorAll(`[data-order-feedback="${id}"]`)).toHaveLength(1);
		expect(container.textContent).toContain("Filled");
		expect(container.textContent).not.toContain("Submitting");
		await timers(5100);
		await settle();
		expect(getOrderQueueItem(id)).toBeUndefined();
		expect(container.querySelectorAll("[data-sonner-toast]")).toHaveLength(0);
	});

	it("keeps success received in the same update as Sonner dismisses the pending presentation", async () => {
		await warmGate();
		const id = await addTask();
		await settle();
		const previous = toast.getToasts().find((notification) => String(notification.id).endsWith(id));
		if (!previous || !("onDismiss" in previous) || !previous.onDismiss) {
			throw new Error("Expected the pending notification's dismissal callback");
		}
		await act(async () => {
			toast.dismiss(previous.id);
			previous.onDismiss?.(previous);
			updateOrderQueueItem(id, { status: "success", outcome: "filled" });
		});
		await settle();
		expect(getOrderQueueItem(id)).toMatchObject({ status: "success", dismissed: false });
		expect(container.querySelectorAll(`[data-order-feedback="${id}"]`)).toHaveLength(1);
		expect(container.textContent).toContain("Filled");
		expect(container.textContent).not.toContain("Submitting");
		await timers(5100);
		await settle();
		expect(getOrderQueueItem(id)).toBeUndefined();
		expect(container.querySelectorAll("[data-sonner-toast]")).toHaveLength(0);
	});

	it("keeps success arriving at the earlier result's auto-close deadline", async () => {
		await warmGate();
		const id = await addTask();
		await settle();
		setTimeout(() => updateOrderQueueItem(id, { status: "success", outcome: "filled" }), 3000);
		await act(async () => updateOrderQueueItem(id, { status: "unconfirmed" }));
		await timers(2999);
		expect(getOrderQueueItem(id)).toMatchObject({ status: "unconfirmed", dismissed: false });
		await timers(1);
		expect(getOrderQueueItem(id)).toMatchObject({ status: "success", dismissed: false });
		await settle();
		expect(getOrderQueueItem(id)).toMatchObject({ status: "success", dismissed: false });
		expect(container.querySelectorAll(`[data-order-feedback="${id}"]`)).toHaveLength(1);
		expect(container.textContent).toContain("Filled");
		await timers(5100);
		await settle();
		expect(getOrderQueueItem(id)).toBeUndefined();
		expect(container.querySelectorAll("[data-sonner-toast]")).toHaveLength(0);
	});

	it.each(["pending", "success"] as const)(
		"ignores an earlier state's auto-close callback after the same presentation updates to %s",
		async (status) => {
			await warmGate();
			const id = await addTask();
			await act(async () => updateOrderQueueItem(id, { status: "unconfirmed" }));
			await settle();
			const previous = toast.getToasts().find((notification) => String(notification.id).endsWith(id));
			if (!previous || !("onAutoClose" in previous) || !previous.onAutoClose) {
				throw new Error("Expected the unconfirmed notification's auto-close callback");
			}
			await act(async () => updateOrderQueueItem(id, { status, outcome: status === "success" ? "filled" : undefined }));
			await timers();
			const current = toast.getToasts().find((notification) => String(notification.id).endsWith(id));
			const currentTask = getOrderQueueItem(id);
			expect(current?.id).toBe(previous.id);
			await act(async () => previous.onAutoClose?.(previous));
			await settle();
			expect(getOrderQueueItem(id)).toBe(currentTask);
			expect(getOrderQueueItem(id)).toMatchObject({ status, dismissed: false });
			expect(container.querySelectorAll(`[data-order-feedback="${id}"]`)).toHaveLength(1);
			expect(container.textContent).toContain(status === "success" ? "Filled" : "Submitting");
		},
	);
});
