/** @vitest-environment jsdom */

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import type { OrderParameters } from "@nktkas/hyperliquid";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	availableBalance: 100,
	baseAvailable: 100,
	availabilityStatus: "success" as "success" | "loading" | "stale" | "error",
	kind: "perp" as "perp" | "spot",
	limitPrice: "",
	markPx: "100",
	prevDayPx: undefined as string | undefined,
	formatLocale: "en-US",
	markPriceStatus: "success" as "success" | "loading" | "stale" | "error",
	maxSize: 10,
	openInterestCapped: false,
	orderType: "market",
	orderValue: 100,
	quoteAvailable: 100,
	reduceOnly: false,
	side: "buy" as "buy" | "sell",
	sizeValue: 1,
	requestSubmit: vi.fn(),
	submitOrder: vi.fn(),
	executionGuard: undefined as ((params: OrderParameters) => void) | undefined,
	tradingReady: true,
	isSubmitting: false,
	registerStatus: "idle" as "idle" | "approving_fee" | "approving_agent" | "verifying",
	authorize: vi.fn(async () => {}),
	actions: {
		markDraftEdited: vi.fn(),
		setLimitPriceFromPrefill: vi.fn(),
		setLimitPriceFromUser: vi.fn(),
		setOrderType: vi.fn(),
		setReduceOnly: vi.fn(),
		setSide: vi.fn(),
		setSize: vi.fn(),
		setSlPrice: vi.fn(),
		setTpPrice: vi.fn(),
		setTpSlEnabled: vi.fn(),
		setTriggerPrice: vi.fn(),
	},
}));

vi.mock("@sairn/ui", async (importOriginal) => ({
	...(await importOriginal<typeof import("@sairn/ui")>()),
	Button: ({
		children,
		iconLeft: _iconLeft,
		intent: _intent,
		size: _size,
		variant: _variant,
		...props
	}: Record<string, unknown>) => createElement("button", { type: "button", ...props }, children as ReactNode),
	Tooltip: ({ children }: { children: ReactNode }) => children,
}));

const wagmiState = vi.hoisted(() => ({
	walletClientError: null as Error | null,
	switchChain: vi.fn(),
}));

vi.mock("wagmi", () => ({
	useSwitchChain: () => ({ isPending: false, switchChain: wagmiState.switchChain }),
	useWalletClient: () => ({ data: wagmiState.walletClientError ? undefined : {}, error: wagmiState.walletClientError, isLoading: false }),
}));

vi.mock("@/components/trade/chart/token-selector", () => ({ TokenSelector: () => null }));
vi.mock("@/components/trade/tradebox/margin-mode-modal", () => ({ MarginModeModal: () => null }));
vi.mock("@/components/trade/tradebox/order-confirmation-modal", () => ({ OrderConfirmationModal: () => null }));
vi.mock("@/components/trade/tradebox/trade-form-scale", () => ({ TradeFormScale: () => null }));
vi.mock("@/components/trade/tradebox/trade-form-tif", () => ({ TradeFormTif: () => null }));
vi.mock("@/components/trade/tradebox/trade-form-tp-sl", () => ({ TradeFormTpSl: () => null }));
vi.mock("@/components/trade/tradebox/trade-form-twap", () => ({ TradeFormTwap: () => null }));
vi.mock("@/components/trade/tradebox/trade-header", () => ({ TradeHeader: () => null }));
vi.mock("@/components/trade/tradebox/trade-option-checkboxes", () => ({
	TradeOptionCheckboxes: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/trade/mobile/mobile-bottom-nav", () => ({ MobileBottomNavSpacer: () => null }));

vi.mock("@/hooks/trade/use-account-abstraction-control", () => ({
	useAccountAbstractionControl: () => ({
		accountAbstraction: "disabled",
		canSet: false,
		isLoading: false,
		isUpdating: false,
		portfolioMarginActivationEnabled: false,
		setAccountAbstraction: vi.fn(async () => false),
	}),
}));

vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({ available: true, unavailableReason: null }),
}));

vi.mock("@/hooks/trade/use-fee-rates", () => ({
	useMarketFeeRates: () => ({ makerRate: 0.0001, takerRate: 0.0002 }),
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({ useMarketNavigation: () => vi.fn() }));

vi.mock("@/hooks/trade/use-order-confirmation", () => ({
	useOrderConfirmation: () => ({
		cancel: vi.fn(),
		confirm: vi.fn(),
		dontShowAgain: false,
		isConfirming: false,
		pending: null,
		requestSubmit: testState.requestSubmit,
		setDontShowAgain: vi.fn(),
	}),
}));

vi.mock("@/hooks/trade/use-order-entry-data", () => ({
	useOrderEntryData: () => ({
		accountAbstraction: "disabled",
		allowsIsolatedMarginRemoval: false,
		applyMarginAndLeverage: vi.fn(),
		availabilityMaxAgeMs: 10_000,
		availabilityReceivedAt: Date.now(),
		availabilityStatus: testState.availabilityStatus,
		availableBalance: testState.availableBalance,
		availableBalanceToken: testState.side === "sell" && testState.kind === "spot" ? "BTC" : "USDC",
		baseToken: "BTC",
		capabilities: {
			allowsCrossMargin: true,
			hasReduceOnly: false,
			hasTpSl: false,
			isLeveraged: testState.kind === "perp",
		},
		committedLeverage: null,
		toggleSizeDenomination: vi.fn(),
		currentLeverage: 10,
		executionAvailability: { kind: "perp", maxBaseBySide: { buy: "10", sell: "10" } },
		applySizePercent: vi.fn(),
		hasAvailabilityError: testState.availabilityStatus === "error",
		hasPosition: false,
		isAvailabilityBlocked: testState.availabilityStatus !== "success",
		isBalanceAvailabilityBlocked: testState.availabilityStatus !== "success",
		conversionPrice: 100,
		isAvailabilityLoading: testState.availabilityStatus === "loading",
		isAvailabilityStale: testState.availabilityStatus === "stale",
		isSpotMarket: testState.kind === "spot",
		isOpenInterestCapped: testState.openInterestCapped,
		isSwitchingMode: false,
		leverage: 10,
		marginMode: "cross",
		maxLeverage: 50,
		maxSize: testState.maxSize,
		orderValue: testState.orderValue,
		pendingLeverage: null,
		positionStateReady: true,
		quoteToken: "USDC",
		resetPendingLeverage: vi.fn(),
		setPendingLeverage: vi.fn(),
		sideLabels: { buy: "Buy", sell: "Sell" },
		sizeValue: testState.sizeValue,
		spotBalance: {
			baseAvailable: testState.baseAvailable,
			quoteAvailable: testState.quoteAvailable,
		},
		switchModeError: null,
		szDecimals: 3,
	}),
}));

vi.mock("@/hooks/trade/use-order-submit", () => ({
	useOrderSubmit: (options: { executionGuard?: (params: OrderParameters) => void }) => {
		testState.executionGuard = options.executionGuard;
		return {
			captureDraftResetToken: () => ({
				orderEntry: { marketIdentity: "Mainnet:BTC", draftRevision: 0 },
				exchangeSession: {
					id: Symbol("mobile-size-validation-session"),
					env: "Mainnet",
					clientKey: "0xabc",
					sessionMode: "wallet",
					active: true,
				},
			}),
			isDraftResetTokenCurrent: () => true,
			handleSubmit: testState.submitOrder,
			isSubmitting: testState.isSubmitting,
		};
	},
}));

vi.mock("@/hooks/trade/use-prospective-cross-margin-account", () => ({
	useProspectiveCrossMarginAccount: () => ({ account: null, existingPosition: null }),
}));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({
		actionsBlocked: false,
		isError: false,
		isResolved: true,
		tradeRestricted: false,
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: "0xabc", isConnected: true, hasWalletAccess: true }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	getMarketCapabilities: () => ({
		allowsCrossMargin: true,
		hasReduceOnly: false,
		hasTpSl: false,
		isLeveraged: testState.kind === "perp",
	}),
	useTradingStatus: () => ({
		isSignerLoading: false,
		isSignerReady: true,
		isBuilderFeeLoading: false,
		isReady: testState.tradingReady,
	}),
	useSelectedMarketInfo: () => ({
		data: {
			assetId: testState.kind === "spot" ? 10_000 : 0,
			kind: testState.kind,
			markPriceReceivedAt: Date.now(),
			markPriceStatus: testState.markPriceStatus,
			markPx: testState.markPx,
			midPriceReceivedAt: Date.now(),
			midPx: testState.markPx,
			name: testState.kind === "spot" ? "BTC/USDC" : "BTC",
			pairName: "BTC/USDC",
			prevDayPx: testState.prevDayPx ?? testState.markPx,
			szDecimals: 3,
		},
	}),
	useInfo: () => ({ data: undefined }),
	useTradingAuthorization: () => ({ authorize: testState.authorize, status: testState.registerStatus }),
	useUserPositions: () => ({
		getPosition: () => null,
		hasError: false,
		isLoading: false,
		isStale: false,
	}),
}));

vi.mock("@/lib/lazy", () => ({
	createLazyComponent: () => () => null,
	createRetryableLazyComponent: () => () => null,
	preloadLazyComponents: () => Promise.resolve(),
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: vi.fn() }),
	useEstablishConnectionModalActions: () => ({ open: vi.fn() }),
	useSettingsDialogActions: () => ({ open: vi.fn() }),
}));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => testState.formatLocale,
	useMarketOrderSlippageBps: () => 50,
	useMarketOrderSlippagePercent: () => 0.5,
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useLimitPrice: () => testState.limitPrice,
	useOrderEntryActions: () => testState.actions,
	useOrderSide: () => testState.side,
	useOrderSize: () => String(testState.sizeValue),
	useOrderSizeSource: () => null,
	useOrderType: () => testState.orderType,
	useReduceOnly: () => testState.reduceOnly,
	useScaleEnd: () => "",
	useScaleLevels: () => null,
	useScaleSkew: () => "",
	useScaleStart: () => "",
	useSlPrice: () => "",
	useTif: () => "Gtc",
	useTpPrice: () => "",
	useTpSlEnabled: () => false,
	useTpSlReturnInvalid: () => false,
	useTriggerPrice: () => "",
	useTwapAdvancedEnabled: () => false,
	useTwapMinutes: () => null,
	useTwapRandomize: () => false,
	useTwapStopPrice: () => "",
	useTwapTriggerPrice: () => "",
}));

vi.mock("@/stores/use-orderbook-actions-store", () => ({
	getOrderbookActionsStore: () => ({ actions: { clearSelectedPrice: vi.fn() } }),
	getSelectedPriceForMarket: () => null,
	useSelectedPrice: () => null,
}));

import { MobileTradeView } from "@/components/trade/mobile/mobile-trade-view";
import { EntryExecutionError } from "@/domain/trade/order/entry-execution-guard";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import { LOADING_INDICATOR_SELECTOR } from "@/lib/tests/harness/loading-indicator";

const LOCALES = ["en", "zh", "hi", "es", "fr", "ar"] as const;
const OPEN_INTEREST_CAP_COPY =
	"The limit order would be canceled after resting because open interest is capped. Use market orders to close positions.";
type Locale = (typeof LOCALES)[number];

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

function getLocaleMessages(locale: Locale): Messages {
	if (locale === "en") return {};
	return {
		[getMessageId("Enter limit price")]: `${locale}: price required`,
		[getMessageId("Exceeds max size")]: `${locale}: max size`,
		[getMessageId("Insufficient {0} balance")]: `${locale}: insufficient balance`,
		[getMessageId("Min order $10")]: `${locale}: perp minimum`,
		[getMessageId(OPEN_INTEREST_CAP_COPY)]: `${locale}: open interest cap`,
	};
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MobileTradeView order-size validation accessibility", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		setValidPerpScenario();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it.each(LOCALES)("links every size-related error to all size controls in %s", async (locale) => {
		activateLocale(locale);

		setPerpMinimumScenario();
		await renderView(root);
		expectSizeErrorLinked(container);

		setPerpMaximumScenario();
		await renderView(root);
		expectSizeErrorLinked(container);

		setSpotBuyBalanceScenario();
		await renderView(root);
		expectSizeErrorLinked(container);

		setSpotSellBalanceScenario();
		await renderView(root);
		expectSizeErrorLinked(container);
	});

	it.each(LOCALES)("clears corrected size errors and ARIA together immediately in %s", async (locale) => {
		activateLocale(locale);
		setPerpMaximumScenario();
		await renderView(root);
		expectSizeErrorLinked(container);

		setValidPerpScenario();
		await renderView(root);
		expect(getValidationError(container)).toBeNull();
		for (const control of getSizeControls(container)) expectDescriptionCleared(control);
		expect(getOrderButton(container).disabled).toBe(false);
	});

	it.each(LOCALES)("keeps an empty limit quiet but prevents submission in %s", async (locale) => {
		activateLocale(locale);
		testState.orderType = "limit";
		await renderView(root);

		expect(getPriceInput(container).value).toBe("");
		expect(getValidationError(container)).toBeNull();
		for (const control of getSizeControls(container)) expectDescriptionCleared(control);
		await expectSubmissionBlocked(container);
	});

	it("ignores the order button while the size slider is held without disabling it", async () => {
		activateLocale("en");
		await renderView(root);
		const control = container.querySelector<HTMLElement>("[data-trade-slider-control]");
		if (!control) throw new Error("Expected the size slider control");
		control.getBoundingClientRect = () => new DOMRect(0, 0, 200, 20);
		const classNameAtRest = getOrderButton(container).className;

		await act(async () => {
			control.dispatchEvent(sliderPointer("pointerdown", 100));
		});
		expect(control.dataset.dragging).toBe("true");
		expect(getOrderButton(container).disabled).toBe(false);
		expect(getOrderButton(container).className).toBe(classNameAtRest);
		await act(async () => getOrderButton(container).click());
		expect(testState.requestSubmit).not.toHaveBeenCalled();
		expect(testState.submitOrder).not.toHaveBeenCalled();

		await act(async () => {
			document.dispatchEvent(sliderPointer("pointercancel", 100));
		});
		expect(control.dataset.dragging).toBeUndefined();
		await act(async () => getOrderButton(container).click());
		expect(testState.requestSubmit).toHaveBeenCalledTimes(1);
	});

	it("offers Enable Trading on the wallet's current network instead of a switch to Arbitrum", async () => {
		activateLocale("en");
		testState.tradingReady = false;
		wagmiState.walletClientError = new Error(
			"The current chain of the connector (id: 1) does not match the connection's chain (id: 42161).",
		);
		try {
			await renderView(root);
			const enable = getCtaButton(container, "Enable Trading");
			expect(enable.disabled).toBe(false);

			await act(async () => enable.click());

			expect(testState.authorize).toHaveBeenCalledTimes(1);
			expect(wagmiState.switchChain).not.toHaveBeenCalled();
		} finally {
			wagmiState.walletClientError = null;
		}
	});

	it("ignores the Enable Trading step while the size slider is held", async () => {
		activateLocale("en");
		testState.tradingReady = false;
		await renderView(root);
		const control = container.querySelector<HTMLElement>("[data-trade-slider-control]");
		if (!control) throw new Error("Expected the size slider control");
		control.getBoundingClientRect = () => new DOMRect(0, 0, 200, 20);
		const enable = Array.from(container.querySelectorAll<HTMLButtonElement>("button.w-full")).find(
			(candidate) => candidate.textContent?.trim() === "Enable Trading",
		);
		if (!enable) throw new Error("Expected the Enable Trading button");
		expect(enable.disabled).toBe(false);

		await act(async () => {
			control.dispatchEvent(sliderPointer("pointerdown", 100));
		});
		expect(control.dataset.dragging).toBe("true");
		expect(enable.disabled).toBe(false);
		await act(async () => enable.click());
		expect(testState.authorize).not.toHaveBeenCalled();

		await act(async () => {
			document.dispatchEvent(sliderPointer("pointercancel", 100));
		});
		await act(async () => enable.click());
		expect(testState.authorize).toHaveBeenCalledTimes(1);
	});

	it("opens confirmation for a valid spot limit without an unsupported shared reduce-only flag", async () => {
		activateLocale("en");
		testState.kind = "spot";
		testState.orderType = "limit";
		testState.limitPrice = "100";
		testState.reduceOnly = true;
		await renderView(root);

		expect(getPriceInput(container).value).toBe("100");
		expect(getValidationError(container)).toBeNull();
		expect(getOrderButton(container).disabled).toBe(false);
		await act(async () => getOrderButton(container).click());
		expect(testState.requestSubmit).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ orderType: "limit", limitPriceInput: "100", reduceOnly: false }),
			expect.objectContaining({ marketKind: "spot", limitPrice: 100, reduceOnly: false }),
		);
		expect(testState.submitOrder).not.toHaveBeenCalled();
	});

	for (const invalidPrice of ["0", "."]) {
		it.each(LOCALES)(
			`shows the nonempty invalid limit ${invalidPrice} without invalidating size in %s`,
			async (locale) => {
				activateLocale(locale);
				setPerpMaximumScenario();
				await renderView(root);
				expectSizeErrorLinked(container);
				const errorId = getValidationError(container)?.id;

				setValidPerpScenario();
				testState.orderType = "limit";
				testState.limitPrice = invalidPrice;
				await renderView(root);

				expect(getPriceInput(container).value).toBe(invalidPrice);
				expect(getValidationError(container)?.id).toBe(errorId);
				expect(getValidationError(container)?.textContent).toBe(
					locale === "en" ? "Enter limit price" : `${locale}: price required`,
				);
				for (const control of getSizeControls(container)) expectDescriptionCleared(control);
				await expectSubmissionBlocked(container);
			},
		);
	}

	it.each(LOCALES)("explains a confirmed open-interest cap on a limit order and blocks it in %s", async (locale) => {
		activateLocale(locale);
		testState.orderType = "limit";
		testState.limitPrice = "100";
		testState.openInterestCapped = true;
		await renderView(root);

		expect(getPriceInput(container).value).toBe("100");
		expect(getValidationError(container)?.textContent).toBe(
			locale === "en" ? OPEN_INTEREST_CAP_COPY : `${locale}: open interest cap`,
		);
		for (const control of getSizeControls(container)) expectDescriptionCleared(control);
		expect(getOrderButton(container).textContent?.trim()).toBe("Buy");
		await expectSubmissionBlocked(container);
	});

	it("shows the cap restriction before a limit price is typed", async () => {
		activateLocale("en");
		testState.orderType = "limit";
		testState.openInterestCapped = true;
		await renderView(root);

		expect(getPriceInput(container).value).toBe("");
		expect(getValidationError(container)?.textContent).toBe(OPEN_INTEREST_CAP_COPY);
		await expectSubmissionBlocked(container);
	});

	it("keeps a market order on a capped market available and quiet", async () => {
		activateLocale("en");
		testState.openInterestCapped = true;
		await renderView(root);

		expect(getValidationError(container)).toBeNull();
		expect(getOrderButton(container).disabled).toBe(false);
		await act(async () => getOrderButton(container).click());
		expect(testState.requestSubmit).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ orderType: "market" }),
			expect.anything(),
		);
	});

	it("keeps an uncapped or unknown limit order unchanged", async () => {
		activateLocale("en");
		testState.orderType = "limit";
		testState.limitPrice = "100";
		await renderView(root);

		expect(getValidationError(container)).toBeNull();
		expect(getOrderButton(container).disabled).toBe(false);
	});

	it("re-checks the latest cap state in the SDK execution guard", async () => {
		activateLocale("en");
		const limitOrder: OrderParameters = {
			orders: [{ a: 0, b: true, p: "100", s: "1", r: false, t: { limit: { tif: "Alo" } } }],
			grouping: "na",
		};
		testState.orderType = "limit";
		testState.limitPrice = "100";
		await renderView(root);
		expect(testState.executionGuard).toBeTypeOf("function");
		expect(() => testState.executionGuard?.(limitOrder)).not.toThrow();

		testState.openInterestCapped = true;
		await renderView(root);

		let failure: unknown;
		try {
			testState.executionGuard?.(limitOrder);
		} catch (error) {
			failure = error;
		}
		expect(failure).toBeInstanceOf(EntryExecutionError);
		expect(failure).toMatchObject({ reason: "open-interest-capped" });
	});

	it("keeps the cap restriction on the same node when the language changes", async () => {
		activateLocale("en");
		testState.orderType = "limit";
		testState.limitPrice = "100";
		testState.openInterestCapped = true;
		await renderView(root);
		const restriction = getValidationError(container);
		expect(restriction?.textContent).toBe(OPEN_INTEREST_CAP_COPY);

		await act(async () => activateLocale("zh"));

		expect(getValidationError(container)).toBe(restriction);
		expect(getPriceInput(container).value).toBe("100");
		expect(restriction?.textContent).toBe("zh: open interest cap");
		await expectSubmissionBlocked(container);
	});

	for (const source of ["account", "market"] as const) {
		it.each(["loading", "stale", "error"] as const)(
			`blocks an otherwise valid draft while ${source} data is %s without passive error text`,
			async (status) => {
				activateLocale("en");
				if (source === "account") testState.availabilityStatus = status;
				else testState.markPriceStatus = status;
				await renderView(root);

				expect(getSizeControls(container)[0].value).toBe("1");
				expect(getValidationError(container)).toBeNull();
				for (const control of getSizeControls(container)) expectDescriptionCleared(control);
				await expectSubmissionBlocked(container);

				testState.availabilityStatus = "success";
				testState.markPriceStatus = "success";
				await renderView(root);
				expect(getSizeControls(container)[0].value).toBe("1");
				expect(getValidationError(container)).toBeNull();
				expect(getOrderButton(container).disabled).toBe(false);
			},
		);
	}

	it.each([
		["account", "stale"],
		["account", "error"],
		["market", "stale"],
		["market", "error"],
	] as const)(
		"keeps %s %s recovery quiet, preserves the draft and restores current validation",
		async (source, status) => {
			activateLocale("en");
			setPerpMaximumScenario();
			await renderView(root);
			expectSizeErrorLinked(container);
			const errorId = getValidationError(container)?.id;

			if (source === "account") testState.availabilityStatus = status;
			else testState.markPriceStatus = status;
			await renderView(root);
			expect(getSizeControls(container)[0].value).toBe("2");
			expect(getValidationError(container)).toBeNull();
			for (const control of getSizeControls(container)) expectDescriptionCleared(control);
			await expectSubmissionBlocked(container);

			testState.availabilityStatus = "success";
			testState.markPriceStatus = "success";
			await renderView(root);
			expect(getSizeControls(container)[0].value).toBe("2");
			expectSizeErrorLinked(container);
			expect(getValidationError(container)?.id).toBe(errorId);
			await expectSubmissionBlocked(container);

			setValidPerpScenario();
			await renderView(root);
			expect(getValidationError(container)).toBeNull();
			for (const control of getSizeControls(container)) expectDescriptionCleared(control);
			expect(getOrderButton(container).disabled).toBe(false);
		},
	);
});

describe("MobileTradeView order button status", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		setValidPerpScenario();
		activateLocale("en");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("keeps the order button name static and shows no indicator while an order is submitting", async () => {
		await renderView(root);
		const button = getOrderButton(container);
		expect(button.disabled).toBe(false);
		expect(button.querySelector(LOADING_INDICATOR_SELECTOR)).toBeNull();

		testState.isSubmitting = true;
		await renderView(root);

		expect(getOrderButton(container)).toBe(button);
		expect(button.textContent?.trim()).toBe("Buy");
		expect(button.disabled).toBe(true);
		expect(button.querySelector("svg")).toBeNull();
		expect(button.querySelector(LOADING_INDICATOR_SELECTOR)).toBeNull();
		await act(async () => button.click());
		expect(testState.requestSubmit).not.toHaveBeenCalled();
		expect(testState.submitOrder).not.toHaveBeenCalled();
	});

	it.each(["approving_fee", "approving_agent", "verifying"] as const)(
		"shows the Sairn button indicator instead of a spinner while trading is enabled (%s)",
		async (status) => {
			testState.tradingReady = false;
			await renderView(root);
			const enable = getCtaButton(container, "Enable Trading");
			expect(enable.querySelector(LOADING_INDICATOR_SELECTOR)).toBeNull();

			testState.registerStatus = status;
			await renderView(root);

			const signing = getCtaButton(container, "Signing...");
			expect(signing.disabled).toBe(true);
			const indicator = signing.querySelector('svg[data-brand-motion="button-loading"]');
			expect(indicator?.getAttribute("data-appearance")).toBe("mono");
			expect(indicator?.getAttribute("aria-hidden")).toBe("true");
			expect(signing.querySelectorAll(LOADING_INDICATOR_SELECTOR)).toHaveLength(1);
			expect(signing.querySelector(".animate-spin")).toBeNull();
			await act(async () => signing.click());
			expect(testState.authorize).not.toHaveBeenCalled();
		},
	);
});

function sliderPointer(type: string, clientX: number): MouseEvent {
	const event = new MouseEvent(type, { bubbles: true, button: 0, buttons: type === "pointerdown" ? 1 : 0, clientX });
	Object.defineProperties(event, {
		pointerId: { value: 1 },
		pointerType: { value: "touch" },
		isPrimary: { value: true },
	});
	return event;
}

function activateLocale(locale: Locale) {
	i18n.loadAndActivate({ locale, messages: getLocaleMessages(locale) });
}

describe("MobileTradeView header number format", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		setValidPerpScenario();
		activateLocale("en");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	function getChangePercent(): string | null | undefined {
		return container.querySelector(".text-right > div:nth-child(2)")?.textContent;
	}

	it("writes the 24h change percent with the number-format decimal sign", async () => {
		testState.markPx = "112.5";
		testState.prevDayPx = "100";
		await renderView(root);
		expect(getChangePercent()).toBe("+12.50%");

		testState.formatLocale = "de-DE";
		await act(async () => notifyNumberFormatChange());
		expect(getChangePercent()).toBe("+12,50%");

		testState.markPx = "87.65";
		await renderView(root);
		expect(getChangePercent()).toBe("-12,35%");

		testState.formatLocale = "fr-FR";
		await act(async () => notifyNumberFormatChange());
		expect(getChangePercent()).toBe("-12,35%");
	});

	it("writes the editable maximum slippage with the number-format decimal sign", async () => {
		testState.formatLocale = "de-DE";
		await renderView(root);
		expect(container.querySelector('button[aria-label="Slippage"]')?.textContent).toContain("0,5%");
	});
});

async function renderView(root: Root) {
	await act(async () => {
		root.render(
			<I18nProvider i18n={i18n}>
				<MobileTradeView sizeMode="base" onSizeModeChange={vi.fn()} />
			</I18nProvider>,
		);
	});
}

function expectSizeErrorLinked(container: HTMLElement) {
	const error = getValidationError(container);
	expect(error).not.toBeNull();
	expect(error?.id).not.toBe("");
	expect(error?.getAttribute("role")).toBe("alert");
	expect(error?.textContent?.trim()).not.toBe("");
	for (const control of getSizeControls(container)) {
		expect(control.getAttribute("aria-invalid")).toBe("true");
		expect(control.getAttribute("aria-describedby")?.split(/\s+/)).toContain(error?.id);
		expect(document.getElementById(error?.id ?? "")?.textContent?.trim()).not.toBe("");
	}
}

function getValidationError(container: HTMLElement): HTMLParagraphElement | null {
	return container.querySelector<HTMLParagraphElement>('p[id][role="alert"]');
}

function getPriceInput(container: HTMLElement): HTMLInputElement {
	const input = container.querySelector<HTMLInputElement>('input[aria-label="Price (USDC)"]');
	if (!input) throw new Error("Expected the limit price input");
	return input;
}

function getOrderButton(container: HTMLElement): HTMLButtonElement {
	return getCtaButton(container, "Buy");
}

function getCtaButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button.w-full")).find(
		(candidate) => candidate.textContent?.trim() === label,
	);
	if (!button) throw new Error(`Expected the ${label} button`);
	return button;
}

async function expectSubmissionBlocked(container: HTMLElement) {
	const button = getOrderButton(container);
	expect(button.disabled).toBe(true);
	await act(async () => button.click());
	expect(testState.requestSubmit).not.toHaveBeenCalled();
	expect(testState.submitOrder).not.toHaveBeenCalled();
}

function getSizeControls(container: HTMLElement): HTMLInputElement[] {
	const sizeInput = container.querySelector<HTMLInputElement>('input[aria-label="Size"]');
	const slider = container.querySelector<HTMLInputElement>('input[type="range"]');
	const percentInput = container.querySelector<HTMLInputElement>('input[aria-label="Size (%)"]:not([type="range"])');
	if (!sizeInput || !slider || !percentInput) throw new Error("Expected all mobile size controls");
	return [sizeInput, slider, percentInput];
}

function expectDescriptionCleared(control: HTMLInputElement) {
	expect(control.getAttribute("aria-invalid")).toBeNull();
	expect(control.getAttribute("aria-describedby")).toBeNull();
}

function setValidPerpScenario() {
	testState.tradingReady = true;
	testState.isSubmitting = false;
	testState.registerStatus = "idle";
	testState.availableBalance = 100;
	testState.baseAvailable = 100;
	testState.availabilityStatus = "success";
	testState.kind = "perp";
	testState.limitPrice = "";
	testState.markPx = "100";
	testState.prevDayPx = undefined;
	testState.formatLocale = "en-US";
	testState.markPriceStatus = "success";
	testState.maxSize = 10;
	testState.openInterestCapped = false;
	testState.orderType = "market";
	testState.orderValue = 100;
	testState.quoteAvailable = 100;
	testState.reduceOnly = false;
	testState.side = "buy";
	testState.sizeValue = 1;
}

function setPerpMinimumScenario() {
	setValidPerpScenario();
	testState.orderValue = 5;
	testState.sizeValue = 0.05;
}

function setPerpMaximumScenario() {
	setValidPerpScenario();
	testState.maxSize = 1;
	testState.orderValue = 200;
	testState.sizeValue = 2;
}

function setSpotBuyBalanceScenario() {
	setValidPerpScenario();
	testState.kind = "spot";
	testState.orderValue = 200;
	testState.quoteAvailable = 100;
	testState.sizeValue = 2;
}

function setSpotSellBalanceScenario() {
	setValidPerpScenario();
	testState.availableBalance = 1;
	testState.baseAvailable = 1;
	testState.kind = "spot";
	testState.orderValue = 200;
	testState.side = "sell";
	testState.sizeValue = 2;
}
