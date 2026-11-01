/** @vitest-environment jsdom */

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import type { OrderParameters } from "@nktkas/hyperliquid";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	twapAdvancedEnabled: false,
	twapTriggerPrice: "",
	twapStopPrice: "",
	authorize: vi.fn(async () => {}),
	availableBalance: 100,
	accountModeBlocked: false,
	isAwaitingFirstDeposit: false,
	openDeposit: vi.fn(),
	hasWalletAccess: true,
	isReady: true,
	isSignerLoading: false,
	signerMode: "owner" as "owner" | "agent",
	limitPrice: "100",
	openInterestCapped: false,
	orderType: "limit",
	selectedPrice: null as { marketName: string; price: string } | null,
	sizeModeRequest: null as { marketName: string; mode: "base" | "quote" } | null,
	toggleSizeDenomination: vi.fn(),
	triggerPrice: "",
	scaleStart: "",
	scaleEnd: "",
	scaleLevels: null as number | null,
	scaleSkew: "",
	orderEntryInput: undefined as unknown,
	scaleSummaryProps: undefined as { orderValue?: number; marginRequired?: number | null } | undefined,
	sizeForOrder: "1",
	kind: "perp" as "perp" | "spot",
	quoteAvailable: 0,
	spotBuyQuoteCost: undefined as number | undefined,
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
	connectionChainId: 42161 as number,
	walletClientError: null as Error | null,
	walletClientLoading: false,
	walletClientMissing: false,
	switchChain: vi.fn(),
}));

vi.mock("wagmi", () => ({
	useConnection: () => ({ chainId: wagmiState.connectionChainId }),
	useSwitchChain: () => ({ isPending: false, mutate: wagmiState.switchChain }),
	useWalletClient: (parameters?: { chainId?: number }) => {
		const matchesConnection = parameters?.chainId === wagmiState.connectionChainId;
		const data =
			matchesConnection && !wagmiState.walletClientLoading && !wagmiState.walletClientMissing
				? { account: { address: "0xabc" } }
				: undefined;
		const error = matchesConnection ? null : wagmiState.walletClientError;
		return { data, error, isLoading: wagmiState.walletClientLoading };
	},
}));

vi.mock("@/components/trade/tradebox/trade-form-fields", () => ({ TradeFormFields: () => null }));
vi.mock("@/components/trade/tradebox/trade-header", () => ({ TradeHeader: () => null }));
vi.mock("@/components/trade/tradebox/order-summary", () => ({ OrderSummary: () => null }));
vi.mock("@/components/trade/tradebox/scale-order-summary", () => ({
	ScaleOrderSummary: (props: { orderValue?: number; marginRequired?: number | null }) => {
		testState.scaleSummaryProps = props;
		return null;
	},
}));
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
	useOrderEntryData: (input: { orderValueForSize?: (size: string) => number | undefined }) => {
		testState.orderEntryInput = input;
		return {
			accountAbstraction: "disabled",
			allowsIsolatedMarginRemoval: false,
			applyMarginAndLeverage: vi.fn(),
			applySizePercent: vi.fn(),
			beginSizePercentGesture: vi.fn(),
			endSizePercentGesture: vi.fn(),
			availabilityMaxAgeMs: 20_000,
			availabilityReceivedAt: Date.now(),
			availabilityStatus: testState.accountModeBlocked ? "error" : "success",
			availableBalance: testState.availableBalance,
			baseToken: "BTC",
			committedLeverage: null,
			conversionPrice: 100,
			currentLeverage: 10,
			executionAvailability: { kind: "perp", maxBaseBySide: { buy: "10", sell: "10" } },
			hasAvailabilityError: testState.accountModeBlocked,
			hasPosition: false,
			isAvailabilityBlocked: testState.accountModeBlocked,
			isAwaitingFirstDeposit: testState.isAwaitingFirstDeposit,
			isAvailabilityLoading: false,
			isAvailabilityStale: false,
			isLeverageUpdating: false,
			isOpenInterestCapped: testState.openInterestCapped,
			isSpotMarket: testState.kind === "spot",
			isSwitchingMode: false,
			leverage: 10,
			leverageInteractionIdentity: "Mainnet:BTC",
			marginMode: "cross",
			maxLeverage: 50,
			maxSize: 10,
			orderValue: input.orderValueForSize?.(testState.sizeForOrder) ?? 100,
			pendingLeverage: null,
			positionStateReady: true,
			quoteToken: "USDC",
			resetPendingLeverage: vi.fn(),
			setPendingLeverage: vi.fn(),
			sideLabels: { buy: "Buy", sell: "Sell", buyAria: "Buy", sellAria: "Sell" },
			sizeForOrder: testState.sizeForOrder,
			sizeValue: Number(testState.sizeForOrder),
			spotBalance: { baseAvailable: 0, quoteAvailable: testState.quoteAvailable },
			spotBuyQuoteCost: testState.spotBuyQuoteCost ?? input.orderValueForSize?.(testState.sizeForOrder) ?? 100,
			szDecimals: 3,
			toggleSizeDenomination: testState.toggleSizeDenomination,
		};
	},
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
	useDepositModalActions: () => ({ open: testState.openDeposit }),
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
	useScaleEnd: () => testState.scaleEnd,
	useScaleLevels: () => testState.scaleLevels,
	useScaleSkew: () => testState.scaleSkew,
	useScaleStart: () => testState.scaleStart,
	useSizeMode: () => "base",
	useSlPrice: () => "",
	useTif: () => "Gtc",
	useTpPrice: () => "",
	useTpSlEnabled: () => false,
	useTpSlReturnInvalid: () => false,
	useTriggerPrice: () => testState.triggerPrice,
	useTwapAdvancedEnabled: () => testState.twapAdvancedEnabled,
	useTwapMinutes: () => 30,
	useTwapRandomize: () => false,
	useTwapStopPrice: () => testState.twapStopPrice,
	useTwapTriggerPrice: () => testState.twapTriggerPrice,
}));
vi.mock("@/stores/use-orderbook-actions-store", () => ({
	getOrderbookActionsStore: () => ({ actions: { clearSelectedPrice: vi.fn(), clearSizeModeRequest: vi.fn() } }),
	getSelectedPriceForMarket: (selection: { marketName: string; price: string } | null, marketName?: string) =>
		selection && selection.marketName === marketName ? selection.price : null,
	useSelectedPrice: () => testState.selectedPrice,
	useSizeModeRequest: () => testState.sizeModeRequest,
}));

import { TradePanel } from "@/components/trade/tradebox/trade-panel";
import { EntryExecutionError } from "@/domain/trade/order/entry-execution-guard";
import { getScaleOrderNotional } from "@/domain/trade/orders";

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
		testState.accountModeBlocked = false;
		testState.isAwaitingFirstDeposit = false;
		testState.limitPrice = "100";
		testState.openInterestCapped = false;
		testState.orderType = "limit";
		testState.selectedPrice = null;
		testState.sizeModeRequest = null;
		testState.triggerPrice = "";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.clearAllMocks();
		testState.accountModeBlocked = false;
		testState.isAwaitingFirstDeposit = false;
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

	it.each([
		["market", "limit"],
		["limit", "limit"],
		["stopMarket", "stopLimit"],
		["stopLimit", "stopLimit"],
		["takeProfitLimit", "takeProfitLimit"],
	] as const)("prices a %s order at a clicked book level as a %s order, like the official terminal", async (orderType, expected) => {
		testState.orderType = orderType;
		testState.selectedPrice = { marketName: "BTC", price: "98.5" };
		await renderPanel(root);

		expect(testState.actions.setOrderType.mock.calls).toEqual(expected === orderType ? [] : [[expected]]);
		expect(testState.actions.setLimitPriceFromUser).toHaveBeenCalledWith(`BTC|${expected}`, "98.5");
	});

	it.each(["takeProfitMarket", "twap", "scale"] as const)(
		"leaves a %s order unchanged when a book level is clicked",
		async (orderType) => {
			testState.orderType = orderType;
			testState.selectedPrice = { marketName: "BTC", price: "98.5" };
			await renderPanel(root);

			expect(testState.actions.setOrderType).not.toHaveBeenCalled();
			expect(testState.actions.setLimitPriceFromUser).not.toHaveBeenCalled();
		},
	);

	it("converts the entered size once through the form's own unit toggle when the book picks the other unit", async () => {
		testState.sizeModeRequest = { marketName: "BTC", mode: "quote" };
		await renderPanel(root);

		expect(testState.toggleSizeDenomination).toHaveBeenCalledTimes(1);
	});

	it.each([
		["the unit already in use", { marketName: "BTC", mode: "base" as const }],
		["another market's book", { marketName: "ETH", mode: "quote" as const }],
	])("ignores a unit request from %s", async (_name, request) => {
		testState.sizeModeRequest = request;
		await renderPanel(root);

		expect(testState.toggleSizeDenomination).not.toHaveBeenCalled();
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

	it("offers Deposit to a new account awaiting its first deposit and never submits its valid-looking draft", async () => {
		testState.accountModeBlocked = true;
		await renderPanel(root);
		await expectSubmissionBlocked(container);
		expect(getOrderButton(container).textContent?.trim()).not.toBe("Deposit");

		testState.isAwaitingFirstDeposit = true;
		await act(async () => root.unmount());
		root = createRoot(container);
		await renderPanel(root);
		const button = getOrderButton(container);
		expect(button.textContent?.trim()).toBe("Deposit");
		expect(button.disabled).toBe(false);

		await act(async () => button.click());

		expect(testState.openDeposit).toHaveBeenCalledWith("deposit");
		expect(testState.requestSubmit).not.toHaveBeenCalled();
		expect(testState.submitOrder).not.toHaveBeenCalled();
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
		testState.signerMode = "agent";
		wagmiState.connectionChainId = 999_999;
		wagmiState.walletClientError = new Error(
			"The current chain of the connector (id: 999999) does not match the connection's chain (id: 42161).",
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
			wagmiState.connectionChainId = 42161;
			wagmiState.walletClientError = null;
		}
	});

	it("lets the Privy owner enable trading without any wagmi client", async () => {
		testState.signerMode = "owner";
		testState.isReady = false;
		wagmiState.walletClientMissing = true;
		try {
			await renderPanel(root);
			const button = getOrderButton(container);
			expect(button.textContent?.trim()).toBe("Enable Trading");
			expect(button.disabled).toBe(false);
			await act(async () => button.click());
			expect(testState.authorize).toHaveBeenCalledTimes(1);
			expect(wagmiState.switchChain).not.toHaveBeenCalled();
		} finally {
			wagmiState.walletClientMissing = false;
		}
	});

	it("waits for the external wallet client before offering Enable Trading", async () => {
		testState.signerMode = "agent";
		wagmiState.walletClientLoading = true;
		try {
			await renderPanel(root);
			const pending = getOrderButton(container);
			expect(pending.textContent?.trim()).toBe("Enable Trading");
			expect(pending.disabled).toBe(true);
			await act(async () => pending.click());
			expect(testState.authorize).not.toHaveBeenCalled();

			wagmiState.walletClientLoading = false;
			wagmiState.walletClientMissing = true;
			await renderPanel(root);
			const missing = getOrderButton(container);
			expect(missing.disabled).toBe(true);
			await act(async () => missing.click());
			expect(testState.authorize).not.toHaveBeenCalled();

			wagmiState.walletClientMissing = false;
			await renderPanel(root);
			const ready = getOrderButton(container);
			expect(ready.disabled).toBe(false);
			await act(async () => ready.click());
			expect(testState.authorize).toHaveBeenCalledTimes(1);
		} finally {
			wagmiState.walletClientLoading = false;
			wagmiState.walletClientMissing = false;
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

describe("desktop TradePanel price precision and scale sizing", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		activateLocale("en");
		testState.availableBalance = 100;
		testState.kind = "perp";
		testState.quoteAvailable = 0;
		testState.spotBuyQuoteCost = undefined;
		testState.limitPrice = "100";
		testState.openInterestCapped = false;
		testState.orderType = "limit";
		testState.triggerPrice = "";
		testState.scaleStart = "";
		testState.scaleEnd = "";
		testState.scaleLevels = null;
		testState.scaleSkew = "";
		testState.twapAdvancedEnabled = false;
		testState.twapTriggerPrice = "";
		testState.twapStopPrice = "";
		testState.orderEntryInput = undefined;
		testState.scaleSummaryProps = undefined;
		testState.sizeForOrder = "1";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("marks an off-tick limit price, names a valid one and blocks the order", async () => {
		testState.limitPrice = "100.1234";
		await renderPanel(root);

		expect(getRestriction(container)?.textContent).toBe(
			"Price must be a multiple of the tick size, with at most 5 significant figures. E.g., 100.12",
		);
		await expectSubmissionBlocked(container);
	});

	it("blocks a TWAP price limit off the market tick on its own", async () => {
		testState.orderType = "twap";
		testState.twapStopPrice = "101.1234";
		testState.twapAdvancedEnabled = true;
		await renderPanel(root);

		expect(getRestriction(container)?.textContent).toContain("E.g., 101.12");
		await expectSubmissionBlocked(container);
	});

	it("blocks a TWAP trigger price off the market tick while the advanced settings are on", async () => {
		testState.orderType = "twap";
		testState.twapTriggerPrice = "100.1234";
		testState.twapAdvancedEnabled = true;
		await renderPanel(root);

		expect(getRestriction(container)?.textContent).toContain("E.g., 100.12");
		await expectSubmissionBlocked(container);
	});

	it("marks an off-tick trigger price and blocks the order", async () => {
		testState.orderType = "stopMarket";
		testState.triggerPrice = "110.0009";
		await renderPanel(root);

		expect(getRestriction(container)?.textContent).toContain("E.g., 110");
		await expectSubmissionBlocked(container);
	});

	it("estimates a scale order's margin from the value of its lot-rounded levels", async () => {
		testState.orderType = "scale";
		testState.scaleStart = "100000";
		testState.scaleEnd = "20000";
		testState.scaleLevels = 2;
		testState.scaleSkew = "1";
		testState.sizeForOrder = "0.003";
		await renderPanel(root);

		expect(testState.scaleSummaryProps?.orderValue).toBe(220);
		expect(testState.scaleSummaryProps?.marginRequired).toBe(22);
	});

	it("checks a spot market buy against what it locks at the slippage limit before it is sent", async () => {
		testState.kind = "spot";
		testState.orderType = "market";
		testState.quoteAvailable = 100;
		testState.spotBuyQuoteCost = 102.5;
		await renderPanel(root);
		await expectSubmissionBlocked(container);

		testState.spotBuyQuoteCost = 100;
		await renderPanel(root);
		expect(getOrderButton(container).disabled).toBe(false);
	});

	it("hands order entry the margin a resting limit order reserves at the official terminal's price", async () => {
		testState.orderType = "limit";
		testState.limitPrice = "80";
		await renderPanel(root);

		const marginForSize = (testState.orderEntryInput as { marginNotionalForSize?: (size: string) => number | undefined })
			.marginNotionalForSize;
		expect(marginForSize?.("2")).toBe(160);

		testState.limitPrice = "120";
		await renderPanel(root);
		const aggressive = (testState.orderEntryInput as { marginNotionalForSize?: (size: string) => number | undefined })
			.marginNotionalForSize;
		expect(aggressive?.("2")).toBe(200);
	});

	it("sizes a scale order at the size-weighted average of its levels", async () => {
		testState.orderType = "scale";
		testState.scaleStart = "80";
		testState.scaleEnd = "60";
		testState.scaleLevels = 4;
		testState.scaleSkew = "1";
		await renderPanel(root);

		expect((testState.orderEntryInput as { limitPx?: number } | undefined)?.limitPx).toBe(70);
		const valueForSize = (testState.orderEntryInput as { orderValueForSize?: (size: string) => number | undefined })
			.orderValueForSize;
		const levels = {
			assetId: 0,
			szDecimals: 3,
			scaleStartPriceInput: "80",
			scaleEndPriceInput: "60",
			scaleLevelsNum: 4,
			scaleSkew: "1",
		};
		expect(valueForSize?.("1.003")).toBe(getScaleOrderNotional({ ...levels, sizeValue: "1.003" })?.toNumber());
		expect(valueForSize?.("1.003")).not.toBeUndefined();
	});
});
