// @vitest-environment jsdom

import type { FrontendOpenOrdersResponse } from "@nktkas/hyperliquid";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TpSlPositionRef } from "@/components/trade/positions/position-dialog-types";
import { PositionTpSlModal } from "@/components/trade/positions/position-tpsl-modal";
import type { Position } from "@/lib/hyperliquid";
import type { OpenOrder } from "@/lib/trade/open-orders";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	connected: true,
	markPx: "28595.5" as string | undefined,
	marketMarkPx: "28000" as string | undefined,
	openOrdersStatus: "active" as "idle" | "subscribing" | "active" | "error",
	hasOpenOrdersSnapshot: true,
	positionLoading: false,
	positionError: false,
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
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: testState.connected ? "0x1111111111111111111111111111111111111111" : undefined,
		isConnected: testState.connected,
	}),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
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
		onSlPriceChange,
		onTpPriceChange,
		slPrice,
		tpPrice,
	}: {
		leverage?: number;
		onSlPriceChange: (value: string) => void;
		onTpPriceChange: (value: string) => void;
		slPrice: string;
		tpPrice: string;
	}) =>
		createElement(
			"div",
			null,
			createElement("input", {
				"aria-label": "Take Profit",
				onChange: (event: { currentTarget: { value: string } }) => onTpPriceChange(event.currentTarget.value),
				value: tpPrice,
			}),
			createElement("input", {
				"aria-label": "Stop Loss",
				onChange: (event: { currentTarget: { value: string } }) => onSlPriceChange(event.currentTarget.value),
				value: slPrice,
			}),
			createElement("span", { "data-testid": "leverage" }, String(leverage)),
		),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: (method: string) => ({
		error: null,
		isPending: testState.pendingMethods.has(method),
		mutateAsync:
			method === "order"
				? testState.placeOrder
				: method === "batchModify"
					? testState.modifyOrders
					: testState.cancelOrders,
	}),
	useHyperliquid: () => ({
		clientKey: testState.connected ? "0x1111111111111111111111111111111111111111" : "disconnected",
		env: "Mainnet",
	}),
	useMarketsInfo: () => ({
		getMarketInfo: () => (testState.marketMarkPx ? { markPx: testState.marketMarkPx } : undefined),
	}),
	useSubscription: (method: string, params: unknown) => {
		testState.subscriptions.push({ method, params });
		if (method === "activeAssetCtx") {
			return { data: testState.markPx ? { ctx: { markPx: testState.markPx } } : undefined, status: "active" };
		}
		if (method === "openOrders") {
			return {
				data: testState.hasOpenOrdersSnapshot ? { orders: testState.orders } : undefined,
				status: testState.openOrdersStatus,
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
	}),
}));

const positionRef: TpSlPositionRef = {
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
		testState.markPx = "28595.5";
		testState.marketMarkPx = "28000";
		testState.openOrdersStatus = "active";
		testState.hasOpenOrdersSnapshot = true;
		testState.positionLoading = false;
		testState.positionError = false;
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
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function renderModal(onOpenChange = vi.fn()) {
		act(() => {
			root.render(createElement(PositionTpSlModal, { open: true, onOpenChange, position: positionRef }));
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
