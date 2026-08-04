// @vitest-environment jsdom

import type { FrontendOpenOrdersResponse } from "@nktkas/hyperliquid";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TpSlPositionTarget } from "@/components/trade/positions/position-dialog-types";
import { PositionTpSlModal } from "@/components/trade/positions/position-tpsl-modal";
import type { Position } from "@/lib/hyperliquid";
import type { OpenOrder } from "@/lib/trade/open-orders";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	connected: true,
	walletAddress: "0x1111111111111111111111111111111111111111",
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	markPx: "28595.5" as string | undefined,
	marketMarkPx: "28000" as string | undefined,
	markStatus: "active" as "idle" | "subscribing" | "active" | "error",
	markStale: false,
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
	modifyOrders: vi.fn(),
	cancelOrders: vi.fn(),
	isMobile: false,
	pendingMethods: new Set<string>(),
	executionGuards: {} as Record<string, ((params: unknown) => void) | undefined>,
}));

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
			submitOrder: async (params: unknown) => {
				options?.executionGuard?.(params);
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
		...props
	}: {
		children: ReactNode;
		containerClassName?: string;
		[key: string]: unknown;
	}) => createElement("button", { ...props, type: "button" }, children),
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
		const mutation =
			method === "order"
				? testState.placeOrder
				: method === "batchModify"
					? testState.modifyOrders
					: testState.cancelOrders;
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
				data: testState.markPx ? { ctx: { markPx: testState.markPx } } : undefined,
				status: testState.markStatus,
				isStale: testState.markStale,
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

describe("PositionTpSlModal live data", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
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
		testState.placeOrder.mockReset().mockResolvedValue({});
		testState.modifyOrders.mockReset().mockResolvedValue({});
		testState.cancelOrders.mockReset().mockResolvedValue({});
		testState.executionGuards = {};
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
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
		testState.pendingMethods.add("batchModify");
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

	it("modifies an existing leg to a fixed partial-size trigger-limit order", async () => {
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

		expect(testState.modifyOrders).toHaveBeenCalledWith({
			a: true,
			modifies: [
				{
					oid: 7,
					order: {
						a: positionRef.assetId,
						b: true,
						p: "27600",
						r: true,
						s: "0.1",
						t: { trigger: { isMarket: false, tpsl: "tp", triggerPx: "27500" } },
					},
				},
			],
		});
		expect(testState.placeOrder).not.toHaveBeenCalled();
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
			expect(container.textContent).toContain(snapshot === "position" ? "Live position data is stale." : "Loading...");
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
		expect(testState.modifyOrders).not.toHaveBeenCalled();
	});

	it("continues a create-then-cancel workflow only after receiving the new resting order id", async () => {
		testState.orders = [
			openOrder({
				oid: 8,
				orderType: "Stop Market",
				triggerCondition: "Price above 31000",
				triggerPx: "31000",
			}),
		];
		testState.placeOrder.mockResolvedValueOnce({
			response: { data: { statuses: [{ resting: { oid: 99 } }] } },
		});
		const onOpenChange = renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		act(() => setInputValue(getInput(container, "Stop Loss"), ""));

		const confirm = getButton(container, "Confirm");
		expect(confirm.disabled, container.textContent ?? undefined).toBe(false);
		await act(async () => confirm.click());

		expect(testState.placeOrder).toHaveBeenCalledTimes(1);
		expect(testState.cancelOrders).toHaveBeenCalledWith({ cancels: [{ a: positionRef.assetId, o: 8 }] });
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("does not cancel an existing leg when a newly created trigger has no confirmed resting id", async () => {
		testState.orders = [
			openOrder({
				oid: 8,
				orderType: "Stop Market",
				triggerCondition: "Price above 31000",
				triggerPx: "31000",
			}),
		];
		testState.placeOrder.mockResolvedValueOnce({
			response: { data: { statuses: ["waitingForTrigger"] } },
		});
		const onOpenChange = renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		act(() => setInputValue(getInput(container, "Stop Loss"), ""));

		const confirm = getButton(container, "Confirm");
		expect(confirm.disabled, container.textContent ?? undefined).toBe(false);
		await act(async () => confirm.click());

		expect(testState.placeOrder).toHaveBeenCalledTimes(1);
		expect(testState.cancelOrders).not.toHaveBeenCalled();
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
		expect(container.textContent).toContain("Confirming exchange status; do not retry.");
		expect(getButton(container, "Confirm").disabled).toBe(true);
	});

	it("modifies an existing position TP with the trigger-replacement flag", async () => {
		testState.orders = [openOrder()];
		renderModal();

		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		await act(async () => getButton(container, "Confirm").click());

		expect(testState.modifyOrders).toHaveBeenCalledWith({
			a: true,
			modifies: [
				{
					oid: 7,
					order: {
						a: positionRef.assetId,
						b: true,
						p: "30250",
						r: true,
						s: "0",
						t: { trigger: { isMarket: true, tpsl: "tp", triggerPx: "27500" } },
					},
				},
			],
		});
		expect(testState.placeOrder).not.toHaveBeenCalled();
		expect(testState.cancelOrders).not.toHaveBeenCalled();
	});

	it("locks the whole workflow synchronously against duplicate confirmation and dismissal", async () => {
		testState.orders = [openOrder()];
		let resolveModify: ((value: unknown) => void) | undefined;
		testState.modifyOrders.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveModify = resolve;
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

		await vi.waitFor(() => expect(testState.modifyOrders).toHaveBeenCalledTimes(1));
		expect(onOpenChange).not.toHaveBeenCalled();
		expect(getInput(container, "Take Profit").disabled).toBe(true);
		await act(async () => {
			resolveModify?.({ response: { data: { statuses: [{ resting: { oid: 7 } }] } } });
			await Promise.resolve();
		});
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("keeps the dialog open and blocks retries after an uncertain partial update", async () => {
		testState.orders = [
			openOrder(),
			openOrder({
				oid: 8,
				orderType: "Stop Market",
				triggerCondition: "Price above 31000",
				triggerPx: "31000",
			}),
		];
		testState.modifyOrders.mockResolvedValueOnce({
			response: { data: { statuses: [{ resting: { oid: 7 } }] } },
		});
		testState.cancelOrders.mockRejectedValueOnce(new Error("cancel failed"));
		const onOpenChange = renderModal();

		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		act(() => setInputValue(getInput(container, "Stop Loss"), ""));
		await act(async () => getButton(container, "Confirm").click());

		expect(testState.modifyOrders).toHaveBeenCalledTimes(1);
		expect(testState.cancelOrders).toHaveBeenCalledTimes(1);
		expect(testState.modifyOrders.mock.invocationCallOrder[0]).toBeLessThan(
			testState.cancelOrders.mock.invocationCallOrder[0],
		);
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
		expect(container.textContent).toContain("cancel failed");
		expect(container.textContent).toContain("Close and reopen it before submitting.");
		expect(getButton(container, "Confirm").disabled).toBe(true);
	});

	it("allows later steps to observe the subscription update caused by an earlier successful step", async () => {
		testState.orders = [
			openOrder(),
			openOrder({
				oid: 8,
				orderType: "Stop Market",
				triggerCondition: "Price above 31000",
				triggerPx: "31000",
			}),
		];
		let resolveModify: ((value: unknown) => void) | undefined;
		testState.modifyOrders.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveModify = resolve;
				}),
		);
		const onOpenChange = renderModal();

		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		act(() => setInputValue(getInput(container, "Stop Loss"), ""));
		act(() => getButton(container, "Confirm").click());
		await vi.waitFor(() => expect(testState.modifyOrders).toHaveBeenCalledTimes(1));

		testState.orders = [
			openOrder({ limitPx: "30250", triggerPx: "27500" }),
			openOrder({
				oid: 8,
				orderType: "Stop Market",
				triggerCondition: "Price above 31000",
				triggerPx: "31000",
			}),
		];
		act(() => {
			root.render(createElement(PositionTpSlModal, { open: true, onOpenChange, position: { ...positionRef } }));
		});
		await act(async () => {
			resolveModify?.({ response: { data: { statuses: [{ resting: { oid: 7 } }] } } });
			await Promise.resolve();
		});

		await vi.waitFor(() => expect(testState.cancelOrders).toHaveBeenCalledWith({ cancels: [{ a: 120000, o: 8 }] }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
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
		let resolveModify: ((value: unknown) => void) | undefined;
		testState.modifyOrders.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveModify = resolve;
				}),
		);
		const onOpenChange = renderModal();
		act(() => setInputValue(getInput(container, "Take Profit"), "27500"));
		act(() => setInputValue(getInput(container, "Stop Loss"), ""));
		act(() => getButton(container, "Confirm").click());
		await vi.waitFor(() => expect(testState.modifyOrders).toHaveBeenCalledTimes(1));

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
			resolveModify?.({ response: { data: { statuses: [{ resting: { oid: 7 } }] } } });
			await Promise.resolve();
		});

		await vi.waitFor(() => expect(container.textContent).toContain("Close and reopen it before submitting."));
		expect(testState.cancelOrders).not.toHaveBeenCalled();
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
		expect(container.textContent).toContain("Loading...");
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
		expect(container.textContent).toContain("Failed to load positions.");
		expect(getButton(container, "Confirm").disabled).toBe(true);
	});
});
