// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { HttpRequestError } from "@nktkas/hyperliquid";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTwapCancel } from "@/hooks/trade/use-twap-cancel";
import {
	getOrderAssetReservationState,
	reserveOrderAssets,
	runWithOrderAssetLocks,
} from "@/lib/trade/order-asset-lock";
import { getActiveTwapReservationId } from "@/lib/trade/twap-order-asset-reservation";
import { getPendingTradingActionActions } from "@/stores/use-pending-trading-action-store";
import { createI18nRoot } from "./harness/react";

const USER = "0x1111111111111111111111111111111111111111" as const;
const MARKET_UNAVAILABLE_MESSAGE = "Unable to identify this TWAP market. Refresh market data before retrying.";
const MARKET_UNAVAILABLE_MESSAGE_AR = "تعذر تحديد سوق TWAP هذا. حدّث بيانات السوق قبل إعادة المحاولة.";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(MARKET_UNAVAILABLE_MESSAGE)]: MARKET_UNAVAILABLE_MESSAGE_AR,
};

const mocks = vi.hoisted(() => ({
	assetId: 7 as number | undefined,
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	mutateAsync: vi.fn(),
	guardPassesBeforeMutation: 2,
	reset: vi.fn(),
	successToast: vi.fn(),
	errorToast: vi.fn(),
	warningToast: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: { success: mocks.successToast, error: mocks.errorToast, warning: mocks.warningToast },
}));

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: (_method: string, options?: { executionGuard?: (params: { a: number; t: number }) => void }) => ({
		mutateAsync: async (params: { a: number; t: number }) => {
			for (let pass = 0; pass < mocks.guardPassesBeforeMutation; pass += 1) {
				options?.executionGuard?.(params);
			}
			return mocks.mutateAsync(params);
		},
		reset: mocks.reset,
	}),
	useHyperliquid: () => ({ clientKey: mocks.clientKey, env: mocks.env }),
	useMarkets: () => ({ getAssetId: () => mocks.assetId }),
}));

let hookValue: ReturnType<typeof useTwapCancel> | null = null;

function Probe() {
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
		mocks.reset.mockReset();
		mocks.successToast.mockReset();
		mocks.errorToast.mockReset();
		mocks.warningToast.mockReset();
		window.localStorage.clear();
		installExclusiveLockManager();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(createElement(Probe)));
	});

	afterEach(() => {
		act(() => root.unmount());
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

		expect(mocks.mutateAsync).toHaveBeenCalledWith({ a: 7, t: 42 });
		expect(mocks.successToast).not.toHaveBeenCalled();
		expect(hookValue?.cancellingTwapId).toBe(42);
		expect(hookValue?.feedback).toBeNull();
	});

	it("fails closed when the selected market has no resolved asset ID", async () => {
		mocks.assetId = undefined;

		await act(async () => {
			await hookValue?.cancelTwap("missing:COIN", 43);
		});

		expect(mocks.mutateAsync).not.toHaveBeenCalled();
		expect(mocks.errorToast).toHaveBeenCalledOnce();
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

		expect(mocks.warningToast).toHaveBeenCalledOnce();
		expect(mocks.errorToast).not.toHaveBeenCalled();
		expect(hookValue?.feedback?.tone).toBe("warning");
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
		expect(mocks.errorToast).toHaveBeenCalledOnce();
		expect(hookValue?.cancellingTwapId).toBeNull();
		expect(hookValue?.feedback?.tone).toBe("error");
	});

	it("surfaces a definitive exchange or HTTP rejection", async () => {
		mocks.mutateAsync.mockRejectedValueOnce(new Error("TWAP 45 is not active"));

		await act(async () => {
			await hookValue?.cancelTwap("ETH", 45);
		});

		expect(mocks.errorToast).toHaveBeenCalledWith("TWAP 45 is not active");
		expect(hookValue?.feedback).toEqual({ tone: "error", message: "TWAP 45 is not active" });

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));

		expect(hookValue?.feedback).toEqual({ tone: "error", message: "TWAP 45 is not active" });
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
			rejectRequest?.(new Error("TWAP 66 is not active"));
			await cancellation;
		});

		expect(hookValue?.feedback).toBeNull();
		expect(mocks.errorToast).not.toHaveBeenCalled();
	});

	it("treats HTTP 429 as a definitive cancellation failure", async () => {
		mocks.mutateAsync.mockRejectedValueOnce(
			new HttpRequestError({ response: new Response("rate limited", { status: 429 }) }),
		);

		await act(async () => {
			await hookValue?.cancelTwap("ETH", 46);
		});

		expect(mocks.errorToast).toHaveBeenCalledOnce();
		expect(mocks.warningToast).not.toHaveBeenCalled();
		expect(hookValue?.feedback?.tone).toBe("error");
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
