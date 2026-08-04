/** @vitest-environment jsdom */

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ComponentProps, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	actionButtonProps: null as Record<string, unknown> | null,
	adaptiveProps: null as Record<string, unknown> | null,
	checkboxProps: null as Record<string, unknown> | null,
	close: vi.fn(),
	error: null as string | null,
	isMobile: false,
	isPending: false,
	isReconciling: false,
	livePosition: {
		szi: "2.5",
		entryPx: "100000",
		unrealizedPnl: "-50",
	} as { szi: string; entryPx?: string; unrealizedPnl?: string } | null,
	marketsInfo: { markPx: "101000", shortName: "BTC" } as { markPx: string; shortName?: string } | undefined,
	numberInputs: new Map<string, Record<string, unknown>>(),
	positionHasError: false,
	positionIsLoading: false,
	positionIsStale: false,
	preferenceStatus: "required" as "dismissed" | "required" | "unavailable",
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

const zhTranslations: Record<string, string> = {
	"Market Close": "市价平仓",
	Close: "关闭",
	"Position summary": "持仓摘要",
	"Close size": "平仓数量",
	"Close percentage": "平仓比例",
	"Close percentage slider": "平仓比例滑杆",
	"Don't show this confirmation again": "以后不再提示",
};

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const zhMessages: Messages = Object.fromEntries(
	Object.entries(zhTranslations).map(([message, translation]) => [getMessageId(message), translation]),
);

function activateLocale(locale: "en" | "zh") {
	i18n.loadAndActivate({ locale, messages: locale === "zh" ? zhMessages : {} });
}

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => {
		testState.adaptiveProps = props;
		return createElement("div", { "data-testid": "adaptive-modal" }, children);
	},
	Button: ({ children, variant: _variant, intent: _intent, size: _size, ...props }: Record<string, unknown>) =>
		createElement("button", { type: "button", ...props }, children as ReactNode),
	Checkbox: (props: Record<string, unknown>) => {
		testState.checkboxProps = props;
		const { checked, disabled, label, description, onCheckedChange } = props as {
			checked: boolean;
			disabled?: boolean;
			label: ReactNode;
			description?: ReactNode;
			onCheckedChange: (checked: boolean) => void;
		};
		return createElement(
			"label",
			null,
			createElement("input", {
				type: "checkbox",
				"data-testid": props["data-testid"],
				checked,
				disabled,
				"aria-label": String(label),
				onChange: (event: { target: { checked: boolean } }) => onCheckedChange(event.target.checked),
			}),
			label,
			description,
		);
	},
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
		return createElement(
			"div",
			null,
			createElement("input", {
				"aria-label": ariaLabel,
				"aria-describedby": props["aria-describedby"],
				"aria-invalid": props["aria-invalid"],
				value: String(props.value ?? ""),
				disabled: Boolean(props.disabled),
				onChange: props.onChange,
				onBlur: props.onBlur,
			}),
			createElement("span", { "data-testid": `${ariaLabel}-suffix` }, props.suffix as ReactNode),
		);
	},
}));

vi.mock("@/components/trade/components/trade-size-slider", () => ({
	TradeSizeSlider: (props: Record<string, unknown>) => {
		testState.sliderProps = props;
		return createElement("div", {
			role: "slider",
			"aria-label": props.ariaLabel,
			"aria-describedby": props.ariaDescribedBy,
			"aria-invalid": props.ariaInvalid,
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
				"aria-describedby": props["aria-describedby"],
				className: props.className,
				disabled: Boolean(props.disabled),
				onClick: props.onClick,
			},
			props.children,
		);
	},
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

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("PositionMarketCloseModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	function render(props: ComponentProps<typeof PositionMarketCloseModal> = {}) {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<PositionMarketCloseModal {...props} />
				</I18nProvider>,
			),
		);
	}

	function getSummaryValue(label: string): HTMLElement | null {
		const summary = container.querySelector<HTMLElement>('[data-testid="position-market-close-summary"]');
		const labelElement = [...(summary?.querySelectorAll<HTMLElement>("span") ?? [])].find(
			(element) => element.textContent === label,
		);
		return labelElement?.parentElement?.querySelectorAll<HTMLElement>("span").item(1) ?? null;
	}

	function expectEditingLocked() {
		expect(testState.numberInputs.get("Close size")?.disabled).toBe(true);
		expect(testState.numberInputs.get("Close percentage")?.disabled).toBe(true);
		expect(testState.sliderProps?.disabled).toBe(true);
		expect(
			[...container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].every((button) => button.disabled),
		).toBe(true);
		expect(container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.disabled).toBe(true);
	}

	beforeEach(() => {
		activateLocale("en");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.actionButtonProps = null;
		testState.adaptiveProps = null;
		testState.checkboxProps = null;
		testState.close.mockReset();
		testState.error = null;
		testState.isMobile = false;
		testState.isPending = false;
		testState.isReconciling = false;
		testState.livePosition = { szi: "2.5", entryPx: "100000", unrealizedPnl: "-50" };
		testState.marketsInfo = { markPx: "101000", shortName: "BTC" };
		testState.numberInputs.clear();
		testState.positionHasError = false;
		testState.positionIsLoading = false;
		testState.positionIsStale = false;
		testState.preferenceStatus = "required";
		testState.session.position.signedPositionSize = "2.5";
		testState.session.position.szDecimals = 4;
		testState.session.position.markPx = "100000";
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

	it("uses the 440px desktop modal and scales the four-line summary PnL", () => {
		testState.session.sizingIntent = { kind: "percent", value: "50" };
		render();

		expect(testState.adaptiveProps).toMatchObject({
			presentation: "modal",
			dismissible: true,
			showClose: true,
			showHandle: false,
			closeLabel: "Close",
		});
		expect(testState.adaptiveProps?.className).toContain("min-[1001px]:max-w-[27.5rem]");
		expect(testState.adaptiveProps?.className).toContain("!rounded-t-[20px]");
		expect(testState.adaptiveProps?.className).toContain("min-[1001px]:!rounded-[16px]");
		expect(testState.adaptiveProps?.className).not.toContain("rounded-t-20");
		expect(testState.adaptiveProps?.className).not.toContain("min-[1001px]:rounded-16");
		expect(getSummaryValue("Available to close")?.textContent).toBe("2.5000 BTC");
		expect(getSummaryValue("Entry price")?.textContent).toBe("$100,000");
		expect(getSummaryValue("Mark price")?.textContent).toBe("$101,000");
		expect(getSummaryValue("Estimated PnL")?.textContent).toBe("-$25.00");
		expect(getSummaryValue("Estimated PnL")?.className).toContain("text-market-close-danger");
		expect(container.querySelector('[data-testid="position-market-close-summary"]')?.className).toMatch(
			/rounded-\[12px\].*border.*bg-market-close-card/,
		);
		expect(container.querySelector('[data-testid="position-market-close-summary"]')?.className).not.toContain(
			"rounded-12",
		);
		expect(testState.numberInputs.get("Close size")?.className).toContain("!rounded-[10px]");
		expect(testState.numberInputs.get("Close percentage")?.className).toContain("!rounded-[10px]");
		expect(testState.numberInputs.get("Close size")?.suffixClassName).toContain("right-3");
		expect(testState.numberInputs.get("Close percentage")?.suffixClassName).toContain("right-2.5");
		const quickChip = container.querySelector<HTMLButtonElement>('button[aria-pressed="false"]');
		const selectedChip = container.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
		expect(quickChip?.className).toContain("!rounded-[8px]");
		expect(selectedChip?.className).toContain("!bg-market-close-control");
		expect(selectedChip?.className).toContain("!text-market-close-on-control");
		expect(testState.sliderProps).toMatchObject({
			thumbAlignment: "center",
			controlClassName: "h-9 min-[1001px]:h-8",
		});
		expect(testState.sliderProps?.thumbClassName).toContain("size-[30px]");
		expect(testState.sliderProps?.thumbClassName).toContain("min-[1001px]:size-[26px]");
		expect(container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.textContent).toContain(
			"Market Close 1.2500 BTC",
		);
		expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')).not.toBeNull();
		expect(testState.checkboxProps).toMatchObject({
			controlClassName: expect.stringContaining("size-5 !rounded-[5px]"),
			labelClassName: expect.stringContaining("text-[13px]"),
		});
		expect(testState.actionButtonProps?.className).toContain("!rounded-[12px]");
		expect(testState.actionButtonProps?.className).toContain("!text-market-close-danger-text");
	});

	it("uses the design-sized mobile drawer and keeps the opt-out visible", () => {
		testState.isMobile = true;
		render();

		expect(testState.adaptiveProps).toMatchObject({
			presentation: "drawer",
			dismissible: true,
			showClose: false,
			showHandle: true,
			handleClassName: "top-2.5 h-1 w-9 !rounded-[2px] bg-market-close-stroke-input",
		});
		const preference = container.querySelector<HTMLInputElement>(
			'[data-testid="position-market-close-confirmation-preference"]',
		);
		expect(preference).toMatchObject({ checked: false, disabled: false });
		expect(preference?.getAttribute("aria-label")).toBe("Don't show this confirmation again");
		expect(getSummaryValue("Available to close")?.textContent).toBe("2.5000");
		expect(container.querySelector('[data-testid="position-market-close-summary"] div')?.className).toContain(
			"justify-between",
		);
		expect(testState.adaptiveProps?.className).toContain("!rounded-t-[20px]");
		expect(testState.numberInputs.get("Close percentage")?.className).toContain("h-[46px]");
		expect(testState.checkboxProps?.controlClassName).toContain("!rounded-[5px]");
	});

	it("normalizes size on blur with the market's current szDecimals", () => {
		testState.session.position.signedPositionSize = "1.23456";
		testState.session.position.szDecimals = 5;
		testState.livePosition = { szi: "1.23456", entryPx: "100000", unrealizedPnl: "10" };
		testState.session.sizingIntent = { kind: "size", value: "0.333339" };
		render();

		let sizeInput = testState.numberInputs.get("Close size");
		expect(sizeInput?.maxAllowedDecimals).toBe(5);
		act(() => (sizeInput?.onBlur as () => void)());
		expect(testState.setSizingIntent).toHaveBeenLastCalledWith("session-1", {
			kind: "size",
			value: "0.33333",
		});

		testState.setSizingIntent.mockClear();
		testState.session.position.signedPositionSize = "1.23";
		testState.session.position.szDecimals = 2;
		testState.livePosition = { szi: "1.23", entryPx: "100000", unrealizedPnl: "10" };
		testState.session.sizingIntent = { kind: "size", value: "0.339" };
		render();

		sizeInput = testState.numberInputs.get("Close size");
		expect(sizeInput?.maxAllowedDecimals).toBe(2);
		act(() => (sizeInput?.onBlur as () => void)());
		expect(testState.setSizingIntent).toHaveBeenLastCalledWith("session-1", {
			kind: "size",
			value: "0.33",
		});
	});

	it("routes quantity, percentage, quick-chip, and slider edits through one sizing intent", () => {
		render();
		const sizeInput = testState.numberInputs.get("Close size");
		const percentInput = testState.numberInputs.get("Close percentage");
		const maxChip = [...container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
			(button) => button.textContent === "Max",
		);

		act(() => {
			(sizeInput?.onChange as (event: { target: { value: string } }) => void)({ target: { value: "1.25" } });
			(percentInput?.onChange as (event: { target: { value: string } }) => void)({ target: { value: "50" } });
			maxChip?.click();
			(testState.sliderProps?.onPercentChange as (value: number) => void)(75);
		});

		expect(testState.setSizingIntent.mock.calls).toEqual([
			["session-1", { kind: "size", value: "1.25" }],
			["session-1", { kind: "percent", value: "50" }],
			["session-1", { kind: "max" }],
			["session-1", { kind: "percent", value: "75" }],
		]);
		expect(testState.resetError).toHaveBeenCalledTimes(4);
	});

	it("keeps the opt-out selectable for a partial close and submits the preference", async () => {
		testState.session.sizingIntent = { kind: "percent", value: "50" };
		render();

		const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
		expect(checkbox).toMatchObject({ checked: false, disabled: false });
		act(() => checkbox?.click());
		expect(checkbox?.checked).toBe(true);

		await act(async () => {
			container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.click();
		});
		expect(testState.submit).toHaveBeenCalledWith({
			sessionId: "session-1",
			dismissFutureConfirmation: true,
		});
	});

	it("uses a single click while preserving the trading-readiness confirmation", async () => {
		render();
		expect(testState.actionButtonProps?.holdDurationMs).toBeUndefined();
		expect(testState.actionButtonProps?.holdProgressClassName).toBeUndefined();
		expect(testState.actionButtonProps?.requireReadyConfirmation).toBe(true);
		expect(container.textContent).toContain("Click to submit · Filled trades cannot be reversed");

		await act(async () => {
			container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.click();
		});
		expect(testState.submit).toHaveBeenCalledWith({
			sessionId: "session-1",
			dismissFutureConfirmation: false,
		});
	});

	it("keeps zero disabled without presenting it as an error", () => {
		testState.session.sizingIntent = { kind: "percent", value: "0" };
		render();

		expect(container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.disabled).toBe(true);
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.textContent).not.toContain("must be greater than zero");
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close percentage"]')?.value).toBe("0");
	});

	it("fails closed for loading, failed, stale, closed, and direction-changed live positions", () => {
		testState.positionIsLoading = true;
		render();
		expect(container.querySelector('[role="status"]')?.textContent).toContain("Loading the latest position");
		expectEditingLocked();

		testState.positionIsLoading = false;
		testState.positionHasError = true;
		render();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Live position data is unavailable");
		expectEditingLocked();

		testState.positionHasError = false;
		testState.positionIsStale = true;
		render();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Live position data is stale");
		expectEditingLocked();

		testState.positionIsStale = false;
		testState.livePosition = null;
		render();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("This position is no longer open");
		expectEditingLocked();

		testState.livePosition = { szi: "-2.5", entryPx: "100000", unrealizedPnl: "-50" };
		render();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("This position changed sides");
		expectEditingLocked();
	});

	it("locks editing while reconciling and locks both dismissal and editing while submitting", () => {
		testState.isReconciling = true;
		testState.session.phase = "reconciling";
		testState.error = "Order submitted. Confirming exchange status; do not retry.";
		render();

		expect(testState.adaptiveProps).toMatchObject({
			dismissible: true,
			showClose: true,
			showHandle: false,
		});
		expect(container.textContent).toContain("Closing this dialog will not cancel it.");
		expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(true);
		expectEditingLocked();

		act(() => (testState.adaptiveProps?.onOpenChange as (open: boolean) => void)(false));
		expect(testState.close).toHaveBeenCalledWith("session-1");

		testState.isReconciling = false;
		testState.isPending = true;
		testState.error = null;
		testState.session.phase = "submitting";
		render();

		expect(testState.adaptiveProps).toMatchObject({
			dismissible: false,
			showClose: false,
			showHandle: false,
		});
		expectEditingLocked();
		expect(container.textContent).toContain("Submitting...");
	});

	it("reactively switches visible and ARIA copy without remounting or losing opt-out state", () => {
		render();
		const title = container.querySelector<HTMLElement>("h2 span");
		const summary = container.querySelector<HTMLElement>('[data-testid="position-market-close-summary"]');
		const slider = container.querySelector<HTMLElement>('[role="slider"]');
		const checkbox = container.querySelector<HTMLInputElement>(
			'input[aria-label="Don\'t show this confirmation again"]',
		);
		expect(title?.textContent).toBe("Market Close");
		expect(slider?.getAttribute("aria-label")).toBe("Close percentage slider");

		act(() => checkbox?.click());
		expect(checkbox?.checked).toBe(true);
		act(() => activateLocale("zh"));

		expect(container.querySelector("h2 span")).toBe(title);
		expect(title?.textContent).toBe("市价平仓");
		expect(container.querySelector('[data-testid="position-market-close-summary"]')).toBe(summary);
		expect(summary?.getAttribute("aria-label")).toBe("持仓摘要");
		expect(container.querySelector('[role="slider"]')).toBe(slider);
		expect(slider?.getAttribute("aria-label")).toBe("平仓比例滑杆");
		expect(container.querySelector<HTMLInputElement>('input[aria-label="平仓数量"]')).not.toBeNull();
		expect(container.querySelector<HTMLInputElement>('input[aria-label="平仓比例"]')).not.toBeNull();
		expect(container.querySelector<HTMLInputElement>('input[aria-label="以后不再提示"]')).toBe(checkbox);
		expect(checkbox?.checked).toBe(true);
		expect(testState.adaptiveProps?.closeLabel).toBe("关闭");
	});
});
