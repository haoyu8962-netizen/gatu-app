// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderReconciliation } from "@/components/trade/order-reconciliation";
import { ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS } from "@/domain/trade/order-tracking";
import { getPendingOrderActions, hasPendingOrderForAssets } from "@/stores/use-pending-order-store";

const USER = "0x1111111111111111111111111111111111111111" as const;
const mocks = vi.hoisted(() => ({
	clientKey: "0x1111111111111111111111111111111111111111",
	infoOrderStatus: vi.fn(),
	successToast: vi.fn(),
	warningToast: vi.fn(),
	orderUpdatesData: undefined as
		| Array<{ order: { cloid?: `0x${string}` }; status: "open" | "filled" | "rejected" }>
		| undefined,
}));

vi.mock("sonner", () => ({
	toast: { success: mocks.successToast, warning: mocks.warningToast, error: vi.fn() },
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ clientKey: mocks.clientKey, env: "Mainnet", info: { orderStatus: mocks.infoOrderStatus } }),
	useSubscription: () => ({ data: mocks.orderUpdatesData }),
}));

describe("OrderReconciliation", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-21T00:00:00Z"));
		mocks.infoOrderStatus.mockReset();
		mocks.successToast.mockReset();
		mocks.warningToast.mockReset();
		mocks.clientKey = USER;
		mocks.orderUpdatesData = undefined;
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	it("resolves a tracked cloid from the authenticated user's order updates", () => {
		const cloid = "0x00000000000000000000000000000001" as const;
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "market-order",
			children: [{ assetId: 7, cloid }],
		});
		mocks.orderUpdatesData = [{ order: { cloid }, status: "open" }];

		act(() => root.render(createElement(OrderReconciliation)));

		expect(hasPendingOrderForAssets("Mainnet", USER, [7])).toBe(false);
		expect(mocks.infoOrderStatus).not.toHaveBeenCalled();
		expect(mocks.successToast).toHaveBeenCalledOnce();
	});

	it("consumes a batch child update only once while other children remain pending", () => {
		const firstCloid = "0x00000000000000000000000000000011" as const;
		const secondCloid = "0x00000000000000000000000000000012" as const;
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "scale-order",
			children: [
				{ assetId: 9, cloid: firstCloid },
				{ assetId: 9, cloid: secondCloid },
			],
		});
		mocks.orderUpdatesData = [{ order: { cloid: firstCloid }, status: "open" }];

		act(() => root.render(createElement(OrderReconciliation)));

		expect(hasPendingOrderForAssets("Mainnet", USER, [9])).toBe(true);
		expect(mocks.successToast).not.toHaveBeenCalled();
	});

	it("reports a reconciled batch as partial when only some children were accepted", () => {
		const firstCloid = "0x00000000000000000000000000000021" as const;
		const secondCloid = "0x00000000000000000000000000000022" as const;
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "scale-order",
			children: [
				{ assetId: 9, cloid: firstCloid },
				{ assetId: 9, cloid: secondCloid },
			],
		});
		mocks.orderUpdatesData = [
			{ order: { cloid: firstCloid }, status: "open" },
			{ order: { cloid: secondCloid }, status: "rejected" },
		];

		act(() => root.render(createElement(OrderReconciliation)));

		expect(hasPendingOrderForAssets("Mainnet", USER, [9])).toBe(false);
		expect(mocks.successToast).not.toHaveBeenCalled();
		expect(mocks.warningToast).toHaveBeenCalledOnce();
	});

	it("queries order status with the authenticated user and resolves a filled order", async () => {
		const cloid = "0x00000000000000000000000000000002" as const;
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "limit-order",
			children: [{ assetId: 8, cloid }],
		});
		mocks.infoOrderStatus.mockResolvedValue({ status: "order", order: { status: "filled" } });

		act(() => root.render(createElement(OrderReconciliation)));
		await act(() => vi.advanceTimersByTimeAsync(3_000));

		expect(mocks.infoOrderStatus).toHaveBeenCalledWith({ user: USER, oid: cloid });
		expect(hasPendingOrderForAssets("Mainnet", USER, [8])).toBe(false);
		expect(mocks.successToast).toHaveBeenCalledOnce();
	});

	it("keeps unknown orders pending and limits each polling pass", async () => {
		const children = Array.from({ length: 5 }, (_, index) => ({
			assetId: 20 + index,
			cloid: `0x${String(index + 3).padStart(32, "0")}` as `0x${string}`,
		}));
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "scale-order",
			children,
		});
		mocks.infoOrderStatus.mockResolvedValue({ status: "unknownOid" });

		act(() => root.render(createElement(OrderReconciliation)));
		await act(() => vi.advanceTimersByTimeAsync(3_000));

		expect(mocks.infoOrderStatus).toHaveBeenCalledTimes(3);
		expect(
			hasPendingOrderForAssets(
				"Mainnet",
				USER,
				children.map((child) => child.assetId),
			),
		).toBe(true);
		expect(mocks.successToast).not.toHaveBeenCalled();
	});

	it("stops polling, releases the asset lock, and warns when confirmation times out", () => {
		const submission = getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "unknown-order",
			children: [{ assetId: 30, cloid: "0x00000000000000000000000000000030" }],
		});
		vi.setSystemTime(submission.createdAt + ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS);

		act(() => root.render(createElement(OrderReconciliation)));

		expect(mocks.infoOrderStatus).not.toHaveBeenCalled();
		expect(hasPendingOrderForAssets("Mainnet", USER, [30])).toBe(false);
		expect(mocks.warningToast).toHaveBeenCalledOnce();
	});

	it("releases the local lock while the wallet is disconnected", () => {
		const submission = getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "disconnected-order",
			children: [{ assetId: 32, cloid: "0x00000000000000000000000000000032" }],
		});
		mocks.clientKey = "disconnected";
		vi.setSystemTime(submission.createdAt + ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS);

		act(() => root.render(createElement(OrderReconciliation)));

		expect(hasPendingOrderForAssets("Mainnet", USER, [32])).toBe(false);
		expect(mocks.infoOrderStatus).not.toHaveBeenCalled();
		expect(mocks.warningToast).toHaveBeenCalledOnce();
	});

	it("accepts a late order update after the local hard lock has been released", () => {
		const cloid = "0x00000000000000000000000000000031" as const;
		const submission = getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "late-order",
			children: [{ assetId: 31, cloid }],
		});
		getPendingOrderActions().markUnconfirmed(submission.id, submission.createdAt + 1);
		mocks.orderUpdatesData = [{ order: { cloid }, status: "filled" }];

		act(() => root.render(createElement(OrderReconciliation)));

		expect(hasPendingOrderForAssets("Mainnet", USER, [31])).toBe(false);
		expect(mocks.successToast).toHaveBeenCalledOnce();
	});
});
