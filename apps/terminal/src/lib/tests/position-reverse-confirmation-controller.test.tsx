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

const SESSION_ID = "reverse:1";
const session = { sessionId: SESSION_ID, target };

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

	it("keeps the dialog mounted closed for its exit transition after the target clears", () => {
		vi.useFakeTimers();
		try {
			act(() => root.render(<PositionReverseConfirmationController session={session} onSessionEnd={vi.fn()} />));
			expect(mocks.modalProps?.open).toBe(true);

			act(() => root.render(<PositionReverseConfirmationController session={null} onSessionEnd={vi.fn()} />));
			expect(container.querySelector('[role="dialog"]')).not.toBeNull();
			expect(mocks.modalProps?.open).toBe(false);
			expect(mocks.modalProps?.isConfirmDisabled).toBe(true);
			act(() => (mocks.modalProps?.onConfirm as () => void)());
			expect(mocks.submit).not.toHaveBeenCalled();

			act(() => {
				vi.advanceTimersByTime(250);
			});
			expect(container.querySelector('[role="dialog"]')).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	function holdSubmission(): (outcome: Record<string, unknown>) => void {
		let settle: (outcome: Record<string, unknown>) => void = () => {};
		mocks.submit.mockImplementation(
			() =>
				new Promise((resolve) => {
					settle = resolve;
				}),
		);
		return (outcome) => settle(outcome);
	}

	it("formats the exact 2x string size, closes at the click and leaves fill feedback to the submit hook", async () => {
		const onSessionEnd = vi.fn();
		const settle = holdSubmission();
		act(() => root.render(<PositionReverseConfirmationController session={session} onSessionEnd={onSessionEnd} />));

		expect(mocks.modalProps).toMatchObject({
			open: true,
			marketLabel: "CXMT-USDC",
			currentDirection: "long",
			reverseSizeLabel: "5.000 CXMT",
			isConfirmDisabled: false,
		});
		expect(mocks.modalProps).not.toHaveProperty("isSubmitting");
		expect(mocks.modalProps).not.toHaveProperty("errorMessage");

		await act(async () => {
			(mocks.modalProps?.onConfirm as () => void)();
		});
		expect(mocks.submit).toHaveBeenCalledOnce();
		expect(mocks.modalProps).toMatchObject({ open: false, isConfirmDisabled: true });
		expect(onSessionEnd).not.toHaveBeenCalled();

		await act(async () => {
			(mocks.modalProps?.onConfirm as () => void)();
			(mocks.modalProps?.onOpenChange as (open: boolean) => void)(false);
		});
		expect(mocks.submit).toHaveBeenCalledOnce();
		expect(onSessionEnd).not.toHaveBeenCalled();

		await act(async () =>
			settle({ state: "confirmed", result: { response: { data: { statuses: [{ filled: { totalSz: "5.125" } }] } } } }),
		);
		expect(mocks.success).not.toHaveBeenCalled();
		expect(onSessionEnd).toHaveBeenCalledExactlyOnceWith(SESSION_ID);
	});

	it("submits once when the confirm control is activated twice in the same tick", async () => {
		mocks.submit.mockResolvedValue({ state: "blocked" });
		act(() => root.render(<PositionReverseConfirmationController session={session} onSessionEnd={vi.fn()} />));
		await act(async () => {
			const onConfirm = mocks.modalProps?.onConfirm as () => void;
			onConfirm();
			onConfirm();
		});
		expect(mocks.submit).toHaveBeenCalledOnce();
	});

	it.each([{ state: "blocked" }, { state: "reconciling", submissionId: "pending-1" }] as const)(
		"leaves %o feedback to the submit hook without duplicating a notification",
		async (outcome) => {
			const onSessionEnd = vi.fn();
			mocks.submit.mockResolvedValue({ ...outcome });
			act(() => root.render(<PositionReverseConfirmationController session={session} onSessionEnd={onSessionEnd} />));

			await act(async () => {
				(mocks.modalProps?.onConfirm as () => void)();
			});
			expect(mocks.warning).not.toHaveBeenCalled();
			expect(mocks.info).not.toHaveBeenCalled();
			expect(mocks.success).not.toHaveBeenCalled();
			expect(mocks.errorToast).not.toHaveBeenCalled();
			expect(onSessionEnd).toHaveBeenCalledExactlyOnceWith(SESSION_ID);
		},
	);

	it("ends a failed submission without duplicating feedback", async () => {
		const onSessionEnd = vi.fn();
		mocks.submit.mockRejectedValue(new Error("Trading data changed"));
		act(() => root.render(<PositionReverseConfirmationController session={session} onSessionEnd={onSessionEnd} />));

		await act(async () => {
			(mocks.modalProps?.onConfirm as () => void)();
		});
		expect(mocks.errorToast).not.toHaveBeenCalled();
		expect(onSessionEnd).toHaveBeenCalledExactlyOnceWith(SESSION_ID);
	});
});
