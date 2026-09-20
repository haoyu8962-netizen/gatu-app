// @vitest-environment jsdom

import { ApiRequestError, type FrontendOpenOrdersResponse, HttpRequestError } from "@nktkas/hyperliquid";
import { act, type ComponentProps, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TradeSizeSlider } from "@/components/trade/components/trade-size-slider";
import type { TpSlPositionTarget } from "@/components/trade/positions/position-dialog-types";
import { PositionTpSlModal } from "@/components/trade/positions/position-tpsl-modal";
import type { Position } from "@/lib/hyperliquid";
import type { OpenOrder } from "@/lib/trade/open-orders";
import { getOrderAssetLockName } from "@/lib/trade/order-asset-lock";
import { createExchangeHarness } from "./harness/hyperliquid-exchange";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	isActivationLocked: undefined as (() => boolean) | undefined,
	connected: true,
	walletAddress: "0x1111111111111111111111111111111111111111",
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	markPx: "28595.5" as string | undefined,
	marketMarkPx: "28000" as string | undefined,
	markStatus: "active" as "idle" | "subscribing" | "active" | "error",
	markStale: false,
	markReceivedAt: Date.now(),
	openOrdersStatus: "active" as "idle" | "subscribing" | "active" | "error",
	openOrdersStale: false,
	hasOpenOrdersSnapshot: true,
	marketLoading: false,
	marketError: null as Error | null,
	marketAssetId: 120000,
	marketSzDecimals: 3,
	marketDex: "xyz",
	positionLoading: false,
	positionError: false,
	positionStale: false,
	position: {
		dex: "xyz",
		coin: "xyz:XYZ100",
		szi: "-0.301",
		entryPx: "28600.68",
		positionValue: "8608.80468",
		unrealizedPnl: "-1.11",
		returnOnEquity: "-0.004",
		liquidationPx: null,
		marginUsed: "430.44",
		maxLeverage: 20,
		leverage: { type: "cross", value: 20 },
		cumFunding: { allTime: "0", sinceChange: "0", sinceOpen: "0" },
	} as Position | null,
	orders: [] as FrontendOpenOrdersResponse,
	getPosition: vi.fn(),
	subscriptions: [] as Array<{ method: string; params: unknown }>,
	placeOrder: vi.fn(),
	cancelOrders: vi.fn(),
	frontendOpenOrders: vi.fn(),
	clearinghouseState: vi.fn(),
	trackedOrderOptions: [] as unknown[],
	isMobile: false,
	pendingMethods: new Set<string>(),
	executionGuards: {} as Record<string, ((params: unknown) => void) | undefined>,
	amountSliderProps: null as ComponentProps<typeof TradeSizeSlider> | null,
}));

vi.mock("@/components/trade/components/trade-size-slider", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/components/trade/components/trade-size-slider")>();
	return {
		TradeSizeSlider: (props: ComponentProps<typeof TradeSizeSlider>) => {
			testState.amountSliderProps = props;
			return createElement(original.TradeSizeSlider, props);
		},
	};
});

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({
		children,
		dismissible,
		onOpenChange,
		open,
		presentation,
		showHandle,
	}: {
		children: ReactNode;
		dismissible: boolean;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		presentation: string;
		showHandle: boolean;
	}) =>
		open
			? createElement(
					"section",
					{
						"data-testid": "position-risk-dialog",
						"data-presentation": presentation,
						"data-dismissible": String(dismissible),
						"data-show-handle": String(showHandle),
					},
					createElement("button", {
						"aria-label": "Request adaptive dismiss",
						type: "button",
						onClick: () => onOpenChange(false),
					}),
					children,
				)
			: null,
	Button: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("button", { ...props, type: "button" }, children),
	Checkbox: ({
		checked,
		disabled,
		label,
		onCheckedChange,
	}: {
		checked: boolean;
		disabled?: boolean;
		label: string;
		onCheckedChange: (checked: boolean) => void;
	}) =>
		createElement(
			"label",
			null,
			createElement("input", {
				"aria-label": label,
				checked,
				disabled,
				onChange: (event: { currentTarget: { checked: boolean } }) => onCheckedChange(event.currentTarget.checked),
				type: "checkbox",
			}),
			label,
		),
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: testState.connected ? testState.walletAddress : undefined,
		isConnected: testState.connected,
	}),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@/hooks/trade/use-tracked-order", () => ({
	useTrackedOrder: (options?: { executionGuard?: (params: unknown) => void }) => {
		testState.executionGuards.order = options?.executionGuard;
		return {
			error: null,
			isPending: testState.pendingMethods.has("order"),
			submitOrder: async (params: unknown, submitOptions: unknown) => {
				options?.executionGuard?.(params);
				testState.trackedOrderOptions.push(submitOptions);
				return { state: "confirmed" as const, result: await testState.placeOrder(params) };
			},
		};
	},
}));

vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin }: { coin: string }) => createElement("span", null, coin),
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({
		children,
		containerClassName: _containerClassName,
		isActivationLocked,
		...props
	}: {
		children: ReactNode;
		containerClassName?: string;
		isActivationLocked?: () => boolean;
		[key: string]: unknown;
	}) => {
		testState.isActivationLocked = isActivationLocked;
		return createElement("button", { ...props, type: "button" }, children);
	},
}));

vi.mock("@/components/trade/tradebox/tp-sl-section", () => ({
	TpSlSection: ({
		leverage,
		linkedReturnInputs,
		disabled,
		onSlPriceChange,
		onTpPriceChange,
		preserveFinancialPrecision,
		referencePrice,
		size,
		slPrice,
		slError,
		tpPrice,
		tpError,
	}: {
		disabled?: boolean;
		leverage?: number;
		linkedReturnInputs?: {
			unitLabel: string;
			onUnitToggle: () => void;
			tp: { ariaLabel: string; value: string; onBlur?: () => void; onChange: (value: string) => void };
			sl: { ariaLabel: string; value: string; onBlur?: () => void; onChange: (value: string) => void };
		};
		onSlPriceChange: (value: string) => void;
		onTpPriceChange: (value: string) => void;
		preserveFinancialPrecision?: boolean;
		referencePrice: string | number;
		size: string | number;
		slPrice: string;
		slError?: string | null;
		tpPrice: string;
		tpError?: string | null;
	}) =>
		createElement(
			"div",
			null,
			createElement("input", {
				"aria-label": "Take Profit",
				disabled,
				onChange: (event: { currentTarget: { value: string } }) => onTpPriceChange(event.currentTarget.value),
				value: tpPrice,
			}),
			createElement("input", {
				"aria-label": "Stop Loss",
				disabled,
				onChange: (event: { currentTarget: { value: string } }) => onSlPriceChange(event.currentTarget.value),
				value: slPrice,
			}),
			createElement("span", { "data-testid": "leverage" }, String(leverage)),
			createElement("span", { "data-testid": "reference-price" }, String(referencePrice)),
			createElement("span", { "data-testid": "position-size" }, String(size)),
			createElement("span", { "data-testid": "precision-mode" }, String(preserveFinancialPrecision)),
			tpError ? createElement("span", { "data-testid": "tp-error" }, tpError) : null,
			slError ? createElement("span", { "data-testid": "sl-error" }, slError) : null,
			linkedReturnInputs
				? createElement(
						"div",
						null,
						createElement("input", {
							"aria-label": linkedReturnInputs.tp.ariaLabel,
							disabled,
							onBlur: linkedReturnInputs.tp.onBlur,
							onChange: (event: { currentTarget: { value: string } }) =>
								linkedReturnInputs.tp.onChange(event.currentTarget.value),
							value: linkedReturnInputs.tp.value,
						}),
						createElement("input", {
							"aria-label": linkedReturnInputs.sl.ariaLabel,
							disabled,
							onBlur: linkedReturnInputs.sl.onBlur,
							onChange: (event: { currentTarget: { value: string } }) =>
								linkedReturnInputs.sl.onChange(event.currentTarget.value),
							value: linkedReturnInputs.sl.value,
						}),
						createElement(
							"button",
							{ disabled, onClick: linkedReturnInputs.onUnitToggle, type: "button" },
							linkedReturnInputs.unitLabel,
						),
					)
				: null,
		),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: (method: string, options?: { executionGuard?: (params: unknown) => void }) => {
		testState.executionGuards[method] = options?.executionGuard;
		const mutation = method === "order" ? testState.placeOrder : testState.cancelOrders;
		return {
			error: null,
			isPending: testState.pendingMethods.has(method),
			mutateAsync: async (params: unknown) => {
				options?.executionGuard?.(params);
				return mutation(params);
			},
			reset: vi.fn(),
		};
	},
	useHyperliquid: () => ({
		clientKey: testState.connected ? testState.clientKey : "disconnected",
		env: testState.env,
		info: {
			frontendOpenOrders: testState.frontendOpenOrders,
			clearinghouseState: testState.clearinghouseState,
		},
	}),
	useMarketsInfo: () => ({
		getMarketInfo: () => (testState.marketMarkPx ? { markPx: testState.marketMarkPx } : undefined),
	}),
	useMarkets: () => ({
		error: testState.marketError,
		isLoading: testState.marketLoading,
		getMarket: () => ({
			kind: "builderPerp",
			assetId: testState.marketAssetId,
			szDecimals: testState.marketSzDecimals,
			dex: testState.marketDex,
			quoteToken: { name: "USDC" },
		}),
	}),
	useSubscription: (method: string, params: unknown) => {
		testState.subscriptions.push({ method, params });
		if (method === "activeAssetCtx") {
			return {
				data: testState.markPx ? { coin: positionRef.coin, ctx: { markPx: testState.markPx } } : undefined,
				status: testState.markStatus,
				isStale: testState.markStale,
				lastMessageAt: testState.markReceivedAt,
			};
		}
		if (method === "openOrders") {
			return {
				data: testState.hasOpenOrdersSnapshot ? { orders: testState.orders } : undefined,
				status: testState.openOrdersStatus,
				isStale: testState.openOrdersStale,
			};
		}
		return { data: undefined, status: "idle" };
	},
	useUserPositions: () => ({
		getPosition: (coin: string, dex: string) => {
			testState.getPosition(coin, dex);
			return testState.position;
		},
		hasError: testState.positionError,
		isLoading: testState.positionLoading,
		isStale: testState.positionStale,
	}),
}));

const positionRef: TpSlPositionTarget = {
	owner: "0x1111111111111111111111111111111111111111",
	env: "Mainnet",
	coin: "xyz:XYZ100",
	dex: "xyz",
	assetId: 120000,
	isLong: false,
	szDecimals: 3,
	marginMode: "cross",
};

function openOrder(overrides: Partial<OpenOrder> = {}): OpenOrder {
	return {
		coin: positionRef.coin,
		side: "B",
		limitPx: "33000",
		sz: "0",
		oid: 7,
		timestamp: 1,
		origSz: "0",
		triggerCondition: "Price below 30000",
		isTrigger: true,
		triggerPx: "30000",
		children: [],
		isPositionTpsl: true,
		reduceOnly: true,
		orderType: "Take Profit Market",
		tif: null,
		cloid: null,
		...overrides,
	};
}

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
	if (!(button instanceof HTMLButtonElement)) throw new Error(`${label} button not found`);
	return button;
}

function getInput(container: HTMLElement, label: string): HTMLInputElement {
	const input = container.querySelector(`input[aria-label="${label}"]`);
	if (!(input instanceof HTMLInputElement)) throw new Error(`${label} input not found`);
	return input;
}

function setInputValue(input: HTMLInputElement, value: string) {
	const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	if (!valueSetter) throw new Error("Native input value setter not found");
	valueSetter.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function installExclusiveLockManager(): void {
	const queues = new Map<string, Promise<void>>();
	const busy = new Set<string>();
	const manager = {
		async request<T>(
			name: string,
			options: LockOptions,
			callback: (lock: Lock | null) => T | PromiseLike<T>,
		): Promise<T> {
			if (options.ifAvailable) {
				if (busy.has(name)) return callback(null);
				busy.add(name);
				try {
					return await callback({ name, mode: "exclusive" } as Lock);
				} finally {
					busy.delete(name);
				}
			}
			const previous = queues.get(name) ?? Promise.resolve();
			let release = () => {};
			const current = new Promise<void>((resolve) => {
				release = resolve;
			});
			queues.set(
				name,
				previous.then(() => current),
			);
			await previous;
			busy.add(name);
			try {
				return await callback({ name, mode: "exclusive" } as Lock);
			} finally {
				busy.delete(name);
				release();
			}
		},
	} as unknown as LockManager;
	Object.defineProperty(window.navigator, "locks", { configurable: true, value: manager });
}

describe("PositionTpSlModal live data", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		window.localStorage.clear();
		installExclusiveLockManager();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		testState.connected = true;
		testState.walletAddress = "0x1111111111111111111111111111111111111111";
		testState.clientKey = "0x1111111111111111111111111111111111111111";
		testState.env = "Mainnet";
		testState.markPx = "28595.5";
		testState.marketMarkPx = "28000";
		testState.markStatus = "active";
		testState.markStale = false;
		testState.markReceivedAt = Date.now();
		testState.openOrdersStatus = "active";
		testState.openOrdersStale = false;
		testState.hasOpenOrdersSnapshot = true;
		testState.marketLoading = false;
		testState.marketError = null;
		testState.marketAssetId = positionRef.assetId;
		testState.marketSzDecimals = positionRef.szDecimals;
		testState.marketDex = positionRef.dex;
		testState.positionLoading = false;
		testState.positionError = false;
		testState.positionStale = false;
		testState.position = {
			dex: "xyz",
			coin: positionRef.coin,
			szi: "-0.301",
			entryPx: "28600.68",
			positionValue: "8608.80468",
			unrealizedPnl: "-1.11",
			returnOnEquity: "-0.004",
			liquidationPx: null,
			marginUsed: "430.44",
			maxLeverage: 20,
			leverage: { type: "cross", value: 20 },
			cumFunding: { allTime: "0", sinceChange: "0", sinceOpen: "0" },
		} as Position;
		testState.orders = [];
		testState.isMobile = false;
		testState.pendingMethods.clear();
		testState.subscriptions = [];
		testState.getPosition.mockReset();
		testState.placeOrder.mockReset().mockImplementation(async (params: { orders?: unknown[] }) => ({
			status: "ok",
			response: {
				type: "order",
				data: { statuses: (params.orders ?? []).map((_, index) => ({ resting: { oid: 100 + index } })) },
			},
		}));
		testState.cancelOrders.mockReset().mockImplementation(async (params: { cancels?: unknown[] }) => ({
			status: "ok",
			response: { type: "cancel", data: { statuses: (params.cancels ?? []).map(() => "success") } },
		}));
		testState.frontendOpenOrders.mockReset().mockImplementation(async () => testState.orders);
		testState.clearinghouseState.mockReset().mockImplementation(async () => ({
			assetPositions: testState.position ? [{ type: "oneWay", position: testState.position }] : [],
		}));
		testState.trackedOrderOptions = [];
		testState.executionGuards = {};
		testState.amountSliderProps = null;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
		vi.clearAllMocks();
	});

	function renderModal(onOpenChange = vi.fn()) {
		act(() => {
			root.render(createElement(PositionTpSlModal, { open: true, onOpenChange, position: { ...positionRef } }));
		});
		return onOpenChange;
	}

	it("uses the terminal breakpoint for a touch-safe mobile bottom sheet while retaining the desktop modal", () => {
		testState.isMobile = true;
		renderModal();

		let dialog = container.querySelector<HTMLElement>('[data-testid="position-risk-dialog"]');
		expect(dialog?.dataset.presentation).toBe("drawer");
		expect(dialog?.dataset.dismissible).toBe("true");
		expect(dialog?.dataset.showHandle).toBe("true");
		expect(getButton(container, "Cancel").className).toContain("max-[1000px]:min-h-11");
		expect(getButton(container, "Confirm").className).toContain("max-[1000px]:min-h-11");

		testState.isMobile = false;
		act(() => {
			root.render(createElement(PositionTpSlModal, { open: true, onOpenChange: vi.fn(), position: positionRef }));
		});
		dialog = container.querySelector<HTMLElement>('[data-testid="position-risk-dialog"]');
		expect(dialog?.dataset.presentation).toBe("modal");
		expect(dialog?.dataset.showHandle).toBe("false");
	});

	it("blocks adaptive dismissal while a TP/SL mutation is pending", () => {
		testState.isMobile = true;
		testState.pendingMethods.add("cancel");
		const onOpenChange = renderModal();

		const dialog = container.querySelector<HTMLElement>('[data-testid="position-risk-dialog"]');
		expect(dialog?.dataset.dismissible).toBe("false");
		expect(dialog?.dataset.showHandle).toBe("false");
		act(() => container.querySelector<HTMLButtonElement>('[aria-label="Request adaptive dismiss"]')?.click());
		expect(onOpenChange).not.toHaveBeenCalled();
		expect(getButton(container, "Cancel").disabled).toBe(true);
	});

	it("queries the exact HIP-3 dex and accepts a negative short size as an active position", () => {
		renderModal();

		expect(testState.getPosition).toHaveBeenCalledWith(positionRef.coin, positionRef.dex);
		expect(testState.subscriptions).toContainEqual({ method: "activeAssetCtx", params: { coin: positionRef.coin } });
		expect(container.textContent).toContain("Short position");
		expect(container.textContent).toContain("28,595.5");
		expect(container.textContent).not.toContain("No active positions.");
	});

	it("passes exchange strings to the precision-preserving TP/SL path", () => {
		if (testState.position) {
			testState.position = {
				...testState.position,
				entryPx: "9007199254740993.123",
				szi: "-0.301000000000000001",
			};
		}
		renderModal();

		expect(container.querySelector('[data-testid="reference-price"]')?.textContent).toBe("9007199254740993.123");
		expect(container.querySelector('[data-testid="position-size"]')?.textContent).toBe("0.301000000000000001");
		expect(container.querySelector('[data-testid="precision-mode"]')?.textContent).toBe("true");
	});

	it("links the editable ROE target back to the trigger price and can switch to quote PnL", () => {
		renderModal();

		act(() => setInputValue(getInput(container, "Take profit return"), "25"));
		expect(getInput(container, "Take Profit").value).toBe("28243");

		const unitToggle = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent === "%",
		);
		act(() => unitToggle?.click());
		expect(getInput(container, "Take profit return").value).toBe("107.61");
	});

	it("keeps a quote-PnL draft as the source of truth when the configured size changes", () => {
		renderModal();

		act(() => setInputValue(getInput(container, "Take profit return"), "25"));
		const unitToggle = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent === "%",
		);
		act(() => unitToggle?.click());
		act(() => setInputValue(getInput(container, "Take profit return"), "100"));
		act(() => getInput(container, "Configure amount").click());
		act(() => setInputValue(getInput(container, "Configured TP/SL amount"), "0.1"));

		expect(getInput(container, "Take profit return").value).toBe("100");
		expect(getInput(container, "Take Profit").value).toBe("27601");
		expect(container.querySelector('[data-testid="position-size"]')?.textContent).toBe("0.1");
		expect(getButton(container, "Confirm").disabled).toBe(false);
	});

	it.each([false, true])("shows percentage sizing only for a configured amount on mobile=%s", (isMobile) => {
		testState.isMobile = isMobile;
		renderModal();
		expect(container.querySelector('input[type="range"]')).toBeNull();

		act(() => getInput(container, "Configure amount").click());
		expect(container.querySelectorAll('input[type="range"]')).toHaveLength(1);
		expect(getInput(container, "Size (%)").value).toBe("100");

		act(() => setInputValue(getInput(container, "Size (%)"), "63"));
		expect(getInput(container, "Configured TP/SL amount").value).toBe("0.189");
		expect(testState.placeOrder).not.toHaveBeenCalled();
		expect(testState.cancelOrders).not.toHaveBeenCalled();

		act(() => getInput(container, "Configure amount").click());
		expect(container.querySelector('input[type="range"]')).toBeNull();
		expect(container.querySelector('input[aria-label="Size (%)"]')).toBeNull();
	});

	it.each([
		[false, "0"],
		[true, "0.301"],
	])("submits the distinct configured=%s protection intent", async (configured, expectedSize) => {
		renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		if (configured) {
			act(() => getInput(container, "Configure amount").click());
			act(() => setInputValue(getInput(container, "Size (%)"), "100"));
		}

		expect(testState.placeOrder).not.toHaveBeenCalled();
		await act(async () => getButton(container, "Confirm").click());

		expect(testState.placeOrder).toHaveBeenCalledExactlyOnceWith({
			orders: [expect.objectContaining({ s: expectedSize, r: true })],
			grouping: "positionTpsl",
		});
	});

	it.each([
		{ percent: null, executionMode: "market", expectedSize: "0", expectedPrice: "30250" },
		{ percent: "63", executionMode: "market", expectedSize: "0.189", expectedPrice: "30250" },
		{ percent: "100", executionMode: "market", expectedSize: "0.301", expectedPrice: "30250" },
		{ percent: null, executionMode: "limit", expectedSize: "0", expectedPrice: "27600" },
		{ percent: "63", executionMode: "limit", expectedSize: "0.189", expectedPrice: "27600" },
		{ percent: "100", executionMode: "limit", expectedSize: "0.301", expectedPrice: "27600" },
	])("serializes configured $percent% $executionMode protection through the real SDK", async (sample) => {
		const exchange = createExchangeHarness(false);
		testState.placeOrder.mockImplementation((params) => exchange.client.order(params));
		renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		if (sample.percent !== null) {
			act(() => getInput(container, "Configure amount").click());
			act(() => setInputValue(getInput(container, "Size (%)"), sample.percent ?? ""));
		}
		if (sample.executionMode === "limit") {
			act(() => getInput(container, "Limit execution").click());
			act(() => setInputValue(getInput(container, "Take profit limit price"), "27600"));
		}
		expect(exchange.signTypedData).not.toHaveBeenCalled();
		expect(exchange.request).not.toHaveBeenCalled();

		await act(async () => getButton(container, "Confirm").click());

		expect(exchange.request).toHaveBeenCalledOnce();
		expect(exchange.getAction()).toEqual({
			type: "order",
			grouping: "positionTpsl",
			orders: [
				{
					a: positionRef.assetId,
					b: true,
					p: sample.expectedPrice,
					s: sample.expectedSize,
					r: true,
					t: { trigger: { isMarket: sample.executionMode === "market", triggerPx: "27500", tpsl: "tp" } },
				},
			],
		});
		expect(testState.cancelOrders).not.toHaveBeenCalled();
	});

	it("serializes a fixed-size replacement as cancel then order through the real SDK", async () => {
		const exchange = createExchangeHarness(false);
		testState.orders = [openOrder({ triggerPx: "27500", limitPx: "30250" })];
		testState.placeOrder.mockImplementation((params) => exchange.client.order(params));
		testState.cancelOrders.mockImplementation((params) => exchange.client.cancel(params));
		renderModal();
		act(() => getInput(container, "Configure amount").click());
		act(() => setInputValue(getInput(container, "Size (%)"), "63"));

		await act(async () => getButton(container, "Confirm").click());

		expect(exchange.request).toHaveBeenCalledTimes(2);
		expect(exchange.getAction(0)).toEqual({ type: "cancel", cancels: [{ a: positionRef.assetId, o: 7 }] });
		expect(exchange.getAction(1)).toMatchObject({
			type: "order",
			grouping: "positionTpsl",
			orders: [{ a: positionRef.assetId, b: true, s: "0.189", r: true }],
		});
	});

	it("blocks zero percent without replacing or deleting existing protection", () => {
		testState.orders = [openOrder({ triggerPx: "27500" })];
		renderModal();
		act(() => getInput(container, "Configure amount").click());
		act(() => setInputValue(getInput(container, "Size (%)"), "0"));
		act(() => getButton(container, "Confirm").click());

		expect(getInput(container, "Configured TP/SL amount").value).toBe("0.000");
		expect(getButton(container, "Confirm").disabled).toBe(true);
		expect(container.textContent).toContain("Amount must be greater than zero");
		expect(testState.placeOrder).not.toHaveBeenCalled();
		expect(testState.cancelOrders).not.toHaveBeenCalled();
	});

	it("preserves the exact quantity text and quote-PnL draft when a preview is canceled", () => {
		renderModal();
		act(() => setInputValue(getInput(container, "Take profit return"), "25"));
		act(() => getButton(container, "%").click());
		act(() => setInputValue(getInput(container, "Take profit return"), "100"));
		act(() => getInput(container, "Configure amount").click());
		act(() => setInputValue(getInput(container, "Configured TP/SL amount"), ".100"));
		const slider = testState.amountSliderProps;
		if (!slider) throw new Error("Expected the configured amount slider");

		act(() => slider.onPercentInteractionStart?.(slider.value));
		act(() => slider.onPercentChange(33));
		expect(getInput(container, "Configured TP/SL amount").value).toBe("0.099");
		expect(getInput(container, "Take profit return").value).toBe("100");
		expect(getInput(container, "Take Profit").value).toBe("27591");
		act(() => testState.amountSliderProps?.onPercentCancel(slider.value));
		act(() => testState.amountSliderProps?.onPercentInteractionEnd?.());

		expect(getInput(container, "Configured TP/SL amount").value).toBe(".100");
		expect(getInput(container, "Take profit return").value).toBe("100");
		expect(getInput(container, "Take Profit").value).toBe("27601");
		expect(testState.placeOrder).not.toHaveBeenCalled();
		expect(testState.cancelOrders).not.toHaveBeenCalled();
	});

	it("ignores confirmation until a quantity gesture ends without greying the button", async () => {
		renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		act(() => getInput(container, "Configure amount").click());
		const slider = testState.amountSliderProps;
		if (!slider) throw new Error("Expected the configured amount slider");
		const confirm = getButton(container, "Confirm");
		expect(testState.isActivationLocked?.()).toBe(false);
		await act(async () => {
			slider.onPercentInteractionStart?.(slider.value);
			confirm.click();
		});

		expect(confirm.disabled).toBe(false);
		expect(testState.isActivationLocked?.()).toBe(true);
		expect(testState.placeOrder).not.toHaveBeenCalled();
		act(() => slider.onPercentChange(50));
		await act(async () => confirm.click());
		expect(confirm.disabled).toBe(false);
		expect(testState.placeOrder).not.toHaveBeenCalled();
		expect(testState.cancelOrders).not.toHaveBeenCalled();

		act(() => testState.amountSliderProps?.onPercentCommit(25, { reason: "drag", event: new Event("pointerup") }));
		act(() => testState.amountSliderProps?.onPercentInteractionEnd?.());
		expect(confirm.disabled).toBe(false);
		expect(testState.isActivationLocked?.()).toBe(false);
		expect(getInput(container, "Configured TP/SL amount").value).toBe("0.075");
		await act(async () => confirm.click());
		expect(testState.placeOrder).toHaveBeenCalledExactlyOnceWith({
			orders: [expect.objectContaining({ s: "0.075" })],
			grouping: "positionTpsl",
		});
	});

	it("releases the confirmation lock when a quantity gesture ends without moving", () => {
		renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		act(() => getInput(container, "Configure amount").click());
		const slider = testState.amountSliderProps;
		if (!slider) throw new Error("Expected the configured amount slider");
		act(() => slider.onPercentInteractionStart?.(slider.value));
		expect(getButton(container, "Confirm").disabled).toBe(false);
		expect(testState.isActivationLocked?.()).toBe(true);
		act(() => slider.onPercentInteractionEnd?.());

		expect(getButton(container, "Confirm").disabled).toBe(false);
		expect(testState.isActivationLocked?.()).toBe(false);
		expect(getInput(container, "Configured TP/SL amount").value).toBe("0.301");
		expect(testState.placeOrder).not.toHaveBeenCalled();
	});

	it.each(["position size", "stale snapshot", "submitting"])(
		"ignores pending percentage callbacks after %s disables editing",
		(change) => {
			renderModal();
			act(() => getInput(container, "Configure amount").click());
			act(() => setInputValue(getInput(container, "Configured TP/SL amount"), ".100"));
			const slider = testState.amountSliderProps;
			if (!slider) throw new Error("Expected the configured amount slider");
			act(() => slider.onPercentInteractionStart?.(slider.value));
			act(() => slider.onPercentChange(33));
			if (change === "position size" && testState.position) testState.position = { ...testState.position, szi: "-0.3" };
			if (change === "stale snapshot") testState.positionStale = true;
			if (change === "submitting") testState.pendingMethods.add("order");
			renderModal();
			act(() => {
				slider.onPercentChange(100);
				slider.onPercentCommit(100, { reason: "drag", event: new Event("pointerup") });
				slider.onPercentCancel(slider.value);
			});

			expect(testState.amountSliderProps?.disabled).toBe(true);
			expect(getInput(container, "Configured TP/SL amount").value).toBe("0.099");
			expect(getButton(container, change === "submitting" ? "Submitting..." : "Confirm").disabled).toBe(true);
			expect(testState.placeOrder).not.toHaveBeenCalled();
			expect(testState.cancelOrders).not.toHaveBeenCalled();
		},
	);

	it("ignores a pending amount commit after a close request before the parent unmounts", () => {
		const onOpenChange = renderModal();
		act(() => getInput(container, "Configure amount").click());
		const slider = testState.amountSliderProps;
		if (!slider) throw new Error("Expected the configured amount slider");
		act(() => slider.onPercentInteractionStart?.(slider.value));
		act(() => getButton(container, "Cancel").click());
		act(() => slider.onPercentCommit(25, { reason: "drag", event: new Event("pointerup") }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(getInput(container, "Configured TP/SL amount").value).toBe("0.301");
		expect(testState.placeOrder).not.toHaveBeenCalled();
	});

	it.each(["0", "."])("blocks a stale trigger while the linked return draft is invalid: %s", (invalidValue) => {
		renderModal();

		act(() => setInputValue(getInput(container, "Take profit return"), "25"));
		expect(getButton(container, "Confirm").disabled).toBe(false);
		act(() => setInputValue(getInput(container, "Take profit return"), invalidValue));

		expect(getInput(container, "Take profit return").value).toBe(invalidValue);
		expect(getButton(container, "Confirm").disabled).toBe(true);
		expect(container.textContent).toContain("Enter a valid TP/SL order configuration.");
	});

	it("keeps an impossible quote-PnL draft invalid after blur instead of submitting the previous trigger", () => {
		renderModal();

		act(() => setInputValue(getInput(container, "Take profit return"), "25"));
		const unitToggle = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent === "%",
		);
		act(() => unitToggle?.click());
		const returnInput = getInput(container, "Take profit return");
		act(() => setInputValue(returnInput, "999999"));
		act(() => returnInput.blur());

		expect(returnInput.value).toBe("999999");
		expect(getButton(container, "Confirm").disabled).toBe(true);
		expect(container.textContent).toContain("Enter a valid TP/SL order configuration.");
	});

	it("updates live mark and position values without replacing the user's TP draft", () => {
		renderModal();
		const tpInput = getInput(container, "Take Profit");

		act(() => {
			setInputValue(tpInput, "27500");
		});
		expect(getInput(container, "Take Profit").value).toBe("27500");

		testState.markPx = "28001.25";
		if (testState.position) testState.position = { ...testState.position, unrealizedPnl: "10.5" };
		act(() => {
			root.render(createElement(PositionTpSlModal, { open: true, onOpenChange: vi.fn(), position: positionRef }));
		});

		expect(container.textContent).toContain("28,001.25");
		expect(container.textContent).toContain("+$10.50");
		expect(getInput(container, "Take Profit").value).toBe("27500");
	});

	it("blocks submission when the live TP/SL order changed after opening", () => {
		testState.orders = [openOrder()];
		renderModal();
		expect(getInput(container, "Take Profit").value).toBe("30000.000");

		testState.orders = [openOrder({ oid: 8, triggerPx: "29500" })];
		act(() => {
			root.render(createElement(PositionTpSlModal, { open: true, onOpenChange: vi.fn(), position: positionRef }));
		});

		expect(container.textContent).toContain("Trading data changed while this dialog was open.");
		expect(getButton(container, "Confirm").disabled).toBe(true);
	});

	it("fails closed when existing TP/SL orders use the wrong close side for the live position", () => {
		testState.orders = [openOrder({ side: "A" })];
		renderModal();

		expect(container.textContent).toContain("unsupported mixed or duplicate configuration");
		expect(getButton(container, "Confirm").disabled).toBe(true);
	});

	it.each([".", "0", "-1", "abc"])(
		"does not turn an invalid non-empty trigger draft into a protective-order cancellation: %s",
		(invalidValue) => {
			testState.orders = [openOrder()];
			renderModal();

			act(() => setInputValue(getInput(container, "Take Profit"), invalidValue));

			expect(getButton(container, "Confirm").disabled).toBe(true);
			expect(container.querySelector('[data-testid="tp-error"]')?.textContent).toBe(
				"Enter a valid TP/SL order configuration.",
			);
			expect(testState.cancelOrders).not.toHaveBeenCalled();
		},
	);

	it("rejects a short-position stop at or beyond the live liquidation price", () => {
		if (testState.position) testState.position = { ...testState.position, liquidationPx: "30000" };
		renderModal();

		act(() => setInputValue(getInput(container, "Stop Loss"), "31000"));

		expect(getButton(container, "Confirm").disabled).toBe(true);
		expect(container.querySelector('[data-testid="sl-error"]')?.textContent).toBe(
			"Stop trigger must be below liquidation price",
		);
	});

	it("validates the exchange-normalized trigger instead of the unrounded draft", () => {
		testState.markPx = "100";
		testState.marketMarkPx = "100";
		if (testState.position) testState.position = { ...testState.position, entryPx: "110" };
		renderModal();

		act(() => setInputValue(getInput(container, "Take Profit"), "99.9995"));

		expect(getButton(container, "Confirm").disabled).toBe(true);
		expect(container.querySelector('[data-testid="tp-error"]')?.textContent).toBe(
			"Take profit trigger must be below mark",
		);
	});

	it("replaces an existing leg with cancel-then-place using the fixed partial-size trigger-limit order", async () => {
		testState.orders = [openOrder()];
		renderModal();

		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		act(() => getInput(container, "Configure amount").click());
		act(() => setInputValue(getInput(container, "Configured TP/SL amount"), "0.1"));
		act(() => getInput(container, "Limit execution").click());
		act(() => setInputValue(getInput(container, "Take profit limit price"), "27600"));

		const confirm = getButton(container, "Confirm");
		expect(confirm.disabled).toBe(false);
		await act(async () => confirm.click());

		expect(testState.frontendOpenOrders, container.textContent ?? undefined).toHaveBeenCalledWith({
			user: positionRef.owner,
			dex: positionRef.dex,
		});
		expect(testState.clearinghouseState).toHaveBeenCalledWith({ user: positionRef.owner, dex: positionRef.dex });
		expect(testState.cancelOrders).toHaveBeenCalledWith({
			cancels: [{ a: positionRef.assetId, o: 7 }],
		});
		expect(testState.placeOrder).toHaveBeenCalledWith({
			grouping: "positionTpsl",
			orders: [
				{
					a: positionRef.assetId,
					b: true,
					p: "27600",
					r: true,
					s: "0.1",
					t: { trigger: { isMarket: false, tpsl: "tp", triggerPx: "27500" } },
				},
			],
		});
		expect(testState.cancelOrders.mock.invocationCallOrder[0]).toBeLessThan(
			testState.placeOrder.mock.invocationCallOrder[0],
		);
	});

	it("fails closed when the lock-time REST snapshot reports a stale TP/SL oid", async () => {
		testState.orders = [openOrder()];
		testState.frontendOpenOrders.mockResolvedValueOnce([openOrder({ oid: 8 })]);
		renderModal();

		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		await act(async () => getButton(container, "Confirm").click());

		expect(testState.cancelOrders).not.toHaveBeenCalled();
		expect(testState.placeOrder).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Trading data changed while this dialog was open.");
		expect(getButton(container, "Confirm").disabled).toBe(true);
	});

	it("fails closed when the lock-time REST position size differs from the confirmed dialog size", async () => {
		testState.orders = [openOrder()];
		testState.clearinghouseState.mockResolvedValueOnce({
			assetPositions: [
				{
					type: "oneWay",
					position: { ...testState.position, szi: "-0.2" },
				},
			],
		});
		renderModal();

		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		await act(async () => getButton(container, "Confirm").click());

		expect(testState.cancelOrders).not.toHaveBeenCalled();
		expect(testState.placeOrder).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Trading data changed while this dialog was open.");
		expect(getButton(container, "Confirm").disabled).toBe(true);
	});

	it("fails closed when the live position size changes while the dialog remains open", () => {
		renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		if (testState.position) testState.position = { ...testState.position, szi: "-0.2" };

		act(() => {
			root.render(createElement(PositionTpSlModal, { open: true, onOpenChange: vi.fn(), position: positionRef }));
		});

		expect(container.textContent).toContain("Trading data changed while this dialog was open.");
		expect(getButton(container, "Confirm").disabled).toBe(true);
		expect(testState.frontendOpenOrders).not.toHaveBeenCalled();
		expect(testState.cancelOrders).not.toHaveBeenCalled();
		expect(testState.placeOrder).not.toHaveBeenCalled();
	});

	it("rejects a competing tab before reading or mutating the same asset", async () => {
		testState.orders = [openOrder()];
		renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		const lockName = getOrderAssetLockName({ env: positionRef.env, owner: positionRef.owner }, positionRef.assetId);

		await window.navigator.locks.request(lockName, { mode: "exclusive" }, async () => {
			await act(async () => getButton(container, "Confirm").click());
		});

		expect(testState.frontendOpenOrders).not.toHaveBeenCalled();
		expect(testState.cancelOrders).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Another order for this market is still being confirmed.");
	});

	it("does not place a replacement and blocks retries when the cancel response is lost", async () => {
		testState.orders = [openOrder()];
		testState.cancelOrders.mockRejectedValueOnce(new HttpRequestError({ detail: "Request timed out" }));
		renderModal();

		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		await act(async () => getButton(container, "Confirm").click());

		expect(testState.cancelOrders).toHaveBeenCalledTimes(1);
		expect(testState.placeOrder).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Confirming exchange status; do not retry.");
		expect(getButton(container, "Confirm").disabled).toBe(true);
		await act(async () => getButton(container, "Confirm").click());
		expect(testState.cancelOrders).toHaveBeenCalledTimes(1);
		expect(testState.placeOrder).not.toHaveBeenCalled();

		act(() => {
			root.render(
				createElement(PositionTpSlModal, {
					open: false,
					onOpenChange: vi.fn(),
					position: positionRef,
				}),
			);
		});
		act(() => {
			root.render(
				createElement(PositionTpSlModal, {
					open: true,
					onOpenChange: vi.fn(),
					position: positionRef,
				}),
			);
		});
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		await act(async () => getButton(container, "Confirm").click());

		expect(testState.cancelOrders).toHaveBeenCalledTimes(1);
		expect(testState.placeOrder).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Another order for this market is still being confirmed.");
	});

	it("does not place replacements after a partial cancel response", async () => {
		testState.orders = [
			openOrder(),
			openOrder({
				oid: 8,
				orderType: "Stop Market",
				triggerCondition: "Price above 31000",
				triggerPx: "31000",
			}),
		];
		testState.cancelOrders.mockRejectedValueOnce(
			new ApiRequestError({
				status: "ok",
				response: { type: "cancel", data: { statuses: ["success", { error: "second leg rejected" }] } },
			}),
		);
		renderModal();

		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		act(() => setInputValue(getInput(container, "Stop Loss"), "32000"));
		await act(async () => getButton(container, "Confirm").click());

		expect(testState.cancelOrders).toHaveBeenCalledTimes(1);
		expect(testState.placeOrder).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Confirming exchange status; do not retry.");
		expect(getButton(container, "Confirm").disabled).toBe(true);
	});

	it("treats a single cancel error as a definitive whole-batch rejection and permits a safe retry", async () => {
		testState.orders = [
			openOrder(),
			openOrder({
				oid: 8,
				orderType: "Stop Market",
				triggerCondition: "Price above 31000",
				triggerPx: "31000",
			}),
		];
		testState.cancelOrders.mockRejectedValueOnce(
			new ApiRequestError(
				{
					status: "ok",
					response: { type: "cancel", data: { statuses: [{ error: "batch rejected" }] } },
				},
				"cancel 0: batch rejected",
			),
		);
		renderModal();

		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		act(() => setInputValue(getInput(container, "Stop Loss"), "32000"));
		await act(async () => getButton(container, "Confirm").click());

		expect(testState.cancelOrders).toHaveBeenCalledTimes(1);
		expect(testState.placeOrder).not.toHaveBeenCalled();
		expect(container.textContent).toContain("batch rejected");
		expect(getButton(container, "Confirm").disabled).toBe(false);

		await act(async () => getButton(container, "Confirm").click());
		await vi.waitFor(() => expect(testState.placeOrder).toHaveBeenCalledTimes(1));
		expect(testState.cancelOrders).toHaveBeenCalledTimes(2);
	});

	it.each([{}, { status: "ok", response: { type: "cancel", data: { statuses: ["unexpected"] } } }])(
		"does not place a replacement after a malformed cancel response",
		async (cancelResponse) => {
			testState.orders = [openOrder()];
			testState.cancelOrders.mockResolvedValueOnce(cancelResponse);
			renderModal();

			act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
			await act(async () => getButton(container, "Confirm").click());

			expect(testState.cancelOrders).toHaveBeenCalledTimes(1);
			expect(testState.placeOrder).not.toHaveBeenCalled();
			expect(container.textContent).toContain("Confirming exchange status; do not retry.");
			expect(getButton(container, "Confirm").disabled).toBe(true);
		},
	);

	it("passes the active workflow lease into tracked placement", async () => {
		renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));

		await act(async () => getButton(container, "Confirm").click());

		expect(testState.placeOrder).toHaveBeenCalledTimes(1);
		expect(testState.trackedOrderOptions).toHaveLength(1);
		expect(testState.trackedOrderOptions[0]).toEqual(
			expect.objectContaining({
				assetLockLease: expect.objectContaining({ assetIds: [positionRef.assetId] }),
				exclusiveAssetLock: true,
			}),
		);
	});

	it("blocks a configured TP/SL amount larger than the live position", () => {
		renderModal();

		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		act(() => getInput(container, "Configure amount").click());
		act(() => setInputValue(getInput(container, "Configured TP/SL amount"), "0.302"));

		expect(getButton(container, "Confirm").disabled).toBe(true);
		expect(container.textContent).toContain("no more than the current position");
		expect(testState.placeOrder).not.toHaveBeenCalled();
	});

	it.each(["owner", "environment"] as const)("binds the open TP/SL session to its original %s", (identityPart) => {
		renderModal();
		const executionGuard = testState.executionGuards.order;
		expect(executionGuard).toBeTypeOf("function");

		if (identityPart === "owner") {
			testState.clientKey = "0x2222222222222222222222222222222222222222";
			testState.walletAddress = "0x2222222222222222222222222222222222222222";
		} else {
			testState.env = "Testnet";
		}
		act(() => {
			root.render(createElement(PositionTpSlModal, { open: true, onOpenChange: vi.fn(), position: positionRef }));
		});

		expect(container.textContent).toContain("Trading data changed while this dialog was open.");
		expect(container.querySelector("button[disabled]")?.textContent).not.toBe("Confirm");
		expect(() =>
			executionGuard?.({
				grouping: "positionTpsl",
				orders: [{ a: positionRef.assetId }],
			}),
		).toThrow("Trading data changed while this dialog was open.");
	});

	it.each(["position", "open orders"] as const)(
		"fails closed when the %s snapshot becomes stale before TP/SL execution",
		(snapshot) => {
			renderModal();
			if (snapshot === "position") {
				testState.positionStale = true;
			} else {
				testState.openOrdersStatus = "subscribing";
			}
			act(() => {
				root.render(createElement(PositionTpSlModal, { open: true, onOpenChange: vi.fn(), position: positionRef }));
			});

			expect(getButton(container, "Confirm").disabled).toBe(true);
			expect(container.textContent).not.toContain(
				snapshot === "position" ? "Live position data is stale." : "Loading...",
			);
			expect(() =>
				testState.executionGuards.order?.({
					grouping: "positionTpsl",
					orders: [{ a: positionRef.assetId }],
				}),
			).toThrow("Trading data changed while this dialog was open.");
		},
	);

	it.each(["mark", "open orders"] as const)("fails closed when the active %s subscription is stale", (snapshot) => {
		renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		if (snapshot === "mark") testState.markStale = true;
		else testState.openOrdersStale = true;
		act(() => {
			root.render(createElement(PositionTpSlModal, { open: true, onOpenChange: vi.fn(), position: positionRef }));
		});

		expect(getButton(container, "Confirm").disabled).toBe(true);
		expect(() =>
			testState.executionGuards.order?.({
				grouping: "positionTpsl",
				orders: [
					{
						a: positionRef.assetId,
						b: true,
						p: "30250",
						r: true,
						s: "0",
						t: { trigger: { isMarket: true, tpsl: "tp", triggerPx: "27500" } },
					},
				],
			}),
		).toThrow("Trading data changed while this dialog was open.");
	});

	it("fails closed when the exact mark receipt expires before the watchdog marks it stale", () => {
		testState.markReceivedAt = Date.now() - 10_001;
		renderModal();

		expect(getButton(container, "Confirm").disabled).toBe(true);
		expect(() =>
			testState.executionGuards.order?.({
				grouping: "positionTpsl",
				orders: [
					{
						a: positionRef.assetId,
						b: true,
						p: "30250",
						r: true,
						s: "0",
						t: { trigger: { isMarket: true, tpsl: "tp", triggerPx: "27500" } },
					},
				],
			}),
		).toThrow("Trading data changed while this dialog was open.");
	});

	it.each([
		["asset", { marketAssetId: positionRef.assetId + 1 }],
		["size precision", { marketSzDecimals: positionRef.szDecimals + 1 }],
		["dex", { marketDex: "other" }],
	] as const)("fails closed when live market %s no longer matches the captured position", (_label, change) => {
		renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		Object.assign(testState, change);
		act(() => {
			root.render(createElement(PositionTpSlModal, { open: true, onOpenChange: vi.fn(), position: positionRef }));
		});

		expect(getButton(container, "Confirm").disabled).toBe(true);
		expect(container.textContent).toContain("Trading data changed while this dialog was open.");
	});

	it("revalidates a partial order size against the live position at the SDK boundary", () => {
		renderModal();
		const executionGuard = testState.executionGuards.order;
		if (testState.position) testState.position = { ...testState.position, szi: "-0.05" };
		act(() => {
			root.render(createElement(PositionTpSlModal, { open: true, onOpenChange: vi.fn(), position: positionRef }));
		});

		expect(() =>
			executionGuard?.({
				grouping: "positionTpsl",
				orders: [
					{
						a: positionRef.assetId,
						b: true,
						p: "27600",
						r: true,
						s: "0.1",
						t: { trigger: { isMarket: false, tpsl: "tp", triggerPx: "27500" } },
					},
				],
			}),
		).toThrow("Trading data changed while this dialog was open.");
	});

	it("revalidates the normalized trigger against the latest mark at the SDK boundary", () => {
		testState.markPx = "100";
		testState.marketMarkPx = "100";
		renderModal();
		const executionGuard = testState.executionGuards.order;

		testState.markPx = "85";
		act(() => {
			root.render(createElement(PositionTpSlModal, { open: true, onOpenChange: vi.fn(), position: positionRef }));
		});

		expect(() =>
			executionGuard?.({
				grouping: "positionTpsl",
				orders: [
					{
						a: positionRef.assetId,
						b: true,
						p: "99",
						r: true,
						s: "0",
						t: { trigger: { isMarket: true, tpsl: "tp", triggerPx: "90" } },
					},
				],
			}),
		).toThrow("Trading data changed while this dialog was open.");
	});

	it("allows a cancel-only update when no mark price is available", async () => {
		testState.markPx = undefined;
		testState.marketMarkPx = undefined;
		testState.orders = [openOrder()];
		renderModal();

		const tpInput = getInput(container, "Take Profit");
		act(() => {
			setInputValue(tpInput, "");
		});

		const confirm = getButton(container, "Confirm");
		expect(confirm.disabled).toBe(false);
		await act(async () => confirm.click());
		expect(testState.cancelOrders).toHaveBeenCalledWith({ cancels: [{ a: positionRef.assetId, o: 7 }] });
		expect(testState.placeOrder).not.toHaveBeenCalled();
	});

	it("continues a cancel-then-create workflow only after strict cancel success", async () => {
		testState.orders = [
			openOrder({
				oid: 8,
				orderType: "Stop Market",
				triggerCondition: "Price above 31000",
				triggerPx: "31000",
			}),
		];
		const onOpenChange = renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		act(() => setInputValue(getInput(container, "Stop Loss"), ""));

		const confirm = getButton(container, "Confirm");
		expect(confirm.disabled, container.textContent ?? undefined).toBe(false);
		await act(async () => confirm.click());

		expect(testState.cancelOrders).toHaveBeenCalledWith({ cancels: [{ a: positionRef.assetId, o: 8 }] });
		expect(testState.placeOrder).toHaveBeenCalledTimes(1);
		expect(testState.cancelOrders.mock.invocationCallOrder[0]).toBeLessThan(
			testState.placeOrder.mock.invocationCallOrder[0],
		);
		await vi.waitFor(() => expect(onOpenChange, container.textContent ?? undefined).toHaveBeenCalledWith(false));
	});

	it("blocks retries when replacement placement fails after a confirmed cancel", async () => {
		testState.orders = [
			openOrder({
				oid: 8,
				orderType: "Stop Market",
				triggerCondition: "Price above 31000",
				triggerPx: "31000",
			}),
		];
		testState.placeOrder.mockRejectedValueOnce(new Error("place failed"));
		const onOpenChange = renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		act(() => setInputValue(getInput(container, "Stop Loss"), ""));

		const confirm = getButton(container, "Confirm");
		expect(confirm.disabled, container.textContent ?? undefined).toBe(false);
		await act(async () => confirm.click());

		expect(testState.cancelOrders).toHaveBeenCalledTimes(1);
		expect(testState.placeOrder).toHaveBeenCalledTimes(1);
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
		expect(container.textContent).toContain("Confirming exchange status; do not retry.");
		expect(getButton(container, "Confirm").disabled).toBe(true);
		await act(async () => getButton(container, "Confirm").click());
		expect(testState.cancelOrders).toHaveBeenCalledTimes(1);
		expect(testState.placeOrder).toHaveBeenCalledTimes(1);
	});

	it("replaces an existing position TP without the unsafe batch-modify flag", async () => {
		testState.orders = [openOrder()];
		renderModal();

		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		await act(async () => getButton(container, "Confirm").click());

		expect(testState.cancelOrders).toHaveBeenCalledWith({
			cancels: [{ a: positionRef.assetId, o: 7 }],
		});
		expect(testState.placeOrder).toHaveBeenCalledWith({
			grouping: "positionTpsl",
			orders: [
				{
					a: positionRef.assetId,
					b: true,
					p: "30250",
					r: true,
					s: "0",
					t: { trigger: { isMarket: true, tpsl: "tp", triggerPx: "27500" } },
				},
			],
		});
		expect(testState.cancelOrders.mock.invocationCallOrder[0]).toBeLessThan(
			testState.placeOrder.mock.invocationCallOrder[0],
		);
	});

	it("locks the whole workflow synchronously against duplicate confirmation and dismissal", async () => {
		testState.orders = [openOrder()];
		let resolveCancel: ((value: unknown) => void) | undefined;
		testState.cancelOrders.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveCancel = resolve;
				}),
		);
		const onOpenChange = renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		const confirm = getButton(container, "Confirm");

		act(() => {
			confirm.click();
			confirm.click();
			container.querySelector<HTMLButtonElement>('[aria-label="Request adaptive dismiss"]')?.click();
		});

		await vi.waitFor(() => expect(testState.cancelOrders).toHaveBeenCalledTimes(1));
		expect(onOpenChange).not.toHaveBeenCalled();
		expect(getInput(container, "Take Profit").disabled).toBe(true);
		await act(async () => {
			resolveCancel?.({ status: "ok", response: { type: "cancel", data: { statuses: ["success"] } } });
			await Promise.resolve();
		});
		expect(testState.placeOrder).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(onOpenChange, container.textContent ?? undefined).toHaveBeenCalledWith(false));
	});

	it("keeps the dialog open and blocks retries when placement fails after successful cancellation", async () => {
		testState.orders = [
			openOrder(),
			openOrder({
				oid: 8,
				orderType: "Stop Market",
				triggerCondition: "Price above 31000",
				triggerPx: "31000",
			}),
		];
		testState.placeOrder.mockRejectedValueOnce(new Error("place failed"));
		const onOpenChange = renderModal();

		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		act(() => setInputValue(getInput(container, "Stop Loss"), ""));
		await act(async () => getButton(container, "Confirm").click());

		expect(testState.cancelOrders).toHaveBeenCalledTimes(1);
		expect(testState.placeOrder).toHaveBeenCalledTimes(1);
		expect(testState.cancelOrders.mock.invocationCallOrder[0]).toBeLessThan(
			testState.placeOrder.mock.invocationCallOrder[0],
		);
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
		expect(container.textContent).toContain("Confirming exchange status; do not retry.");
		expect(container.textContent).toContain("Close and reopen it before submitting.");
		expect(getButton(container, "Confirm").disabled).toBe(true);
	});

	it("allows placement to observe the subscription update caused by successful cancellation", async () => {
		testState.orders = [
			openOrder(),
			openOrder({
				oid: 8,
				orderType: "Stop Market",
				triggerCondition: "Price above 31000",
				triggerPx: "31000",
			}),
		];
		let resolveCancel: ((value: unknown) => void) | undefined;
		testState.cancelOrders.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveCancel = resolve;
				}),
		);
		const onOpenChange = renderModal();

		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		act(() => setInputValue(getInput(container, "Stop Loss"), ""));
		act(() => getButton(container, "Confirm").click());
		await vi.waitFor(() => expect(testState.cancelOrders).toHaveBeenCalledTimes(1));

		testState.orders = [];
		act(() => {
			root.render(createElement(PositionTpSlModal, { open: true, onOpenChange, position: { ...positionRef } }));
		});
		await act(async () => {
			resolveCancel?.({
				status: "ok",
				response: { type: "cancel", data: { statuses: ["success", "success"] } },
			});
			await Promise.resolve();
		});

		await vi.waitFor(() => expect(testState.placeOrder).toHaveBeenCalledTimes(1));
		await vi.waitFor(() => expect(onOpenChange, container.textContent ?? undefined).toHaveBeenCalledWith(false));
	});

	it("rejects an external TP/SL change between successful workflow steps", async () => {
		testState.orders = [
			openOrder(),
			openOrder({
				oid: 8,
				orderType: "Stop Market",
				triggerCondition: "Price above 31000",
				triggerPx: "31000",
			}),
		];
		let resolveCancel: ((value: unknown) => void) | undefined;
		testState.cancelOrders.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveCancel = resolve;
				}),
		);
		const onOpenChange = renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		act(() => setInputValue(getInput(container, "Stop Loss"), ""));
		act(() => getButton(container, "Confirm").click());
		await vi.waitFor(() => expect(testState.cancelOrders).toHaveBeenCalledTimes(1));

		testState.orders = [
			openOrder({ limitPx: "30250", triggerPx: "27500" }),
			openOrder({
				oid: 8,
				orderType: "Stop Market",
				triggerCondition: "Price above 32000",
				triggerPx: "32000",
			}),
		];
		act(() => {
			root.render(createElement(PositionTpSlModal, { open: true, onOpenChange, position: positionRef }));
		});
		await act(async () => {
			resolveCancel?.({
				status: "ok",
				response: { type: "cancel", data: { statuses: ["success", "success"] } },
			});
			await Promise.resolve();
		});

		await vi.waitFor(() => expect(container.textContent).toContain("Close and reopen it before submitting."));
		expect(testState.placeOrder).not.toHaveBeenCalled();
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});

	it("shows a stable disconnected state instead of an endless loading screen", () => {
		testState.connected = false;
		renderModal();

		expect(container.textContent).toContain("Connect wallet to view positions");
		expect(container.textContent).not.toContain("Loading...");
	});

	it("preserves draft inputs while subscriptions reconnect and blocks stale submission", () => {
		renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));

		testState.openOrdersStatus = "subscribing";
		testState.positionLoading = true;
		act(() => {
			root.render(createElement(PositionTpSlModal, { open: true, onOpenChange: vi.fn(), position: positionRef }));
		});

		expect(getInput(container, "Take Profit").value).toBe("27500");
		expect(container.textContent).not.toContain("Loading...");
		expect(getButton(container, "Confirm").disabled).toBe(true);
	});

	it("preserves cached form data across transient subscription errors", () => {
		renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));

		testState.openOrdersStatus = "error";
		testState.positionError = true;
		act(() => {
			root.render(createElement(PositionTpSlModal, { open: true, onOpenChange: vi.fn(), position: positionRef }));
		});

		expect(getInput(container, "Take Profit").value).toBe("27500");
		expect(container.textContent).not.toContain("Failed to load positions.");
		expect(getButton(container, "Confirm").disabled).toBe(true);
	});
});
