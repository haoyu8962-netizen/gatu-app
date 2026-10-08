/** @vitest-environment jsdom */

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import type { OrderParameters } from "@nktkas/hyperliquid";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	authorize: vi.fn(async () => {}),
	availableBalance: 100,
	hasWalletAccess: true,
	isReady: true,
	isSignerLoading: false,
	signerMode: "owner" as "owner" | "agent",
	limitPrice: "100",
	openInterestCapped: false,
	orderType: "limit",
	triggerPrice: "",
	requestSubmit: vi.fn(),
	submitOrder: vi.fn(),
	executionGuard: undefined as ((params: OrderParameters) => void) | undefined,
	actions: {
		markDraftEdited: vi.fn(),
		setLimitPriceFromPrefill: vi.fn(),
		setLimitPriceFromUser: vi.fn(),
		setOrderType: vi.fn(),
		setReduceOnly: vi.fn(),
		setSide: vi.fn(),
		setSize: vi.fn(),
		setSizeMode: vi.fn(),
		setSlPrice: vi.fn(),
		setTpPrice: vi.fn(),
		setTpSlEnabled: vi.fn(),
		setTriggerPrice: vi.fn(),
	},
}));

const wagmiState = vi.hoisted(() => ({
	walletClientError: null as Error | null,
	switchChain: vi.fn(),
}));

vi.mock("wagmi", () => ({
	useSwitchChain: () => ({ isPending: false, mutate: wagmiState.switchChain }),
	useWalletClient: () => ({ data: wagmiState.walletClientError ? undefined : {}, error: wagmiState.walletClientError, isLoading: false }),
}));

vi.mock("@/components/trade/tradebox/trade-form-fields", () => ({ TradeFormFields: () => null }));
vi.mock("@/components/trade/tradebox/trade-header", () => ({ TradeHeader: () => null }));
vi.mock("@/components/trade/tradebox/order-summary", () => ({ OrderSummary: () => null }));
vi.mock("@/components/trade/tradebox/scale-order-summary", () => ({ ScaleOrderSummary: () => null }));
vi.mock("@/components/trade/tradebox/twap-order-summary", () => ({ TwapOrderSummary: () => null }));
vi.mock("@/components/trade/tradebox/order-confirmation-modal", () => ({ OrderConfirmationModal: () => null }));
vi.mock("@/components/trade/tradebox/lazy-trade-settings-modals", () => ({
	AccountModeModal: () => null,
	LeverageModal: () => null,
	MarginModeModal: () => null,
	warmTradeSettingsModals: vi.fn(),
}));
vi.mock("@/components/ui/lazy-dialog-host", () => ({ LazyDialogHost: () => null }));

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
vi.mock("@/hooks/trade/use-builder-fee-config", () => ({ useBuilderFeeTenthsBps: () => 0 }));
vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({ available: true, unavailableReason: null }),
}));
vi.mock("@/hooks/trade/use-fee-rates", () => ({
	useMarketFeeRates: () => ({ makerRate: 0.0001, takerRate: 0.0002 }),
}));
vi.mock("@/hooks/trade/use-market-slippage-estimate", () => ({ useMarketSlippageEstimate: () => null }));
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
		applySizePercent: vi.fn(),
		availabilityMaxAgeMs: 20_000,
		availabilityReceivedAt: Date.now(),
		availabilityStatus: "success",
		availableBalance: testState.availableBalance,
		baseToken: "BTC",
		committedLeverage: null,
		conversionPrice: 100,
		currentLeverage: 10,
		executionAvailability: { kind: "perp", maxBaseBySide: { buy: "10", sell: "10" } },
		hasAvailabilityError: false,
		hasPosition: false,
		isAvailabilityBlocked: false,
		isAvailabilityLoading: false,
		isAvailabilityStale: false,
		isLeverageUpdating: false,
		isOpenInterestCapped: testState.openInterestCapped,
		isSpotMarket: false,
		isSwitchingMode: false,
		leverage: 10,
		leverageInteractionIdentity: "Mainnet:BTC",
		marginMode: "cross",
		maxLeverage: 50,
		maxSize: 10,
		orderValue: 100,
		pendingLeverage: null,
		positionStateReady: true,
		quoteToken: "USDC",
		resetPendingLeverage: vi.fn(),
		setPendingLeverage: vi.fn(),
		sideLabels: { buy: "Buy", sell: "Sell", buyAria: "Buy", sellAria: "Sell" },
		sizeForOrder: "1",
		sizeValue: 1,
		spotBalance: { baseAvailable: 0, quoteAvailable: 0 },
		szDecimals: 3,
		toggleSizeDenomination: vi.fn(),
	}),
}));
vi.mock("@/hooks/trade/use-order-submit", () => ({
	useOrderSubmit: (options: { executionGuard?: (params: OrderParameters) => void }) => {
		testState.executionGuard = options.executionGuard;
		return {
		captureDraftResetToken: () => ({
			orderEntry: { marketIdentity: "Mainnet:BTC", draftRevision: 0 },
			exchangeSession: {
				id: Symbol("desktop-open-interest-cap-session"),
				env: "Mainnet",
				clientKey: "0xabc",
				sessionMode: "wallet",
				active: true,
			},
		}),
		isDraftResetTokenCurrent: () => true,
		handleSubmit: testState.submitOrder,
		isSubmitting: false,
		};
	},
}));
vi.mock("@/hooks/trade/use-prospective-cross-margin-account", () => ({
	useProspectiveCrossMarginAccount: () => ({ account: null, existingPosition: null }),
}));
vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({ actionsBlocked: false, isError: false, isResolved: true, tradeRestricted: false }),
}));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: "0xabc", isConnected: true, hasWalletAccess: testState.hasWalletAccess }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	getMarketCapabilities: () => ({ allowsCrossMargin: true, hasReduceOnly: true, hasTpSl: true, isLeveraged: true }),
	useMarketsInfo: () => ({ spotMarkets: [], isLoading: false, error: null }),
	useSelectedMarketInfo: () => ({
		data: {
			assetId: 0,
			kind: "perp",
			marginMetadataReady: true,
			markPriceReceivedAt: Date.now(),
			markPriceStatus: "success",
			markPx: "100",
			midPriceReceivedAt: Date.now(),
			midPx: "100",
			name: "BTC",
			pairName: "BTC-USDC",
			szDecimals: 3,
		},
	}),
	useTradingAuthorization: () => ({ authorize: testState.authorize, status: "idle" }),
	useTradingStatus: () => ({
		isBuilderFeeLoading: false,
		isReady: testState.isReady,
		isSignerLoading: testState.isSignerLoading,
		isSignerReady: !testState.isSignerLoading,
		signerMode: testState.signerMode,
	}),
	useUserPositions: () => ({
		getPosition: () => null,
		hasError: false,
		isLoading: false,
		isStale: false,
		receivedAt: Date.now(),
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
	useSwapModalActions: () => ({ open: vi.fn() }),
}));
vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	useMarketOrderSlippageBps: () => 50,
	useMarketOrderSlippagePercent: () => 0.5,
}));
vi.mock("@/stores/use-order-entry-store", () => ({
	useLimitPrice: () => testState.limitPrice,
	useOrderEntryActions: () => testState.actions,
	useOrderSide: () => "buy",
	useOrderSize: () => "1",
	useOrderType: () => testState.orderType,
	useReduceOnly: () => false,
	useScaleEnd: () => "",
	useScaleLevels: () => null,
	useScaleSkew: () => "",
	useScaleStart: () => "",
	useSizeMode: () => "base",
	useSlPrice: () => "",
	useTif: () => "Gtc",
	useTpPrice: () => "",
	useTpSlEnabled: () => false,
	useTpSlReturnInvalid: () => false,
	useTriggerPrice: () => testState.triggerPrice,
	useTwapAdvancedEnabled: () => false,
	useTwapMinutes: () => 30,
	useTwapRandomize: () => false,
	useTwapStopPrice: () => "",
	useTwapTriggerPrice: () => "",
}));
vi.mock("@/stores/use-orderbook-actions-store", () => ({
	getOrderbookActionsStore: () => ({ actions: { clearSelectedPrice: vi.fn() } }),
	getSelectedPriceForMarket: () => null,
	useSelectedPrice: () => null,
}));

import { TradePanel } from "@/components/trade/tradebox/trade-panel";
import { EntryExecutionError } from "@/domain/trade/order/entry-execution-guard";

const OPEN_INTEREST_CAP_COPY =
	"The limit order would be canceled after resting because open interest is capped. Use market orders to close positions.";
const GENERIC_FAILURE = "The request could not be completed. Try again.";
const APPROVAL_FAILURE = "Failed to enable trading";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

function activateLocale(locale: "en" | "zh") {
	const messages: Messages =
		locale === "en"
			? {}
			: {
					[getMessageId(OPEN_INTEREST_CAP_COPY)]: "zh: open interest cap",
					[getMessageId("Place {0} Order")]: "zh: place {0} order",
					[getMessageId(GENERIC_FAILURE)]: "zh: request failed",
					[getMessageId(APPROVAL_FAILURE)]: "zh: failed to enable trading",
				};
	i18n.loadAndActivate({ locale, messages });
}

async function renderPanel(root: Root) {
	await act(async () => {
		root.render(
			<I18nProvider i18n={i18n}>
				<TradePanel key="trade-panel" />
			</I18nProvider>,
		);
	});
}

function getFooter(container: HTMLElement): HTMLElement {
	const footer = container.querySelector<HTMLElement>('[data-slot="trade-panel-footer"]');
	if (!footer) throw new Error("Expected the trade panel footer");
	return footer;
}

function getRestriction(container: HTMLElement): HTMLElement | null {
	return getFooter(container).querySelector<HTMLElement>("div.text-error");
}

function getOrderButton(container: HTMLElement): HTMLButtonElement {
	const button = getFooter(container).querySelector<HTMLButtonElement>("button");
	if (!button) throw new Error("Expected the order submit button");
	return button;
}

async function expectSubmissionBlocked(container: HTMLElement) {
	const button = getOrderButton(container);
	expect(button.disabled).toBe(true);
	await act(async () => button.click());
	expect(testState.requestSubmit).not.toHaveBeenCalled();
	expect(testState.submitOrder).not.toHaveBeenCalled();
}

describe("desktop TradePanel open-interest cap restriction", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		activateLocale("en");
		testState.availableBalance = 100;
		testState.limitPrice = "100";
		testState.openInterestCapped = false;
		testState.orderType = "limit";
		testState.triggerPrice = "";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.clearAllMocks();
		activateLocale("en");
	});

	it.each([
		["limit", ""],
		["stopLimit", "110"],
		["takeProfitLimit", "90"],
	])("explains the confirmed cap for %s and keeps the static CTA disabled", async (orderType, triggerPrice) => {
		testState.orderType = orderType;
		testState.triggerPrice = triggerPrice;
		testState.openInterestCapped = true;
		await renderPanel(root);

		expect(getRestriction(container)?.textContent).toBe(OPEN_INTEREST_CAP_COPY);
		expect(getOrderButton(container).textContent?.trim()).toBe("Place Buy Order");
		expect(getOrderButton(container).getAttribute("aria-label")).toBe("Place Buy Order");
		await expectSubmissionBlocked(container);
	});

	it("shows the restriction before a limit price is typed", async () => {
		testState.limitPrice = "";
		testState.openInterestCapped = true;
		await renderPanel(root);

		expect(getRestriction(container)?.textContent).toBe(OPEN_INTEREST_CAP_COPY);
		await expectSubmissionBlocked(container);
	});

	it("keeps the restriction quiet until the account is ready", async () => {
		testState.availableBalance = 0;
		testState.openInterestCapped = true;
		await renderPanel(root);

		expect(getRestriction(container)).toBeNull();
		expect(getOrderButton(container).textContent?.trim()).not.toBe("Place Buy Order");
	});

	it("keeps a market order on a capped market available and quiet", async () => {
		testState.orderType = "market";
		testState.openInterestCapped = true;
		await renderPanel(root);

		expect(getRestriction(container)).toBeNull();
		expect(getOrderButton(container).disabled).toBe(false);
		await act(async () => getOrderButton(container).click());
		expect(testState.requestSubmit).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ orderType: "market" }),
			expect.anything(),
		);
	});

	it("keeps an uncapped or unknown limit order unchanged", async () => {
		await renderPanel(root);

		expect(getRestriction(container)).toBeNull();
		expect(getOrderButton(container).disabled).toBe(false);
		await act(async () => getOrderButton(container).click());
		expect(testState.requestSubmit).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ orderType: "limit", limitPriceInput: "100" }),
			expect.anything(),
		);
	});

	it("re-checks the latest cap state in the SDK execution guard", async () => {
		const limitOrder: OrderParameters = {
			orders: [{ a: 0, b: true, p: "100", s: "1", r: false, t: { limit: { tif: "Ioc" } } }],
			grouping: "na",
		};
		await renderPanel(root);
		expect(testState.executionGuard).toBeTypeOf("function");
		expect(() => testState.executionGuard?.(limitOrder)).not.toThrow();

		testState.openInterestCapped = true;
		await renderPanel(root);

		let failure: unknown;
		try {
			testState.executionGuard?.(limitOrder);
		} catch (error) {
			failure = error;
		}
		expect(failure).toBeInstanceOf(EntryExecutionError);
		expect(failure).toMatchObject({ reason: "open-interest-capped" });
	});

	it("updates the restriction on the same nodes when the language changes", async () => {
		testState.openInterestCapped = true;
		await renderPanel(root);
		const restriction = getRestriction(container);
		const button = getOrderButton(container);
		expect(restriction?.textContent).toBe(OPEN_INTEREST_CAP_COPY);

		await act(async () => activateLocale("zh"));

		expect(getRestriction(container)).toBe(restriction);
		expect(getOrderButton(container)).toBe(button);
		expect(restriction?.textContent).toBe("zh: open interest cap");
		expect(button.textContent?.trim()).toBe("zh: place Buy order");
		await expectSubmissionBlocked(container);
	});
});

describe("desktop TradePanel trading approval errors", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		activateLocale("en");
		testState.isReady = false;
		testState.openInterestCapped = false;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.clearAllMocks();
		testState.isReady = true;
		testState.hasWalletAccess = true;
		testState.isSignerLoading = false;
		testState.signerMode = "owner";
		activateLocale("en");
	});

	it("keeps Enable Trading inert for an Agent-only session without wallet access", async () => {
		testState.hasWalletAccess = false;
		await renderPanel(root);
		const button = getOrderButton(container);
		expect(button.textContent?.trim()).toBe("Enable Trading");
		expect(button.disabled).toBe(true);

		await act(async () => button.click());

		expect(testState.authorize).not.toHaveBeenCalled();
	});

	it("keeps Enable Trading inert while the exact owner signer is still being established", async () => {
		testState.isSignerLoading = true;
		testState.signerMode = "owner";
		await renderPanel(root);
		const button = getOrderButton(container);
		expect(button.textContent?.trim()).toBe("Enable Trading");
		expect(button.disabled).toBe(true);

		await act(async () => button.click());

		expect(testState.authorize).not.toHaveBeenCalled();
	});

	it("offers Enable Trading on the wallet's current network instead of a switch to Arbitrum", async () => {
		wagmiState.walletClientError = new Error(
			"The current chain of the connector (id: 1) does not match the connection's chain (id: 42161).",
		);
		try {
			await renderPanel(root);
			const button = getOrderButton(container);
			expect(button.textContent?.trim()).toBe("Enable Trading");
			expect(button.disabled).toBe(false);

			await act(async () => button.click());

			expect(testState.authorize).toHaveBeenCalledTimes(1);
			expect(wagmiState.switchChain).not.toHaveBeenCalled();
		} finally {
			wagmiState.walletClientError = null;
		}
	});

	it.each([
		[new Error("Agent registration returned an unexpected payload"), GENERIC_FAILURE, "zh: request failed"],
		["declined", APPROVAL_FAILURE, "zh: failed to enable trading"],
	])("renders a failed approval in the active language, never its raw text: %s", async (cause, english, chinese) => {
		testState.authorize.mockRejectedValueOnce(cause);
		await renderPanel(root);
		const button = getOrderButton(container);
		expect(button.textContent?.trim()).toBe("Enable Trading");

		await act(async () => button.click());

		expect(getRestriction(container)?.textContent).toBe(english);
		expect(getFooter(container).textContent).not.toContain("unexpected payload");

		await act(async () => activateLocale("zh"));

		expect(getRestriction(container)?.textContent).toBe(chinese);
	});
});
