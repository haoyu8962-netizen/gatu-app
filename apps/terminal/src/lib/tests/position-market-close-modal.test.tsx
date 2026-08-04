/** @vitest-environment jsdom */

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	adaptiveProps: null as Record<string, unknown> | null,
	close: vi.fn(),
	error: null as string | null,
	isMobile: false,
	isPending: false,
	isReconciling: false,
	livePosition: { szi: "2.5" } as { szi: string } | null,
	marketsInfo: { markPx: "101000" } as { markPx: string } | undefined,
	numberInputs: new Map<string, Record<string, unknown>>(),
	positionHasError: false,
	positionIsLoading: false,
	positionIsStale: false,
	preferenceStatus: "required" as "dismissed" | "required" | "unavailable",
	marketDataStatus: "active" as "idle" | "subscribing" | "active" | "error",
	marketDataIsStale: false,
	resetError: vi.fn(),
	session: {
		sessionId: "session-1",
		owner: "0xabc",
		env: "Mainnet" as const,
		position: {
			coin: "BTC",
			dex: "",
			assetId: 0,
			szDecimals: 4,
			signedPositionSize: "2.5",
			markPx: "100000",
			marginMode: "cross" as const,
		},
		sizingIntent: { kind: "max" } as
			| { kind: "max" }
			| { kind: "percent"; value: string }
			| { kind: "size"; value: string },
		phase: "idle" as "idle" | "validating" | "submitting" | "reconciling",
		error: null as string | null,
	},
	setSizingIntent: vi.fn(),
	sliderProps: null as Record<string, unknown> | null,
	submit: vi.fn(async () => {}),
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => {
		testState.adaptiveProps = props;
		return createElement("div", { "data-testid": "adaptive-modal" }, children);
	},
	ModalContent: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("div", props, children),
	ModalDescription: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("p", props, children),
	ModalHeader: ({ children, divider: _divider, ...props }: { children: ReactNode; divider?: boolean }) =>
		createElement("header", props, children),
	ModalTitle: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("h2", props, children),
	Checkbox: ({
		checked,
		disabled,
		label,
		description,
		onCheckedChange,
	}: {
		checked: boolean;
		disabled?: boolean;
		label: ReactNode;
		description?: ReactNode;
		onCheckedChange: (checked: boolean) => void;
	}) =>
		createElement(
			"label",
			null,
			createElement("input", {
				type: "checkbox",
				checked,
				disabled,
				"aria-label": String(label),
				onChange: (event: { target: { checked: boolean } }) => onCheckedChange(event.target.checked),
			}),
			label,
			description,
		),
}));

vi.mock("@/components/ui/number-input", () => ({
	NumberInput: (props: Record<string, unknown>) => {
		const ariaLabel = String(props["aria-label"]);
		testState.numberInputs.set(ariaLabel, props);
		return createElement(
			"div",
			null,
			createElement("input", {
				"aria-label": ariaLabel,
				value: props.value,
				disabled: props.disabled,
				readOnly: true,
			}),
			props.onMaxClick
				? createElement(
						"button",
						{ type: "button", onClick: props.onMaxClick as () => void },
						props.maxLabel as ReactNode,
					)
				: null,
		);
	},
}));

vi.mock("@/components/trade/components/trade-size-slider", () => ({
	TradeSizeSlider: (props: Record<string, unknown>) => {
		testState.sliderProps = props;
		return createElement("div", {
			role: "slider",
			"aria-label": props.ariaLabel,
			"aria-valuetext": props.ariaValueText,
		});
	},
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({
		children,
		onClick,
		containerClassName: _containerClassName,
		requireReadyConfirmation: _requireReadyConfirmation,
		...props
	}: {
		children: ReactNode;
		onClick: () => void;
		containerClassName?: string;
		requireReadyConfirmation?: boolean;
	}) => createElement("button", { ...props, type: "button", "data-testid": "submit", onClick }, children),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@/hooks/trade/use-position-market-close-submit", () => ({
	usePositionMarketCloseSubmit: () => ({
		submit: testState.submit,
		isPending: testState.isPending,
		isReconciling: testState.isReconciling,
		error: testState.error,
		resetError: testState.resetError,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarketsInfo: () => ({ getMarketInfo: () => testState.marketsInfo }),
	useSubscription: () => ({
		data: { ctx: { markPx: "102000" } },
		status: testState.marketDataStatus,
		isStale: testState.marketDataIsStale,
	}),
	useUserPositions: () => ({
		getPosition: () => testState.livePosition,
		isLoading: testState.positionIsLoading,
		hasError: testState.positionHasError,
		isStale: testState.positionIsStale,
	}),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => "en-US",
	useMarketOrderSlippagePercent: () => 0.5,
}));

vi.mock("@/lib/trade/position-market-close-confirmation-preference", () => ({
	readPositionMarketCloseConfirmationPreference: () => testState.preferenceStatus,
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	usePositionMarketCloseSession: () => testState.session,
	usePositionMarketCloseActions: () => ({
		open: vi.fn(),
		close: testState.close,
		setSizingIntent: testState.setSizingIntent,
		updatePhase: vi.fn(),
		setError: vi.fn(),
	}),
}));

import { PositionMarketCloseModal } from "@/components/trade/positions/position-market-close-modal";

describe("PositionMarketCloseModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	function render() {
		act(() => root.render(<PositionMarketCloseModal />));
	}

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.adaptiveProps = null;
		testState.close.mockReset();
		testState.error = null;
		testState.isMobile = false;
		testState.isPending = false;
		testState.isReconciling = false;
		testState.livePosition = { szi: "2.5" };
		testState.marketsInfo = { markPx: "101000" };
		testState.numberInputs.clear();
		testState.positionHasError = false;
		testState.positionIsLoading = false;
		testState.positionIsStale = false;
		testState.preferenceStatus = "required";
		testState.marketDataStatus = "active";
		testState.marketDataIsStale = false;
		testState.session.position.signedPositionSize = "2.5";
		testState.session.position.szDecimals = 4;
		testState.resetError.mockReset();
		testState.session.sizingIntent = { kind: "max" };
		testState.session.phase = "idle";
		testState.session.error = null;
		testState.setSizingIntent.mockReset();
		testState.sliderProps = null;
		testState.submit.mockClear();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("defaults to max and derives both inputs without duplicate state", async () => {
		render();

		expect(testState.adaptiveProps).toMatchObject({
			presentation: "modal",
			dismissible: true,
			showClose: true,
		});
		expect(container.textContent).toContain("Market Close");
		expect(container.textContent).toContain("Remaining");
		expect(container.textContent).toContain("0.0000 BTC");
		expect(container.textContent).toContain("102,000 USDC");
		expect(container.textContent).toContain("Max Slippage");
		expect(container.textContent).not.toContain("Cancel");
		expect(container.textContent).toContain("Don't show this confirmation again");
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close size"]')?.value).toBe("2.5");
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close percentage"]')?.value).toBe("100");
		expect(testState.numberInputs.get("Close percentage")?.className).toContain("w-full");
		expect(container.querySelector('[role="slider"]')?.getAttribute("aria-valuetext")).toBe(
			"100% selected; 100% after size precision",
		);

		await act(async () => {
			container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.click();
		});
		expect(testState.submit).toHaveBeenCalledWith({
			sessionId: "session-1",
			dismissFutureConfirmation: false,
		});
	});

	it("sends the opt-out only for a full-position confirmation", async () => {
		render();
		const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
		expect(checkbox?.disabled).toBe(false);

		act(() => checkbox?.click());
		await act(async () => {
			container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.click();
		});

		expect(testState.submit).toHaveBeenCalledWith({
			sessionId: "session-1",
			dismissFutureConfirmation: true,
		});
	});

	it("shows an existing opt-out accurately when a direct close falls back to the dialog", async () => {
		testState.preferenceStatus = "dismissed";
		render();

		const checkbox = container.querySelector<HTMLInputElement>(
			'input[aria-label="Don\'t show this confirmation again"]',
		);
		expect(checkbox).toMatchObject({ checked: true, disabled: true });

		await act(async () => {
			container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.click();
		});
		expect(testState.submit).toHaveBeenCalledWith({
			sessionId: "session-1",
			dismissFutureConfirmation: false,
		});
	});

	it("writes size, percent, slider, and max events to one sizing intent", () => {
		render();
		const sizeInput = testState.numberInputs.get("Close size");
		const percentInput = testState.numberInputs.get("Close percentage");

		act(() => {
			(sizeInput?.onChange as (event: { target: { value: string } }) => void)({ target: { value: "1.25" } });
			(percentInput?.onChange as (event: { target: { value: string } }) => void)({ target: { value: "50" } });
			(testState.sliderProps?.onPercentChange as (value: number) => void)(75);
			(sizeInput?.onMaxClick as () => void)();
		});

		expect(testState.setSizingIntent.mock.calls).toEqual([
			["session-1", { kind: "size", value: "1.25" }],
			["session-1", { kind: "percent", value: "50" }],
			["session-1", { kind: "percent", value: "75" }],
			["session-1", { kind: "max" }],
		]);
		expect(testState.resetError).toHaveBeenCalledTimes(4);
	});

	it("keeps the requested percent on the controls while showing the lot-adjusted close", () => {
		testState.session.position.signedPositionSize = "3";
		testState.session.position.szDecimals = 0;
		testState.livePosition = { szi: "3" };
		testState.session.sizingIntent = { kind: "percent", value: "50" };
		render();

		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close size"]')?.value).toBe("1");
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close percentage"]')?.value).toBe("50");
		expect(container.querySelector('[role="slider"]')?.getAttribute("aria-valuetext")).toBe(
			"50% selected; 33.3% after size precision",
		);
		expect(container.textContent).toContain("1 BTC (33.3%)");
		expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(true);

		testState.livePosition = { szi: "4" };
		render();
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close size"]')?.value).toBe("2");
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close percentage"]')?.value).toBe("50");
	});

	it("preserves manual size while live position changes and fails closed on stale data", () => {
		testState.session.sizingIntent = { kind: "size", value: "1.25" };
		testState.livePosition = { szi: "3" };
		render();
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close size"]')?.value).toBe("1.25");

		testState.livePosition = { szi: "2" };
		render();
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close size"]')?.value).toBe("1.25");

		testState.positionIsStale = true;
		render();
		expect(container.textContent).toContain("Live position data is stale");
		expect(container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.disabled).toBe(true);
		expect(testState.numberInputs.get("Close size")?.disabled).toBe(true);
	});

	it("fails closed for every unavailable or incompatible live position state", () => {
		testState.positionIsLoading = true;
		render();
		expect(container.textContent).toContain("Loading the latest position");

		testState.positionIsLoading = false;
		testState.positionHasError = true;
		render();
		expect(container.textContent).toContain("Live position data is unavailable");

		testState.positionHasError = false;
		testState.livePosition = null;
		render();
		expect(container.textContent).toContain("This position is no longer open");

		testState.livePosition = { szi: "-2.5" };
		render();
		expect(container.textContent).toContain("This position changed sides");
		expect(container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.disabled).toBe(true);
	});

	it("does not present stale market data as a current execution price", () => {
		testState.marketDataIsStale = true;
		render();

		expect(container.textContent).toContain("BTC · Unavailable");
		expect(container.textContent).not.toContain("102,000 USDC");
		expect(container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.disabled).toBe(false);
	});

	it("uses a drawer on mobile and permits explicit dismissal while reconciling", () => {
		testState.isMobile = true;
		testState.isReconciling = true;
		testState.session.phase = "reconciling";
		testState.error = "Order submitted. Confirming exchange status; do not retry.";
		render();

		expect(testState.adaptiveProps).toMatchObject({
			presentation: "drawer",
			dismissible: true,
			showClose: true,
			showHandle: true,
		});
		expect(container.textContent).toContain("Closing this dialog will not cancel it.");
		expect(container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.disabled).toBe(true);

		act(() => (testState.adaptiveProps?.onOpenChange as (open: boolean) => void)(false));
		expect(testState.close).toHaveBeenCalledWith("session-1");
	});

	it("locks dismissal and editing while submitting", () => {
		testState.isPending = true;
		testState.session.phase = "submitting";
		render();

		expect(testState.adaptiveProps).toMatchObject({
			dismissible: false,
			showClose: false,
			showHandle: false,
		});
		expect(testState.numberInputs.get("Close size")?.disabled).toBe(true);
		expect(testState.numberInputs.get("Close percentage")?.disabled).toBe(true);
		expect(testState.sliderProps?.disabled).toBe(true);
		expect(container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.disabled).toBe(true);
		expect(container.textContent).toContain("Submitting...");
	});
});
