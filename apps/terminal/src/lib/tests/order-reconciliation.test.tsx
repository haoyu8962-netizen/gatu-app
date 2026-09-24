// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderReconciliation } from "@/components/trade/order-reconciliation";
import { ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS, type OrderProcessingStatus } from "@/domain/trade/order-tracking";
import {
	getPositionMarketCloseActions,
	getPositionMarketCloseModal,
	type PositionMarketCloseRef,
} from "@/stores/use-global-modal-store";
import {
	addOrderQueueItem,
	dismissOrderQueueItem,
	getOrderQueueItem,
	type OrderQueueItem,
	useOrderQueue,
	useOrderQueueActions,
} from "@/stores/use-order-queue-store";
import { getPendingOrderActions, hasPendingOrderForAssets } from "@/stores/use-pending-order-store";
import {
	getPendingTradingActionActions,
	getPendingTradingActionSnapshot,
	TRADING_ACTION_CONFIRMATION_TIMEOUT_MS,
} from "@/stores/use-pending-trading-action-store";

let queueItems: OrderQueueItem[] = [];
let queueActions: ReturnType<typeof useOrderQueueActions> | null = null;

function OrderQueueProbe() {
	queueItems = useOrderQueue();
	queueActions = useOrderQueueActions();
	return null;
}

function createReconciliation() {
	return createElement(Fragment, null, createElement(OrderReconciliation), createElement(OrderQueueProbe));
}

function findQueueForAsset(assetId: number) {
	return queueItems.find((item) => item.children?.some((child) => child.assetId === assetId));
}

function expectActionFeedback(id: string, status: OrderQueueItem["status"], message: string) {
	const item = getOrderQueueItem(`pending-trading-action:${id}`);
	expect(item?.status).toBe(status);
	expect(item?.message ? i18n._(item.message) : null).toBe(message);
}

const USER = "0x1111111111111111111111111111111111111111" as const;
const POSITION: PositionMarketCloseRef = {
	coin: "BTC",
	dex: "",
	assetId: 0,
	szDecimals: 4,
	signedPositionSize: "1",
	markPx: "100000",
	marginMode: "cross",
};
const mocks = vi.hoisted(() => ({
	clientKey: "0x1111111111111111111111111111111111111111",
	infoOrderStatus: vi.fn(),
	successToast: vi.fn(),
	warningToast: vi.fn(),
	infoToast: vi.fn(),
	errorToast: vi.fn(),
	dismissToast: vi.fn(),
	orderUpdatesData: undefined as Array<{ order: { cloid?: `0x${string}` }; status: OrderProcessingStatus }> | undefined,
	openOrdersData: undefined as { orders: Array<{ oid: number; sz: string; triggerPx: string }> } | undefined,
	openOrdersLastMessageAt: undefined as number | undefined,
}));

vi.mock("sonner", () => ({
	toast: {
		success: mocks.successToast,
		warning: mocks.warningToast,
		info: mocks.infoToast,
		error: mocks.errorToast,
		dismiss: mocks.dismissToast,
	},
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ clientKey: mocks.clientKey, env: "Mainnet", info: { orderStatus: mocks.infoOrderStatus } }),
	useSubscription: (method: string) =>
		method === "openOrders"
			? {
					data: mocks.openOrdersData,
					status: "active",
					isStale: false,
					lastMessageAt: mocks.openOrdersLastMessageAt,
				}
			: { data: mocks.orderUpdatesData },
}));

describe("OrderReconciliation", () => {
	let container: HTMLDivElement;
	let root: Root;

	function clearMarketCloseSession() {
		const session = getPositionMarketCloseModal();
		if (!session) return;
		const actions = getPositionMarketCloseActions();
		actions.updatePhase(session.sessionId, "reconciling");
		actions.close(session.sessionId);
	}

	function openReconcilingMarketCloseSession(): string {
		const actions = getPositionMarketCloseActions();
		const sessionId = actions.open(POSITION, { owner: USER, env: "Mainnet" });
		if (!sessionId) throw new Error("Expected market close session");
		actions.updatePhase(sessionId, "reconciling");
		return sessionId;
	}

	beforeEach(() => {
		clearMarketCloseSession();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-21T00:00:00Z"));
		mocks.infoOrderStatus.mockReset();
		mocks.successToast.mockReset();
		mocks.warningToast.mockReset();
		mocks.infoToast.mockReset();
		mocks.errorToast.mockReset();
		mocks.dismissToast.mockReset();
		mocks.clientKey = USER;
		mocks.orderUpdatesData = undefined;
		mocks.openOrdersData = undefined;
		mocks.openOrdersLastMessageAt = undefined;
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		getPendingTradingActionActions().reset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		clearMarketCloseSession();
		act(() => {
			for (const item of queueItems) queueActions?.removeOrder(item.id);
			root.unmount();
		});
		queueItems = [];
		queueActions = null;
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

		act(() => root.render(createReconciliation()));

		expect(hasPendingOrderForAssets("Mainnet", USER, [7])).toBe(false);
		expect(findQueueForAsset(7)).toMatchObject({ owner: USER, env: "Mainnet", status: "success", outcome: "resting" });
		expect(mocks.infoOrderStatus).not.toHaveBeenCalled();
		expect(mocks.successToast).not.toHaveBeenCalled();
	});

	it("retains a filled-confirmation lock until an open market close becomes filled", () => {
		const cloid = "0x00000000000000000000000000000041" as const;
		const sessionId = openReconcilingMarketCloseSession();
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "market-close",
			exclusiveAssetLock: true,
			confirmationMode: "filled",
			origin: { type: "positionMarketClose", sessionId },
			children: [{ assetId: 41, cloid }],
		});
		mocks.orderUpdatesData = [{ order: { cloid }, status: "open" }];

		act(() => root.render(createReconciliation()));

		expect(hasPendingOrderForAssets("Mainnet", USER, [41])).toBe(true);
		expect(getPositionMarketCloseModal()?.phase).toBe("reconciling");
		expect(mocks.successToast).not.toHaveBeenCalled();

		mocks.orderUpdatesData = [{ order: { cloid }, status: "filled" }];
		act(() => root.render(createReconciliation()));

		expect(hasPendingOrderForAssets("Mainnet", USER, [41])).toBe(false);
		expect(findQueueForAsset(41)).toMatchObject({ status: "success", outcome: "filled" });
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(mocks.successToast).not.toHaveBeenCalled();
	});

	it("releases a rejected reconciled market close session", () => {
		const cloid = "0x00000000000000000000000000000042" as const;
		const sessionId = openReconcilingMarketCloseSession();
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "market-close-rejected",
			exclusiveAssetLock: true,
			confirmationMode: "filled",
			origin: { type: "positionMarketClose", sessionId },
			children: [{ assetId: 42, cloid }],
		});
		mocks.orderUpdatesData = [{ order: { cloid }, status: "rejected" }];

		act(() => root.render(createReconciliation()));

		expect(getPositionMarketCloseModal()).toBeNull();
		expect(mocks.errorToast).not.toHaveBeenCalled();
		expect(findQueueForAsset(42)?.status).toBe("failed");
	});

	it("warns when an accepted market close is later canceled instead of reporting a placement rejection", () => {
		const cloid = "0x00000000000000000000000000000043" as const;
		const sessionId = openReconcilingMarketCloseSession();
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "market-close-canceled",
			exclusiveAssetLock: true,
			confirmationMode: "filled",
			origin: { type: "positionMarketClose", sessionId },
			children: [{ assetId: 43, cloid }],
		});
		mocks.orderUpdatesData = [{ order: { cloid }, status: "marginCanceled" }];

		act(() => root.render(createReconciliation()));

		expect(hasPendingOrderForAssets("Mainnet", USER, [43])).toBe(false);
		expect(mocks.warningToast).not.toHaveBeenCalled();
		expect(findQueueForAsset(43)).toMatchObject({ status: "canceled", error: { code: "accepted-orders-canceled" } });
		expect(getPositionMarketCloseModal()).toBeNull();
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

		act(() => root.render(createReconciliation()));

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

		act(() => root.render(createReconciliation()));

		expect(hasPendingOrderForAssets("Mainnet", USER, [9])).toBe(false);
		expect(findQueueForAsset(9)).toMatchObject({ status: "partial", acceptedCount: 1, totalCount: 2 });
		expect(mocks.successToast).not.toHaveBeenCalled();
		expect(mocks.warningToast).not.toHaveBeenCalled();
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

		act(() => root.render(createReconciliation()));
		await act(() => vi.advanceTimersByTimeAsync(3_000));

		expect(mocks.infoOrderStatus).toHaveBeenCalledWith({ user: USER, oid: cloid });
		expect(hasPendingOrderForAssets("Mainnet", USER, [8])).toBe(false);
		expect(findQueueForAsset(8)).toMatchObject({ status: "success", outcome: "filled" });
		expect(mocks.successToast).not.toHaveBeenCalled();
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

		act(() => root.render(createReconciliation()));
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
		const sessionId = openReconcilingMarketCloseSession();
		const submission = getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "unknown-order",
			origin: { type: "positionMarketClose", sessionId },
			children: [{ assetId: 30, cloid: "0x00000000000000000000000000000030" }],
		});
		vi.setSystemTime(submission.createdAt + ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS);

		act(() => root.render(createReconciliation()));

		expect(mocks.infoOrderStatus).not.toHaveBeenCalled();
		expect(hasPendingOrderForAssets("Mainnet", USER, [30])).toBe(false);
		expect(findQueueForAsset(30)).toMatchObject({
			owner: USER,
			env: "Mainnet",
			status: "unconfirmed",
			error: { code: "status-unconfirmed" },
		});
		expect(mocks.warningToast).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
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

		act(() => root.render(createReconciliation()));

		expect(hasPendingOrderForAssets("Mainnet", USER, [32])).toBe(false);
		expect(findQueueForAsset(32)).toMatchObject({
			owner: USER,
			env: "Mainnet",
			status: "unconfirmed",
			error: { code: "status-unconfirmed" },
		});
		expect(mocks.infoOrderStatus).not.toHaveBeenCalled();
		expect(mocks.warningToast).not.toHaveBeenCalled();
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

		act(() => root.render(createReconciliation()));

		expect(hasPendingOrderForAssets("Mainnet", USER, [31])).toBe(false);
		expect(findQueueForAsset(31)).toMatchObject({ status: "success", outcome: "filled" });
		expect(findQueueForAsset(31)?.error).toBeUndefined();
		expect(mocks.successToast).not.toHaveBeenCalled();
	});

	it("keeps a dismissed timeout hidden across unrelated pending changes until its late result arrives", () => {
		const cloid = "0x00000000000000000000000000000071" as const;
		const submission = getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "dismissed-timeout",
			children: [{ assetId: 71, cloid }],
		});
		getPendingOrderActions().markUnconfirmed(submission.id, submission.createdAt + 1);
		act(() => root.render(createReconciliation()));
		const queueId = `reconcile-${submission.id}`;
		expect(getOrderQueueItem(queueId)?.status).toBe("unconfirmed");
		act(() => dismissOrderQueueItem(queueId));
		expect(getOrderQueueItem(queueId)).toMatchObject({ status: "unconfirmed", dismissed: true });

		act(() => {
			getPendingOrderActions().add({
				env: "Mainnet",
				user: USER,
				intentKey: "unrelated-order",
				children: [{ assetId: 72, cloid: "0x00000000000000000000000000000072" }],
			});
		});
		expect(findQueueForAsset(72)?.status).toBe("confirming");
		expect(getOrderQueueItem(queueId)).toMatchObject({ status: "unconfirmed", dismissed: true });
		expect(queueItems.filter((item) => !item.dismissed).map((item) => item.id)).not.toContain(queueId);

		mocks.orderUpdatesData = [{ order: { cloid }, status: "filled" }];
		act(() => root.render(createReconciliation()));
		expect(getOrderQueueItem(queueId)).toMatchObject({ status: "success", outcome: "filled", dismissed: false });
		expect(queueItems.filter((item) => !item.dismissed).map((item) => item.id)).toContain(queueId);
		expect(getOrderQueueItem(queueId)?.error).toBeUndefined();
	});

	it("restores an old pending record without inventing market or size metadata", () => {
		const submission = getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "restored-order",
			children: [{ assetId: 61, cloid: "0x00000000000000000000000000000061" }],
		});

		act(() => root.render(createReconciliation()));

		expect(getOrderQueueItem(`reconcile-${submission.id}`)).toMatchObject({
			owner: USER,
			env: "Mainnet",
			operation: "order",
			status: "confirming",
			totalCount: 1,
			children: [{ assetId: 61, status: "pending" }],
		});
		expect(findQueueForAsset(61)?.market).toBeUndefined();
		expect(findQueueForAsset(61)?.size).toBeUndefined();
	});

	it("restores close-all metadata and updates each child without claiming positions are flat", () => {
		const firstCloid = "0x00000000000000000000000000000062" as const;
		const secondCloid = "0x00000000000000000000000000000063" as const;
		const submission = getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "restored-close-all",
			queueId: "restored-close-all-queue",
			confirmationMode: "filled",
			feedback: {
				operation: "close-all",
				countMode: "filled",
				children: [
					{ assetId: 62, market: "BTC", size: "1", status: "pending" },
					{ assetId: 63, market: "ETH", size: "2", status: "pending" },
				],
			},
			children: [
				{ assetId: 62, cloid: firstCloid },
				{ assetId: 63, cloid: secondCloid },
			],
		});
		mocks.orderUpdatesData = [{ order: { cloid: firstCloid }, status: "filled" }];

		act(() => root.render(createReconciliation()));
		expect(getOrderQueueItem(submission.queueId)).toMatchObject({
			operation: "close-all",
			status: "confirming",
			children: [
				{ assetId: 62, market: "BTC", size: "1", status: "filled-unverified" },
				{ assetId: 63, market: "ETH", size: "2", status: "pending" },
			],
		});

		mocks.orderUpdatesData = [{ order: { cloid: secondCloid }, status: "rejected" }];
		act(() => root.render(createReconciliation()));
		expect(getOrderQueueItem(submission.queueId)).toMatchObject({
			status: "partial",
			countMode: "filled",
			acceptedCount: undefined,
			totalCount: undefined,
			positionsClosed: false,
			children: [
				{ assetId: 62, market: "BTC", status: "filled-unverified" },
				{ assetId: 63, market: "ETH", status: "rejected" },
			],
		});
		expect(mocks.warningToast).not.toHaveBeenCalled();
	});

	it("keeps a late response scoped to the originating account after switching accounts", async () => {
		let settle!: (result: { status: "order"; order: { status: "filled" } }) => void;
		mocks.infoOrderStatus.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					settle = resolve;
				}),
		);
		const cloid = "0x00000000000000000000000000000064" as const;
		const submission = getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "account-switch-order",
			confirmationMode: "filled",
			children: [{ assetId: 64, cloid }],
		});
		act(() => root.render(createReconciliation()));
		await act(() => vi.advanceTimersByTimeAsync(3_000));
		expect(mocks.infoOrderStatus).toHaveBeenCalledExactlyOnceWith({ user: USER, oid: cloid });

		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		act(() => root.render(createReconciliation()));
		await act(async () => {
			settle({ status: "order", order: { status: "filled" } });
		});

		expect(getOrderQueueItem(`reconcile-${submission.id}`)).toMatchObject({
			owner: USER,
			env: "Mainnet",
			status: "success",
			outcome: "filled",
		});
		expect(hasPendingOrderForAssets("Mainnet", USER, [64])).toBe(false);
		expect(mocks.successToast).not.toHaveBeenCalled();
		expect(mocks.warningToast).not.toHaveBeenCalled();
	});

	it("retains existing queue metadata when a late confirmation clears an earlier timeout", () => {
		const cloid = "0x00000000000000000000000000000065" as const;
		const queueId = addOrderQueueItem({
			owner: USER,
			env: "Mainnet",
			market: "BTC",
			side: "sell",
			size: "1",
			operation: "market-close",
			status: "unconfirmed",
			error: "Old timeout",
			acceptedCount: 0,
			totalCount: 1,
		});
		const submission = getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "late-queue-update",
			queueId,
			confirmationMode: "filled",
			children: [{ assetId: 65, cloid }],
		});
		getPendingOrderActions().markUnconfirmed(submission.id, submission.createdAt + 1);
		mocks.orderUpdatesData = [{ order: { cloid }, status: "filled" }];

		act(() => root.render(createReconciliation()));

		expect(getOrderQueueItem(queueId)).toMatchObject({
			market: "BTC",
			side: "sell",
			size: "1",
			operation: "market-close",
			status: "success",
			outcome: "filled",
		});
		expect(getOrderQueueItem(queueId)?.error).toBeUndefined();
		expect(getOrderQueueItem(queueId)?.acceptedCount).toBeUndefined();
	});

	it("preserves known partial fills through a later filled status without inventing full quantity", () => {
		const cloid = "0x00000000000000000000000000000066" as const;
		const queueId = addOrderQueueItem({
			owner: USER,
			env: "Mainnet",
			operation: "close-all",
			status: "confirming",
			children: [{ assetId: 66, market: "BTC", size: "1.25", filledSize: "0.25", status: "partial" }],
		});
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "partially-filled-close",
			queueId,
			confirmationMode: "filled",
			children: [{ assetId: 66, cloid }],
		});
		act(() => root.render(createReconciliation()));
		expect(getOrderQueueItem(queueId)?.children?.[0]).toMatchObject({ status: "partial", filledSize: "0.25" });

		mocks.orderUpdatesData = [{ order: { cloid }, status: "filled" }];
		act(() => root.render(createReconciliation()));
		expect(getOrderQueueItem(queueId)).toMatchObject({
			status: "partial",
			countMode: "filled",
			acceptedCount: 0,
			totalCount: 1,
			positionsClosed: false,
			children: [{ assetId: 66, size: "1.25", filledSize: "0.25", status: "partial" }],
		});
		expect(getOrderQueueItem(queueId)?.error).toBeUndefined();
	});

	it("restores an entry execution and never upgrades a known partial from a later status-only fill", () => {
		const cloid = "0x00000000000000000000000000000067" as const;
		const execution = {
			evidence: "exchange-response",
			filledSize: "0.4",
			requestedSize: "1",
			averagePrice: "99",
			orderIds: [67],
			completeness: "partial",
		} as const;
		const submission = getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "entry-partial",
			queueId: "entry-partial-queue",
			feedback: { market: "HYPE", quoteToken: "USDC", execution: { ...execution, orderIds: [67] } },
			children: [{ assetId: 67, cloid }],
		});
		act(() => root.render(createReconciliation()));
		expect(getOrderQueueItem(submission.queueId)).toMatchObject({
			status: "confirming",
			execution,
			quoteToken: "USDC",
		});
		mocks.orderUpdatesData = [{ order: { cloid }, status: "filled" }];
		act(() => root.render(createReconciliation()));
		expect(getOrderQueueItem(submission.queueId)).toMatchObject({
			status: "partial",
			execution,
			positionsClosed: false,
		});
	});

	it("preserves a verified IOC partial fill when its remainder and attached order are canceled", () => {
		const mainCloid = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		const tpCloid = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
		const execution = {
			evidence: "exchange-response" as const,
			filledSize: "0.4",
			requestedSize: "1",
			averagePrice: "99",
			orderIds: [70],
			completeness: "partial" as const,
			partialIoc: { cloid: mainCloid, orderId: 70, attachedCloids: [tpCloid] },
		};
		const submission = getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "ioc-partial-with-tp",
			feedback: { market: "HYPE", orderType: "market", execution },
			children: [
				{ assetId: 70, cloid: mainCloid },
				{ assetId: 70, cloid: tpCloid },
			],
		});
		mocks.orderUpdatesData = [
			{ order: { cloid: mainCloid }, status: "canceled" },
			{ order: { cloid: tpCloid }, status: "canceled" },
		];
		act(() => root.render(createReconciliation()));
		expect(getOrderQueueItem(`reconcile-${submission.id}`)).toMatchObject({
			status: "partial",
			execution,
			acceptedCount: 1,
			totalCount: 2,
			positionsClosed: false,
			children: [{ status: "partial", size: "1", filledSize: "0.4" }, { status: "canceled" }],
		});
		expect(getOrderQueueItem(`reconcile-${submission.id}`)?.error).toBeUndefined();
	});

	it.each([
		{ mainStatus: "canceled", attachedStatus: "canceled", code: "accepted-orders-canceled" },
		{ mainStatus: "canceled", attachedStatus: "rejected", code: "batch-rejected" },
		{ mainStatus: "marginCanceled", attachedStatus: "open", code: "accepted-orders-canceled" },
	] as const)("keeps abnormal IOC batch outcomes (%j)", ({ mainStatus, attachedStatus, code }) => {
		const mainCloid = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		const tpCloid = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "ioc-partial-with-failed-tp",
			feedback: {
				market: "HYPE",
				execution: {
					evidence: "exchange-response",
					filledSize: "0.4",
					requestedSize: "1",
					averagePrice: "99",
					orderIds: [71],
					completeness: "partial",
					partialIoc: { cloid: mainCloid, orderId: 71 },
				},
			},
			children: [
				{ assetId: 71, cloid: mainCloid },
				{ assetId: 71, cloid: tpCloid },
			],
		});
		mocks.orderUpdatesData = [
			{ order: { cloid: mainCloid }, status: mainStatus },
			{ order: { cloid: tpCloid }, status: attachedStatus },
		];
		act(() => root.render(createReconciliation()));
		expect(findQueueForAsset(71)).toMatchObject({ status: "partial", error: { code } });
	});

	it.each([
		undefined,
		{ cloid: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", orderId: 72 },
		{ cloid: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", orderId: 73 },
	])("does not infer normal IOC cancellation from missing or mismatched evidence (%j)", (partialIoc) => {
		const cloid = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "unverified-ioc-remainder",
			feedback: {
				market: "HYPE",
				orderType: "market",
				execution: {
					evidence: "exchange-response",
					filledSize: "0.4",
					requestedSize: "1",
					averagePrice: "99",
					orderIds: [72],
					completeness: "partial",
					partialIoc,
				},
			},
			children: [{ assetId: 72, cloid }],
		});
		mocks.orderUpdatesData = [{ order: { cloid }, status: "canceled" }];
		act(() => root.render(createReconciliation()));
		expect(findQueueForAsset(72)).toMatchObject({ status: "partial", error: { code: "accepted-orders-canceled" } });
	});

	it.each([
		{ knownPartialChild: false, confirmationMode: "accepted", secondStatus: "open", expected: "success" },
		{ knownPartialChild: true, confirmationMode: "filled", secondStatus: "filled", expected: "partial" },
		{ knownPartialChild: false, confirmationMode: "accepted", secondStatus: "canceled", expected: "partial" },
		{ knownPartialChild: false, confirmationMode: "accepted", secondStatus: "rejected", expected: "partial" },
	] as const)("separates Scale acceptance from fill completeness (%j)", (scenario) => {
		const firstCloid = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		const secondCloid = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "scale-accepted-partial-execution",
			confirmationMode: scenario.confirmationMode,
			feedback: {
				market: "HYPE",
				orderType: "scale",
				execution: {
					evidence: "exchange-response",
					filledSize: "0.4",
					requestedSize: "1",
					averagePrice: "99",
					orderIds: [73],
					completeness: "partial",
				},
				children: scenario.knownPartialChild
					? [
							{ assetId: 73, size: "0.5", filledSize: "0.4", status: "partial" },
							{ assetId: 73, status: "pending" },
						]
					: undefined,
			},
			children: [
				{ assetId: 73, cloid: firstCloid },
				{ assetId: 73, cloid: secondCloid },
			],
		});
		mocks.orderUpdatesData = [
			{ order: { cloid: firstCloid }, status: "filled" },
			{ order: { cloid: secondCloid }, status: scenario.secondStatus },
		];
		act(() => root.render(createReconciliation()));
		expect(findQueueForAsset(73)).toMatchObject({
			status: scenario.expected,
			execution: { completeness: "partial", filledSize: "0.4", requestedSize: "1" },
			positionsClosed: false,
		});
		if (scenario.expected === "success") expect(findQueueForAsset(73)?.error).toBeUndefined();
	});

	it("uses a fresh open-orders snapshot to confirm an update that arrived before the HTTP response", () => {
		const now = Date.now();
		const action = getPendingTradingActionActions().claimModification({
			env: "Mainnet",
			owner: USER,
			oid: 42,
			originalSize: "2",
			originalTriggerPx: "0",
			expectedSize: "1",
		});
		if (!action) throw new Error("Expected modification claim");
		getPendingTradingActionActions().markModificationRequestStarted(action.id, now - 2);
		mocks.openOrdersData = { orders: [{ oid: 42, sz: "1", triggerPx: "0" }] };
		mocks.openOrdersLastMessageAt = now - 1;
		getPendingTradingActionActions().markModificationAwaiting(action.id, now);

		act(() => root.render(createReconciliation()));

		expect(getPendingTradingActionSnapshot().modifications).toHaveLength(0);
		expectActionFeedback(action.id, "success", "Order modification confirmed.");
	});

	it("releases an unconfirmed modification after a fresh snapshot shows the original order", () => {
		const now = Date.now();
		const action = getPendingTradingActionActions().claimModification({
			env: "Mainnet",
			owner: USER,
			oid: 43,
			originalSize: "2",
			originalTriggerPx: "0",
			expectedSize: "1",
		});
		if (!action) throw new Error("Expected modification claim");
		getPendingTradingActionActions().markModificationRequestStarted(action.id, now - 2);
		getPendingTradingActionActions().markModificationUnconfirmed(action.id, now - 1);
		mocks.openOrdersData = { orders: [{ oid: 43, sz: "2", triggerPx: "0" }] };
		mocks.openOrdersLastMessageAt = now;

		act(() => root.render(createReconciliation()));

		expect(getPendingTradingActionSnapshot().modifications).toHaveLength(0);
		expectActionFeedback(
			action.id,
			"unconfirmed",
			"The modification was not confirmed. Review the order before retrying.",
		);
	});

	it("does not use a pre-unconfirmed snapshot to release a modification", () => {
		const now = Date.now();
		const action = getPendingTradingActionActions().claimModification({
			env: "Mainnet",
			owner: USER,
			oid: 47,
			originalSize: "2",
			originalTriggerPx: "0",
			expectedSize: "1",
		});
		if (!action) throw new Error("Expected modification claim");
		getPendingTradingActionActions().markModificationRequestStarted(action.id, now - 2);
		getPendingTradingActionActions().markModificationUnconfirmed(action.id, now);
		mocks.openOrdersData = { orders: [{ oid: 47, sz: "2", triggerPx: "0" }] };
		mocks.openOrdersLastMessageAt = now - 1;

		act(() => root.render(createReconciliation()));
		expect(getPendingTradingActionSnapshot().modifications).toHaveLength(1);
		expect(mocks.infoToast).not.toHaveBeenCalled();

		mocks.openOrdersData = { orders: [{ oid: 47, sz: "2", triggerPx: "0" }] };
		mocks.openOrdersLastMessageAt = now + 1;
		act(() => root.render(createReconciliation()));
		expect(getPendingTradingActionSnapshot().modifications).toHaveLength(0);
		expectActionFeedback(
			action.id,
			"unconfirmed",
			"The modification was not confirmed. Review the order before retrying.",
		);
	});

	it("does not use a pre-response snapshot to report an awaiting modification conflict", () => {
		const now = Date.now();
		const action = getPendingTradingActionActions().claimModification({
			env: "Mainnet",
			owner: USER,
			oid: 48,
			originalSize: "2",
			originalTriggerPx: "0",
			expectedSize: "1",
		});
		if (!action) throw new Error("Expected modification claim");
		getPendingTradingActionActions().markModificationRequestStarted(action.id, now - 2);
		getPendingTradingActionActions().markModificationAwaiting(action.id, now);
		mocks.openOrdersData = { orders: [{ oid: 48, sz: "1.5", triggerPx: "0" }] };
		mocks.openOrdersLastMessageAt = now - 1;

		act(() => root.render(createReconciliation()));
		expect(getPendingTradingActionSnapshot().modifications).toHaveLength(1);
		expect(mocks.errorToast).not.toHaveBeenCalled();

		mocks.openOrdersData = { orders: [{ oid: 48, sz: "1.5", triggerPx: "0" }] };
		mocks.openOrdersLastMessageAt = now + 1;
		act(() => root.render(createReconciliation()));
		expect(getPendingTradingActionSnapshot().modifications).toHaveLength(0);
		expectActionFeedback(
			action.id,
			"failed",
			"The order changed before the requested modification was confirmed. Review the latest order before retrying.",
		);
	});

	it("does not use a pre-unconfirmed snapshot to report a modification conflict", () => {
		const now = Date.now();
		const action = getPendingTradingActionActions().claimModification({
			env: "Mainnet",
			owner: USER,
			oid: 49,
			originalSize: "2",
			originalTriggerPx: "0",
			expectedSize: "1",
		});
		if (!action) throw new Error("Expected modification claim");
		getPendingTradingActionActions().markModificationRequestStarted(action.id, now - 2);
		getPendingTradingActionActions().markModificationUnconfirmed(action.id, now);
		mocks.openOrdersData = { orders: [{ oid: 49, sz: "1.5", triggerPx: "0" }] };
		mocks.openOrdersLastMessageAt = now - 1;

		act(() => root.render(createReconciliation()));
		expect(getPendingTradingActionSnapshot().modifications).toHaveLength(1);
		expect(mocks.errorToast).not.toHaveBeenCalled();

		mocks.openOrdersData = { orders: [{ oid: 49, sz: "1.5", triggerPx: "0" }] };
		mocks.openOrdersLastMessageAt = now + 1;
		act(() => root.render(createReconciliation()));
		expect(getPendingTradingActionSnapshot().modifications).toHaveLength(0);
		expectActionFeedback(
			action.id,
			"failed",
			"The order changed before the requested modification was confirmed. Review the latest order before retrying.",
		);
	});

	it("does not resolve a pending action belonging to another owner", () => {
		const now = Date.now();
		const action = getPendingTradingActionActions().claimModification({
			env: "Mainnet",
			owner: "0x2222222222222222222222222222222222222222",
			oid: 44,
			originalSize: "2",
			originalTriggerPx: "0",
			expectedSize: "1",
		});
		if (!action) throw new Error("Expected modification claim");
		getPendingTradingActionActions().markModificationRequestStarted(action.id, now - 2);
		getPendingTradingActionActions().markModificationUnconfirmed(action.id, now - 1);
		mocks.openOrdersData = { orders: [{ oid: 44, sz: "1", triggerPx: "0" }] };
		mocks.openOrdersLastMessageAt = now;

		act(() => root.render(createReconciliation()));

		expect(getPendingTradingActionSnapshot().modifications).toHaveLength(1);
		expect(mocks.successToast).not.toHaveBeenCalled();
	});

	it("confirms a cancellation from a fresh missing-order snapshot and clears matching modify uncertainty", () => {
		const now = Date.now();
		const modification = getPendingTradingActionActions().claimModification({
			env: "Mainnet",
			owner: USER,
			oid: 45,
			originalSize: "2",
			originalTriggerPx: "0",
			expectedSize: "1",
		});
		if (!modification) throw new Error("Expected modification claim");
		getPendingTradingActionActions().markModificationRequestStarted(modification.id, now - 4);
		getPendingTradingActionActions().markModificationUnconfirmed(modification.id, now - 3);
		const cancellation = getPendingTradingActionActions().claimOrderCancellation({
			env: "Mainnet",
			owner: USER,
			oids: [45],
		});
		if (!cancellation) throw new Error("Expected cancellation claim");
		getPendingTradingActionActions().markOrderCancellationRequestStarted(cancellation.id, now - 2);
		getPendingTradingActionActions().markOrderCancellationAwaiting(cancellation.id, now - 1);
		mocks.openOrdersData = { orders: [] };
		mocks.openOrdersLastMessageAt = now;

		act(() => root.render(createReconciliation()));

		expect(getPendingTradingActionSnapshot()).toMatchObject({
			modifications: [],
			orderCancellations: [],
		});
		expectActionFeedback(cancellation.id, "success", "Order cancellation confirmed.");
		expectActionFeedback(modification.id, "canceled", "The modified order was canceled.");
		act(() => root.render(createReconciliation()));
		expect(mocks.successToast).not.toHaveBeenCalled();
	});

	it("replaces a persistent cancellation timeout with one finite confirmed notification", () => {
		const now = Date.now();
		const cancellation = getPendingTradingActionActions().claimOrderCancellation({
			env: "Mainnet",
			owner: USER,
			oids: [60],
		});
		if (!cancellation) throw new Error("Expected cancellation claim");
		getPendingTradingActionActions().markOrderCancellationRequestStarted(cancellation.id, now - 1);
		getPendingTradingActionActions().markOrderCancellationAwaiting(cancellation.id, now);
		act(() => root.render(createReconciliation()));

		act(() => vi.advanceTimersByTime(TRADING_ACTION_CONFIRMATION_TIMEOUT_MS));
		expectActionFeedback(
			cancellation.id,
			"unconfirmed",
			"The cancellation response could not be confirmed. Refresh open orders before retrying.",
		);

		mocks.openOrdersData = { orders: [] };
		mocks.openOrdersLastMessageAt = Date.now() + 1;
		act(() => root.render(createReconciliation()));
		expectActionFeedback(cancellation.id, "success", "Order cancellation confirmed.");
	});

	it("uses one sufficiently fresh snapshot to release an unconfirmed cancellation and modification", () => {
		const now = Date.now();
		const modification = getPendingTradingActionActions().claimModification({
			env: "Mainnet",
			owner: USER,
			oid: 46,
			originalSize: "2",
			originalTriggerPx: "0",
			expectedSize: "1",
		});
		if (!modification) throw new Error("Expected modification claim");
		getPendingTradingActionActions().markModificationRequestStarted(modification.id, now - 4);
		getPendingTradingActionActions().markModificationUnconfirmed(modification.id, now - 3);
		const cancellation = getPendingTradingActionActions().claimOrderCancellation({
			env: "Mainnet",
			owner: USER,
			oids: [46],
		});
		if (!cancellation) throw new Error("Expected cancellation claim");
		getPendingTradingActionActions().markOrderCancellationRequestStarted(cancellation.id, now - 2);
		getPendingTradingActionActions().markOrderCancellationUnconfirmed(cancellation.id, now);
		mocks.openOrdersData = { orders: [{ oid: 46, sz: "2", triggerPx: "0" }] };
		mocks.openOrdersLastMessageAt = now - 1;

		act(() => root.render(createReconciliation()));
		expect(getPendingTradingActionSnapshot()).toMatchObject({
			modifications: [expect.objectContaining({ id: modification.id })],
			orderCancellations: [expect.objectContaining({ id: cancellation.id })],
		});

		mocks.openOrdersData = { orders: [{ oid: 46, sz: "2", triggerPx: "0" }] };
		mocks.openOrdersLastMessageAt = now + 1;
		act(() => root.render(createReconciliation()));

		expect(getPendingTradingActionSnapshot()).toMatchObject({
			modifications: [],
			orderCancellations: [],
		});
	});

	it("keeps modify uncertainty while a matching cancellation still awaits confirmation", () => {
		const now = Date.now();
		const modification = getPendingTradingActionActions().claimModification({
			env: "Mainnet",
			owner: USER,
			oid: 50,
			originalSize: "2",
			originalTriggerPx: "0",
			expectedSize: "1",
		});
		if (!modification) throw new Error("Expected modification claim");
		getPendingTradingActionActions().markModificationRequestStarted(modification.id, now - 4);
		getPendingTradingActionActions().markModificationUnconfirmed(modification.id, now - 3);
		const cancellation = getPendingTradingActionActions().claimOrderCancellation({
			env: "Mainnet",
			owner: USER,
			oids: [50],
		});
		if (!cancellation) throw new Error("Expected cancellation claim");
		getPendingTradingActionActions().markOrderCancellationRequestStarted(cancellation.id, now - 2);
		getPendingTradingActionActions().markOrderCancellationAwaiting(cancellation.id, now - 1);
		mocks.openOrdersData = { orders: [{ oid: 50, sz: "2", triggerPx: "0" }] };
		mocks.openOrdersLastMessageAt = now;

		act(() => root.render(createReconciliation()));

		expect(getPendingTradingActionSnapshot()).toMatchObject({
			modifications: [expect.objectContaining({ id: modification.id })],
			orderCancellations: [expect.objectContaining({ id: cancellation.id })],
		});
	});

	it("does not emit a captured timeout warning after the action was already resolved", () => {
		const now = Date.now();
		const timeoutSpy = vi.spyOn(window, "setTimeout");
		const action = getPendingTradingActionActions().claimModification({
			env: "Mainnet",
			owner: USER,
			oid: 51,
			originalSize: "2",
			originalTriggerPx: "0",
			expectedSize: "1",
		});
		if (!action) throw new Error("Expected modification claim");
		getPendingTradingActionActions().markModificationAwaiting(action.id, now);
		act(() => root.render(createReconciliation()));
		const capturedTimer = timeoutSpy.mock.calls.find(
			([, delay]) => delay === TRADING_ACTION_CONFIRMATION_TIMEOUT_MS,
		)?.[0];
		expect(typeof capturedTimer).toBe("function");

		act(() => getPendingTradingActionActions().resolveModification(action.id));
		vi.setSystemTime(now + TRADING_ACTION_CONFIRMATION_TIMEOUT_MS);
		act(() => {
			if (typeof capturedTimer === "function") capturedTimer();
		});

		expect(mocks.errorToast).not.toHaveBeenCalled();
		timeoutSpy.mockRestore();
	});

	it("transitions an old account timeout without showing its warning in the current account", () => {
		const now = Date.now();
		const timeoutSpy = vi.spyOn(window, "setTimeout");
		const action = getPendingTradingActionActions().claimModification({
			env: "Mainnet",
			owner: USER,
			oid: 52,
			originalSize: "2",
			originalTriggerPx: "0",
			expectedSize: "1",
		});
		if (!action) throw new Error("Expected modification claim");
		getPendingTradingActionActions().markModificationAwaiting(action.id, now);
		act(() => root.render(createReconciliation()));
		const capturedTimer = timeoutSpy.mock.calls.find(
			([, delay]) => delay === TRADING_ACTION_CONFIRMATION_TIMEOUT_MS,
		)?.[0];
		expect(typeof capturedTimer).toBe("function");

		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		act(() => root.render(createReconciliation()));
		vi.setSystemTime(now + TRADING_ACTION_CONFIRMATION_TIMEOUT_MS);
		act(() => {
			if (typeof capturedTimer === "function") capturedTimer();
		});

		expect(getPendingTradingActionSnapshot().modifications[0]).toMatchObject({
			id: action.id,
			phase: "unconfirmed",
		});
		expect(mocks.errorToast).not.toHaveBeenCalled();
		expect(getOrderQueueItem(`pending-trading-action:${action.id}`)?.owner).toBe(USER);
		timeoutSpy.mockRestore();
	});
});
