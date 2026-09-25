/** @vitest-environment jsdom */

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LimitClosePositionData } from "@/components/trade/positions/position-dialog-types";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	actionButtonProps: null as Record<string, unknown> | null,
	adaptiveProps: null as Record<string, unknown> | null,
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	error: null as string | null,
	hip3Required: false,
	isMobile: false,
	isPending: false,
	isReconciling: false,
	livePosition: {
		szi: "2.5",
		entryPx: "100",
		unrealizedPnl: "2.5",
	} as { szi: string; entryPx: string; unrealizedPnl: string } | null,
	marketInfo: {
		markPx: "101" as string | undefined,
		midPx: "100.5" as string | null | undefined,
		shortName: "BTC",
		markPriceStatus: "success" as "idle" | "loading" | "success" | "stale" | "error",
		markPriceReceivedAt: Date.now() as number | undefined,
		midPriceReceivedAt: Date.now() as number | undefined,
	},
	numberInputs: new Map<string, Record<string, unknown>>(),
	phase: "idle" as "idle" | "validating" | "submitting" | "reconciling",
	positionHasError: false,
	positionIsLoading: false,
	positionIsStale: false,
	priceInputProps: null as Record<string, unknown> | null,
	resetError: vi.fn(),
	sliderProps: null as Record<string, unknown> | null,
	submit: vi.fn(),
	submitTarget: null as Record<string, unknown> | null,
	toastError: vi.fn(),
	toastInfo: vi.fn(),
	toastSuccess: vi.fn(),
	toastWarning: vi.fn(),
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => {
		testState.adaptiveProps = props;
		return createElement("div", { "data-testid": "adaptive-modal" }, children);
	},
	Button: ({ children, variant: _variant, intent: _intent, size: _size, ...props }: Record<string, unknown>) =>
		createElement("button", { type: "button", ...props }, children as ReactNode),
	ModalContent: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("div", props, children),
	ModalDescription: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("p", props, children),
	ModalFooter: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("footer", props, children),
	ModalHeader: ({ children, divider: _divider, ...props }: { children: ReactNode; divider?: boolean }) =>
		createElement("header", props, children),
	ModalTitle: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("h2", props, children),
}));

vi.mock("@/components/ui/number-input", () => ({
	NumberInput: (props: Record<string, unknown>) => {
		const ariaLabel = String(props["aria-label"]);
		testState.numberInputs.set(ariaLabel, props);
		return createElement("input", {
			"aria-label": ariaLabel,
			"aria-describedby": props["aria-describedby"],
			"aria-invalid": props["aria-invalid"],
			value: String(props.value ?? ""),
			disabled: Boolean(props.disabled),
			onChange: props.onChange,
			onBlur: props.onBlur,
		});
	},
}));

vi.mock("@/components/ui/price-input", () => ({
	PriceInput: (props: Record<string, unknown>) => {
		testState.priceInputProps = props;
		return createElement("input", {
			id: props.id,
			"aria-label": "Limit Price",
			"aria-describedby": props["aria-describedby"],
			"aria-invalid": props["aria-invalid"],
			value: String(props.value ?? ""),
			disabled: Boolean(props.disabled),
			onChange: props.onChange,
			onBlur: props.onBlur,
		});
	},
}));

vi.mock("@/components/trade/components/trade-size-slider", () => ({
	TradeSizeSlider: (props: Record<string, unknown>) => {
		testState.sliderProps = props;
		return createElement("div", {
			role: "slider",
			"aria-label": props.ariaLabel,
			"aria-valuenow": props.value,
			"aria-valuetext": props.ariaValueText,
			"aria-disabled": props.disabled,
		});
	},
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: (props: { children: ReactNode; onClick: () => void } & Record<string, unknown>) => {
		testState.actionButtonProps = props;
		return createElement(
			"button",
			{
				type: "button",
				"data-testid": "submit",
				disabled: Boolean(props.disabled),
				onClick: props.onClick,
			},
			props.children,
		);
	},
}));

vi.mock("@/components/trade/components/hip3-deployer-disclaimer", () => ({
	Hip3DeployerDisclaimer: ({ open, exit, onExit }: { open: boolean; exit: string; onExit: () => void }) =>
		createElement(
			"button",
			{ type: "button", "data-testid": "hip3-cancel", "data-open": String(open), "data-exit": exit, onClick: onExit },
			"HIP-3",
		),
}));

vi.mock("@/hooks/trade/use-hip3-disclaimer", () => ({
	useHip3DisclaimerRequirement: () => ({
		isRequired: testState.hip3Required,
		dex: testState.hip3Required ? "xyz" : undefined,
		documentationUrl: undefined,
	}),
}));

vi.mock("@/hooks/trade/use-position-limit-close-submit", () => ({
	usePositionLimitCloseSubmit: (target: Record<string, unknown>) => {
		testState.submitTarget = target;
		return {
			submit: testState.submit,
			phase: testState.phase,
			isPending: testState.isPending,
			isReconciling: testState.isReconciling,
			error: testState.error,
			resetError: testState.resetError,
		};
	},
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({
		clientKey: testState.clientKey,
		env: testState.env,
	}),
	useMarketsInfo: () => ({ getMarketInfo: () => testState.marketInfo }),
	useUserPositions: () => ({
		getPosition: () => testState.livePosition,
		isLoading: testState.positionIsLoading,
		hasError: testState.positionHasError,
		isStale: testState.positionIsStale,
	}),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => "en-US",
}));

vi.mock("sonner", () => ({
	toast: {
		error: testState.toastError,
		info: testState.toastInfo,
		success: testState.toastSuccess,
		warning: testState.toastWarning,
	},
}));

import { PositionLimitCloseModal } from "@/components/trade/positions/position-limit-close-modal";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const position: LimitClosePositionData = {
	coin: "BTC",
	dex: "",
	assetId: 0,
	signedPositionSize: "2.5",
	entryPx: "100",
	markPx: "101",
	szDecimals: 4,
	marginMode: "cross",
};

const SESSION_ID = "limit-close:1";

describe("PositionLimitCloseModal", () => {
	let container: HTMLDivElement;
	let root: Root;
	let onSessionEnd: ReturnType<typeof vi.fn<(sessionId: string) => void>>;

	function render() {
		act(() => {
			root.render(
				createElement(PositionLimitCloseModal, {
					session: { sessionId: SESSION_ID, position: { ...position } },
					onSessionEnd,
				}),
			);
		});
	}

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		onSessionEnd = vi.fn<(sessionId: string) => void>();
		testState.actionButtonProps = null;
		testState.adaptiveProps = null;
		testState.clientKey = "0x1111111111111111111111111111111111111111";
		testState.env = "Mainnet";
		testState.error = null;
		testState.hip3Required = false;
		testState.isMobile = false;
		testState.isPending = false;
		testState.isReconciling = false;
		testState.livePosition = { szi: "2.5", entryPx: "100", unrealizedPnl: "2.5" };
		testState.marketInfo.markPx = "101";
		testState.marketInfo.midPx = "100.5";
		testState.marketInfo.shortName = "BTC";
		testState.marketInfo.markPriceStatus = "success";
		testState.marketInfo.markPriceReceivedAt = Date.now();
		testState.marketInfo.midPriceReceivedAt = Date.now();
		testState.numberInputs.clear();
		testState.phase = "idle";
		testState.positionHasError = false;
		testState.positionIsLoading = false;
		testState.positionIsStale = false;
		testState.priceInputProps = null;
		testState.resetError.mockReset();
		testState.sliderProps = null;
		testState.submit.mockReset().mockResolvedValue({ state: "confirmed", result: {} });
		testState.submitTarget = null;
		testState.toastError.mockReset();
		testState.toastInfo.mockReset();
		testState.toastSuccess.mockReset();
		testState.toastWarning.mockReset();
	});

	function enterPrice(value: string) {
		act(() => {
			(testState.priceInputProps?.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
		});
	}

	function getSubmitButton(): HTMLButtonElement {
		const button = container.querySelector<HTMLButtonElement>('[data-testid="submit"]');
		if (!button) throw new Error("Expected the submit button");
		return button;
	}

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

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("reuses the desktop close shell and renders limit-specific price and GTC semantics", () => {
		render();

		expect(testState.adaptiveProps).toMatchObject({
			presentation: "modal",
			dismissible: true,
			showClose: true,
			showHandle: false,
		});
		expect(testState.adaptiveProps?.className).toContain("min-[1001px]:max-w-[27.5rem]");
		expect(testState.submitTarget).toEqual({
			owner: "0x1111111111111111111111111111111111111111",
			env: "Mainnet",
			coin: "BTC",
			dex: "",
			assetId: 0,
			szDecimals: 4,
			signedPositionSize: "2.5",
			marginMode: "cross",
		});
		expect(testState.priceInputProps).toMatchObject({ value: "", midPrice: "100.5", maxAllowedDecimals: 2 });
		expect(container.querySelector('[data-testid="position-limit-close-summary"]')?.textContent).toContain(
			"Estimated PnL-",
		);
		expect(container.textContent).toContain("Order will rest until filled or canceled.");
		expect(container.querySelector('input[type="checkbox"]')).toBeNull();
		expect(testState.actionButtonProps?.holdDurationMs).toBeUndefined();
		expect(testState.actionButtonProps?.requireReadyConfirmation).toBe(true);
	});

	it("starts blank and never auto-overwrites the user's price", () => {
		testState.marketInfo.markPriceStatus = "stale";
		render();

		expect(testState.priceInputProps).toMatchObject({ value: "", midPrice: undefined });
		expect(testState.priceInputProps?.onMidClick).toBeUndefined();
		expect(container.querySelector('[data-testid="position-limit-close-summary"]')?.textContent).toContain(
			"Mark price$101",
		);
		expect(container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.disabled).toBe(true);

		testState.marketInfo.markPriceStatus = "success";
		testState.marketInfo.markPx = "102";
		testState.marketInfo.midPx = "101.5";
		testState.marketInfo.markPriceReceivedAt = Date.now();
		testState.marketInfo.midPriceReceivedAt = Date.now();
		render();
		expect(testState.priceInputProps?.value).toBe("");

		act(() => {
			(testState.priceInputProps?.onChange as (event: { target: { value: string } }) => void)({
				target: { value: "99" },
			});
		});
		testState.marketInfo.markPx = "103";
		testState.marketInfo.midPx = "102.5";
		testState.marketInfo.markPriceReceivedAt = Date.now();
		testState.marketInfo.midPriceReceivedAt = Date.now();
		render();

		expect(testState.priceInputProps).toMatchObject({ value: "99", midPrice: "102.5" });
	});

	it("does not substitute mark price for an unavailable Mid shortcut", () => {
		testState.marketInfo.midPriceReceivedAt = undefined;
		render();

		expect(testState.priceInputProps).toMatchObject({ value: "", midPrice: undefined });
		expect(testState.priceInputProps?.onMidClick).toBeUndefined();
	});

	it("uses the terminal mobile breakpoint presentation", () => {
		testState.isMobile = true;
		render();

		expect(testState.adaptiveProps).toMatchObject({
			presentation: "drawer",
			dismissible: true,
			showClose: true,
			showHandle: true,
		});
		const titleRow = container.querySelector("h2")?.parentElement;
		expect(titleRow?.children).toHaveLength(1);
		expect(titleRow?.className).toContain("max-[1000px]:pe-10");
		expect(container.querySelector('[data-testid="position-limit-close-summary"]')?.textContent).toContain("2.5000");
	});

	it("keeps price text while editing and links quantity, percentage, chips, and slider through one intent", () => {
		render();
		const priceInput = container.querySelector<HTMLInputElement>('input[aria-label="Limit Price"]');

		act(() => {
			priceInput?.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "" }));
			(testState.priceInputProps?.onChange as (event: { target: { value: string } }) => void)({
				target: { value: "123.456" },
			});
		});
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Limit Price"]')?.value).toBe("123.456");

		act(() => (testState.priceInputProps?.onBlur as () => void)());
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Limit Price"]')?.value).toBe("123.46");

		act(() => {
			(testState.numberInputs.get("Close size")?.onChange as (event: { target: { value: string } }) => void)({
				target: { value: "1.25" },
			});
		});
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close percentage"]')?.value).toBe("50");

		expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(0);
		act(() => {
			(testState.numberInputs.get("Close percentage")?.onChange as (event: { target: { value: string } }) => void)({
				target: { value: "75" },
			});
		});
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close size"]')?.value).toBe("1.8750");

		act(() => (testState.sliderProps?.onPercentChange as (value: number) => void)(25));
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close size"]')?.value).toBe("0.6250");
		expect(container.querySelector('[role="slider"]')?.getAttribute("aria-valuetext")).toBe("25%");
	});

	it("closes at the click, submits exact strings once and leaves order feedback to the submit hook", async () => {
		const settle = holdSubmission();
		render();
		enterPrice("101");

		await act(async () => getSubmitButton().click());
		expect(testState.submit).toHaveBeenCalledExactlyOnceWith({ price: "101", size: "2.5" });
		expect(testState.adaptiveProps?.open).toBe(false);
		expect(onSessionEnd).not.toHaveBeenCalled();
		expect(testState.toastSuccess).not.toHaveBeenCalled();

		await act(async () => getSubmitButton().click());
		act(() => (testState.adaptiveProps?.onOpenChange as (open: boolean) => void)(false));
		expect(testState.submit).toHaveBeenCalledTimes(1);
		expect(onSessionEnd).not.toHaveBeenCalled();

		await act(async () => settle({ state: "confirmed", result: {} }));
		expect(testState.toastSuccess).not.toHaveBeenCalled();
		expect(onSessionEnd).toHaveBeenCalledExactlyOnceWith(SESSION_ID);
	});

	it("submits once when the submit control is activated twice in the same tick", async () => {
		render();
		enterPrice("101");
		await act(async () => {
			const onClick = testState.actionButtonProps?.onClick as () => Promise<void>;
			void onClick();
			void onClick();
		});
		expect(testState.submit).toHaveBeenCalledTimes(1);
	});

	it.each(["cancel", "commit", "no-move"])(
		"ignores confirm during a slider gesture ending with %s without greying the button",
		async (ending) => {
			render();
			act(() => {
				(testState.priceInputProps?.onChange as (event: { target: { value: string } }) => void)({
					target: { value: "101" },
				});
				(testState.numberInputs.get("Close size")?.onChange as (event: { target: { value: string } }) => void)({
					target: { value: "1.0000" },
				});
			});
			const submitBeforeStart = testState.actionButtonProps?.onClick as () => void;
			const getSubmitButton = () => container.querySelector<HTMLButtonElement>('[data-testid="submit"]');
			const isLocked = () => (testState.actionButtonProps?.isActivationLocked as () => boolean)();
			expect(isLocked()).toBe(false);

			act(() => {
				(testState.sliderProps?.onPercentInteractionStart as () => void)();
				submitBeforeStart();
			});
			await act(async () => {
				getSubmitButton()?.click();
			});
			expect(testState.submit).not.toHaveBeenCalled();
			expect(testState.actionButtonProps?.disabled).toBe(false);
			expect(isLocked()).toBe(true);
			expect(testState.sliderProps?.disabled).toBe(false);

			if (ending !== "no-move") {
				act(() => (testState.sliderProps?.onPercentChange as (value: number) => void)(75));
				await act(async () => {
					getSubmitButton()?.click();
				});
				act(() => {
					const callback = ending === "cancel" ? "onPercentCancel" : "onPercentCommit";
					(testState.sliderProps?.[callback] as (value: number) => void)(75);
				});
				if (ending === "cancel") {
					expect(container.querySelector<HTMLInputElement>('input[aria-label="Close size"]')?.value).toBe("1.0000");
				}
				await act(async () => {
					getSubmitButton()?.click();
				});
				expect(testState.submit).not.toHaveBeenCalled();
				expect(testState.actionButtonProps?.disabled).toBe(false);
			}

			act(() => (testState.sliderProps?.onPercentInteractionEnd as () => void)());
			expect(testState.actionButtonProps?.disabled).toBe(false);
			expect(isLocked()).toBe(false);
			expect(testState.submit).not.toHaveBeenCalled();

			await act(async () => {
				getSubmitButton()?.click();
			});
			expect(testState.submit).toHaveBeenCalledTimes(1);
			expect(testState.submit).toHaveBeenCalledWith({
				price: "101",
				size: ending === "commit" ? "1.875" : "1",
			});
		},
	);

	it("includes the live account and network in the slider identity and rejects the old drag", () => {
		render();
		const previousIdentity = testState.sliderProps?.interactionIdentity;
		act(() => (testState.sliderProps?.onPercentInteractionStart as () => void)());
		testState.clientKey = "0x2222222222222222222222222222222222222222";
		testState.env = "Testnet";
		render();
		expect(testState.sliderProps?.interactionIdentity).not.toBe(previousIdentity);
		expect(testState.sliderProps?.interactionIdentity).toContain(testState.clientKey);
		expect(testState.sliderProps?.interactionIdentity).toContain("Testnet");
		act(() => {
			(testState.sliderProps?.onPercentCommit as (value: number) => void)(75);
			(testState.sliderProps?.onPercentInteractionEnd as () => void)();
		});
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close size"]')?.value).toBe("2.5000");
	});

	it("normalizes the Mid shortcut to the exact protocol price before displaying or submitting", async () => {
		testState.marketInfo.midPx = "123.4567";
		render();

		act(() => (testState.priceInputProps?.onMidClick as (value: string) => void)("123.4567"));
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Limit Price"]')?.value).toBe("123.46");

		await act(async () => {
			container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.click();
		});
		expect(testState.submit).toHaveBeenCalledWith({ price: "123.46", size: "2.5" });
	});

	it.each([
		{ state: "reconciling", submissionId: "submission-1" },
		{ state: "blocked" },
		{ state: "confirmed", result: {} },
	] as const)("leaves %o feedback to its submit hook without a duplicate toast", async (outcome) => {
		testState.submit.mockResolvedValue({ ...outcome });
		render();
		enterPrice("101");
		await act(async () => getSubmitButton().click());

		for (const name of ["toastError", "toastInfo", "toastSuccess", "toastWarning"] as const) {
			expect(testState[name]).not.toHaveBeenCalled();
		}
		expect(testState.adaptiveProps?.open).toBe(false);
		expect(onSessionEnd).toHaveBeenCalledExactlyOnceWith(SESSION_ID);
	});

	it("ends a failed submission without duplicating feedback", async () => {
		testState.submit.mockRejectedValue(new Error("Trading data changed"));
		render();
		enterPrice("101");
		await act(async () => getSubmitButton().click());

		expect(testState.toastError).not.toHaveBeenCalled();
		expect(onSessionEnd).toHaveBeenCalledExactlyOnceWith(SESSION_ID);
	});

	it.each(["validating", "submitting", "reconciling"] as const)("never shows the %s phase in the dialog", (phase) => {
		testState.phase = phase;
		testState.isPending = phase !== "reconciling";
		testState.isReconciling = phase === "reconciling";
		testState.error = "Order submitted. Confirming exchange status; do not retry.";
		render();
		expect(getSubmitButton().textContent).toBe("Place Limit Close");
		expect(testState.adaptiveProps).toMatchObject({ open: true, dismissible: true, showClose: true });
		expect(container.textContent).not.toContain("Confirming exchange status");
		expect(container.textContent).not.toContain("Closing this dialog will not cancel it.");
	});

	it("fails closed when the live position is stale or changes direction", () => {
		testState.positionIsStale = true;
		render();
		expect(container.textContent).not.toContain("Live position data is stale");
		expect(container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.disabled).toBe(true);
		expect(testState.sliderProps).toMatchObject({ paused: true, disabled: false });

		testState.positionIsStale = false;
		testState.livePosition = { szi: "-2.5", entryPx: "100", unrealizedPnl: "2.5" };
		render();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("This position changed sides");
		expect(container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.disabled).toBe(true);
		expect(testState.sliderProps).toMatchObject({ paused: false, disabled: true });
	});

	it("shows the target HIP-3 disclaimer before mounting the order controller", () => {
		testState.hip3Required = true;
		render();

		expect(testState.submitTarget).toBeNull();
		const disclaimer = container.querySelector<HTMLButtonElement>('[data-testid="hip3-cancel"]');
		expect(disclaimer?.getAttribute("data-exit")).toBe("cancel");
		expect(disclaimer?.getAttribute("data-open")).toBe("true");
		act(() => disclaimer?.click());
		expect(onSessionEnd).toHaveBeenCalledWith(SESSION_ID);
	});

	it("captures owner and environment before the HIP-3 disclaimer can switch accounts", () => {
		vi.useFakeTimers();
		try {
			testState.hip3Required = true;
			render();
			expect(testState.submitTarget).toBeNull();

			testState.clientKey = "0x2222222222222222222222222222222222222222";
			testState.env = "Testnet";
			testState.hip3Required = false;
			render();
			expect(container.querySelector('[data-testid="hip3-cancel"]')?.getAttribute("data-open")).toBe("false");
			expect(testState.submitTarget).toBeNull();

			act(() => {
				vi.advanceTimersByTime(250);
			});
			expect(container.querySelector('[data-testid="hip3-cancel"]')).toBeNull();
			expect(testState.submitTarget).toMatchObject({
				owner: "0x1111111111111111111111111111111111111111",
				env: "Mainnet",
			});
		} finally {
			vi.useRealTimers();
		}
	});
});
