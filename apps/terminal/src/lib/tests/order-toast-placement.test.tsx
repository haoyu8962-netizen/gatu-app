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
	return (
		<IdentityContext.Provider value={account}>
			<Toaster />
			<OrderNotificationHost />
			<div data-page={page}>{page}</div>
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
	});
	afterEach(async () => {
		await act(async () => {
			for (const id of ids.splice(0)) removeOrderQueueItem(id);
			toast.dismiss();
			await vi.advanceTimersByTimeAsync(1000);
			root.unmount();
		});
		container.remove();
		vi.useRealTimers();
	});
	async function flush() {
		await act(() => vi.advanceTimersByTimeAsync(0));
	}
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
		expect(container.textContent).toContain("Filled");
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
		expect(container.textContent).toContain("Filled");
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
		expect(container.textContent).not.toContain("Filled");
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
		expect(container.textContent).toContain("Filled");
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
		const messageId = createHash("sha256").update("Submitting\x1f").digest("base64").slice(0, 6);
		act(() => i18n.loadAndActivate({ locale: "zh", messages: { [messageId]: "正在提交" } }));
		expect(container.textContent).toContain("正在提交");
		expect(container.querySelector(`[data-order-feedback="${id}"]`)).toBe(element);
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
		expect(container.textContent).toContain("1 of 2 close orders fully filled");
		expect(container.textContent).toContain("Partially filled");
		expect(container.textContent).toContain("1 / 2");
		expect(container.textContent).not.toContain("All positions closed");
		await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')?.click());
		expect(getOrderQueueItem(id)).toBeUndefined();
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
		expect(container.textContent).toContain("Filled");
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
			expect(container.textContent).toContain("Filled");
		},
	);

	it("mounts the feedback bridge at the client root, independently from market readiness", () => {
		const rootCode = readFileSync(resolve("src/components/app-toaster.tsx"), "utf8");
		const tradeCode = readFileSync(resolve("src/components/trade/trade-terminal-page.tsx"), "utf8");
		expect(rootCode.match(/<OrderNotificationGate\s*\/>/g)).toHaveLength(1);
		expect(tradeCode).not.toContain("OrderToast");
	});
});
