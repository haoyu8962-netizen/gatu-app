// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TwapReconciliation } from "@/components/trade/twap-reconciliation";
import { TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS } from "@/domain/trade/twap";
import {
	getOrderAssetReservationState,
	reserveOrderAssets,
	runWithOrderAssetLocks,
} from "@/lib/trade/order-asset-lock";
import { getPendingTwapActions, hasPendingTwapForAsset } from "@/stores/use-pending-twap-store";

const USER = "0x1111111111111111111111111111111111111111" as const;
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
					status: { status: "finished" | "activated" | "terminated" } | { status: "error"; description: string };
				}>;
		  }
		| undefined,
	successToast: vi.fn(),
	errorToast: vi.fn(),
	warningToast: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: { success: mocks.successToast, error: mocks.errorToast, warning: mocks.warningToast },
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ clientKey: mocks.clientKey, env: "Mainnet" }),
	useSubscription: (method: string) => ({
		data: method === "twapStates" ? mocks.activeData : mocks.historyData,
		status: "active",
		error: null,
		isStale: false,
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
		sz: "1.25",
		timestamp: Date.now(),
		user: USER,
		...overrides,
	};
}

function addSubmission(options: { activeKnownIds?: number[]; historyKnownIds?: number[] } = {}) {
	return getPendingTwapActions().add({
		env: "Mainnet",
		user: USER,
		intent: {
			assetId: 7,
			coin: "xyz:GOLD",
			side: "B",
			size: "1.2500",
			minutes: 30,
			reduceOnly: false,
			randomize: true,
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
		mocks.clientKey = USER;
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
		window.localStorage.clear();
		installExclusiveLockManager();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
		vi.useRealTimers();
	});

	it("waits for the in-flight request to settle, then accepts a new exact active TWAP ID", async () => {
		const submission = addSubmission({ activeKnownIds: [50] });
		getPendingTwapActions().markActive(submission.id);
		mocks.activeData = { dex: "", user: USER, states: [[51, createTwapState()]] };

		act(() => root.render(createElement(TwapReconciliation)));
		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(true);
		expect(mocks.successToast).not.toHaveBeenCalled();

		await act(async () => {
			getPendingTwapActions().clearActive(submission.id);
			await Promise.resolve();
		});
		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(false);
		expect(mocks.successToast).toHaveBeenCalledOnce();
	});

	it("does not consume a TWAP ID that was already present in the pre-submit baseline", () => {
		addSubmission({ activeKnownIds: [52] });
		mocks.activeData = { dex: "", user: USER, states: [[52, createTwapState()]] };

		act(() => root.render(createElement(TwapReconciliation)));

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
			root.render(createElement(TwapReconciliation));
			await Promise.resolve();
		});

		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(false);
		expect(mocks.successToast).not.toHaveBeenCalled();
		expect(mocks.errorToast).toHaveBeenCalledWith("TWAP order rejected");
	});

	it("ignores a new TWAP whose exchange fields do not match the submitted intent", () => {
		addSubmission();
		mocks.activeData = {
			dex: "",
			user: USER,
			states: [[54, createTwapState({ minutes: 60 })]],
		};

		act(() => root.render(createElement(TwapReconciliation)));

		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(true);
		expect(mocks.successToast).not.toHaveBeenCalled();
	});

	it("releases the TWAP lock and warns when positive reconciliation times out", async () => {
		const submission = addSubmission();
		await reservePendingSubmission(submission, submission.createdAt + 60 * 60_000);
		vi.setSystemTime(submission.createdAt + TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS);

		act(() => root.render(createElement(TwapReconciliation)));
		await act(() => vi.runOnlyPendingTimersAsync());

		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(false);
		expect(mocks.warningToast).toHaveBeenCalledOnce();
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

	it("releases the TWAP lock while the wallet is disconnected", () => {
		const submission = addSubmission();
		mocks.clientKey = "disconnected";
		vi.setSystemTime(submission.createdAt + TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS);

		act(() => root.render(createElement(TwapReconciliation)));

		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(false);
		expect(mocks.warningToast).toHaveBeenCalledOnce();
	});

	it("accepts a late matching TWAP after the local hard lock has been released", async () => {
		const submission = addSubmission();
		getPendingTwapActions().markUnconfirmed(submission.id, submission.createdAt + 1);
		mocks.activeData = { dex: "", user: USER, states: [[55, createTwapState()]] };

		await act(async () => {
			root.render(createElement(TwapReconciliation));
			await Promise.resolve();
		});

		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(false);
		expect(mocks.successToast).toHaveBeenCalledOnce();
	});

	it("promotes a reconciled active TWAP beyond the short confirmation window", async () => {
		const submission = addSubmission();
		await reservePendingSubmission(submission);
		mocks.activeData = { dex: "", user: USER, states: [[56, createTwapState()]] };

		await act(async () => {
			root.render(createElement(TwapReconciliation));
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
			if (key.startsWith("gatu-order-asset-reservations") && value.includes("active-twap:58")) {
				throw new Error("storage unavailable");
			}
			return nativeSetItem.call(this, key, value);
		});
		mocks.activeData = { dex: "", user: USER, states: [[58, createTwapState()]] };

		await act(async () => {
			root.render(createElement(TwapReconciliation));
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

	it("releases a pending asset reservation when TWAP history reports a terminal state", async () => {
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
					status: { status: "finished" },
				},
			],
		};

		await act(async () => {
			root.render(createElement(TwapReconciliation));
			await Promise.resolve();
		});

		await runWithOrderAssetLocks({ env: "Mainnet", owner: USER, assetIds: [7] }, async (lease) => {
			expect(
				getOrderAssetReservationState(lease, {
					intentKey: "entry-after-finish",
					exclusiveAssetLock: false,
					isRiskReducing: false,
				}),
			).toBe("clear");
		});
	});
});
