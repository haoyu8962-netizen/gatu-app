/** @vitest-environment jsdom */

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	availableBalance: 100,
	baseAvailable: 100,
	kind: "perp" as "perp" | "spot",
	markPx: "100",
	maxSize: 10,
	orderType: "market",
	orderValue: 100,
	quoteAvailable: 100,
	side: "buy" as "buy" | "sell",
	sizeValue: 1,
	actions: {
		markDraftEdited: vi.fn(),
		setLimitPriceFromPrefill: vi.fn(),
		setLimitPriceFromUser: vi.fn(),
		setOrderType: vi.fn(),
		setSide: vi.fn(),
		setSlPrice: vi.fn(),
		setTpPrice: vi.fn(),
		setTpSlEnabled: vi.fn(),
		setTriggerPrice: vi.fn(),
	},
}));

vi.mock("@gatu/ui", async (importOriginal) => ({
	...(await importOriginal<typeof import("@gatu/ui")>()),
	Button: ({
		children,
		iconLeft: _iconLeft,
		intent: _intent,
		size: _size,
		variant: _variant,
		...props
	}: Record<string, unknown>) => createElement("button", props, children as ReactNode),
	Tooltip: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("wagmi", () => ({
	useSwitchChain: () => ({ isPending: false, switchChain: vi.fn() }),
	useWalletClient: () => ({ data: {}, error: null, isLoading: false }),
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
vi.mock("@/components/trade/mobile/mobile-trade-price-field", () => ({ MobileTradePriceField: () => null }));

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
		requestSubmit: vi.fn(),
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
		availabilityStatus: "ready",
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
		convertSizeForModeToggle: () => "",
		currentLeverage: 10,
		executionAvailability: {},
		getSizeForPercent: () => "1",
		hasAvailabilityError: false,
		hasPosition: false,
		isAvailabilityBlocked: false,
		isAvailabilityLoading: false,
		isSpotMarket: testState.kind === "spot",
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
	useOrderSubmit: () => ({
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
		handleSubmit: vi.fn(),
		isSubmitting: false,
	}),
}));

vi.mock("@/hooks/trade/use-prospective-cross-margin-account", () => ({
	useProspectiveCrossMarginAccount: () => ({ account: null, existingPosition: null }),
}));

vi.mock("@/hooks/trade/use-orderbook-mid-price", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/hooks/trade/use-orderbook-mid-price")>()),
	useOrderbookMidPrice: () => ({ midPx: undefined }),
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
	useWalletSession: () => ({ address: "0xabc", isConnected: true }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useTradingStatus: () => ({
		isSignerLoading: false,
		isSignerReady: true,
		isBuilderFeeLoading: false,
		isReady: true,
	}),
	useSelectedMarketInfo: () => ({
		data: {
			assetId: 0,
			kind: testState.kind,
			markPriceReceivedAt: Date.now(),
			markPriceStatus: "success",
			markPx: testState.markPx,
			midPriceReceivedAt: Date.now(),
			midPx: testState.markPx,
			name: testState.kind === "spot" ? "BTC/USDC" : "BTC",
			pairName: "BTC/USDC",
			prevDayPx: testState.markPx,
			szDecimals: 3,
		},
	}),
	useInfo: () => ({ data: undefined }),
	useTradingAuthorization: () => ({ authorize: vi.fn(), status: "idle" }),
	useUserPositions: () => ({
		getPosition: () => null,
		hasError: false,
		isLoading: false,
		isStale: false,
	}),
}));

vi.mock("@/lib/lazy", () => ({ createLazyComponent: () => () => null }));
vi.mock("@/lib/number-format-reactivity", () => ({ useNumberFormatRevision: () => 0 }));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: vi.fn() }),
	useEstablishConnectionModalActions: () => ({ open: vi.fn() }),
	useSettingsDialogActions: () => ({ open: vi.fn() }),
}));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	useMarketOrderSlippageBps: () => 50,
	useMarketOrderSlippagePercent: () => 0.5,
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useLimitPrice: () => "",
	useOrderEntryActions: () => testState.actions,
	useOrderSide: () => testState.side,
	useOrderType: () => testState.orderType,
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

const LOCALES = ["en", "zh", "hi", "es", "fr", "ar"] as const;
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

	it("keeps the lingering error and ARIA state atomic, then clears both", async () => {
		activateLocale("en");
		setPerpMaximumScenario();
		await renderView(root);
		expectSizeErrorLinked(container);

		setValidPerpScenario();
		await renderView(root);
		expectSizeErrorLinked(container);

		await act(async () => vi.advanceTimersByTime(1_500));

		expect(getValidationError(container)).toBeNull();
		for (const control of getSizeControls(container)) expectDescriptionCleared(control);
	});

	it("does not mark size controls invalid for a price-only error", async () => {
		activateLocale("ar");
		setPerpMaximumScenario();
		await renderView(root);
		expectSizeErrorLinked(container);

		setPriceErrorScenario();
		await renderView(root);

		const error = getValidationError(container);
		expect(error?.textContent).toBe("ar: price required");
		for (const control of getSizeControls(container)) expectDescriptionCleared(control);
	});
});

function activateLocale(locale: Locale) {
	i18n.loadAndActivate({ locale, messages: getLocaleMessages(locale) });
}

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
	return container.querySelector<HTMLParagraphElement>("p[id]");
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
	testState.availableBalance = 100;
	testState.baseAvailable = 100;
	testState.kind = "perp";
	testState.markPx = "100";
	testState.maxSize = 10;
	testState.orderType = "market";
	testState.orderValue = 100;
	testState.quoteAvailable = 100;
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

function setPriceErrorScenario() {
	setValidPerpScenario();
	testState.markPx = "0";
	testState.orderType = "limit";
}
