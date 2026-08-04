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
	modifyOrders: vi.fn(),
	navigateToMarket: vi.fn(),
	resetCancelError: vi.fn(),
	resetModifyError: vi.fn(),
	setActiveTab: vi.fn(),
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

vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => true,
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => mocks.navigateToMarket,
}));

vi.mock("@/hooks/trade/use-order-display-labels", () => ({
	useOrderDisplayLabels: () => ({
		getFullOrderTypeLabel: () => "Stop Market",
		getOrderSideLabel: (side: "A" | "B", reduceOnly: boolean) =>
			reduceOnly ? (side === "B" ? "Close Short" : "Close Long") : side === "B" ? "Buy" : "Sell",
		getTriggerConditionLabel: () => "Price below 149.00",
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
	useHyperliquid: () => ({ clientKey: "0x1111111111111111111111111111111111111111", env: "Mainnet" }),
	useMarkets: () => ({
		error: null,
		getAssetId: () => mocks.assetId,
		getMarket: () =>
			mocks.assetId === undefined
				? undefined
				: { assetId: mocks.assetId, kind: "builderPerp", shortName: "ORCL", szDecimals: 3 },
		getSzDecimals: () => 3,
		isLoading: false,
	}),
	useMarketsInfo: () => ({ getMarketInfo: () => ({ markPx: "160" }) }),
	useSubscription: () => ({
		data: { orders: [order] },
		error: null,
		isStale: false,
		status: "active",
	}),
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => ({ setSide: mocks.setSide }),
}));

vi.mock("@/components/trade/mobile/use-mobile-terminal-tab", () => ({
	useMobileTerminalTab: () => ({ setActiveTab: mocks.setActiveTab }),
}));

describe("MobileOrdersTab disclosure card", () => {
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
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("uses remaining size in the summary and exposes details on demand", () => {
		act(() => root.render(<MobileOrdersTab scrollMode="page" />));

		expect(container.textContent).toContain("2.000 ORCL");
		expect(container.textContent).not.toContain("Original Size");

		const expand = container.querySelector<HTMLButtonElement>('button[aria-label="Expand ORCL order details"]');
		expect(expand?.parentElement?.className).toContain("min-h-11");
		act(() => expand?.click());

		expect(container.textContent).toContain("Original Size");
		expect(container.textContent).toContain("5.000 ORCL");
		expect(container.textContent).toContain("Reduce Only");
		expect(container.textContent).toContain("Yes");
		expect(container.textContent).toContain("Close Short");
		expect(container.textContent).not.toContain("Long");
	});

	it("preserves market navigation and the exact cancel payload", () => {
		act(() => root.render(<MobileOrdersTab scrollMode="page" />));

		const market = container.querySelector<HTMLButtonElement>('button[aria-label="Switch to ORCL market"]');
		act(() => market?.click());
		expect(mocks.navigateToMarket).toHaveBeenCalledWith("xyz:ORCL", undefined, { displayedContent: "trade" });
		expect(mocks.setSide).toHaveBeenCalledWith("buy");
		expect(mocks.setActiveTab).toHaveBeenCalledWith("trade");

		const expand = container.querySelector<HTMLButtonElement>('button[aria-label="Expand ORCL order details"]');
		act(() => expand?.click());
		const cancel = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Cancel");
		expect(cancel?.className).toContain("min-h-11");
		act(() => cancel?.click());

		expect(mocks.resetCancelError).toHaveBeenCalled();
		expect(mocks.cancelOrders).toHaveBeenCalledWith(
			{ cancels: [{ a: 120_001, o: 42 }] },
			expect.objectContaining({ onSettled: expect.any(Function) }),
		);
	});

	it("requires confirmation before canceling all and blocks duplicate submission", () => {
		act(() => root.render(<MobileOrdersTab scrollMode="page" />));

		const requestButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel All",
		);
		act(() => requestButton?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain("Cancel All Orders");
		expect(document.body.textContent).toContain("including protective stop orders");
		const cancelAllButtons = [...document.body.querySelectorAll<HTMLButtonElement>("button")].filter(
			(button) => button.textContent?.trim() === "Cancel All",
		);
		const confirmButton = cancelAllButtons.find((button) => button !== requestButton);

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

	it("fails closed when an order market cannot be mapped", () => {
		mocks.assetId = undefined;
		act(() => root.render(<MobileOrdersTab scrollMode="page" />));

		const requestButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel All",
		);
		act(() => requestButton?.click());
		const confirmButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button !== requestButton && button.textContent?.trim() === "Cancel All",
		);
		act(() => confirmButton?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain("Some order markets are unavailable");
		expect(document.body.textContent).toContain("Cancel All Orders");
	});
});
