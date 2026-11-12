// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { act, createElement, Fragment } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderToast } from "@/components/trade/tradebox/order-toast";
import { TwapReconciliation } from "@/components/trade/twap-reconciliation";
import { TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS, type TwapIntent } from "@/domain/trade/twap";
import {
	getOrderAssetReservationState,
	reserveOrderAssets,
	runWithOrderAssetLocks,
} from "@/lib/trade/order-asset-lock";
import * as twapReservations from "@/lib/trade/twap-order-asset-reservation";
import { getActiveTwapReservationId } from "@/lib/trade/twap-order-asset-reservation";
import {
	getOrderQueueItem,
	type OrderQueueItem,
	useOrderQueue,
	useOrderQueueActions,
} from "@/stores/use-order-queue-store";
import {
	getPendingTradingActionActions,
	getPendingTradingActionSnapshot,
	TRADING_ACTION_CONFIRMATION_TIMEOUT_MS,
} from "@/stores/use-pending-trading-action-store";
import { getPendingTwapActions, hasPendingTwapForAsset } from "@/stores/use-pending-twap-store";
import { createI18nRoot } from "./harness/react";

function expectActionFeedback(id: string, status: OrderQueueItem["status"], message: string) {
	const item = getOrderQueueItem(`pending-trading-action:${id}`);
	expect(item?.status).toBe(status);
	expect(item?.message ? i18n._(item.message) : null).toBe(message);
}

const USER = "0x1111111111111111111111111111111111111111" as const;
const TWAP_UNCONFIRMED = "Review active TWAP orders before retrying";
const ARABIC_TWAP_UNCONFIRMED = "راجع أوامر TWAP النشطة قبل إعادة المحاولة";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(TWAP_UNCONFIRMED)]: ARABIC_TWAP_UNCONFIRMED,
};

let queueItems: OrderQueueItem[] = [];
let queueActions: ReturnType<typeof useOrderQueueActions> | null = null;

function OrderQueueProbe() {
	queueItems = useOrderQueue();
	queueActions = useOrderQueueActions();
	return null;
}
function createReconciliation() {
	return createElement(Fragment, null, createElement(TwapReconciliation), createElement(OrderQueueProbe));
}

function QueueFeedback() {
	const orders = useOrderQueue();
	const actions = useOrderQueueActions();
	return createElement(
		Fragment,
		null,
		...orders.map((order) =>
			createElement(OrderToast, {
				key: order.id,
				order,
				onDismiss: () => actions.removeOrder(order.id),
			}),
		),
	);
}

const mocks = vi.hoisted(() => ({
	clientKey: "0x1111111111111111111111111111111111111111",
	activeData: undefined as
		| { dex: string; user: `0x${string}`; states: Array<[number, ReturnType<typeof createTwapState>]> }
		| undefined,
	historyData: undefined as
		| {
				user: `0x${string}`;
				isSnapshot: true;
				history: Array<{
					twapId: number;
					time: number;
					state: ReturnType<typeof createTwapState>;
					status:
						| { status: "finished" | "activated" | "waitingForTrigger" | "terminated" | "stopped" }
						| { status: "error"; description: string };
				}>;
		  }
		| undefined,
	activeLastMessageAt: undefined as number | undefined,
	activeMonotonicLastMessageAt: undefined as number | undefined,
	successToast: vi.fn(),
	errorToast: vi.fn(),
	warningToast: vi.fn(),
	infoToast: vi.fn(),
	dismissToast: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		success: mocks.successToast,
		error: mocks.errorToast,
		warning: mocks.warningToast,
		info: mocks.infoToast,
		dismiss: mocks.dismissToast,
	},
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ clientKey: mocks.clientKey, env: "Mainnet" }),
	useSubscription: (method: string) => ({
		data: method === "twapStates" ? mocks.activeData : mocks.historyData,
		status: "active",
		error: null,
		isStale: false,
		lastMessageAt: method === "twapStates" ? mocks.activeLastMessageAt : undefined,
		monotonicLastMessageAt: method === "twapStates" ? mocks.activeMonotonicLastMessageAt : undefined,
	}),
}));

function createTwapState(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		coin: "xyz:GOLD",
		executedNtl: "0",
		executedSz: "0",
		minutes: 30,
		randomize: true,
		reduceOnly: false,
		side: "B" as const,
		stopPx: null,
		sz: "1.25",
		timestamp: Date.now(),
		trigger: null,
		user: USER,
		...overrides,
	};
}

function addSubmission(
	options: {
		activeKnownIds?: number[];
		historyKnownIds?: number[];
		intent?: Partial<TwapIntent>;
		queueId?: string;
	} = {},
) {
	return getPendingTwapActions().add({
		env: "Mainnet",
		user: USER,
		queueId: options.queueId,
		intent: {
			assetId: 7,
			coin: "xyz:GOLD",
			side: "B",
			size: "1.2500",
			minutes: 30,
			reduceOnly: false,
			randomize: true,
			stopPx: null,
			trigger: null,
			...options.intent,
		},
		activeBaseline: { ready: true, knownIds: options.activeKnownIds ?? [] },
		historyBaseline: { ready: true, knownIds: options.historyKnownIds ?? [] },
	});
}

function installExclusiveLockManager(): void {
	const manager = {
		request<T>(name: string, _options: LockOptions, callback: (lock: Lock | null) => T | PromiseLike<T>): Promise<T> {
			return Promise.resolve(callback({ name, mode: "exclusive" } as Lock));
		},
	} as unknown as LockManager;
	Object.defineProperty(window.navigator, "locks", { configurable: true, value: manager });
}

async function reservePendingSubmission(
	submission: ReturnType<typeof addSubmission>,
	expiresAt = submission.createdAt + TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS,
): Promise<void> {
	await runWithOrderAssetLocks(
		{ env: submission.env, owner: submission.user, assetIds: [submission.intent.assetId] },
		async (lease) => {
			expect(
				reserveOrderAssets(lease, {
					submissionId: submission.id,
					intentKey: `twap:${submission.intent.assetId}`,
					exclusiveAssetLock: false,
					isRiskReducing: submission.intent.reduceOnly,
					createdAt: submission.createdAt,
					expiresAt,
				}),
			).toBe(true);
		},
	);
}

describe("TwapReconciliation", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-21T00:00:00Z"));
		i18n.loadAndActivate({ locale: "en", messages: {} });
		mocks.activeData = { dex: "", user: USER, states: [] };
		mocks.historyData = { user: USER, isSnapshot: true, history: [] };
		mocks.successToast.mockReset();
		mocks.errorToast.mockReset();
		mocks.warningToast.mockReset();
		mocks.infoToast.mockReset();
		mocks.dismissToast.mockReset();
		mocks.clientKey = USER;
		mocks.activeLastMessageAt = undefined;
		mocks.activeMonotonicLastMessageAt = undefined;
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
		getPendingTradingActionActions().reset();
		window.localStorage.clear();
		installExclusiveLockManager();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => {
			for (const item of queueItems) queueActions?.removeOrder(item.id);
		});
		queueItems = [];
		queueActions = null;
		act(() => root.unmount());
		container.remove();
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("waits for the in-flight request to settle, then accepts a new exact active TWAP ID", async () => {
		const submission = addSubmission({ activeKnownIds: [50] });
		getPendingTwapActions().markActive(submission.id);
		mocks.activeData = { dex: "", user: USER, states: [[51, createTwapState()]] };

		act(() => root.render(createReconciliation()));
		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(true);
		expect(mocks.successToast).not.toHaveBeenCalled();

		await act(async () => {
			getPendingTwapActions().clearActive(submission.id);
			await Promise.resolve();
		});
		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(false);
		expect(mocks.successToast).not.toHaveBeenCalled();
		expect(queueItems).toEqual([
			expect.objectContaining({ owner: USER, env: "Mainnet", status: "success", outcome: "twapStarted" }),
		]);
	});

	it("does not consume a TWAP ID that was already present in the pre-submit baseline", () => {
		addSubmission({ activeKnownIds: [52] });
		mocks.activeData = { dex: "", user: USER, states: [[52, createTwapState()]] };

		act(() => root.render(createReconciliation()));

		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(true);
		expect(mocks.successToast).not.toHaveBeenCalled();
	});

	it("prefers an exchange history error over an active snapshot for the same TWAP ID", async () => {
		addSubmission();
		const state = createTwapState();
		mocks.activeData = { dex: "", user: USER, states: [[53, state]] };
		mocks.historyData = {
			user: USER,
			isSnapshot: true,
			history: [
				{
					twapId: 53,
					time: Math.floor(Date.now() / 1000),
					state,
					status: { status: "error", description: "TWAP order rejected" },
				},
			],
		};

		await act(async () => {
			root.render(createReconciliation());
			await Promise.resolve();
		});

		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(false);
		expect(mocks.successToast).not.toHaveBeenCalled();
		expect(mocks.errorToast).not.toHaveBeenCalled();
		expect(queueItems).toEqual([
			expect.objectContaining({ owner: USER, env: "Mainnet", status: "failed", error: "TWAP order rejected" }),
		]);
	});

	it.each([
		["finished", "success", "TWAP finished"],
		["terminated", "canceled", "TWAP terminated"],
		["stopped", "canceled", "TWAP stopped"],
		["waitingForTrigger", "success", "TWAP waiting for trigger"],
	] as const)("reports late history %s instead of the older active snapshot", async (status, queueStatus, message) => {
		const submission = addSubmission();
		getPendingTwapActions().markUnconfirmed(submission.id, submission.createdAt + 1);
		const state = createTwapState();
		mocks.activeData = { dex: "", user: USER, states: [[53, state]] };
		mocks.historyData = {
			user: USER,
			isSnapshot: true,
			history: [{ twapId: 53, time: Math.floor(Date.now() / 1000), state, status: { status } }],
		};

		await act(async () => {
			root.render(createElement(Fragment, null, createReconciliation(), createElement(QueueFeedback)));
			await Promise.resolve();
		});

		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(false);
		expect(queueItems).toHaveLength(1);
		const item = queueItems[0];
		expect(item).toMatchObject({ id: `reconcile-${submission.id}`, owner: USER, env: "Mainnet", status: queueStatus });
		expect(item?.outcome).toBeUndefined();
		expect(item?.error).toBeUndefined();
		expect(item?.message ? i18n._(item.message) : null).toBe(message);
		expect(container.textContent).toContain(message);
		expect(container.textContent).not.toContain("Running");
		expect(container.textContent).not.toContain("Filled");

		act(() => i18n.loadAndActivate({ locale: "ar", messages: { [getMessageId(message)]: "حالة طلب TWAP المؤكدة" } }));
		expect(container.textContent).toContain("حالة طلب TWAP المؤكدة");
		expect(queueItems[0]?.id).toBe(item?.id);
	});

	it("ignores a new TWAP whose exchange fields do not match the submitted intent", () => {
		addSubmission();
		mocks.activeData = {
			dex: "",
			user: USER,
			states: [[54, createTwapState({ minutes: 60 })]],
		};

		act(() => root.render(createReconciliation()));

		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(true);
		expect(mocks.successToast).not.toHaveBeenCalled();
	});

	it("releases the TWAP lock and warns when positive reconciliation times out", async () => {
		const submission = addSubmission();
		await reservePendingSubmission(submission, submission.createdAt + 60 * 60_000);
		vi.setSystemTime(submission.createdAt + TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS);

		act(() => root.render(createReconciliation()));
		await act(() => vi.runOnlyPendingTimersAsync());

		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(false);
		expect(mocks.warningToast).not.toHaveBeenCalled();
		expect(queueItems).toEqual([
			expect.objectContaining({
				owner: USER,
				env: "Mainnet",
				status: "unconfirmed",
				error: { code: "twap-status-unconfirmed", kind: "order-reconciliation" },
			}),
		]);
		await runWithOrderAssetLocks({ env: "Mainnet", owner: USER, assetIds: [7] }, async (lease) => {
			expect(
				getOrderAssetReservationState(lease, {
					intentKey: "entry-after-timeout",
					exclusiveAssetLock: false,
					isRiskReducing: false,
				}),
			).toBe("clear");
		});
	});

	it("stores a locale-independent timeout error and retranslates the visible queue item", async () => {
		act(() => root.render(createElement(OrderQueueProbe)));
		if (!queueActions) throw new Error("Expected order queue actions");
		let queueId = "";
		act(() => {
			queueId =
				queueActions?.addOrder({
					owner: USER,
					env: "Mainnet",
					market: "GOLD",
					orderType: "twap",
					side: "buy",
					size: "1.25",
					status: "confirming",
				}) ?? "";
		});
		const submission = addSubmission({ queueId });
		vi.setSystemTime(submission.createdAt + TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS);

		await act(async () => {
			root.render(
				createElement(
					Fragment,
					null,
					createReconciliation(),
					createElement(OrderQueueProbe),
					createElement(QueueFeedback),
				),
			);
			await Promise.resolve();
		});
		expect(queueItems).toEqual([
			expect.objectContaining({
				id: queueId,
				status: "unconfirmed",
				error: { kind: "order-reconciliation", code: "twap-status-unconfirmed" },
			}),
		]);
		expect(document.body.textContent).toContain(TWAP_UNCONFIRMED);

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(document.body.textContent).toContain(ARABIC_TWAP_UNCONFIRMED);
	});

	it("releases the TWAP lock while the wallet is disconnected and reports it once the account returns", () => {
		const submission = addSubmission();
		mocks.clientKey = "disconnected";
		vi.setSystemTime(submission.createdAt + TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS);

		act(() => root.render(createReconciliation()));
		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(false);

		mocks.clientKey = USER;
		act(() => root.render(createReconciliation()));

		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(false);
		expect(mocks.warningToast).not.toHaveBeenCalled();
		expect(queueItems).toEqual([
			expect.objectContaining({
				owner: USER,
				env: "Mainnet",
				status: "unconfirmed",
				error: { code: "twap-status-unconfirmed", kind: "order-reconciliation" },
			}),
		]);
	});

	it("accepts a late matching TWAP after the local hard lock has been released", async () => {
		const submission = addSubmission();
		getPendingTwapActions().markUnconfirmed(submission.id, submission.createdAt + 1);
		mocks.activeData = { dex: "", user: USER, states: [[55, createTwapState()]] };

		await act(async () => {
			root.render(createReconciliation());
			await Promise.resolve();
		});

		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(false);
		expect(mocks.successToast).not.toHaveBeenCalled();
		expect(queueItems).toEqual([
			expect.objectContaining({ owner: USER, env: "Mainnet", status: "success", outcome: "twapStarted" }),
		]);
		expect(getOrderQueueItem(`reconcile-${submission.id}`)?.error).toBeUndefined();
	});

	it("restores an in-progress TWAP notification from the persisted intent", () => {
		const submission = addSubmission();

		act(() => root.render(createReconciliation()));

		expect(getOrderQueueItem(`reconcile-${submission.id}`)).toMatchObject({
			owner: USER,
			env: "Mainnet",
			market: "xyz:GOLD",
			side: "buy",
			size: "1.2500",
			orderType: "twap",
			status: "confirming",
		});
		expect(mocks.infoToast).not.toHaveBeenCalled();
	});

	it("keeps a late coordinated TWAP result scoped to its owner after switching accounts", async () => {
		let settle!: (coordinated: boolean) => void;
		vi.spyOn(twapReservations, "reconcileTwapOrderAssetReservation").mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					settle = resolve;
				}),
		);
		const submission = addSubmission();
		mocks.activeData = { dex: "", user: USER, states: [[70, createTwapState()]] };
		act(() => root.render(createReconciliation()));
		expect(getOrderQueueItem(`reconcile-${submission.id}`)?.status).toBe("confirming");

		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		act(() => root.render(createReconciliation()));
		await act(async () => {
			settle(true);
		});

		expect(getOrderQueueItem(`reconcile-${submission.id}`)).toMatchObject({
			owner: USER,
			env: "Mainnet",
			status: "success",
			outcome: "twapStarted",
		});
		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(false);
		expect(mocks.successToast).not.toHaveBeenCalled();
	});

	it("promotes a reconciled active TWAP beyond the short confirmation window", async () => {
		const submission = addSubmission();
		await reservePendingSubmission(submission);
		mocks.activeData = { dex: "", user: USER, states: [[56, createTwapState()]] };

		await act(async () => {
			root.render(createReconciliation());
			await Promise.resolve();
		});
		vi.setSystemTime(submission.createdAt + TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS + 1);

		await runWithOrderAssetLocks({ env: "Mainnet", owner: USER, assetIds: [7] }, async (lease) => {
			expect(
				getOrderAssetReservationState(lease, {
					intentKey: "position-close",
					exclusiveAssetLock: true,
					isRiskReducing: true,
				}),
			).toBe("conflict");
		});
	});

	it("keeps a waiting-for-trigger TWAP reserved beyond the short confirmation window", async () => {
		const trigger = { px: "2500", above: true };
		const submission = addSubmission({ intent: { trigger } });
		await reservePendingSubmission(submission);
		mocks.historyData = {
			user: USER,
			isSnapshot: true,
			history: [
				{
					twapId: 59,
					time: Math.floor(Date.now() / 1000),
					state: createTwapState({ trigger }),
					status: { status: "waitingForTrigger" },
				},
			],
		};

		await act(async () => {
			root.render(createReconciliation());
			await Promise.resolve();
		});
		vi.setSystemTime(submission.createdAt + TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS + 1);

		await runWithOrderAssetLocks({ env: "Mainnet", owner: USER, assetIds: [7] }, async (lease) => {
			expect(
				getOrderAssetReservationState(lease, {
					intentKey: "position-close",
					exclusiveAssetLock: true,
					isRiskReducing: true,
				}),
			).toBe("conflict");
		});
	});

	it("keeps the pending submission when active TWAP promotion storage fails", async () => {
		const submission = addSubmission();
		await reservePendingSubmission(submission, submission.createdAt + 60 * 60_000);
		const nativeSetItem = Storage.prototype.setItem;
		const storageSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
			if (key.startsWith("sairn-order-asset-reservations") && value.includes("active-twap:58")) {
				throw new Error("storage unavailable");
			}
			return nativeSetItem.call(this, key, value);
		});
		mocks.activeData = { dex: "", user: USER, states: [[58, createTwapState()]] };

		await act(async () => {
			root.render(createReconciliation());
			await Promise.resolve();
		});

		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(true);
		expect(mocks.successToast).not.toHaveBeenCalled();
		await runWithOrderAssetLocks({ env: "Mainnet", owner: USER, assetIds: [7] }, async (lease) => {
			expect(
				getOrderAssetReservationState(lease, {
					intentKey: "position-close",
					exclusiveAssetLock: true,
					isRiskReducing: true,
				}),
			).toBe("conflict");
		});
		storageSpy.mockRestore();
	});

	it("releases a pending asset reservation when TWAP history reports stopped", async () => {
		const submission = addSubmission();
		await reservePendingSubmission(submission, submission.createdAt + 60 * 60_000);
		mocks.historyData = {
			user: USER,
			isSnapshot: true,
			history: [
				{
					twapId: 57,
					time: Math.floor(Date.now() / 1000),
					state: createTwapState(),
					status: { status: "stopped" },
				},
			],
		};

		await act(async () => {
			root.render(createReconciliation());
			await Promise.resolve();
		});

		await runWithOrderAssetLocks({ env: "Mainnet", owner: USER, assetIds: [7] }, async (lease) => {
			expect(
				getOrderAssetReservationState(lease, {
					intentKey: "entry-after-stop",
					exclusiveAssetLock: false,
					isRiskReducing: false,
				}),
			).toBe("clear");
		});
	});

	it("releases the active TWAP reservation before confirming a cancellation from a fresh snapshot", async () => {
		const now = Date.now();
		const monotonicNow = performance.now();
		const twapId = 60;
		await runWithOrderAssetLocks({ env: "Mainnet", owner: USER, assetIds: [7] }, async (lease) => {
			expect(
				reserveOrderAssets(lease, {
					submissionId: getActiveTwapReservationId(twapId),
					intentKey: "active-twap-test",
					exclusiveAssetLock: false,
					isRiskReducing: false,
					createdAt: now,
					expiresAt: now + 60_000,
				}),
			).toBe(true);
		});
		const cancellation = getPendingTradingActionActions().claimTwapCancellation({
			env: "Mainnet",
			owner: USER,
			twapId,
			assetId: 7,
		});
		if (!cancellation) throw new Error("Expected TWAP cancellation claim");
		getPendingTradingActionActions().markTwapCancellationRequestStarted(cancellation.id, now - 2, monotonicNow - 2);
		getPendingTradingActionActions().markTwapCancellationAccepted(cancellation.id, now - 1, monotonicNow - 1);
		mocks.activeLastMessageAt = now;
		mocks.activeMonotonicLastMessageAt = monotonicNow;

		await act(async () => {
			root.render(createReconciliation());
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(getPendingTradingActionSnapshot().twapCancellations).toHaveLength(0);
		expectActionFeedback(cancellation.id, "success", "Terminated");
		await runWithOrderAssetLocks({ env: "Mainnet", owner: USER, assetIds: [7] }, async (lease) => {
			expect(
				getOrderAssetReservationState(lease, {
					intentKey: "entry-after-cancel",
					exclusiveAssetLock: false,
					isRiskReducing: false,
				}),
			).toBe("clear");
		});
	});

	it("confirms a TWAP cancellation from a snapshot received after the system clock was set back", async () => {
		const twapId = 65;
		await runWithOrderAssetLocks({ env: "Mainnet", owner: USER, assetIds: [7] }, async (lease) => {
			expect(
				reserveOrderAssets(lease, {
					submissionId: getActiveTwapReservationId(twapId),
					intentKey: "active-twap-rollback-test",
					exclusiveAssetLock: false,
					isRiskReducing: false,
					createdAt: Date.now(),
					expiresAt: Date.now() + 60_000,
				}),
			).toBe(true);
		});
		const cancellation = getPendingTradingActionActions().claimTwapCancellation({
			env: "Mainnet",
			owner: USER,
			twapId,
			assetId: 7,
		});
		if (!cancellation) throw new Error("Expected TWAP cancellation claim");
		getPendingTradingActionActions().markTwapCancellationRequestStarted(cancellation.id);
		getPendingTradingActionActions().markTwapCancellationAccepted(cancellation.id);

		vi.setSystemTime(Date.now() - 60 * 60_000);
		await act(() => vi.advanceTimersByTimeAsync(1_000));
		mocks.activeLastMessageAt = Date.now();
		mocks.activeMonotonicLastMessageAt = performance.now();
		await act(async () => {
			root.render(createReconciliation());
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(getPendingTradingActionSnapshot().twapCancellations).toHaveLength(0);
		expectActionFeedback(cancellation.id, "success", "Terminated");
	});

	it("times out an awaiting TWAP cancellation after the usual window when the system clock was set back", async () => {
		const cancellation = getPendingTradingActionActions().claimTwapCancellation({
			env: "Mainnet",
			owner: USER,
			twapId: 66,
			assetId: 7,
		});
		if (!cancellation) throw new Error("Expected TWAP cancellation claim");
		getPendingTradingActionActions().markTwapCancellationRequestStarted(cancellation.id);
		getPendingTradingActionActions().markTwapCancellationAccepted(cancellation.id);
		act(() => root.render(createReconciliation()));

		vi.setSystemTime(Date.now() - 60 * 60_000);
		await act(() => vi.advanceTimersByTimeAsync(TRADING_ACTION_CONFIRMATION_TIMEOUT_MS - 1));
		expect(getPendingTradingActionSnapshot().twapCancellations[0]?.phase).toBe("awaiting");

		await act(() => vi.advanceTimersByTimeAsync(1));
		expect(getPendingTradingActionSnapshot().twapCancellations[0]?.phase).toBe("unconfirmed");
		expectActionFeedback(
			cancellation.id,
			"unconfirmed",
			"TWAP termination was submitted, but its status could not be confirmed. Check active TWAPs before retrying.",
		);
	});

	it("does not use a pre-unconfirmed active snapshot to release a TWAP cancellation", async () => {
		const now = Date.now();
		const monotonicNow = performance.now();
		const twapId = 64;
		const cancellation = getPendingTradingActionActions().claimTwapCancellation({
			env: "Mainnet",
			owner: USER,
			twapId,
			assetId: 7,
		});
		if (!cancellation) throw new Error("Expected TWAP cancellation claim");
		getPendingTradingActionActions().markTwapCancellationRequestStarted(cancellation.id, now - 2, monotonicNow - 2);
		getPendingTradingActionActions().markTwapCancellationUnconfirmed(cancellation.id, now, monotonicNow);
		mocks.activeData = { dex: "", user: USER, states: [[twapId, createTwapState()]] };
		mocks.activeLastMessageAt = now - 1;
		mocks.activeMonotonicLastMessageAt = monotonicNow - 1;

		await act(async () => {
			root.render(createReconciliation());
			await Promise.resolve();
		});
		expect(getPendingTradingActionSnapshot().twapCancellations).toHaveLength(1);
		expect(mocks.infoToast).not.toHaveBeenCalled();

		mocks.activeData = { dex: "", user: USER, states: [[twapId, createTwapState()]] };
		mocks.activeLastMessageAt = now + 1;
		mocks.activeMonotonicLastMessageAt = monotonicNow + 1;
		await act(async () => {
			root.render(createReconciliation());
			await Promise.resolve();
		});
		expect(getPendingTradingActionSnapshot().twapCancellations).toHaveLength(0);
		expectActionFeedback(
			cancellation.id,
			"unconfirmed",
			"TWAP termination was not confirmed. Review active TWAPs before retrying.",
		);
	});

	it("retains a confirmed TWAP cancellation until reservation release can be retried", async () => {
		const now = Date.now();
		const monotonicNow = performance.now();
		const cancellation = getPendingTradingActionActions().claimTwapCancellation({
			env: "Mainnet",
			owner: USER,
			twapId: 61,
			assetId: 7,
		});
		if (!cancellation) throw new Error("Expected TWAP cancellation claim");
		getPendingTradingActionActions().markTwapCancellationRequestStarted(cancellation.id, now - 2, monotonicNow - 2);
		getPendingTradingActionActions().markTwapCancellationAccepted(cancellation.id, now - 1, monotonicNow - 1);
		mocks.activeLastMessageAt = now;
		mocks.activeMonotonicLastMessageAt = monotonicNow;
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });

		await act(async () => {
			root.render(createReconciliation());
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(getPendingTradingActionSnapshot().twapCancellations).toHaveLength(1);
		expect(mocks.successToast).not.toHaveBeenCalled();

		installExclusiveLockManager();
		await act(() => vi.advanceTimersByTimeAsync(1_000));

		expect(getPendingTradingActionSnapshot().twapCancellations).toHaveLength(0);
		expectActionFeedback(cancellation.id, "success", "Terminated");
	});

	it("stops a scheduled reservation-release retry after the action is reset", async () => {
		const now = Date.now();
		const monotonicNow = performance.now();
		const cancellation = getPendingTradingActionActions().claimTwapCancellation({
			env: "Mainnet",
			owner: USER,
			twapId: 62,
			assetId: 7,
		});
		if (!cancellation) throw new Error("Expected TWAP cancellation claim");
		getPendingTradingActionActions().markTwapCancellationRequestStarted(cancellation.id, now - 2, monotonicNow - 2);
		getPendingTradingActionActions().markTwapCancellationAccepted(cancellation.id, now - 1, monotonicNow - 1);
		mocks.activeLastMessageAt = now;
		mocks.activeMonotonicLastMessageAt = monotonicNow;
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });

		await act(async () => {
			root.render(createReconciliation());
			await Promise.resolve();
			await Promise.resolve();
		});
		act(() => getPendingTradingActionActions().reset());
		installExclusiveLockManager();
		await act(() => vi.advanceTimersByTimeAsync(1_000));

		expect(getPendingTradingActionSnapshot().twapCancellations).toHaveLength(0);
		expect(mocks.successToast).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("bounds reservation-release retries while preserving the pending cancellation", async () => {
		const now = Date.now();
		const monotonicNow = performance.now();
		const cancellation = getPendingTradingActionActions().claimTwapCancellation({
			env: "Mainnet",
			owner: USER,
			twapId: 63,
			assetId: 7,
		});
		if (!cancellation) throw new Error("Expected TWAP cancellation claim");
		getPendingTradingActionActions().markTwapCancellationRequestStarted(cancellation.id, now - 2, monotonicNow - 2);
		getPendingTradingActionActions().markTwapCancellationUnconfirmed(cancellation.id, now - 1, monotonicNow - 1);
		mocks.historyData = {
			user: USER,
			isSnapshot: true,
			history: [{ twapId: 63, time: now, state: createTwapState(), status: { status: "terminated" } }],
		};
		mocks.activeLastMessageAt = now;
		mocks.activeMonotonicLastMessageAt = monotonicNow;
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });

		await act(async () => {
			root.render(createReconciliation());
			await Promise.resolve();
			await Promise.resolve();
		});
		await act(() => vi.advanceTimersByTimeAsync(3_000));

		expect(getPendingTradingActionSnapshot().twapCancellations).toEqual([
			expect.objectContaining({ id: cancellation.id, twapId: 63, assetId: 7 }),
		]);
		expect(mocks.successToast).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});
	it("leaves another tab's in-flight TWAP to that tab and takes it over once that tab is gone", async () => {
		const otherTabId = "other-tab-twap";
		const lockName = `sairn-pending-twap-owner-v1:${otherTabId}`;
		let releaseOtherTab: (() => void) | undefined;
		const waiting: Array<() => void> = [];
		const manager = {
			request(name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown) {
				const run = () => Promise.resolve(callback({ name, mode: "exclusive" } as Lock));
				if (name !== lockName || !releaseOtherTab) return run();
				return new Promise((resolve) => waiting.push(() => resolve(run())));
			},
		} as unknown as LockManager;
		releaseOtherTab = () => {
			releaseOtherTab = undefined;
			waiting.shift()?.();
		};
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: manager });
		const template = addSubmission();
		const templateKey = Object.keys(window.localStorage).find((key) => key.endsWith(template.id));
		if (!templateKey) throw new Error("Expected persisted TWAP submission");
		const otherTabKey = templateKey.replace(template.id, otherTabId);
		const otherTabRecord = JSON.stringify({ ...template, id: otherTabId, queueId: undefined });
		act(() => getPendingTwapActions().remove(template.id));
		act(() => root.render(createReconciliation()));

		act(() => {
			window.localStorage.setItem(otherTabKey, otherTabRecord);
			window.dispatchEvent(new StorageEvent("storage", { key: otherTabKey }));
		});
		await act(async () => {
			await Promise.resolve();
		});
		expect(getOrderQueueItem(`reconcile-${otherTabId}`)).toBeUndefined();

		await act(async () => {
			releaseOtherTab?.();
			for (let index = 0; index < 5; index += 1) await Promise.resolve();
		});
		expect(getOrderQueueItem(`reconcile-${otherTabId}`)).toMatchObject({ owner: USER, status: "confirming" });
	});

	describe("a TWAP termination whose outcome the exchange did not confirm", () => {
		const NEUTRAL = "TWAP is no longer active. Check TWAP history before retrying.";
		type HistoryStatus = "terminated" | "finished" | "activated";

		function setHistory(entries: Array<{ twapId: number; status: HistoryStatus }>) {
			mocks.historyData = {
				user: USER,
				isSnapshot: true,
				history: entries.map(({ twapId, status }) => ({
					twapId,
					time: Date.now(),
					state: createTwapState(),
					status: { status },
				})),
			};
		}

		async function renderWithoutActiveTwap(twapId: number) {
			const now = Date.now();
			const monotonicNow = performance.now();
			const cancellation = getPendingTradingActionActions().claimTwapCancellation({
				env: "Mainnet",
				owner: USER,
				twapId,
				assetId: 7,
			});
			if (!cancellation) throw new Error("Expected TWAP cancellation claim");
			getPendingTradingActionActions().markTwapCancellationRequestStarted(cancellation.id, now - 2, monotonicNow - 2);
			getPendingTradingActionActions().markTwapCancellationUnconfirmed(cancellation.id, now - 1, monotonicNow - 1);
			mocks.activeLastMessageAt = now;
			mocks.activeMonotonicLastMessageAt = monotonicNow;
			await act(async () => {
				root.render(createReconciliation());
				await Promise.resolve();
				await Promise.resolve();
			});
			return cancellation;
		}

		async function settleUnconfirmedTermination(twapId: number, status: HistoryStatus) {
			setHistory([{ twapId, status }]);
			const cancellation = await renderWithoutActiveTwap(twapId);
			expect(getPendingTradingActionSnapshot().twapCancellations).toHaveLength(0);
			return cancellation;
		}

		it("reports Terminated when the TWAP history shows the termination", async () => {
			const cancellation = await settleUnconfirmedTermination(90, "terminated");
			expectActionFeedback(cancellation.id, "success", "Terminated");
		});

		it("reports a TWAP that finished instead of being terminated", async () => {
			const cancellation = await settleUnconfirmedTermination(91, "finished");
			expectActionFeedback(cancellation.id, "failed", "TWAP finished before it could be terminated.");
		});

		it("reads only the history entry of the terminated TWAP", async () => {
			setHistory([
				{ twapId: 99, status: "finished" },
				{ twapId: 94, status: "terminated" },
			]);
			const cancellation = await renderWithoutActiveTwap(94);
			expectActionFeedback(cancellation.id, "success", "Terminated");
		});

		it("waits for history that arrives after the active list, then reports how the TWAP ended", async () => {
			setHistory([{ twapId: 95, status: "activated" }]);
			const cancellation = await renderWithoutActiveTwap(95);
			expect(getPendingTradingActionSnapshot().twapCancellations).toHaveLength(1);
			expect(getOrderQueueItem(`pending-trading-action:${cancellation.id}`)?.status).toBe("unconfirmed");
			expect(getOrderQueueItem(`pending-trading-action:${cancellation.id}`)?.message).toBeDefined();

			setHistory([
				{ twapId: 95, status: "activated" },
				{ twapId: 95, status: "finished" },
			]);
			act(() => root.render(createReconciliation()));
			await act(() => vi.advanceTimersByTimeAsync(1_000));

			expect(getPendingTradingActionSnapshot().twapCancellations).toHaveLength(0);
			expectActionFeedback(cancellation.id, "failed", "TWAP finished before it could be terminated.");
		});

		it("stays neutral once the confirmation window passes without a final history entry", async () => {
			setHistory([{ twapId: 93, status: "activated" }]);
			const cancellation = await renderWithoutActiveTwap(93);
			await act(() => vi.advanceTimersByTimeAsync(TRADING_ACTION_CONFIRMATION_TIMEOUT_MS - 1_000));
			expect(getPendingTradingActionSnapshot().twapCancellations).toHaveLength(1);

			await act(() => vi.advanceTimersByTimeAsync(1_000));
			expect(getPendingTradingActionSnapshot().twapCancellations).toHaveLength(0);
			expectActionFeedback(cancellation.id, "unconfirmed", NEUTRAL);
			expect(vi.getTimerCount()).toBe(0);
		});
	});
});
