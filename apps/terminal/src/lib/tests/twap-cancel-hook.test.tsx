// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { ApiRequestError, HttpRequestError } from "@nktkas/hyperliquid";
import { EXCHANGE_ACTION_START_DEADLINE_MS } from "@sairn/hl-react/internal/exchange/request-scheduler";
import { act, createElement, Fragment } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TwapReconciliation } from "@/components/trade/twap-reconciliation";
import { useTwapCancel } from "@/hooks/trade/use-twap-cancel";
import {
	getOrderAssetReservationState,
	reserveOrderAssets,
	runWithOrderAssetLocks,
} from "@/lib/trade/order-asset-lock";
import { getActiveTwapReservationId } from "@/lib/trade/twap-order-asset-reservation";
import {
	getOrderQueueItem,
	type OrderQueueItem,
	removeOrderQueueItem,
	useOrderQueue,
} from "@/stores/use-order-queue-store";
import {
	getPendingTradingActionActions,
	getPendingTradingActionSnapshot,
} from "@/stores/use-pending-trading-action-store";
import { createI18nRoot } from "./harness/react";

const USER = "0x1111111111111111111111111111111111111111" as const;
const MARKET_UNAVAILABLE_MESSAGE = "Unable to identify this TWAP market. Refresh market data before retrying.";
const MARKET_UNAVAILABLE_MESSAGE_AR = "تعذر تحديد سوق TWAP هذا. حدّث بيانات السوق قبل إعادة المحاولة.";

const CANCEL_FAILED_MESSAGE = "Failed to terminate TWAP.";
const CANCEL_FAILED_MESSAGE_AR = "تعذر إنهاء TWAP.";
const NOT_SENT_IN_TIME_MESSAGE = "The checks before this request took too long. Nothing was signed or sent. Try again.";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(MARKET_UNAVAILABLE_MESSAGE)]: MARKET_UNAVAILABLE_MESSAGE_AR,
	[getMessageId(CANCEL_FAILED_MESSAGE)]: CANCEL_FAILED_MESSAGE_AR,
};

function twapCancelRejection(text: string) {
	return new ApiRequestError(
		{ status: "ok", response: { type: "twapCancel", data: { status: { error: text } } } },
		text,
	);
}

const mocks = vi.hoisted(() => ({
	assetId: 7 as number | undefined,
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	mutateAsync: vi.fn(),
	exchange: vi.fn(),
	beforeSdkBoundary: vi.fn(),
	sdkParamsOverride: {} as Partial<{ a: number; t: number }>,
	guardPassesBeforeMutation: 2,
	reset: vi.fn(),
	successToast: vi.fn(),
	errorToast: vi.fn(),
	warningToast: vi.fn(),
	activeTwaps: undefined as { states: Array<[number, unknown]> } | undefined,
	activeTwapsReceivedAt: undefined as number | undefined,
	twapHistory: undefined as
		| { user: string; history: Array<{ twapId: number; status: { status: string } }> }
		| undefined,
}));

vi.mock("sonner", () => ({
	toast: { success: mocks.successToast, error: mocks.errorToast, warning: mocks.warningToast },
}));

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: (method: string, options?: { executionGuard?: (params: { a: number; t: number }) => void }) => {
		mocks.exchange(method, options);
		return {
			mutateAsync: async (params: { a: number; t: number }) => {
				const requestParams = { ...params, ...mocks.sdkParamsOverride };
				for (let pass = 0; pass < mocks.guardPassesBeforeMutation; pass += 1) {
					if (pass === 1) await mocks.beforeSdkBoundary();
					options?.executionGuard?.(requestParams);
				}
				return mocks.mutateAsync(requestParams);
			},
			reset: mocks.reset,
		};
	},
	useHyperliquid: () => ({ clientKey: mocks.clientKey, env: mocks.env }),
	useMarkets: () => ({ getAssetId: () => mocks.assetId }),
	useSubscription: (method: string) => ({
		data: method === "twapStates" ? mocks.activeTwaps : mocks.twapHistory,
		status: "active",
		isStale: false,
		monotonicLastMessageAt: method === "twapStates" ? mocks.activeTwapsReceivedAt : undefined,
	}),
}));

let queueItems: OrderQueueItem[] = [];
let hookValue: ReturnType<typeof useTwapCancel> | null = null;

function Probe() {
	queueItems = useOrderQueue();
	hookValue = useTwapCancel();
	return null;
}

function installExclusiveLockManager(): void {
	const manager = {
		request<T>(name: string, _options: LockOptions, callback: (lock: Lock | null) => T | PromiseLike<T>): Promise<T> {
			return Promise.resolve(callback({ name, mode: "exclusive" } as Lock));
		},
	} as unknown as LockManager;
	Object.defineProperty(window.navigator, "locks", { configurable: true, value: manager });
}

function installQueueingLockManager(): { abandonedWaits: () => number } {
	const held = new Set<string>();
	const waiters = new Map<string, Array<() => void>>();
	let abandoned = 0;
	const manager = {
		async request<T>(
			name: string,
			options: LockOptions,
			callback: (lock: Lock | null) => T | PromiseLike<T>,
		): Promise<T> {
			if (held.has(name)) {
				if (options.ifAvailable) return callback(null);
				await new Promise<void>((resolve, reject) => {
					const signal = options.signal;
					function grant() {
						signal?.removeEventListener("abort", abandon);
						resolve();
					}
					function abandon() {
						abandoned += 1;
						waiters.set(
							name,
							(waiters.get(name) ?? []).filter((waiter) => waiter !== grant),
						);
						reject(new DOMException("The lock request was aborted.", "AbortError"));
					}
					signal?.addEventListener("abort", abandon, { once: true });
					waiters.set(name, [...(waiters.get(name) ?? []), grant]);
				});
			}
			held.add(name);
			try {
				return await callback({ name, mode: "exclusive" } as Lock);
			} finally {
				const next = waiters.get(name)?.shift();
				if (next) next();
				else held.delete(name);
			}
		},
	} as unknown as LockManager;
	Object.defineProperty(window.navigator, "locks", { configurable: true, value: manager });
	return { abandonedWaits: () => abandoned };
}

function holdAssetLock(): { release: () => Promise<void> } {
	let open = () => {};
	const gate = new Promise<void>((resolve) => {
		open = resolve;
	});
	const holder = runWithOrderAssetLocks({ env: "Mainnet", owner: USER, assetIds: [7] }, () => gate);
	return {
		release: async () => {
			open();
			await holder;
		},
	};
}

async function flushMicrotasks(): Promise<void> {
	for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

describe("useTwapCancel", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		getPendingTradingActionActions().reset();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		mocks.assetId = 7;
		mocks.clientKey = USER;
		mocks.env = "Mainnet";
		mocks.guardPassesBeforeMutation = 2;
		mocks.mutateAsync.mockReset();
		mocks.exchange.mockReset();
		mocks.beforeSdkBoundary.mockReset();
		mocks.sdkParamsOverride = {};
		mocks.reset.mockReset();
		mocks.successToast.mockReset();
		mocks.errorToast.mockReset();
		mocks.warningToast.mockReset();
		mocks.activeTwaps = undefined;
		mocks.activeTwapsReceivedAt = undefined;
		mocks.twapHistory = undefined;
		window.localStorage.clear();
		installExclusiveLockManager();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(createElement(Probe)));
	});

	afterEach(() => {
		vi.useRealTimers();
		act(() => {
			for (const item of queueItems) removeOrderQueueItem(item.id);
			root.unmount();
		});
		queueItems = [];
		container.remove();
		hookValue = null;
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
	});

	it("submits the exact SDK fields and waits for a fresh TWAP snapshot", async () => {
		mocks.mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "twapCancel", data: { status: "success" } },
		});

		await act(async () => {
			await hookValue?.cancelTwap("xyz:GOLD", 42);
		});

		expect(mocks.exchange).toHaveBeenLastCalledWith("twapCancel", { executionGuard: expect.any(Function) });
		expect(mocks.mutateAsync).toHaveBeenCalledWith({ a: 7, t: 42 });
		expect(getPendingTradingActionSnapshot().twapCancellations[0]).toMatchObject({
			phase: "awaiting",
			accepted: true,
			requestStartedAt: expect.any(Number),
		});
		expect(mocks.successToast).not.toHaveBeenCalled();
		expect(hookValue?.cancellingTwapId).toBe(42);
		expect(hookValue?.feedback).toBeNull();
	});

	it.each([
		{ clientKey: "0x2222222222222222222222222222222222222222", env: "Mainnet" },
		{ clientKey: USER, env: "Testnet" },
		{ clientKey: "disconnected", env: "Mainnet" },
	] as const)("blocks the SDK request if identity changes after the first guard: %o", async (identity) => {
		let releaseBoundary = () => {};
		mocks.beforeSdkBoundary.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				releaseBoundary = resolve;
			}),
		);
		let cancellation: Promise<void> | undefined;
		await act(async () => {
			cancellation = hookValue?.cancelTwap("BTC", 42);
			await Promise.resolve();
		});
		expect(mocks.beforeSdkBoundary).toHaveBeenCalledOnce();
		Object.assign(mocks, identity);
		act(() => root.render(createElement(Probe)));
		await act(async () => {
			releaseBoundary();
			await cancellation;
		});
		expect(mocks.mutateAsync).not.toHaveBeenCalled();
		expect(getPendingTradingActionSnapshot().twapCancellations).toEqual([]);
		expect(hookValue?.feedback).toBeNull();
		expect(mocks.errorToast).not.toHaveBeenCalled();
	});

	it.each([{ a: 8 }, { t: 99 }])("blocks modified SDK cancellation fields: %o", async (fields) => {
		mocks.sdkParamsOverride = fields;
		await act(async () => {
			await hookValue?.cancelTwap("BTC", 42);
		});
		expect(mocks.mutateAsync).not.toHaveBeenCalled();
		expect(getPendingTradingActionSnapshot().twapCancellations).toEqual([]);
		expect(hookValue?.feedback?.tone).toBe("error");
	});

	it("blocks a cancellation whose pending claim is invalidated before the SDK boundary", async () => {
		mocks.beforeSdkBoundary.mockImplementationOnce(() => {
			const action = getPendingTradingActionSnapshot().twapCancellations[0];
			if (!action) throw new Error("Expected a claimed cancellation");
			getPendingTradingActionActions().resolveTwapCancellation(action.id);
		});
		await act(async () => {
			await hookValue?.cancelTwap("BTC", 42);
		});
		expect(mocks.mutateAsync).not.toHaveBeenCalled();
		expect(hookValue?.feedback?.tone).toBe("error");
	});

	it("fails closed when the selected market has no resolved asset ID", async () => {
		mocks.assetId = undefined;

		await act(async () => {
			await hookValue?.cancelTwap("missing:COIN", 43);
		});

		expect(mocks.mutateAsync).not.toHaveBeenCalled();
		expect(mocks.errorToast).toHaveBeenCalledOnce();
		expect(queueItems).toHaveLength(0);
		expect(hookValue?.feedback?.tone).toBe("error");
	});

	it("retranslates stored client feedback when the locale changes", async () => {
		mocks.assetId = undefined;

		await act(async () => {
			await hookValue?.cancelTwap("missing:COIN", 43);
		});

		expect(hookValue?.feedback).toEqual({ tone: "error", message: MARKET_UNAVAILABLE_MESSAGE });
		expect(mocks.mutateAsync).not.toHaveBeenCalled();

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));

		expect(hookValue?.feedback).toEqual({ tone: "error", message: MARKET_UNAVAILABLE_MESSAGE_AR });
		expect(mocks.mutateAsync).not.toHaveBeenCalled();
	});

	it("reports a transport timeout as unconfirmed instead of a definitive cancellation failure", async () => {
		mocks.mutateAsync.mockRejectedValueOnce(new HttpRequestError({ detail: "Request timed out after 10000 ms" }));

		await act(async () => {
			await hookValue?.cancelTwap("BTC", 44);
		});

		expect(mocks.warningToast).not.toHaveBeenCalled();
		expect(queueItems.at(-1)).toMatchObject({ owner: USER, env: "Mainnet", status: "unconfirmed" });
		expect(mocks.errorToast).not.toHaveBeenCalled();
		expect(hookValue?.feedback?.tone).toBe("warning");
		await act(async () => {
			await hookValue?.cancelTwap("BTC", 44);
		});
		expect(mocks.mutateAsync).toHaveBeenCalledOnce();
		act(() => getPendingTradingActionActions().reset());
		expect(hookValue?.feedback).toBeNull();
	});

	it("releases the action when a transport-shaped error occurs before the SDK boundary", async () => {
		mocks.guardPassesBeforeMutation = 1;
		mocks.mutateAsync.mockRejectedValueOnce(new HttpRequestError({ detail: "Legal status unavailable" }));

		await act(async () => {
			await hookValue?.cancelTwap("BTC", 48);
		});

		expect(mocks.warningToast).not.toHaveBeenCalled();
		expect(mocks.errorToast).not.toHaveBeenCalled();
		expect(queueItems.at(-1)).toMatchObject({ owner: USER, env: "Mainnet", status: "failed" });
		expect(hookValue?.cancellingTwapId).toBeNull();
		expect(hookValue?.feedback?.tone).toBe("error");
	});

	it("surfaces a definitive exchange or HTTP rejection", async () => {
		mocks.mutateAsync.mockRejectedValueOnce(twapCancelRejection("TWAP 45 is not active"));

		await act(async () => {
			await hookValue?.cancelTwap("ETH", 45);
		});

		expect(mocks.errorToast).not.toHaveBeenCalled();
		expect(queueItems.at(-1)).toMatchObject({
			status: "failed",
			error: { kind: "exchange-error", entries: [{ text: "TWAP 45 is not active" }] },
		});
		expect(hookValue?.feedback).toEqual({ tone: "error", message: "TWAP 45 is not active" });

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));

		expect(hookValue?.feedback).toEqual({ tone: "error", message: "TWAP 45 is not active" });
	});

	it("never shows an unrecognised error untranslated and translates its fallback when displayed", async () => {
		mocks.mutateAsync.mockRejectedValueOnce(new Error("TWAP cancel request no longer matches"));

		await act(async () => {
			await hookValue?.cancelTwap("ETH", 49);
		});

		expect(queueItems.at(-1)).toMatchObject({
			status: "failed",
			error: { kind: "order-submission", code: "twap-cancel-failed" },
		});
		expect(hookValue?.feedback).toEqual({ tone: "error", message: CANCEL_FAILED_MESSAGE });

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));

		expect(hookValue?.feedback).toEqual({ tone: "error", message: CANCEL_FAILED_MESSAGE_AR });
	});

	it("hides deterministic feedback after the trading identity changes", async () => {
		mocks.mutateAsync.mockRejectedValueOnce(new Error("TWAP 65 is not active"));
		await act(async () => {
			await hookValue?.cancelTwap("ETH", 65);
		});
		expect(hookValue?.feedback?.tone).toBe("error");

		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		act(() => root.render(createElement(Probe)));

		expect(hookValue?.feedback).toBeNull();
	});

	it("does not publish a late failure into a different trading identity", async () => {
		let rejectRequest: ((reason: Error) => void) | undefined;
		mocks.mutateAsync.mockImplementationOnce(
			() =>
				new Promise((_resolve, reject) => {
					rejectRequest = reject;
				}),
		);
		let cancellation: Promise<void> | undefined;
		await act(async () => {
			cancellation = hookValue?.cancelTwap("ETH", 66);
			await Promise.resolve();
		});
		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		act(() => root.render(createElement(Probe)));

		await act(async () => {
			rejectRequest?.(twapCancelRejection("TWAP 66 is not active"));
			await cancellation;
		});

		expect(hookValue?.feedback).toBeNull();
		expect(mocks.errorToast).not.toHaveBeenCalled();
		expect(queueItems.at(-1)).toMatchObject({
			owner: USER,
			env: "Mainnet",
			status: "failed",
			error: { kind: "exchange-error", entries: [{ text: "TWAP 66 is not active" }] },
		});
	});

	it("treats HTTP 429 as a definitive cancellation failure", async () => {
		mocks.mutateAsync.mockRejectedValueOnce(
			new HttpRequestError({ response: new Response("rate limited", { status: 429 }) }),
		);

		await act(async () => {
			await hookValue?.cancelTwap("ETH", 46);
		});

		expect(mocks.errorToast).not.toHaveBeenCalled();
		expect(queueItems.at(-1)).toMatchObject({ owner: USER, env: "Mainnet", status: "failed" });
		expect(mocks.warningToast).not.toHaveBeenCalled();
		expect(hookValue?.feedback?.tone).toBe("error");
	});

	it.each([
		{ name: "a default response", response: { status: "ok", response: { type: "default" } } },
		{
			name: "an unknown TWAP cancel status",
			response: { status: "ok", response: { type: "twapCancel", data: { status: "pending" } } },
		},
		{ name: "no response body", response: undefined },
	])("leaves the termination unconfirmed after $name", async ({ response }) => {
		mocks.mutateAsync.mockResolvedValueOnce(response);

		await act(async () => {
			await hookValue?.cancelTwap("BTC", 48);
		});

		const action = getPendingTradingActionSnapshot().twapCancellations[0];
		expect(action?.phase).toBe("unconfirmed");
		expect(action?.accepted).toBeUndefined();
		expect(hookValue?.feedback?.tone).toBe("warning");
	});

	it("does not report a TWAP that finished after an unrecognised response as terminated", async () => {
		mocks.mutateAsync.mockResolvedValueOnce({ status: "ok", response: { type: "default" } });
		act(() => root.render(createElement(Fragment, null, createElement(Probe), createElement(TwapReconciliation))));
		await act(async () => {
			await hookValue?.cancelTwap("BTC", 49);
		});
		const action = getPendingTradingActionSnapshot().twapCancellations[0];
		if (!action) throw new Error("Expected a pending TWAP termination");

		mocks.activeTwaps = { states: [] };
		mocks.activeTwapsReceivedAt = performance.now() + 1;
		mocks.twapHistory = { user: USER, history: [{ twapId: 49, status: { status: "finished" } }] };
		await act(async () => {
			root.render(createElement(Fragment, null, createElement(Probe), createElement(TwapReconciliation)));
			for (let index = 0; index < 10; index += 1) await Promise.resolve();
		});

		const item = getOrderQueueItem(`pending-trading-action:${action.id}`);
		expect(item?.status).toBe("failed");
		expect(item?.message ? i18n._(item.message) : null).toBe("TWAP finished before it could be terminated.");
	});

	it("queues a termination behind a held asset lock and sends it once after release", async () => {
		installQueueingLockManager();
		const lock = holdAssetLock();
		mocks.mutateAsync.mockResolvedValue({
			status: "ok",
			response: { type: "twapCancel", data: { status: "success" } },
		});

		let cancellation: Promise<void> | undefined;
		await act(async () => {
			cancellation = hookValue?.cancelTwap("BTC", 42);
			await flushMicrotasks();
		});
		await act(async () => {
			await hookValue?.cancelTwap("BTC", 42);
			await hookValue?.cancelTwap("BTC", 42);
			await flushMicrotasks();
		});

		expect(mocks.mutateAsync).not.toHaveBeenCalled();
		expect(getPendingTradingActionSnapshot().twapCancellations).toHaveLength(1);
		expect(getPendingTradingActionSnapshot().twapCancellations[0]).toMatchObject({ twapId: 42, phase: "submitting" });
		expect(hookValue?.cancellingTwapId).toBe(42);
		expect(hookValue?.feedback).toBeNull();
		expect(queueItems.at(-1)).toMatchObject({ owner: USER, env: "Mainnet", status: "pending" });
		expect(mocks.errorToast).not.toHaveBeenCalled();

		await act(async () => {
			await lock.release();
			await cancellation;
		});

		expect(mocks.mutateAsync).toHaveBeenCalledOnce();
		expect(mocks.mutateAsync).toHaveBeenCalledWith({ a: 7, t: 42 });
		expect(getPendingTradingActionSnapshot().twapCancellations[0]).toMatchObject({ phase: "awaiting", accepted: true });
		expect(hookValue?.feedback).toBeNull();
	});

	it.each([
		{ name: "another wallet", changes: [{ clientKey: "0x2222222222222222222222222222222222222222" }] },
		{ name: "another network", changes: [{ env: "Testnet" }] },
		{ name: "a disconnect", changes: [{ clientKey: "disconnected" }] },
		{
			name: "another wallet and back",
			changes: [{ clientKey: "0x2222222222222222222222222222222222222222" }, { clientKey: USER }],
		},
	] as const)("voids a queued termination after $name and never sends it", async ({ changes }) => {
		installQueueingLockManager();
		const lock = holdAssetLock();

		let cancellation: Promise<void> | undefined;
		await act(async () => {
			cancellation = hookValue?.cancelTwap("BTC", 42);
			await flushMicrotasks();
		});
		const action = getPendingTradingActionSnapshot().twapCancellations[0];
		if (!action) throw new Error("Expected a queued TWAP termination");

		for (const change of changes) {
			Object.assign(mocks, change);
			act(() => root.render(createElement(Probe)));
		}

		expect(getPendingTradingActionSnapshot().twapCancellations).toEqual([]);
		expect(getOrderQueueItem(`pending-trading-action:${action.id}`)).toMatchObject({
			owner: USER,
			env: "Mainnet",
			status: "failed",
			error: { kind: "order-submission", code: "twap-cancel-identity-changed" },
		});

		await act(async () => {
			await lock.release();
			await cancellation;
		});

		expect(mocks.mutateAsync).not.toHaveBeenCalled();
		expect(mocks.errorToast).not.toHaveBeenCalled();
		expect(getPendingTradingActionSnapshot().twapCancellations).toEqual([]);
	});

	it("voids a queued termination as not sent when its surface unmounts", async () => {
		const lockManager = installQueueingLockManager();
		const lock = holdAssetLock();

		let cancellation: Promise<void> | undefined;
		await act(async () => {
			cancellation = hookValue?.cancelTwap("BTC", 42);
			await flushMicrotasks();
		});
		const action = getPendingTradingActionSnapshot().twapCancellations[0];
		if (!action) throw new Error("Expected a queued TWAP termination");

		act(() => root.render(null));
		await act(flushMicrotasks);

		const voided = getOrderQueueItem(`pending-trading-action:${action.id}`);
		expect(getPendingTradingActionSnapshot().twapCancellations).toEqual([]);
		expect(voided).toMatchObject({
			status: "failed",
			error: { kind: "order-submission", code: "twap-cancel-not-sent" },
		});
		expect(lockManager.abandonedWaits()).toBe(1);

		await act(async () => {
			await lock.release();
			await cancellation;
		});

		expect(mocks.mutateAsync).not.toHaveBeenCalled();
		expect(getOrderQueueItem(`pending-trading-action:${action.id}`)).toEqual(voided);
	});

	it("gives up a queued termination at the lock-wait limit without sending it", async () => {
		vi.useFakeTimers();
		const lockManager = installQueueingLockManager();
		const lock = holdAssetLock();

		let cancellation: Promise<void> | undefined;
		await act(async () => {
			cancellation = hookValue?.cancelTwap("BTC", 42);
			await flushMicrotasks();
		});
		const action = getPendingTradingActionSnapshot().twapCancellations[0];
		if (!action) throw new Error("Expected a queued TWAP termination");

		await act(() => vi.advanceTimersByTimeAsync(EXCHANGE_ACTION_START_DEADLINE_MS - 1));
		expect(getPendingTradingActionSnapshot().twapCancellations[0]).toMatchObject({
			id: action.id,
			phase: "submitting",
		});
		expect(hookValue?.feedback).toBeNull();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(1);
			await cancellation;
		});

		expect(getPendingTradingActionSnapshot().twapCancellations).toEqual([]);
		expect(hookValue?.cancellingTwapId).toBeNull();
		expect(hookValue?.feedback).toEqual({ tone: "error", message: NOT_SENT_IN_TIME_MESSAGE });
		const item = getOrderQueueItem(`pending-trading-action:${action.id}`);
		expect(item?.status).toBe("failed");
		expect(lockManager.abandonedWaits()).toBe(1);

		await act(() => lock.release());
		expect(mocks.mutateAsync).not.toHaveBeenCalled();
		expect(getOrderQueueItem(`pending-trading-action:${action.id}`)).toEqual(item);
	});

	it("does not send a termination whose lock arrives after the limit while its timer was held back", async () => {
		vi.useFakeTimers();
		installQueueingLockManager();
		const lock = holdAssetLock();

		let cancellation: Promise<void> | undefined;
		await act(async () => {
			cancellation = hookValue?.cancelTwap("BTC", 42);
			await flushMicrotasks();
		});
		vi.setSystemTime(Date.now() + EXCHANGE_ACTION_START_DEADLINE_MS);
		await act(async () => {
			await lock.release();
			await cancellation;
		});

		expect(mocks.mutateAsync).not.toHaveBeenCalled();
		expect(getPendingTradingActionSnapshot().twapCancellations).toEqual([]);
		expect(hookValue?.feedback).toEqual({ tone: "error", message: NOT_SENT_IN_TIME_MESSAGE });
	});

	it("sends a queued termination once when the lock frees just inside the limit", async () => {
		vi.useFakeTimers();
		installQueueingLockManager();
		const lock = holdAssetLock();
		mocks.mutateAsync.mockResolvedValue({
			status: "ok",
			response: { type: "twapCancel", data: { status: "success" } },
		});

		let cancellation: Promise<void> | undefined;
		await act(async () => {
			cancellation = hookValue?.cancelTwap("BTC", 42);
			await flushMicrotasks();
		});
		await act(() => vi.advanceTimersByTimeAsync(EXCHANGE_ACTION_START_DEADLINE_MS - 1));
		await act(async () => {
			await lock.release();
			await cancellation;
		});
		await act(() => vi.advanceTimersByTimeAsync(EXCHANGE_ACTION_START_DEADLINE_MS));

		expect(mocks.mutateAsync).toHaveBeenCalledOnce();
		expect(mocks.mutateAsync).toHaveBeenCalledWith({ a: 7, t: 42 });
		expect(getPendingTradingActionSnapshot().twapCancellations[0]).toMatchObject({ phase: "awaiting", accepted: true });
		expect(queueItems.at(-1)?.status).not.toBe("failed");
		expect(hookValue?.feedback).toBeNull();
	});

	it("lets two queued terminations on one asset each pass their own execution guard", async () => {
		installQueueingLockManager();
		const lock = holdAssetLock();
		mocks.mutateAsync.mockResolvedValue({
			status: "ok",
			response: { type: "twapCancel", data: { status: "success" } },
		});

		let cancellations: Array<Promise<void> | undefined> = [];
		await act(async () => {
			cancellations = [hookValue?.cancelTwap("BTC", 42), hookValue?.cancelTwap("BTC", 43)];
			await flushMicrotasks();
		});
		expect(getPendingTradingActionSnapshot().twapCancellations).toHaveLength(2);

		await act(async () => {
			await lock.release();
			await Promise.all(cancellations);
		});

		expect(mocks.mutateAsync).toHaveBeenCalledTimes(2);
		expect(mocks.mutateAsync).toHaveBeenNthCalledWith(1, { a: 7, t: 42 });
		expect(mocks.mutateAsync).toHaveBeenNthCalledWith(2, { a: 7, t: 43 });
		expect(getPendingTradingActionSnapshot().twapCancellations.map((action) => action.phase)).toEqual([
			"awaiting",
			"awaiting",
		]);
		expect(hookValue?.feedback).toBeNull();
	});

	it("keeps the active TWAP asset reservation until a fresh snapshot confirms cancellation", async () => {
		await runWithOrderAssetLocks({ env: "Mainnet", owner: USER, assetIds: [7] }, async (lease) => {
			expect(
				reserveOrderAssets(lease, {
					submissionId: getActiveTwapReservationId(47),
					intentKey: "twap:7",
					exclusiveAssetLock: false,
					isRiskReducing: false,
					createdAt: Date.now(),
					expiresAt: Date.now() + 60_000,
				}),
			).toBe(true);
		});
		mocks.mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "twapCancel", data: { status: "success" } },
		});

		await act(async () => {
			await hookValue?.cancelTwap("BTC", 47);
		});

		await runWithOrderAssetLocks({ env: "Mainnet", owner: USER, assetIds: [7] }, async (lease) => {
			expect(
				getOrderAssetReservationState(lease, {
					intentKey: "position-close-before-snapshot",
					exclusiveAssetLock: true,
					isRiskReducing: true,
				}),
			).toBe("conflict");
		});
	});
});
