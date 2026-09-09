/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileOrdersTab } from "@/components/trade/mobile/mobile-orders-tab";
import type { OpenOrder } from "@/lib/trade/open-orders";
import {
	getPendingTradingActionActions,
	getPendingTradingActionSnapshot,
} from "@/stores/use-pending-trading-action-store";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111",
	assetId: 120_001 as number | undefined,
	batchModifyGuard: undefined as ((params: unknown) => void) | undefined,
	cancelError: null as Error | null,
	cancelGuard: undefined as ((params: unknown) => void) | undefined,
	cancelOrders: vi.fn(),
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	isStale: false,
	hasSnapshot: true,
	marketKind: "builderPerp" as "builderPerp" | "perp" | "spot",
	marketSzDecimals: 3,
	modifyError: null as Error | null,
	modifyOrders: vi.fn(),
	navigateToMarket: vi.fn(),
	resetCancelError: vi.fn(),
	resetModifyError: vi.fn(),
	setActiveTab: vi.fn(),
	setSide: vi.fn(),
	status: "active" as "active" | "subscribing" | "idle" | "error",
	orders: [] as OpenOrder[],
	openOrdersEvent: null as { orders: OpenOrder[] } | null,
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

const outcomeOrder = {
	...order,
	coin: "#10",
	oid: 43,
} as OpenOrder;

vi.mock("@gatu/ui", async () => {
	const actual = await vi.importActual<typeof import("@gatu/ui")>("@gatu/ui");
	return {
		...actual,
		Select: ({
			onValueChange,
			options,
			value,
		}: {
			onValueChange: (value: string) => void;
			options: Array<{ label: string; value: string }>;
			value: string;
		}) => (
			<select
				aria-label={options[0]?.label}
				value={value}
				onChange={(event) => onValueChange(event.currentTarget.value)}
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		),
	};
});

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
		getFullOrderTypeLabel: (currentOrder: OpenOrder) => `Stop Market${currentOrder.reduceOnly ? " · Reduce Only" : ""}`,
		getOrderSideLabel: (side: "A" | "B", reduceOnly: boolean) =>
			reduceOnly ? (side === "B" ? "Close Short" : "Close Long") : side === "B" ? "Buy" : "Sell",
		getOrderTypeLabel: () => "Stop Market",
		getTriggerConditionLabel: () => "Price below 149.00",
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: mocks.address,
		isConnected: true,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: (method: string, options?: { executionGuard?: (params: unknown) => void }) => {
		if (method === "batchModify") {
			mocks.batchModifyGuard = options?.executionGuard;
			return { mutateAsync: mocks.modifyOrders, error: mocks.modifyError, reset: mocks.resetModifyError };
		}
		mocks.cancelGuard = options?.executionGuard;
		return {
			mutateAsync: (params: unknown) =>
				new Promise((resolve, reject) => {
					mocks.cancelOrders(params, {
						onSuccess: resolve,
						onError: (cause: Error) => {
							mocks.cancelError = cause;
							reject(cause);
						},
						onSettled: () => {},
					});
				}),
			error: mocks.cancelError,
			reset: mocks.resetCancelError,
		};
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
						kind: mocks.marketKind,
						shortName: "ORCL",
						szDecimals: mocks.marketSzDecimals,
					},
		getSzDecimals: () => mocks.marketSzDecimals,
		isLoading: false,
	}),
	useMarketsInfo: () => ({
		getMarketInfo: () => ({
			markPx: "160",
			markPriceStatus: "success",
			markPriceReceivedAt: Date.now(),
		}),
	}),
	useSubscription: () => ({
		data: mocks.hasSnapshot ? (mocks.openOrdersEvent ?? { orders: mocks.orders }) : undefined,
		error: null,
		isStale: mocks.isStale,
		status: mocks.status,
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
		getPendingTradingActionActions().reset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		mocks.address = "0x1111111111111111111111111111111111111111";
		mocks.assetId = 120_001;
		mocks.cancelError = null;
		mocks.cancelGuard = undefined;
		mocks.clientKey = "0x1111111111111111111111111111111111111111";
		mocks.env = "Mainnet";
		mocks.isStale = false;
		mocks.marketKind = "builderPerp";
		mocks.marketSzDecimals = 3;
		mocks.modifyError = null;
		mocks.orders = [order];
		mocks.openOrdersEvent = null;
		mocks.status = "active";
		mocks.hasSnapshot = true;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function renderOrders({ expandFirst = true }: { expandFirst?: boolean } = {}) {
		act(() => root.render(<MobileOrdersTab scrollMode="page" />));
		if (!expandFirst) return;

		const expand = container.querySelector<HTMLButtonElement>(
			'button[aria-label^="Expand "][aria-label$=" order details"]',
		);
		act(() => expand?.click());
	}

	it.each(["active", "idle", "subscribing", "error"] as const)(
		"keeps %s without a first snapshot quiet and cannot cancel",
		(status) => {
			mocks.status = status;
			mocks.hasSnapshot = false;
			renderOrders({ expandFirst: false });
			expect(container.querySelector('[data-slot="data-pending"]')).not.toBeNull();
			expect(container.textContent).toBe("");
			expect(container.querySelector("button")).toBeNull();
			expect(mocks.cancelOrders).not.toHaveBeenCalled();
			mocks.status = "active";
			mocks.hasSnapshot = true;
			mocks.orders = [];
			renderOrders({ expandFirst: false });
			expect(container.textContent).toContain("No open orders.");
		},
	);

	it("uses remaining size and keeps disclosure controls scoped to each card", () => {
		renderOrders({ expandFirst: false });

		expect(container.textContent).toContain("2.000");
		expect(container.textContent).not.toContain("2.000 ORCL");
		expect(container.textContent).not.toContain("Original Size");
		expect(container.textContent).not.toContain("Long");
		expect(container.textContent).not.toContain("Stop Market · Reduce Only");
		expect(container.querySelector('[data-testid="collapse-all-order-details"]')).toBeNull();
		expect(container.querySelector('[data-testid="expand-all-order-details"]')).toBeNull();

		const expand = container.querySelector<HTMLButtonElement>('button[aria-label="Expand ORCL order details"]');
		act(() => expand?.click());
		expect(container.textContent).toContain("Original Size");
		expect(container.textContent).toContain("5.000");
		expect(container.textContent).not.toContain("5.000 ORCL");
		expect(container.textContent).toContain("Reduce Only");
		expect(container.textContent).toContain("Yes");
		expect(container.textContent).toContain("Close Short");
		expect(container.textContent).toContain("≤ 149.00");
		const collapseControls = [
			...container.querySelectorAll<HTMLButtonElement>('button[aria-label="Collapse ORCL order details"]'),
		];
		expect(collapseControls).toHaveLength(1);
		expect(collapseControls[0]?.getAttribute("aria-expanded")).toBe("true");
		expect(collapseControls[0]?.getAttribute("aria-controls")).toBeTruthy();

		mocks.orders = [{ ...order, limitPx: "151.25", sz: "1.500" } as OpenOrder];
		renderOrders({ expandFirst: false });
		expect(container.textContent).toContain("Original Size");
		expect(container.textContent).toContain("1.500");

		const collapse = container.querySelector<HTMLButtonElement>(
			'button[aria-expanded="true"][aria-label="Collapse ORCL order details"]',
		);
		act(() => collapse?.click());
		expect(container.textContent).not.toContain("Original Size");
	});

	it("shows the SDK-derived mark distance and warns below ten percent", () => {
		renderOrders();

		const distanceLabel = [...container.querySelectorAll<HTMLElement>("div")].find(
			(element) => element.textContent?.trim() === "Distance to mark",
		);
		const distanceValue = distanceLabel?.nextElementSibling as HTMLElement | null;
		expect(distanceValue?.textContent).toBe("-6.9%");
		expect(distanceValue?.className).toContain("text-market-close-warning");
		expect(distanceValue?.className).toContain("tabular-nums");
		expect(distanceLabel?.parentElement?.className).toContain("gap-0.5");

		const market = container.querySelector<HTMLButtonElement>('button[aria-label="Switch to ORCL market"]');
		expect(market?.className).toContain("text-start");
		expect(market?.className).toContain("after:h-11");
		expect(market?.className).toContain("after:min-w-11");
	});

	it("retains 44px minimum touch targets on every compact card action", () => {
		renderOrders();
		const article = container.querySelector("article");
		const actions = [
			article?.querySelector<HTMLButtonElement>('button[aria-label="Switch to ORCL market"]'),
			...["Modify Order", "Cancel"].map((label) =>
				[...(article?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
					(button) => button.textContent?.trim() === label,
				),
			),
		];
		for (const action of actions) {
			expect(action).toBeInstanceOf(HTMLButtonElement);
			expect(action?.classList.contains("relative")).toBe(true);
			expect(action?.classList.contains("after:absolute")).toBe(true);
			expect(action?.classList.contains("after:h-11")).toBe(true);
			expect(action?.classList.contains("after:min-w-11")).toBe(true);
			expect(action?.classList.contains("after:w-full")).toBe(true);
			expect(action?.classList.contains("after:content-['']")).toBe(true);
			expect(action?.disabled).toBe(false);
		}
	});

	it("uses the spot market price cap for low-priced limit orders", () => {
		mocks.marketKind = "spot";
		mocks.marketSzDecimals = 0;
		mocks.orders = [
			{
				...order,
				isTrigger: false,
				limitPx: "0.00000011",
				orderType: "Limit",
				reduceOnly: false,
				tif: "Gtc",
				triggerCondition: "N/A",
				triggerPx: "0",
			} as OpenOrder,
		];
		renderOrders();

		const priceLabel = [...container.querySelectorAll<HTMLElement>("div")].find(
			(element) => element.textContent?.trim() === "Price",
		);
		expect(priceLabel?.nextElementSibling?.textContent).toBe("$0.00000011");
	});

	it("filters the visible cards by SDK trigger type and side without narrowing cancel all", () => {
		mocks.orders = [
			order,
			{
				...order,
				isTrigger: false,
				oid: 43,
				orderType: "Limit",
				reduceOnly: false,
				side: "A",
				tif: "Gtc",
				triggerCondition: "N/A",
				triggerPx: "0",
			} as OpenOrder,
		];
		renderOrders();
		expect(container.querySelectorAll("article")).toHaveLength(2);

		const typeFilter = container.querySelector<HTMLSelectElement>('select[aria-label="Type"]');
		act(() => {
			if (!typeFilter) return;
			typeFilter.value = "limit";
			typeFilter.dispatchEvent(new Event("change", { bubbles: true }));
		});

		expect(container.querySelectorAll("article")).toHaveLength(1);
		const cancelAll = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel all",
		);
		act(() => cancelAll?.click());
		expect(document.body.textContent).toContain("cancel all 2 open orders");
	});

	it("keeps the filter toolbar and renders the design empty state when there are no orders", () => {
		mocks.orders = [];
		renderOrders();

		expect(container.querySelector('[data-testid="mobile-orders-filter-toolbar"]')).not.toBeNull();
		expect(container.textContent).toContain("No open orders.");
		expect(container.textContent).toContain("Submitted limit and trigger orders will appear here.");
		expect(container.querySelector(".size-10")).not.toBeNull();
		expect(container.querySelector("article")).toBeNull();
	});

	it("preserves market navigation and the exact cancel payload", () => {
		renderOrders();

		const market = container.querySelector<HTMLButtonElement>('button[aria-label="Switch to ORCL market"]');
		act(() => market?.click());
		expect(mocks.navigateToMarket).toHaveBeenCalledWith("xyz:ORCL", undefined, { displayedContent: "trade" });
		expect(mocks.setSide).toHaveBeenCalledWith("buy");
		expect(mocks.setActiveTab).toHaveBeenCalledWith("trade");

		const expand = container.querySelector<HTMLButtonElement>('button[aria-label="Expand ORCL order details"]');
		act(() => expand?.click());
		const cancel = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Cancel");
		expect(cancel?.className).toContain("h-[18px]");
		expect(cancel?.className).toContain("after:h-11");
		expect(cancel?.className).toContain("after:min-w-11");
		expect(cancel?.className).toContain("after:top-[calc(50%_-_1px)]");
		expect(cancel?.className).toContain("disabled:text-fg-disabled");
		expect(cancel?.className).not.toContain("disabled:text-market-close-danger-disabled");
		act(() => cancel?.click());

		expect(mocks.resetCancelError).toHaveBeenCalled();
		expect(mocks.cancelOrders).toHaveBeenCalledWith(
			{ cancels: [{ a: 120_001, o: 42 }] },
			expect.objectContaining({ onSettled: expect.any(Function) }),
		);
	});

	it("revalidates the mobile cancellation session at the SDK boundary", () => {
		renderOrders();
		act(() => {
			[...container.querySelectorAll<HTMLButtonElement>("button")]
				.find((button) => button.textContent?.trim() === "Cancel")
				?.click();
		});
		const params = mocks.cancelOrders.mock.calls[0]?.[0];
		expect(mocks.cancelGuard).toBeTypeOf("function");

		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		renderOrders();
		expect(() => mocks.cancelGuard?.(params)).toThrow("Open orders changed. Reopen the confirmation and try again.");
	});

	it("cancels an outcome without market metadata and keeps modification safely unavailable", () => {
		mocks.assetId = undefined;
		mocks.orders = [outcomeOrder];
		renderOrders();

		const modify = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Modify Order",
		);
		expect(modify?.getAttribute("aria-disabled")).toBe("true");
		expect(modify?.title).toBe("Market metadata changed. Refresh and try again.");
		act(() => {
			[...container.querySelectorAll<HTMLButtonElement>("button")]
				.find((button) => button.textContent?.trim() === "Cancel")
				?.click();
		});

		expect(mocks.cancelOrders).toHaveBeenCalledWith(
			{ cancels: [{ a: 100_000_010, o: 43 }] },
			expect.objectContaining({ onSettled: expect.any(Function) }),
		);
	});

	it.each([
		{ status: "subscribing" as const, isStale: false },
		{ status: "active" as const, isStale: true },
	])("fails closed when a row cancellation uses a non-live snapshot", ({ status, isStale }) => {
		mocks.status = status;
		mocks.isStale = isStale;
		renderOrders();

		const cancel = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel",
		);
		act(() => cancel?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(cancel).toBeUndefined();
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.querySelector('[data-slot="data-pending"]')).not.toBeNull();
	});

	it("retains a submitted cancellation error if the subscription becomes stale", async () => {
		renderOrders();
		const cancel = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent?.trim() === "Cancel",
		);
		act(() => cancel?.click());
		expect(mocks.cancelOrders).toHaveBeenCalledOnce();
		const callbacks = mocks.cancelOrders.mock.calls[0]?.[1] as { onError: (cause: Error) => void };
		mocks.isStale = true;
		await act(async () => callbacks.onError(new Error("Cancellation rejected")));
		renderOrders({ expandFirst: false });
		expect(container.querySelector('[data-slot="data-pending"]')).not.toBeNull();
		expect(container.querySelector('[role="alert"]')?.textContent).toBe("Cancellation rejected");
	});

	it("fails closed when the cancellation owner does not match the trading client", () => {
		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		renderOrders();

		const cancel = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel",
		);
		act(() => cancel?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain(
			"The trading account or network changed. Reopen the confirmation and try again.",
		);
	});

	it("fails closed when the open-orders snapshot belongs to another environment", () => {
		mocks.openOrdersEvent = { orders: mocks.orders };
		renderOrders();
		mocks.env = "Testnet";
		renderOrders();

		const cancel = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel",
		);
		act(() => cancel?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain(
			"The trading account or network changed. Reopen the confirmation and try again.",
		);
	});

	it("does not start cancel all while a row cancellation is unresolved", () => {
		renderOrders();

		const rowCancel = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel",
		);
		act(() => rowCancel?.click());
		const cancelAll = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel all",
		);

		expect(cancelAll?.disabled).toBe(true);
		expect(
			[...container.querySelectorAll<HTMLButtonElement>("button")].find(
				(button) => button.textContent?.trim() === "Modify Order",
			)?.disabled,
		).toBe(true);
		act(() => cancelAll?.click());
		expect(mocks.cancelOrders).toHaveBeenCalledOnce();
		expect(document.body.textContent).not.toContain("Cancel All Orders");
	});

	it("does not let an old account cancellation settle a new account interaction", async () => {
		renderOrders();
		const accountACancel = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel",
		);
		act(() => accountACancel?.click());
		const accountACallbacks = mocks.cancelOrders.mock.calls[0]?.[1] as
			| { onSuccess: (response: unknown) => void }
			| undefined;

		mocks.address = "0x2222222222222222222222222222222222222222";
		mocks.clientKey = mocks.address;
		renderOrders();
		const accountBCancel = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel",
		);
		expect(accountBCancel?.disabled).toBe(false);
		act(() => accountBCancel?.click());
		expect(mocks.cancelOrders).toHaveBeenCalledTimes(2);
		expect(
			[...container.querySelectorAll<HTMLButtonElement>("button")].find(
				(button) => button.textContent?.trim() === "Cancel",
			)?.disabled,
		).toBe(true);

		await act(async () => {
			accountACallbacks?.onSuccess({
				status: "ok",
				response: { type: "cancel", data: { statuses: ["success"] } },
			});
			await Promise.resolve();
		});

		expect(
			[...container.querySelectorAll<HTMLButtonElement>("button")].find(
				(button) => button.textContent?.trim() === "Cancel",
			)?.disabled,
		).toBe(true);
	});

	it("does not show a late cancellation rejection from the previous account", async () => {
		renderOrders();
		const accountACancel = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel",
		);
		act(() => accountACancel?.click());
		const accountACallbacks = mocks.cancelOrders.mock.calls[0]?.[1] as { onError: (cause: Error) => void } | undefined;

		mocks.address = "0x2222222222222222222222222222222222222222";
		mocks.clientKey = mocks.address;
		renderOrders();

		await act(async () => {
			accountACallbacks?.onError(new Error("Account A cancellation failed"));
			await Promise.resolve();
		});

		expect(mocks.cancelError?.message).toBe("Account A cancellation failed");
		expect(container.textContent).not.toContain("Account A cancellation failed");
	});

	it("requires confirmation before canceling all and blocks duplicate submission", async () => {
		renderOrders();

		const requestButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel all",
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
			| { onSuccess: (response: unknown) => void; onSettled: () => void }
			| undefined;
		await act(async () => {
			callbacks?.onSuccess({ status: "ok", response: { type: "cancel", data: { statuses: ["success"] } } });
			await Promise.resolve();
		});
		expect(document.body.textContent).not.toContain("Cancel All Orders");
		expect(getPendingTradingActionSnapshot().orderCancellations[0]?.phase).toBe("awaiting");
	});

	it("does not close the confirmation for a malformed cancellation response", async () => {
		renderOrders();
		const requestButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel all",
		);
		act(() => requestButton?.click());
		const confirmButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button !== requestButton && button.textContent?.trim() === "Cancel All",
		);
		act(() => confirmButton?.click());
		const callbacks = mocks.cancelOrders.mock.calls[0]?.[1] as
			| { onSuccess: (response: unknown) => void; onSettled: () => void }
			| undefined;

		await act(async () => {
			callbacks?.onSuccess({ status: "ok", response: { type: "cancel", data: { statuses: [{}] } } });
			await Promise.resolve();
		});
		expect(document.body.textContent).toContain("Cancel All Orders");
		expect(document.body.textContent).toContain("The cancellation response could not be confirmed.");
		expect(getPendingTradingActionSnapshot().orderCancellations[0]?.phase).toBe("awaiting");
	});

	it("cancels all standard and outcome orders with their exact action asset IDs", () => {
		mocks.orders = [order, outcomeOrder];
		renderOrders();
		const requestButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel all",
		);
		act(() => requestButton?.click());
		const confirmButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button !== requestButton && button.textContent?.trim() === "Cancel All",
		);
		act(() => confirmButton?.click());

		expect(mocks.cancelOrders).toHaveBeenCalledWith(
			{
				cancels: [
					{ a: 120_001, o: 42 },
					{ a: 100_000_010, o: 43 },
				],
			},
			expect.objectContaining({ onSuccess: expect.any(Function), onSettled: expect.any(Function) }),
		);
	});

	it("rejects cancel all when the confirmed order set changes", () => {
		renderOrders();
		const requestButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel all",
		);
		act(() => requestButton?.click());

		mocks.orders = [order, { ...order, coin: "BTC", oid: 43 } as OpenOrder];
		renderOrders();
		const confirmButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button !== requestButton && button.textContent?.trim() === "Cancel All",
		);
		act(() => confirmButton?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain("Open orders changed. Reopen the confirmation and try again.");
	});

	it("fails closed when an order market cannot be mapped", () => {
		mocks.assetId = undefined;
		renderOrders();

		const requestButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel all",
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
