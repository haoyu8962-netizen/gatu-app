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
	clientKey: "0xabc",
	env: "Mainnet" as "Mainnet" | "Testnet",
	error: null as string | null,
	isMobile: false,
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
			markPx: "100000" as string | undefined,
			marginMode: "cross" as const,
		},
		sizingIntent: { kind: "max" } as
			| { kind: "max" }
			| { kind: "percent"; value: string }
			| { kind: "size"; value: string },
		phase: "idle" as "idle" | "validating" | "submitting" | "reconciling",
		presentation: "confirmation" as "confirmation" | "dismissed" | "direct",
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
	"Estimated PnL excludes fees": "预估盈亏不含手续费",
	"The position size has changed since you opened this dialog. Review the close size before submitting.":
		"自打开此弹窗以来仓位数量已变化，请在提交前核对平仓数量。",
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
	usePositionMarketCloseSubmit: () => ({ submit: testState.submit }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ clientKey: testState.clientKey, env: testState.env }),
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
		dismiss: vi.fn(),
	}),
}));

import { PositionCloseDialogShell } from "@/components/trade/positions/position-close-dialog-shell";
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

	function expectEditingLocked(slider: "paused" | "disabled") {
		expect(testState.numberInputs.get("Close size")?.disabled).toBe(true);
		expect(testState.numberInputs.get("Close percentage")?.disabled).toBe(true);
		expect(testState.sliderProps?.paused).toBe(slider === "paused");
		expect(testState.sliderProps?.disabled).toBe(slider === "disabled");
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
		testState.clientKey = "0xabc";
		testState.env = "Mainnet";
		testState.isMobile = false;
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
		testState.session.sizingIntent = { kind: "max" };
		testState.session.phase = "idle";
		testState.session.presentation = "confirmation";
		testState.setSizingIntent.mockReset();
		testState.sliderProps = null;
		testState.submit.mockClear();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("supports an explicit mobile close control without changing the default drawer contract", () => {
		act(() =>
			root.render(
				createElement(
					I18nProvider,
					{ i18n },
					<PositionCloseDialogShell open onOpenChange={vi.fn()} isMobile dismissible showMobileClose closeLabel="Close">
						<div />
					</PositionCloseDialogShell>,
				),
			),
		);

		expect(testState.adaptiveProps).toMatchObject({
			presentation: "drawer",
			dismissible: true,
			showClose: true,
			showHandle: true,
		});
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
		const summaryClassName = container.querySelector('[data-testid="position-market-close-summary"]')?.className;
		expect(summaryClassName).toBe("py-3 min-[1001px]:py-3.5");
		expect(summaryClassName).not.toMatch(/rounded|border|bg-/);
		expect(testState.numberInputs.get("Close size")?.className).toContain("!rounded-[10px]");
		expect(testState.numberInputs.get("Close percentage")?.className).toContain("!rounded-[10px]");
		expect(testState.numberInputs.get("Close size")?.suffixClassName).toContain("right-3");
		expect(testState.numberInputs.get("Close percentage")?.suffixClassName).toContain("right-2.5");
		expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(0);
		expect(container.querySelector('[data-testid="position-market-close-sizing"]')?.textContent).not.toMatch(/25%|Max/);
		expect(testState.sliderProps?.interactionIdentity).toContain("session-1");
		expect(testState.sliderProps?.thumbClassName).toBeUndefined();
		expect(testState.sliderProps?.controlClassName).toBeUndefined();
		expect(testState.numberInputs.get("Close percentage")).toMatchObject({
			allowDecimals: false,
			min: 0,
			max: 100,
			step: 1,
		});
		expect(container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.textContent).toBe("Market Close");
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close size"]')?.value).toBe("1.2500");
		expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')).not.toBeNull();
		expect(testState.checkboxProps).toMatchObject({
			controlClassName: expect.stringContaining("size-5 !rounded-[5px]"),
			labelClassName: expect.stringContaining("text-2sm"),
		});
		expect(testState.actionButtonProps?.className).toContain("!rounded-[12px]");
		expect(testState.actionButtonProps?.className).toContain("!text-market-close-danger-text");
	});

	it("renders an optional mark preview without blocking the fresh submit flow", async () => {
		testState.marketsInfo = undefined;
		testState.session.position.markPx = undefined;
		render();

		expect(getSummaryValue("Mark price")?.textContent).toBe("-");
		expect(container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.disabled).toBe(false);

		await act(async () => {
			container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.click();
		});
		expect(testState.submit).toHaveBeenCalledWith({
			sessionId: "session-1",
			confirmedCloseSize: "2.5",
			dismissFutureConfirmation: false,
		});
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

	it("routes quantity, percentage and slider edits through one sizing intent, reaching Max from 100%", () => {
		render();
		const sizeInput = testState.numberInputs.get("Close size");
		const percentInput = testState.numberInputs.get("Close percentage");

		act(() => {
			(sizeInput?.onChange as (event: { target: { value: string } }) => void)({ target: { value: "1.25" } });
			(percentInput?.onChange as (event: { target: { value: string } }) => void)({ target: { value: "50" } });
			(percentInput?.onChange as (event: { target: { value: string } }) => void)({ target: { value: "100" } });
			(testState.sliderProps?.onPercentChange as (value: number) => void)(75);
			(testState.sliderProps?.onPercentChange as (value: number) => void)(100);
		});

		expect(testState.setSizingIntent.mock.calls).toEqual([
			["session-1", { kind: "size", value: "1.25" }],
			["session-1", { kind: "percent", value: "50" }],
			["session-1", { kind: "max" }],
			["session-1", { kind: "percent", value: "75" }],
			["session-1", { kind: "max" }],
		]);
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
			confirmedCloseSize: "1.25",
			dismissFutureConfirmation: true,
		});
	});

	it.each(["cancel", "commit", "no-move"])(
		"ignores confirm during a slider gesture ending with %s without greying the button",
		async (ending) => {
			testState.session.sizingIntent = { kind: "size", value: "1.0000" };
			render();
			const submitBeforeStart = testState.actionButtonProps?.onClick as () => void;
			const getSubmitButton = () => container.querySelector<HTMLButtonElement>('[data-testid="submit"]');
			const classNameBeforeStart = getSubmitButton()?.className;

			act(() => {
				(testState.sliderProps?.onPercentInteractionStart as () => void)();
				submitBeforeStart();
			});
			act(() => getSubmitButton()?.click());
			expect(testState.submit).not.toHaveBeenCalled();
			expect(testState.actionButtonProps?.disabled).toBe(false);
			expect((testState.actionButtonProps?.isActivationLocked as () => boolean)()).toBe(true);
			expect(getSubmitButton()?.className).toBe(classNameBeforeStart);
			expect(testState.sliderProps?.disabled).toBe(false);

			if (ending !== "no-move") {
				act(() => (testState.sliderProps?.onPercentChange as (value: number) => void)(75));
				act(() => getSubmitButton()?.click());
				act(() => {
					const callback = ending === "cancel" ? "onPercentCancel" : "onPercentCommit";
					(testState.sliderProps?.[callback] as (value: number) => void)(75);
				});
				if (ending === "cancel") {
					expect(testState.setSizingIntent).toHaveBeenLastCalledWith("session-1", { kind: "size", value: "1.0000" });
				}
				act(() => getSubmitButton()?.click());
				expect(testState.submit).not.toHaveBeenCalled();
				expect(testState.actionButtonProps?.disabled).toBe(false);
			}

			act(() => (testState.sliderProps?.onPercentInteractionEnd as () => void)());
			expect(testState.actionButtonProps?.disabled).toBe(false);
			expect((testState.actionButtonProps?.isActivationLocked as () => boolean)()).toBe(false);
			expect(testState.submit).not.toHaveBeenCalled();

			await act(async () => {
				getSubmitButton()?.click();
			});
			expect(testState.submit).toHaveBeenCalledTimes(1);
			expect(testState.submit).toHaveBeenCalledWith({
				sessionId: "session-1",
				confirmedCloseSize: "1",
				dismissFutureConfirmation: false,
			});
		},
	);

	it("includes the live account and network in the slider identity and rejects the old drag", () => {
		render();
		const previousIdentity = testState.sliderProps?.interactionIdentity;
		act(() => (testState.sliderProps?.onPercentInteractionStart as () => void)());
		testState.clientKey = "0xdef";
		testState.env = "Testnet";
		render();
		expect(testState.sliderProps?.interactionIdentity).not.toBe(previousIdentity);
		expect(testState.sliderProps?.interactionIdentity).toContain("0xdef");
		expect(testState.sliderProps?.interactionIdentity).toContain("Testnet");
		act(() => {
			(testState.sliderProps?.onPercentCancel as () => void)();
			(testState.sliderProps?.onPercentInteractionEnd as () => void)();
		});
		expect(testState.setSizingIntent).not.toHaveBeenCalled();
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
			confirmedCloseSize: "2.5",
			dismissFutureConfirmation: false,
		});
	});

	it.each([
		["Max", { kind: "max" } as const, "2.6000", "2.6"],
		["a percentage", { kind: "percent", value: "50" } as const, "1.3000", "1.3"],
		["a manual size", { kind: "size", value: "1.1" } as const, "1.1", "1.1"],
	])(
		"keeps a static confirm label and confirms the size shown for %s as the live position moves",
		async (_label, sizingIntent, shownSize, confirmedCloseSize) => {
			testState.session.sizingIntent = sizingIntent;
			render();
			testState.livePosition = { szi: "2.6", entryPx: "100000", unrealizedPnl: "-50" };
			render();

			const submitButton = container.querySelector<HTMLButtonElement>('[data-testid="submit"]');
			expect(submitButton?.textContent).toBe("Market Close");
			expect(container.querySelector<HTMLInputElement>('input[aria-label="Close size"]')?.value).toBe(shownSize);

			await act(async () => {
				submitButton?.click();
			});
			expect(testState.submit).toHaveBeenCalledTimes(1);
			expect(testState.submit).toHaveBeenCalledWith({
				sessionId: "session-1",
				confirmedCloseSize,
				dismissFutureConfirmation: false,
			});
		},
	);

	it("describes the confirm control with the shown size instead of naming it after the size", () => {
		testState.session.sizingIntent = { kind: "percent", value: "50" };
		render();

		const describedBy = String(testState.actionButtonProps?.["aria-describedby"]).split(" ");
		expect(describedBy).toHaveLength(2);
		const [sizeDescription, helper] = describedBy.map((id) => container.querySelector<HTMLElement>(`#${id}`));
		expect(sizeDescription?.textContent).toBe("Close size: 1.2500 BTC");
		expect(sizeDescription?.className).toBe("sr-only");
		expect(sizeDescription?.getAttribute("aria-live")).toBeNull();
		expect(helper?.textContent).toBe("Click to submit · Filled trades cannot be reversed");
	});

	it("states that the PnL estimate excludes fees only while the estimate is shown", () => {
		render();
		expect(container.textContent).toContain("Estimated PnL excludes fees");
		expect(getSummaryValue("Estimated PnL")).not.toBeNull();

		render({ showPnl: false });
		expect(container.textContent).not.toContain("Estimated PnL excludes fees");
		expect(getSummaryValue("Estimated PnL")).toBeNull();
	});

	it("announces a changed position size without gating submit on the notice", () => {
		const getNotice = () => container.querySelector<HTMLElement>('[data-testid="position-market-close-size-changed"]');
		render();
		expect(getNotice()).toBeNull();

		testState.livePosition = { szi: "2.5000", entryPx: "100000", unrealizedPnl: "-50" };
		render();
		expect(getNotice()).toBeNull();

		testState.livePosition = { szi: "2.6", entryPx: "100000", unrealizedPnl: "-50" };
		render();
		expect(getNotice()?.tagName).toBe("OUTPUT");
		expect(getNotice()?.getAttribute("aria-live")).toBe("polite");
		expect(getNotice()?.textContent).toBe(
			"The position size has changed since you opened this dialog. Review the close size before submitting.",
		);
		expect(getSummaryValue("Available to close")?.textContent).toBe("2.6000 BTC");
		expect(container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.disabled).toBe(false);

		testState.livePosition = { szi: "2.5", entryPx: "100000", unrealizedPnl: "-50" };
		render();
		expect(getNotice()).toBeNull();
	});

	it("keeps the changed-size notice out of closed, flipped, unreadable, dismissed and closing dialogs", () => {
		const getNotice = () => container.querySelector<HTMLElement>('[data-testid="position-market-close-size-changed"]');

		testState.livePosition = null;
		render();
		expect(getNotice()).toBeNull();

		testState.livePosition = { szi: "-2.6", entryPx: "100000", unrealizedPnl: "-50" };
		render();
		expect(getNotice()).toBeNull();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("This position changed sides");

		testState.livePosition = { szi: "2.6", entryPx: "100000", unrealizedPnl: "-50" };
		testState.positionIsStale = true;
		render();
		expect(getNotice()).toBeNull();

		testState.positionIsStale = false;
		testState.session.presentation = "dismissed";
		testState.session.phase = "validating";
		render();
		expect(getNotice()).toBeNull();

		testState.session.presentation = "confirmation";
		testState.session.phase = "idle";
		render();
		expect(getNotice()).not.toBeNull();
		act(() => (testState.adaptiveProps?.onOpenChange as (open: boolean) => void)(false));
		expect(getNotice()).toBeNull();
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
		expect(container.textContent).not.toContain("Loading the latest position");
		expectEditingLocked("paused");

		testState.positionIsLoading = false;
		testState.positionHasError = true;
		render();
		expect(container.textContent).not.toContain("Live position data is unavailable");
		expectEditingLocked("paused");

		testState.positionHasError = false;
		testState.positionIsStale = true;
		render();
		expect(container.textContent).not.toContain("Live position data is stale");
		expectEditingLocked("paused");

		testState.session.phase = "validating";
		render();
		expectEditingLocked("disabled");
		testState.session.phase = "idle";

		testState.positionIsStale = false;
		testState.livePosition = null;
		render();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("This position is no longer open");
		expectEditingLocked("disabled");

		testState.livePosition = { szi: "-2.5", entryPx: "100000", unrealizedPnl: "-50" };
		render();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("This position changed sides");
		expectEditingLocked("disabled");
	});

	it("animates out on cancel and releases the session only once the exit completes", () => {
		render();
		expect(testState.adaptiveProps?.open).toBe(true);

		act(() => (testState.adaptiveProps?.onOpenChange as (open: boolean) => void)(false));
		expect(testState.adaptiveProps?.open).toBe(false);
		expect(testState.close).not.toHaveBeenCalled();
		expect(container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.disabled).toBe(true);
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="submit"]')?.click());
		expect(testState.submit).not.toHaveBeenCalled();

		act(() => (testState.adaptiveProps?.onOpenChangeComplete as (open: boolean) => void)(false));
		expect(testState.close).toHaveBeenCalledWith("session-1");
	});

	it("closes the dialog as soon as the session is dismissed and never shows progress copy", () => {
		testState.session.presentation = "dismissed";
		testState.session.phase = "validating";
		render();

		expect(testState.adaptiveProps).toMatchObject({ open: false, dismissible: true });
		expect(container.textContent).not.toContain("Validating...");
		expect(container.textContent).not.toContain("Submitting...");

		testState.session.phase = "reconciling";
		render();
		expect(testState.adaptiveProps).toMatchObject({ open: false });
		expect(container.textContent).not.toContain("Confirming...");
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
		testState.livePosition = { szi: "2.6", entryPx: "100000", unrealizedPnl: "-50" };
		render();
		const notice = container.querySelector<HTMLElement>('[data-testid="position-market-close-size-changed"]');
		const submitButton = container.querySelector<HTMLButtonElement>('[data-testid="submit"]');
		expect(notice).not.toBeNull();
		act(() => activateLocale("zh"));

		expect(container.querySelector("h2 span")).toBe(title);
		expect(title?.textContent).toBe("市价平仓");
		expect(container.querySelector('[data-testid="position-market-close-size-changed"]')).toBe(notice);
		expect(notice?.textContent).toBe("自打开此弹窗以来仓位数量已变化，请在提交前核对平仓数量。");
		expect(container.querySelector('[data-testid="submit"]')).toBe(submitButton);
		expect(submitButton?.textContent).toBe("市价平仓");
		expect(container.textContent).toContain("预估盈亏不含手续费");
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
