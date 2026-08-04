/** @vitest-environment jsdom */

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PositionReverseTarget } from "@/hooks/trade/use-position-reverse-submit";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	modalProps: null as Record<string, unknown> | null,
	submit: vi.fn(),
	resetError: vi.fn(),
	phase: "idle" as "idle" | "validating" | "submitting" | "reconciling",
	error: null as string | null,
	success: vi.fn(),
	warning: vi.fn(),
	info: vi.fn(),
	errorToast: vi.fn(),
}));

vi.mock("@/components/trade/positions/position-reverse-confirmation-modal", () => ({
	PositionReverseConfirmationModal: (props: Record<string, unknown>) => {
		mocks.modalProps = props;
		return createElement("div", { role: "dialog" });
	},
}));

vi.mock("@/hooks/trade/use-position-reverse-submit", () => ({
	usePositionReverseSubmit: () => ({
		submit: mocks.submit,
		phase: mocks.phase,
		isPending: mocks.phase === "validating" || mocks.phase === "submitting",
		isReconciling: mocks.phase === "reconciling",
		error: mocks.error,
		resetError: mocks.resetError,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarkets: () => ({
		getMarket: () => ({ pairName: "CXMT-USDC", shortName: "CXMT" }),
	}),
}));

vi.mock("sonner", () => ({
	toast: {
		success: mocks.success,
		warning: mocks.warning,
		info: mocks.info,
		error: mocks.errorToast,
	},
}));

import { PositionReverseConfirmationController } from "@/components/trade/positions/position-reverse-confirmation-controller";

const target: PositionReverseTarget = {
	owner: "0x1111111111111111111111111111111111111111",
	env: "Mainnet",
	coin: "xyz:CXMT",
	dex: "xyz",
	assetId: 120_031,
	szDecimals: 3,
	signedPositionSize: "2.500",
	marginMode: "isolated",
};

describe("PositionReverseConfirmationController", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.modalProps = null;
		mocks.phase = "idle";
		mocks.error = null;
		mocks.submit.mockReset();
		mocks.resetError.mockReset();
		mocks.success.mockReset();
		mocks.warning.mockReset();
		mocks.info.mockReset();
		mocks.errorToast.mockReset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("formats the exact 2x string size and closes only after a confirmed fill", async () => {
		const onOpenChange = vi.fn();
		mocks.submit.mockResolvedValue({
			state: "confirmed",
			result: { response: { data: { statuses: [{ filled: { totalSz: "5.125" } }] } } },
		});
		act(() => root.render(<PositionReverseConfirmationController target={target} onOpenChange={onOpenChange} />));

		expect(mocks.modalProps).toMatchObject({
			marketLabel: "CXMT-USDC",
			currentDirection: "long",
			reverseSizeLabel: "5.000 CXMT",
			isSubmitting: false,
			isConfirmDisabled: false,
		});

		await act(async () => {
			(mocks.modalProps?.onConfirm as () => void)();
		});
		expect(mocks.submit).toHaveBeenCalledOnce();
		expect(mocks.success).toHaveBeenCalledWith("Position reversed — CXMT-USDC", {
			description: "Reverse order filled for 5.125 CXMT.",
		});
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("keeps the dialog open for blocked work and closes after an ambiguous submitted response", async () => {
		const onOpenChange = vi.fn();
		mocks.submit.mockResolvedValue({ state: "blocked" });
		act(() => root.render(<PositionReverseConfirmationController target={target} onOpenChange={onOpenChange} />));

		await act(async () => {
			(mocks.modalProps?.onConfirm as () => void)();
		});
		expect(mocks.warning).toHaveBeenCalledOnce();
		expect(onOpenChange).not.toHaveBeenCalled();

		mocks.submit.mockResolvedValue({ state: "reconciling", submissionId: "pending-1" });
		await act(async () => {
			(mocks.modalProps?.onConfirm as () => void)();
		});
		expect(mocks.info).toHaveBeenCalledWith("Order submitted. Confirming exchange status; do not retry.");
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
