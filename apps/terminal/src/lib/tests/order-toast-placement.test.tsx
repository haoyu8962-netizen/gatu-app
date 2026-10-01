// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { i18n } from "@lingui/core";
import { act, createContext, useContext } from "react";
import type { Root } from "react-dom/client";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderNotificationHost } from "@/components/trade/order-notification-host";
import { Toaster } from "@/components/ui/sonner";
import { orderReconciliationError } from "@/lib/trade/order-reconciliation-feedback";
import { useGlobalSettingsActions } from "@/stores/use-global-settings-store";
import {
	addOrderQueueItem,
	getOrderQueueItem,
	type OrderQueueItem,
	removeOrderQueueItem,
	updateOrderQueueItem,
} from "@/stores/use-order-queue-store";
import { createI18nRoot } from "./harness/react";

const identity = vi.hoisted(() => ({ clientKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", env: "Mainnet" }));
const IdentityContext = createContext(identity);
vi.mock("@/lib/hyperliquid", () => ({ useHyperliquid: () => useContext(IdentityContext) }));
const ids: string[] = [];

function add(status: OrderQueueItem["status"] = "pending") {
	const id = addOrderQueueItem({
		owner: identity.clientKey,
		env: "Mainnet",
		market: "HYPE",
		side: "sell",
		size: "1",
		status,
	});
	ids.push(id);
	return id;
}

function Harness({ page = "trade", account = identity }: { page?: string; account?: typeof identity }) {
	const { setNumberFormatLocale } = useGlobalSettingsActions();
	return (
		<IdentityContext.Provider value={account}>
			<Toaster />
			<OrderNotificationHost />
			<div data-page={page}>{page}</div>
			<button type="button" data-number-format="en-US" onClick={() => setNumberFormatLocale("en-US")}>
				English numbers
			</button>
			<button type="button" data-number-format="de-DE" onClick={() => setNumberFormatLocale("de-DE")}>
				German numbers
			</button>
		</IdentityContext.Provider>
	);
}

describe("global order notifications", () => {
	let container: HTMLDivElement;
	let root: Root;
	beforeEach(() => {
		vi.useFakeTimers();
		identity.clientKey = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		identity.env = "Mainnet";
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(<Harness account={{ ...identity }} />));
		act(() => container.querySelector<HTMLButtonElement>('[data-number-format="en-US"]')?.click());
	});
	afterEach(async () => {
		await act(async () => {
			container.querySelector<HTMLButtonElement>('[data-number-format="en-US"]')?.click();
			for (const id of ids.splice(0)) removeOrderQueueItem(id);
			toast.dismiss();
			await vi.advanceTimersByTimeAsync(1000);
			root.unmount();
		});
		container.remove();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});
	async function flush() {
		await act(() => vi.advanceTimersByTimeAsync(0));
	}
	it("shows the status glyph of each order state and never an error glyph for an unknown result", async () => {
		const expected: [OrderQueueItem["status"], string, boolean][] = [
			["pending", "submitting", true],
			["confirming", "pending", true],
			["unconfirmed", "unknown", false],
			["partial", "partial", false],
			["success", "success", false],
			["canceled", "cancelled", false],
			["failed", "error", false],
		];
		let id = "";
		act(() => {
			id = add();
		});
		for (const [status, glyph, loading] of expected) {
			act(() => updateOrderQueueItem(id, { status }));
			await flush();
			const icon = container.querySelector(`[data-order-feedback="${id}"] svg[data-status-glyph]`);
			expect(icon?.getAttribute("data-status-glyph"), status).toBe(glyph);
			expect(icon?.getAttribute("aria-hidden"), status).toBe("true");
			expect(icon?.hasAttribute("data-loading-indicator"), status).toBe(loading);
			expect(container.querySelector(`[data-order-feedback="${id}"] .animate-spin`), status).toBeNull();
		}
	});
	it("keeps short live feedback out of the tab order", async () => {
		vi.stubGlobal("ResizeObserver", undefined);
		let id = "";
		act(() => {
			id = add();
		});
		await flush();
		const card = container.querySelector(`[data-order-feedback="${id}"]`);
		expect(card?.querySelector('[role="status"]')?.getAttribute("aria-atomic")).toBe("true");
		expect(card?.querySelector('[data-order-scroll="body"]')?.hasAttribute("tabindex")).toBe(false);
		expect(card?.querySelector('[role="status"]')?.hasAttribute("tabindex")).toBe(false);
		expect(card?.querySelectorAll("button")).toHaveLength(1);
	});
	it("makes only overflowing body and child regions focusable and observes their content", async () => {
		const observers: { notify: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] =
			[];
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe = vi.fn();
				disconnect = vi.fn();
				constructor(notify: () => void) {
					observers.push({ notify, observe: this.observe, disconnect: this.disconnect });
				}
			},
		);
		let id = "";
		act(() => {
			id = add();
			updateOrderQueueItem(id, {
				operation: "close-all",
				children: [{ assetId: 0, market: "HYPE", size: "1", status: "pending" }],
			});
		});
		await flush();
		const regions = container.querySelectorAll<HTMLElement>(`[data-order-feedback="${id}"] [data-order-scroll]`);
		expect(regions).toHaveLength(2);
		let contentHeight = 200;
		for (const region of regions) {
			Object.defineProperties(region, {
				clientHeight: { get: () => 100 },
				scrollHeight: { get: () => contentHeight },
			});
			const observer = observers.find((entry) => entry.observe.mock.calls.some(([element]) => element === region));
			expect(observer).toBeDefined();
			expect(observer?.observe).toHaveBeenCalledWith(region.firstElementChild);
		}
		act(() => {
			for (const observer of observers) observer.notify();
		});
		for (const region of regions) {
			expect(region.tabIndex).toBe(0);
			expect(region.getAttribute("aria-label")).toBeTruthy();
		}
		contentHeight = 80;
		act(() => {
			for (const observer of observers) observer.notify();
		});
		for (const region of regions) {
			expect(region.hasAttribute("tabindex")).toBe(false);
			expect(region.hasAttribute("aria-label")).toBe(false);
		}
		act(() => updateOrderQueueItem(id, { children: undefined }));
		await flush();
		const childrenObserver = observers.find((entry) =>
			entry.observe.mock.calls.some(([element]) => element === regions[1]),
		);
		expect(childrenObserver?.disconnect).toHaveBeenCalled();
	});
	it("shares one Sonner container with ordinary notifications and survives a route change", async () => {
		let id = "";
		act(() => {
			id = add();
			toast.info("Copied");
		});
		await flush();
		expect(container.querySelectorAll("[data-sonner-toaster]")).toHaveLength(1);
		expect(container.querySelectorAll("[data-sonner-toast]")).toHaveLength(2);
		act(() => {
			root.render(<Harness page="portfolio" />);
			updateOrderQueueItem(id, { status: "success", outcome: "filled" });
		});
		await flush();
		expect(container.textContent).toContain("order filled");
		expect(container.querySelector(`[data-order-feedback="${id}"]`)?.closest("[data-sonner-toaster]")).not.toBeNull();
	});
	it("soft-hides unknown results after three seconds and clears stale errors on late success", async () => {
		let id = "";
		act(() => {
			id = add();
			updateOrderQueueItem(id, {
				status: "unconfirmed",
				error: orderReconciliationError("status-unconfirmed"),
				acceptedCount: 1,
				totalCount: 2,
			});
		});
		await flush();
		await act(() => vi.advanceTimersByTimeAsync(3500));
		expect(getOrderQueueItem(id)).toMatchObject({ status: "unconfirmed", dismissed: true });
		expect(container.querySelector(`[data-order-feedback="${id}"]`)).toBeNull();
		act(() => updateOrderQueueItem(id, { acceptedCount: 1 }));
		await flush();
		expect(container.querySelector(`[data-order-feedback="${id}"]`)).toBeNull();
		act(() => updateOrderQueueItem(id, { status: "success", outcome: "filled" }));
		await flush();
		expect(getOrderQueueItem(id)).toMatchObject({
			status: "success",
			error: undefined,
			acceptedCount: undefined,
			totalCount: undefined,
		});
		expect(container.textContent).toContain("order filled");
		expect(container.textContent).not.toContain("Status unconfirmed");
		await act(() => vi.advanceTimersByTimeAsync(5300));
		expect(getOrderQueueItem(id)).toBeUndefined();
	});
	it.each(["unconfirmed", "partial", "failed", "canceled"] as const)(
		"auto-hides a %s result at three seconds",
		async (status) => {
			let id = "";
			act(() => {
				id = add(status);
			});
			await flush();
			// Sonner publishes the initial toast and its front-of-stack duration on separate timer turns.
			await act(() => vi.advanceTimersByTimeAsync(1));
			await act(() => vi.advanceTimersByTimeAsync(2999));
			expect(container.querySelector(`[data-order-feedback="${id}"]`)).not.toBeNull();
			expect(getOrderQueueItem(id)).toMatchObject({ status });
			expect(getOrderQueueItem(id)?.dismissed).not.toBe(true);
			await act(() => vi.advanceTimersByTimeAsync(1));
			if (status === "unconfirmed") {
				expect(getOrderQueueItem(id)).toMatchObject({ status, dismissed: true });
			} else {
				expect(getOrderQueueItem(id)).toBeUndefined();
			}
			await act(() => vi.advanceTimersByTimeAsync(500));
			expect(container.querySelector(`[data-order-feedback="${id}"]`)).toBeNull();
		},
	);
	it.each(["pending", "confirming"] as const)("keeps %s progress visible until a result arrives", async (status) => {
		let id = "";
		act(() => {
			id = add(status);
		});
		await flush();
		await act(() => vi.advanceTimersByTimeAsync(120_000));
		expect(container.querySelector(`[data-order-feedback="${id}"]`)).not.toBeNull();
		expect(getOrderQueueItem(id)?.dismissed).not.toBe(true);
		act(() => updateOrderQueueItem(id, { status: "failed" }));
		await flush();
		await act(() => vi.advanceTimersByTimeAsync(2999));
		expect(getOrderQueueItem(id)).toMatchObject({ status: "failed" });
		await act(() => vi.advanceTimersByTimeAsync(1));
		expect(getOrderQueueItem(id)).toBeUndefined();
	});
	it("starts success lifetime when displayed, not when the result happened", async () => {
		act(() => root.render(<Toaster />));
		let id = "";
		act(() => {
			id = add("success");
		});
		await act(() => vi.advanceTimersByTimeAsync(60_000));
		act(() => root.render(<Harness account={{ ...identity }} />));
		await flush();
		expect(container.querySelector(`[data-order-feedback="${id}"]`)).not.toBeNull();
		await act(() => vi.advanceTimersByTimeAsync(1000));
		expect(getOrderQueueItem(id)).toBeDefined();
	});
	it("hides old identity immediately and preserves its result for that identity", async () => {
		let id = "";
		act(() => {
			id = add();
		});
		await flush();
		act(() => {
			identity.clientKey = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
			root.render(<Harness account={{ ...identity }} />);
		});
		expect(container.textContent).not.toContain("HYPE");
		act(() => updateOrderQueueItem(id, { status: "success", outcome: "filled" }));
		await flush();
		expect(container.textContent).not.toContain("order filled");
		act(() => {
			identity.clientKey = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
			identity.env = "Testnet";
			root.render(<Harness account={{ ...identity }} />);
		});
		await flush();
		expect(container.textContent).not.toContain("HYPE");
		act(() => {
			identity.env = "Mainnet";
			root.render(<Harness account={{ ...identity }} />);
		});
		await act(() => vi.advanceTimersByTimeAsync(400));
		expect(container.textContent).toContain("order filled");
	});
	it.each([
		{ callback: "onDismiss", status: "pending" },
		{ callback: "onAutoClose", status: "success" },
	] as const)(
		"ignores a previous presentation's delayed $callback after returning to the account",
		async ({ callback, status }) => {
			let id = "";
			act(() => {
				id = add(status);
			});
			await flush();
			const previous = toast.getToasts().find((notification) => String(notification.id).endsWith(id));
			if (!previous || !("onDismiss" in previous)) throw new Error("Expected original task presentation");
			const onPreviousEnd = previous[callback];
			if (!onPreviousEnd) throw new Error("Expected original presentation callback");
			const originalTask = getOrderQueueItem(id);
			act(() =>
				root.render(<Harness account={{ ...identity, clientKey: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }} />),
			);
			await flush();
			act(() => root.render(<Harness account={{ ...identity }} />));
			await flush();
			act(() => onPreviousEnd(previous));
			expect(getOrderQueueItem(id)).toBe(originalTask);
			expect(getOrderQueueItem(id)?.dismissed).not.toBe(true);
			await act(() => vi.advanceTimersByTimeAsync(400));
			expect(container.querySelector(`[data-order-feedback="${id}"]`)).not.toBeNull();
		},
	);
	it("retranslates mounted task content without recreating the task", async () => {
		let id = "";
		act(() => {
			id = add();
		});
		await flush();
		const element = container.querySelector(`[data-order-feedback="${id}"]`);
		const messageId = createHash("sha256").update("Submitting…\x1f").digest("base64").slice(0, 6);
		act(() => i18n.loadAndActivate({ locale: "zh", messages: { [messageId]: "正在提交" } }));
		expect(container.textContent).toContain("正在提交");
		expect(container.querySelector(`[data-order-feedback="${id}"]`)).toBe(element);
	});
	it("updates the displayed average when number preferences change without recreating the task", async () => {
		let id = "";
		act(() => {
			id = add("success");
			updateOrderQueueItem(id, {
				quoteToken: "USDC",
				execution: {
					evidence: "exchange-response",
					filledSize: "1",
					requestedSize: "1",
					averagePrice: "1234.56789",
					orderIds: [101],
					completeness: "full",
				},
			});
		});
		await flush();
		const element = container.querySelector(`[data-order-feedback="${id}"]`);
		const task = getOrderQueueItem(id);
		expect(element?.textContent).toContain("$1,234.5679");
		act(() => container.querySelector<HTMLButtonElement>('[data-number-format="de-DE"]')?.click());
		expect(element?.textContent).toContain("$1.234,5679");
		expect(container.querySelector(`[data-order-feedback="${id}"]`)).toBe(element);
		expect(getOrderQueueItem(id)).toBe(task);
	});
	it("renders full-fill counts and partial child details without claiming positions are flat", async () => {
		let id = "";
		act(() => {
			id = add();
			updateOrderQueueItem(id, {
				operation: "close-all",
				status: "partial",
				countMode: "filled",
				acceptedCount: 1,
				totalCount: 2,
				children: [
					{ assetId: 0, market: "HYPE", size: "2", filledSize: "1", status: "partial" },
					{ assetId: 1, market: "BTC", size: "1", filledSize: "1", status: "filled" },
				],
			});
		});
		await flush();
		expect(container.textContent).toContain("Fully filled 1/2 · Review positions");
		expect(container.textContent).toContain("Partially filled");
		expect(container.textContent).toContain("1 / 2");
		expect(container.textContent).not.toContain("All positions closed");
		await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')?.click());
		expect(getOrderQueueItem(id)).toBeUndefined();
	});
	it("announces the TP/SL rule inside the status region of a partial fill that carried TP/SL", async () => {
		let id = "";
		act(() => {
			id = add();
			updateOrderQueueItem(id, {
				status: "partial",
				orderType: "market",
				quoteToken: "USDC",
				slPrice: "95",
				execution: {
					evidence: "exchange-response",
					filledSize: "0.4",
					requestedSize: "1",
					averagePrice: "99",
					orderIds: [7],
					completeness: "partial",
				},
			});
		});
		await flush();
		const notice = container.querySelector(`[data-order-feedback="${id}"] [data-order-notice]`);
		expect(notice?.textContent).toBe(
			"Attached TP/SL is placed only if the order fully fills, or if its remainder is canceled for insufficient margin. Review your position's TP/SL.",
		);
		expect(notice?.closest('[role="status"]')).not.toBeNull();
	});
	it("does not expire a successful task hidden behind a newer pending task", async () => {
		let older = "";
		let newer = "";
		act(() => {
			older = add();
		});
		await flush();
		act(() => {
			newer = add();
			updateOrderQueueItem(older, { status: "success", outcome: "filled" });
		});
		await flush();
		await act(() => vi.advanceTimersByTimeAsync(10_000));
		expect(getOrderQueueItem(older)).toBeDefined();
		act(() => removeOrderQueueItem(newer));
		await act(() => vi.advanceTimersByTimeAsync(500));
		expect(container.textContent).toContain("order filled");
		await act(() => vi.advanceTimersByTimeAsync(5300));
		expect(getOrderQueueItem(older)).toBeUndefined();
	});
	it("gives an unknown result its three seconds after reaching the front of the stack", async () => {
		let older = "";
		let newer = "";
		act(() => {
			older = add("unconfirmed");
		});
		await flush();
		act(() => {
			newer = add();
		});
		await flush();
		await act(() => vi.advanceTimersByTimeAsync(10_000));
		expect(getOrderQueueItem(older)?.dismissed).not.toBe(true);
		act(() => removeOrderQueueItem(newer));
		await act(() => vi.advanceTimersByTimeAsync(500));
		expect(getOrderQueueItem(older)?.dismissed).not.toBe(true);
		await act(() => vi.advanceTimersByTimeAsync(2000));
		expect(getOrderQueueItem(older)?.dismissed).not.toBe(true);
		await act(() => vi.advanceTimersByTimeAsync(1000));
		expect(getOrderQueueItem(older)).toMatchObject({ status: "unconfirmed", dismissed: true });
	});
	it.each(["pending", "unconfirmed"] as const)(
		"dismissing a %s card keeps the task and shows its eventual result",
		async (status) => {
			let id = "";
			act(() => {
				id = add(status);
			});
			await flush();
			act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')?.click());
			expect(getOrderQueueItem(id)).toMatchObject({ status, dismissed: true });
			await act(() => vi.advanceTimersByTimeAsync(500));
			act(() => updateOrderQueueItem(id, { status: "success", outcome: "filled" }));
			await flush();
			expect(container.textContent).toContain("order filled");
		},
	);

	it("mounts the feedback bridge at the client root, independently from market readiness", () => {
		const rootCode = readFileSync(resolve("src/components/app-toaster.tsx"), "utf8");
		const tradeCode = readFileSync(resolve("src/components/trade/trade-terminal-page.tsx"), "utf8");
		expect(rootCode.match(/<OrderNotificationGate\s*\/>/g)).toHaveLength(1);
		expect(tradeCode).not.toContain("OrderToast");
	});
});
