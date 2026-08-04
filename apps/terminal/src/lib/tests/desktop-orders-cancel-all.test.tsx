/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OrdersTab } from "@/components/trade/positions/orders-tab";
import type { OpenOrder } from "@/lib/trade/open-orders";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	assetId: 120_001 as number | undefined,
	cancelOrders: vi.fn(),
	resetCancelError: vi.fn(),
	setSide: vi.fn(),
}));

const order = {
	children: [],
	cloid: null,
	coin: "xyz:ORCL",
	isPositionTpsl: false,
	isTrigger: true,
	limitPx: "150.25",
	oid: 42,
	orderType: "Stop Market",
	origSz: "5.000",
	reduceOnly: true,
	side: "B",
	sz: "2.000",
	tif: null,
	timestamp: 1_786_000_000_000,
	triggerCondition: "Price below 149.00",
	triggerPx: "149.00",
} as unknown as OpenOrder;

vi.mock("@/components/trade/components/asset-badge", () => ({
	AssetBadge: ({ coin }: { coin: string }) => <span>{coin}</span>,
}));

vi.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ScrollBar: () => null,
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => false,
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => vi.fn(),
}));

vi.mock("@/hooks/trade/use-order-display-labels", () => ({
	useOrderDisplayLabels: () => ({
		getExecutionKindLabel: () => "Market",
		getFullOrderTypeLabel: () => "Stop Market",
		getTriggerConditionLabel: () => "Price below 149.00",
		getTriggerKindLabel: () => "Stop",
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: "0x1111111111111111111111111111111111111111", isConnected: true }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: () => ({ mutate: mocks.cancelOrders, error: null, reset: mocks.resetCancelError }),
	useMarkets: () => ({
		getAssetId: () => mocks.assetId,
		getSzDecimals: () => 3,
	}),
	useSubscription: () => ({ data: { orders: [order] }, error: null, status: "active" }),
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => ({ setSide: mocks.setSide }),
}));

describe("desktop cancel all orders confirmation", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeAll(() => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn((query: string) => ({
				matches: false,
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
		mocks.cancelOrders.mockReset();
		mocks.resetCancelError.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("opens the warning before submitting and rejects a synchronous double confirmation", () => {
		act(() => root.render(<OrdersTab />));

		const requestButton = container.querySelector<HTMLButtonElement>('button[aria-label="Cancel all orders"]');
		act(() => requestButton?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain("Cancel All Orders");
		expect(document.body.textContent).toContain("including protective stop orders");
		const confirmButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel All",
		);

		act(() => {
			confirmButton?.click();
			confirmButton?.click();
		});

		expect(mocks.cancelOrders).toHaveBeenCalledOnce();
		expect(mocks.cancelOrders).toHaveBeenCalledWith(
			{ cancels: [{ a: 120_001, o: 42 }] },
			expect.objectContaining({ onSuccess: expect.any(Function), onSettled: expect.any(Function) }),
		);
		expect(confirmButton?.disabled).toBe(true);
		expect(confirmButton?.getAttribute("aria-busy")).toBe("true");

		const callbacks = mocks.cancelOrders.mock.calls[0]?.[1] as
			| { onSuccess: () => void; onSettled: () => void }
			| undefined;
		act(() => callbacks?.onSuccess());
		expect(document.body.textContent).not.toContain("Cancel All Orders");
		act(() => callbacks?.onSettled());
	});

	it("keeps row cancellation on the existing immediate path", () => {
		act(() => root.render(<OrdersTab />));

		const cancelRow = container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]');
		act(() => cancelRow?.click());

		expect(document.body.textContent).not.toContain("Cancel All Orders");
		expect(mocks.cancelOrders).toHaveBeenCalledWith(
			{ cancels: [{ a: 120_001, o: 42 }] },
			expect.objectContaining({ onSettled: expect.any(Function) }),
		);
	});

	it("fails closed when any order market cannot be mapped", () => {
		mocks.assetId = undefined;
		act(() => root.render(<OrdersTab />));

		const requestButton = container.querySelector<HTMLButtonElement>('button[aria-label="Cancel all orders"]');
		act(() => requestButton?.click());
		const confirmButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel All",
		);
		act(() => confirmButton?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain("Some order markets are unavailable");
		expect(document.body.textContent).toContain("Cancel All Orders");
	});
});
