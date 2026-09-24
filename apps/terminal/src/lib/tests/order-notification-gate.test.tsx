// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createContext, useContext } from "react";
import type { Root } from "react-dom/client";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Transform the real renderer during collection; the deferred importer below still controls readiness.
import "@/components/trade/order-notification-host";
import { OrderNotificationGate } from "@/components/trade/order-notification-gate";
import { Toaster } from "@/components/ui/sonner";
import {
	addOrderQueueItem,
	getOrderQueueItem,
	removeOrderQueueItem,
	updateOrderQueueItem,
} from "@/stores/use-order-queue-store";
import { createI18nRoot } from "./harness/react";

const loading = vi.hoisted(() => ({ calls: 0, release: undefined as (() => void) | undefined }));
vi.mock("@/lib/lazy", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/lazy")>();
	return {
		...actual,
		createLazyComponent: <T extends Record<string, unknown>, K extends keyof T>(
			importer: () => Promise<T>,
			exportName: K,
		) =>
			actual.createLazyComponent(async () => {
				loading.calls++;
				await new Promise<void>((resolve) => {
					loading.release = resolve;
				});
				return importer();
			}, exportName),
	};
});

const account = { clientKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", env: "Mainnet" };
const otherAccount = { ...account, clientKey: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
const IdentityContext = createContext(account);
vi.mock("@/lib/hyperliquid", () => ({ useHyperliquid: () => useContext(IdentityContext) }));

function Harness({ identity = account }: { identity?: typeof account }) {
	return (
		<IdentityContext.Provider value={identity}>
			<Toaster />
			<OrderNotificationGate />
		</IdentityContext.Provider>
	);
}

describe("lazy global order notification gate", () => {
	let container: HTMLDivElement;
	let root: Root;
	const ids: string[] = [];
	beforeEach(() => {
		vi.useFakeTimers();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(<Harness />));
	});
	afterEach(async () => {
		await act(async () => {
			loading.release?.();
			for (const id of ids.splice(0)) removeOrderQueueItem(id);
			toast.dismiss();
			await vi.advanceTimersByTimeAsync(1000);
			root.unmount();
		});
		container.remove();
		vi.useRealTimers();
	});

	it("does not load the host without an undismissed task belonging to the active account and network", async () => {
		act(() => {
			for (const task of [
				{ owner: otherAccount.clientKey, env: "Mainnet" as const },
				{ owner: account.clientKey, env: "Testnet" as const },
				{ owner: account.clientKey, env: "Mainnet" as const, dismissed: true },
			]) {
				ids.push(addOrderQueueItem({ ...task, status: "pending" }));
			}
		});
		await act(() => vi.advanceTimersByTimeAsync(0));
		expect(loading.calls).toBe(0);
		expect(container.querySelectorAll("[data-sonner-toast]")).toHaveLength(0);
	});

	it("retains a result and its full visible lifetime when loading finishes after the account changed", async () => {
		let id = "";
		await act(async () => {
			id = addOrderQueueItem({ owner: account.clientKey, env: "Mainnet", market: "HYPE", status: "pending" });
			ids.push(id);
			toast.info("Copied", { id: "ordinary-during-load", duration: Infinity });
		});
		await act(() => vi.advanceTimersByTimeAsync(0));
		expect(loading.calls).toBe(1);
		expect(container.textContent).toContain("Copied");
		expect(container.querySelector("[data-order-feedback]")).toBeNull();
		act(() => updateOrderQueueItem(id, { status: "success", outcome: "filled" }));
		await act(() => vi.advanceTimersByTimeAsync(30_000));
		expect(getOrderQueueItem(id)).toMatchObject({ status: "success", outcome: "filled" });
		act(() => root.render(<Harness identity={otherAccount} />));
		await act(async () => {
			loading.release?.();
			await vi.dynamicImportSettled();
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(container.textContent).not.toContain("HYPE");
		expect(toast.getToasts().some((notification) => String(notification.id).endsWith(id))).toBe(false);
		act(() => {
			toast.dismiss("ordinary-during-load");
			root.render(<Harness />);
		});
		await act(() => vi.advanceTimersByTimeAsync(0));
		expect(container.querySelector(`[data-order-feedback="${id}"]`)).not.toBeNull();
		expect(container.textContent).toContain("order filled");
		expect(container.querySelectorAll("[data-sonner-toaster]")).toHaveLength(1);
		await act(() => vi.advanceTimersByTimeAsync(4900));
		expect(getOrderQueueItem(id)).toBeDefined();
		await act(() => vi.advanceTimersByTimeAsync(500));
		expect(getOrderQueueItem(id)).toBeUndefined();
	});
});
