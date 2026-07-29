// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { HttpRequestError } from "@nktkas/hyperliquid";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTwapCancel } from "@/hooks/trade/use-twap-cancel";

const mocks = vi.hoisted(() => ({
	assetId: 7 as number | undefined,
	mutateAsync: vi.fn(),
	reset: vi.fn(),
	successToast: vi.fn(),
	errorToast: vi.fn(),
	warningToast: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: { success: mocks.successToast, error: mocks.errorToast, warning: mocks.warningToast },
}));

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: () => ({ mutateAsync: mocks.mutateAsync, reset: mocks.reset }),
	useMarkets: () => ({ getAssetId: () => mocks.assetId }),
}));

let hookValue: ReturnType<typeof useTwapCancel> | null = null;

function Probe() {
	hookValue = useTwapCancel();
	return null;
}

describe("useTwapCancel", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		mocks.assetId = 7;
		mocks.mutateAsync.mockReset();
		mocks.reset.mockReset();
		mocks.successToast.mockReset();
		mocks.errorToast.mockReset();
		mocks.warningToast.mockReset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(createElement(Probe)));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		hookValue = null;
	});

	it("submits the exact SDK asset and TWAP ID fields and confirms success", async () => {
		mocks.mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "twapCancel", data: { status: "success" } },
		});

		await act(async () => {
			await hookValue?.cancelTwap("xyz:GOLD", 42);
		});

		expect(mocks.mutateAsync).toHaveBeenCalledWith({ a: 7, t: 42 });
		expect(mocks.successToast).toHaveBeenCalledOnce();
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

	it("reports a transport timeout as unconfirmed instead of a definitive cancellation failure", async () => {
		mocks.mutateAsync.mockRejectedValueOnce(new HttpRequestError({ detail: "Request timed out after 10000 ms" }));

		await act(async () => {
			await hookValue?.cancelTwap("BTC", 44);
		});

		expect(mocks.warningToast).toHaveBeenCalledOnce();
		expect(mocks.errorToast).not.toHaveBeenCalled();
		expect(hookValue?.feedback?.tone).toBe("warning");
	});

	it("surfaces a definitive exchange or HTTP rejection", async () => {
		mocks.mutateAsync.mockRejectedValueOnce(new Error("TWAP 45 is not active"));

		await act(async () => {
			await hookValue?.cancelTwap("ETH", 45);
		});

		expect(mocks.errorToast).toHaveBeenCalledWith("TWAP 45 is not active");
		expect(hookValue?.feedback).toEqual({ tone: "error", message: "TWAP 45 is not active" });
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
});
