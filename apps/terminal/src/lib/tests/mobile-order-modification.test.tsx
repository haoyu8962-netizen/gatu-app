/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileOrdersTab } from "@/components/trade/mobile/mobile-orders-tab";
import type { OpenOrder } from "@/lib/trade/open-orders";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	assetId: 120_001 as number | undefined,
	batchModifyGuard: undefined as ((params: unknown) => void) | undefined,
	cancelOrders: vi.fn(),
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	markPx: "160",
	modifyOrders: vi.fn(),
	orders: [] as OpenOrder[],
	resetCancelError: vi.fn(),
	resetModifyError: vi.fn(),
	toastError: vi.fn(),
	toastInfo: vi.fn(),
	toastSuccess: vi.fn(),
}));

const triggerOrder = {
	children: [],
	cloid: null,
	coin: "xyz:ORCL",
	isPositionTpsl: false,
	isTrigger: true,
	limitPx: "187",
	oid: 42,
	orderType: "Stop Market",
	origSz: "5.000",
	reduceOnly: true,
	side: "B",
	sz: "2.000",
	tif: null,
	timestamp: 1_786_000_000_000,
	triggerCondition: "Price above 170",
	triggerPx: "170",
} as OpenOrder;

vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => vi.fn(),
}));

vi.mock("@/hooks/trade/use-order-display-labels", () => ({
	useOrderDisplayLabels: () => ({
		getFullOrderTypeLabel: (order: OpenOrder) => order.orderType,
		getOrderSideLabel: () => "Close Short",
		getTriggerConditionLabel: (condition: string) => condition,
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: "0x1111111111111111111111111111111111111111",
		isConnected: true,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: (method: string, options?: { executionGuard?: (params: unknown) => void }) => {
		if (method === "batchModify") {
			mocks.batchModifyGuard = options?.executionGuard;
			return { mutateAsync: mocks.modifyOrders, error: null, reset: mocks.resetModifyError };
		}
		return { mutate: mocks.cancelOrders, error: null, reset: mocks.resetCancelError };
	},
	useHyperliquid: () => ({ clientKey: mocks.clientKey, env: mocks.env }),
	useMarkets: () => ({
		error: null,
		getAssetId: () => mocks.assetId,
		getMarket: () =>
			mocks.assetId === undefined
				? undefined
				: {
						assetId: mocks.assetId,
						kind: "builderPerp",
						name: "xyz:ORCL",
						shortName: "ORCL",
						szDecimals: 3,
					},
		getSzDecimals: () => 3,
		isLoading: false,
	}),
	useMarketsInfo: () => ({ getMarketInfo: () => ({ markPx: mocks.markPx }) }),
	useSubscription: () => ({ data: { orders: mocks.orders }, error: null, isStale: false, status: "active" }),
}));

vi.mock("sonner", () => ({
	toast: {
		error: mocks.toastError,
		info: mocks.toastInfo,
		success: mocks.toastSuccess,
	},
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => ({ setSide: vi.fn() }),
}));

vi.mock("@/components/trade/mobile/use-mobile-terminal-tab", () => ({
	useMobileTerminalTab: () => ({ setActiveTab: vi.fn() }),
}));

function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressKey(input: HTMLInputElement, key: string) {
	input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
}

function findButton(text: string, root: ParentNode = document.body) {
	return [...root.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === text);
}

describe("mobile order modification", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeAll(() => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn((query: string) => ({
				matches: true,
				media: query,
				onchange: null,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				addListener: vi.fn(),
				removeListener: vi.fn(),
				dispatchEvent: vi.fn(),
			})),
		});
	});

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		mocks.assetId = 120_001;
		mocks.batchModifyGuard = undefined;
		mocks.clientKey = "0x1111111111111111111111111111111111111111";
		mocks.env = "Mainnet";
		mocks.markPx = "160";
		mocks.orders = [triggerOrder];
		mocks.cancelOrders.mockReset();
		mocks.modifyOrders.mockReset();
		mocks.modifyOrders.mockImplementation(async (params: unknown) => {
			mocks.batchModifyGuard?.(params);
			mocks.batchModifyGuard?.(params);
			return { response: { data: { statuses: [{ resting: { oid: 42 } }] } } };
		});
		mocks.resetCancelError.mockReset();
		mocks.resetModifyError.mockReset();
		mocks.toastError.mockReset();
		mocks.toastInfo.mockReset();
		mocks.toastSuccess.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	function openEditor() {
		act(() => root.render(<MobileOrdersTab scrollMode="page" />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Expand ORCL order details"]')?.click());
		const modify = findButton("Modify Order", container);
		expect(modify).not.toBeUndefined();
		act(() => modify?.click());
		return {
			size: document.body.querySelector<HTMLInputElement>('input[aria-label="Size"]'),
			trigger: document.body.querySelector<HTMLInputElement>('input[aria-label="Trigger Price"]'),
		};
	}

	it("opens a touch-sized drawer and keeps the raw values until confirmation", () => {
		const { size, trigger } = openEditor();
		expect(document.body.textContent).toContain("Modify Order");
		expect(document.body.textContent).toContain("ORCL");
		expect(document.body.textContent).toContain("Close Short");
		expect(size?.value).toBe("2.000");
		expect(trigger?.value).toBe("170");

		act(() => {
			if (size) changeInput(size, "1.");
		});
		expect(size?.value).toBe("1.");
		expect(findButton("Modify Order")?.className).toContain("min-h-11");
	});

	it("marks invalid fields with ARIA and disables submission", () => {
		const { size } = openEditor();
		act(() => {
			if (size) changeInput(size, "3.000");
		});
		expect(size?.getAttribute("aria-invalid")).toBe("true");
		expect(size?.getAttribute("aria-describedby")).toBeTruthy();
		expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
			"Size cannot exceed the order's remaining size.",
		);
		expect(document.body.querySelector<HTMLButtonElement>('form button[type="submit"]')?.disabled).toBe(true);
		expect(mocks.modifyOrders).not.toHaveBeenCalled();
	});

	it("submits one complete guarded payload and reports success only after live writeback", async () => {
		const { size, trigger } = openEditor();
		await act(async () => {
			if (!size || !trigger) return;
			changeInput(size, "1.500");
			changeInput(trigger, "180");
			pressKey(size, "Enter");
			pressKey(size, "Enter");
			await Promise.resolve();
		});

		expect(mocks.modifyOrders).toHaveBeenCalledOnce();
		expect(mocks.modifyOrders).toHaveBeenCalledWith({
			a: true,
			modifies: [
				{
					oid: 42,
					order: {
						a: 120_001,
						b: true,
						p: "198",
						s: "1.5",
						r: true,
						t: { trigger: { isMarket: true, triggerPx: "180", tpsl: "sl" } },
					},
				},
			],
		});
		expect(mocks.toastInfo).toHaveBeenCalledWith("Order modification submitted. Waiting for the open-orders update.");
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(size?.disabled).toBe(true);

		mocks.orders = [{ ...triggerOrder, limitPx: "198", sz: "1.500", triggerPx: "180" } as OpenOrder];
		await act(async () => {
			root.render(<MobileOrdersTab scrollMode="page" />);
			await Promise.resolve();
		});
		expect(mocks.toastSuccess).toHaveBeenCalledWith("Order modification confirmed.");
		expect(document.body.querySelector('input[aria-label="Size"]')).toBeNull();
	});

	it("closes with Escape without submitting", () => {
		const { size } = openEditor();
		act(() => {
			if (size) pressKey(size, "Escape");
		});
		expect(document.body.querySelector('input[aria-label="Size"]')).toBeNull();
		expect(mocks.modifyOrders).not.toHaveBeenCalled();
	});

	it("does not claim success after the 15 second live-data timeout", async () => {
		vi.useFakeTimers();
		const { size } = openEditor();
		await act(async () => {
			if (!size) return;
			changeInput(size, "1.500");
			pressKey(size, "Enter");
			await Promise.resolve();
		});
		act(() => vi.advanceTimersByTime(15_000));

		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
			"Refresh before retrying; cancellation remains available.",
		);
		expect(size?.disabled).toBe(true);
		expect(findButton("Cancel", container)?.disabled).toBe(false);
		expect(findButton("Modify Order", container)?.disabled).toBe(true);
		const close = document.body.querySelector<HTMLButtonElement>('button[aria-label="Close order modification"]');
		act(() => close?.click());
		expect(document.body.querySelector('input[aria-label="Size"]')).toBeNull();
		expect(findButton("Cancel", container)?.disabled).toBe(false);
	});

	it("hides the modification entry for unsupported system orders", () => {
		mocks.orders = [{ ...triggerOrder, isTrigger: false, orderType: "Twap Slice", tif: "Gtc" } as OpenOrder];
		act(() => root.render(<MobileOrdersTab scrollMode="page" />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Expand ORCL order details"]')?.click());
		expect(findButton("Modify Order", container)).toBeUndefined();
	});
});
