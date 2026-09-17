/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PositionCloseAllSnapshot } from "@/domain/trade/position-close-all";

const testState = vi.hoisted(() => ({
	actionButtonProps: null as Record<string, unknown> | null,
	error: null as string | null,
	isPartial: false,
	isPending: false,
	isReconciling: false,
	phase: "idle" as "idle" | "validating" | "submitting" | "reconciling" | "partial",
	onOpenChange: vi.fn(),
	resetError: vi.fn(),
	shellProps: null as Record<string, unknown> | null,
	submit: vi.fn(async () => ({ state: "filled" as const })),
}));

vi.mock("@gatu/ui", () => ({
	ModalDescription: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("p", props, children),
	ModalTitle: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("h2", props, children),
}));

vi.mock("@/components/trade/positions/position-close-dialog-ui", () => ({
	PositionCloseDialogShell: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => {
		testState.shellProps = props;
		return createElement("div", { "data-testid": "shell" }, children);
	},
	PositionCloseDialogHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	PositionCloseDialogContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	PositionCloseDialogFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
	PositionCloseSummary: ({ testId }: { testId: string }) => createElement("dl", { "data-testid": testId }),
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: (props: { children: ReactNode; onClick: () => void } & Record<string, unknown>) => {
		testState.actionButtonProps = props;
		return createElement(
			"button",
			{
				type: "button",
				"data-testid": "submit",
				"aria-describedby": props["aria-describedby"],
				disabled: Boolean(props.disabled),
				onClick: props.onClick,
			},
			props.children,
		);
	},
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

vi.mock("@/hooks/trade/use-position-close-all-submit", () => ({
	usePositionCloseAllSubmit: () => ({
		submit: testState.submit,
		phase: testState.phase,
		isPending: testState.isPending,
		isReconciling: testState.isReconciling,
		isPartial: testState.isPartial,
		error: testState.error,
		resetError: testState.resetError,
	}),
}));

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

import { PositionCloseAllController } from "@/components/trade/positions/position-close-all-modal";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function snapshotWith(positionCount: number): PositionCloseAllSnapshot {
	return {
		owner: "0xabc",
		env: "Mainnet",
		capturedAtMs: 1_700_000_000_000,
		targets: Array.from({ length: positionCount }, (_, index) => ({
			coin: `COIN${index}`,
			dex: "",
			assetId: index,
			szDecimals: 2,
			signedPositionSize: "1.5",
			marginMode: "cross" as const,
			quoteSymbol: "USDC",
		})),
		summaryTotals: [{ quoteSymbol: "USDC", totalNotional: "4284.74", estimatedPnl: "137.52" }],
	};
}

describe("PositionCloseAllController", () => {
	let container: HTMLDivElement;
	let root: Root;

	function render(positionCount = 1) {
		act(() =>
			root.render(
				createElement(
					I18nProvider,
					{ i18n },
					createElement(PositionCloseAllController, {
						snapshot: snapshotWith(positionCount),
						onOpenChange: testState.onOpenChange,
					}),
				),
			),
		);
	}

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.actionButtonProps = null;
		testState.error = null;
		testState.isPartial = false;
		testState.isPending = false;
		testState.isReconciling = false;
		testState.phase = "idle";
		testState.onOpenChange.mockReset();
		testState.resetError.mockReset();
		testState.shellProps = null;
		testState.submit.mockClear();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("keeps the dialog mounted closed for its exit transition after the snapshot clears", () => {
		vi.useFakeTimers();
		try {
			render();
			expect(testState.shellProps?.open).toBe(true);

			act(() =>
				root.render(
					createElement(
						I18nProvider,
						{ i18n },
						createElement(PositionCloseAllController, { snapshot: null, onOpenChange: testState.onOpenChange }),
					),
				),
			);
			expect(testState.shellProps?.open).toBe(false);
			expect(container.textContent).not.toBe("");

			act(() => {
				vi.advanceTimersByTime(250);
			});
			expect(container.textContent).toBe("");
		} finally {
			vi.useRealTimers();
		}
	});

	it("submits on a single click while preserving the trading-readiness confirmation", async () => {
		render();
		expect(testState.actionButtonProps?.holdDurationMs).toBeUndefined();
		expect(testState.actionButtonProps?.holdProgressClassName).toBeUndefined();
		expect(testState.actionButtonProps?.requireReadyConfirmation).toBe(true);
		expect(testState.shellProps).toMatchObject({
			dismissible: true,
			showMobileClose: true,
			closeLabel: "Close close-all confirmation",
		});
		expect(container.textContent).toContain("Close 1 position");
		expect(container.textContent).not.toContain("Hold");
		expect(container.textContent).not.toContain("Back");
		expect(container.textContent).not.toContain("Click to submit · Each market may return a different result");
		expect(container.querySelector('[data-testid="submit"]')?.getAttribute("aria-describedby")).toBeNull();

		await act(async () => {
			container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.click();
		});
		expect(testState.submit).toHaveBeenCalledTimes(1);
	});

	it("describes the submit button only with a visible submission error", () => {
		testState.error = "Close request failed";
		render();

		const describedBy = container.querySelector('[data-testid="submit"]')?.getAttribute("aria-describedby");
		expect(describedBy).toMatch(/^position-close-all-error-/);
		expect(document.getElementById(describedBy ?? "")?.textContent).toContain("Close request failed");
	});

	it("pluralizes the confirm label without reintroducing a hold gesture", () => {
		render(3);
		expect(container.textContent).toContain("Close 3 positions");
		expect(testState.actionButtonProps?.holdDurationMs).toBeUndefined();
	});

	it("keeps the button disabled while a submission is in flight", async () => {
		testState.isPending = true;
		testState.phase = "submitting";
		render();

		const button = container.querySelector<HTMLButtonElement>('[data-testid="submit"]');
		expect(button?.disabled).toBe(true);
		expect(testState.shellProps?.dismissible).toBe(false);
		(testState.shellProps?.onOpenChange as (open: boolean) => void)(false);
		expect(testState.resetError).not.toHaveBeenCalled();
		expect(testState.onOpenChange).not.toHaveBeenCalled();
		await act(async () => button?.click());
		expect(testState.submit).not.toHaveBeenCalled();
	});
});
