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
	onSessionEnd: vi.fn(),
	resetError: vi.fn(),
	shellProps: null as Record<string, unknown> | null,
	submit: vi.fn(async (): Promise<Record<string, unknown>> => ({ state: "filled" })),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }));

vi.mock("@gatu/ui", () => ({
	ModalDescription: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("p", props, children),
	ModalTitle: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("h2", props, children),
}));

vi.mock("@/components/trade/positions/position-close-dialog-shell", () => ({
	PositionCloseDialogShell: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => {
		testState.shellProps = props;
		return createElement("div", { "data-testid": "shell" }, children);
	},
}));

vi.mock("@/components/trade/positions/position-close-dialog-header", () => ({
	PositionCloseDialogHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
}));

vi.mock("@/components/trade/positions/position-close-dialog-content", () => ({
	PositionCloseDialogContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

vi.mock("@/components/trade/positions/position-close-dialog-footer", () => ({
	PositionCloseDialogFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
}));

vi.mock("@/components/trade/positions/position-close-summary", () => ({
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

vi.mock("sonner", () => ({ toast: toastMock }));

import { PositionCloseAllController } from "@/components/trade/positions/position-close-all-modal";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const SESSION_ID = "close-all:1";

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
						session: { sessionId: SESSION_ID, snapshot: snapshotWith(positionCount) },
						onSessionEnd: testState.onSessionEnd,
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
		testState.onSessionEnd.mockReset();
		testState.resetError.mockReset();
		testState.shellProps = null;
		testState.submit.mockReset();
		testState.submit.mockImplementation(async () => ({ state: "filled" }));
		for (const notify of Object.values(toastMock)) notify.mockReset();
	});

	function holdSubmission(): (outcome: Record<string, unknown>) => void {
		let settle: (outcome: Record<string, unknown>) => void = () => {};
		testState.submit.mockImplementation(
			() =>
				new Promise((resolve) => {
					settle = resolve;
				}),
		);
		return (outcome) => settle(outcome);
	}

	function getSubmit(): HTMLButtonElement {
		const button = container.querySelector<HTMLButtonElement>('[data-testid="submit"]');
		if (!button) throw new Error("Expected the confirm button");
		return button;
	}

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
						createElement(PositionCloseAllController, { session: null, onSessionEnd: testState.onSessionEnd }),
					),
				),
			);
			expect(testState.shellProps?.open).toBe(false);
			expect(container.textContent).not.toBe("");
			expect(testState.actionButtonProps?.disabled).toBe(true);
			act(() => {
				void (testState.actionButtonProps?.onClick as () => Promise<void>)();
			});
			expect(testState.submit).not.toHaveBeenCalled();

			act(() => {
				vi.advanceTimersByTime(250);
			});
			expect(container.textContent).toBe("");
		} finally {
			vi.useRealTimers();
		}
	});

	it("names the action with a static verb and keeps the position count in the dialog body", () => {
		render(3);
		expect(testState.actionButtonProps?.holdDurationMs).toBeUndefined();
		expect(testState.actionButtonProps?.holdProgressClassName).toBeUndefined();
		expect(testState.actionButtonProps?.requireReadyConfirmation).toBe(true);
		expect(testState.shellProps).toMatchObject({ dismissible: true, closeLabel: "Close close-all confirmation" });
		expect(testState.shellProps).not.toHaveProperty("showMobileClose");
		expect(getSubmit().textContent).toBe("Close All Positions");
		expect(getSubmit().getAttribute("aria-describedby")).toBeNull();
		expect(container.querySelector('[data-testid="position-close-all-summary"]')).not.toBeNull();
		expect(container.textContent).toContain("all 3 open positions");
		expect(container.textContent).not.toContain("Close 3 positions");
		expect(container.textContent).not.toContain("Hold");
	});

	it.each(["validating", "submitting", "reconciling", "partial"] as const)(
		"never shows the %s phase on the confirm button",
		(phase) => {
			testState.phase = phase;
			testState.isPending = phase === "validating" || phase === "submitting";
			testState.isReconciling = phase === "reconciling";
			testState.isPartial = phase === "partial";
			testState.error = "Close request failed";
			render();
			expect(getSubmit().textContent).toBe("Close All Positions");
			expect(getSubmit().getAttribute("aria-busy")).toBeNull();
			expect(container.textContent).not.toContain("Close request failed");
		},
	);

	it("closes the dialog at the click, keeps the submit hook mounted and ends the session when it settles", async () => {
		const settle = holdSubmission();
		render(2);

		await act(async () => getSubmit().click());
		expect(testState.submit).toHaveBeenCalledTimes(1);
		expect(testState.shellProps?.open).toBe(false);
		expect(testState.onSessionEnd).not.toHaveBeenCalled();
		expect(container.textContent).not.toBe("");
		expect(toastMock.success).not.toHaveBeenCalled();

		await act(async () => getSubmit().click());
		expect(testState.submit).toHaveBeenCalledTimes(1);

		await act(async () => settle({ state: "filled" }));
		expect(toastMock.success).toHaveBeenCalledTimes(1);
		expect(testState.onSessionEnd).toHaveBeenCalledExactlyOnceWith(SESSION_ID);
	});

	it("submits once when the confirm control is activated twice in the same tick", async () => {
		render();
		await act(async () => {
			const onClick = testState.actionButtonProps?.onClick as () => Promise<void>;
			void onClick();
			void onClick();
		});
		expect(testState.submit).toHaveBeenCalledTimes(1);
	});

	it.each([
		[{ state: "blocked" }, "warning"],
		[{ state: "reconciling" }, "info"],
		[{ state: "partial", acceptedCount: 1, totalCount: 2 }, "warning"],
		[{ state: "filled" }, "success"],
	] as const)("reports %o only through a %s notification and ends the session", async (outcome, level) => {
		testState.submit.mockImplementation(async () => ({ ...outcome }));
		render(2);
		await act(async () => getSubmit().click());

		for (const [name, notify] of Object.entries(toastMock))
			expect(notify).toHaveBeenCalledTimes(name === level ? 1 : 0);
		expect(testState.shellProps?.open).toBe(false);
		expect(testState.onSessionEnd).toHaveBeenCalledExactlyOnceWith(SESSION_ID);
	});

	it("reports a failed submission through an error notification and ends the session", async () => {
		testState.submit.mockImplementation(async () => {
			throw new Error("Trading data changed");
		});
		render();
		await act(async () => getSubmit().click());

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith("Trading data changed");
		expect(testState.onSessionEnd).toHaveBeenCalledExactlyOnceWith(SESSION_ID);
	});

	it("lets the user leave before confirming and ignores the shell once the submission has started", async () => {
		render();
		(testState.shellProps?.onOpenChange as (open: boolean) => void)(false);
		expect(testState.onSessionEnd).toHaveBeenCalledExactlyOnceWith(SESSION_ID);

		testState.onSessionEnd.mockReset();
		const settle = holdSubmission();
		render();
		await act(async () => getSubmit().click());
		(testState.shellProps?.onOpenChange as (open: boolean) => void)(false);
		expect(testState.onSessionEnd).not.toHaveBeenCalled();
		await act(async () => settle({ state: "filled" }));
		expect(testState.onSessionEnd).toHaveBeenCalledExactlyOnceWith(SESSION_ID);
	});
});
