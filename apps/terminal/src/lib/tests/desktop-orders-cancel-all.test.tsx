import { LOADING_INDICATOR_SELECTOR } from "./harness/loading-indicator";
/** @vitest-environment jsdom */

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { ApiRequestError, HttpRequestError } from "@nktkas/hyperliquid";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OrdersTab } from "@/components/trade/positions/orders-tab";
import { formatDateTime } from "@/lib/format";
import type { OpenOrder } from "@/lib/trade/open-orders";
import {
	getOrderQueueItem,
	type OrderQueueItem,
	removeOrderQueueItem,
	useOrderQueue,
} from "@/stores/use-order-queue-store";
import {
	getPendingTradingActionActions,
	getPendingTradingActionSnapshot,
	getPendingTradingActionToastId,
} from "@/stores/use-pending-trading-action-store";
import { createI18nRoot } from "./harness/react";

let queueItems: OrderQueueItem[] = [];
function ReviewedOrders() {
	queueItems = useOrderQueue();
	return <OrdersTab />;
}

function cancelRejection(text: string) {
	return new ApiRequestError(
		{ status: "ok", response: { type: "cancel", data: { statuses: [{ error: text }] } } },
		`cancel 0: ${text}`,
	);
}

const mocks = vi.hoisted(() => ({
	markPriceLive: false,
	address: "0x1111111111111111111111111111111111111111",
	assetId: 120_001 as number | undefined,
	batchModifyGuard: undefined as ((params: unknown) => void) | undefined,
	cancelError: null as Error | null,
	cancelGuard: undefined as ((params: unknown) => void) | undefined,
	cancelOrders: vi.fn(),
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	getOrderSideLabel: vi.fn(() => "Close Short"),
	markPx: "160",
	modifyError: null as Error | null,
	modifyOrders: vi.fn(),
	orders: [] as OpenOrder[],
	quoteSymbol: "USDC" as string,
	resetCancelError: vi.fn(),
	resetModifyError: vi.fn(),
	setSide: vi.fn(),
	subscriptionIsStale: false,
	hasSnapshot: true,
	subscriptionStatus: "active" as "active" | "error" | "idle" | "subscribing",
	toastError: vi.fn(),
	toastInfo: vi.fn(),
	toastSuccess: vi.fn(),
	toastWarning: vi.fn(),
}));

const order = {
	children: [],
	cloid: null,
	coin: "xyz:ORCL",
	isPositionTpsl: false,
	isTrigger: false,
	limitPx: "149.00",
	oid: 42,
	orderType: "Limit",
	origSz: "5.000",
	reduceOnly: true,
	side: "B",
	sz: "2.000",
	tif: "Gtc",
	timestamp: 1_786_000_000_000,
	triggerCondition: "N/A",
	triggerPx: "0",
} as unknown as OpenOrder;

const triggerOrder = {
	...order,
	isTrigger: true,
	orderType: "Stop Market",
	tif: null,
	triggerCondition: "Price below 149.00",
	triggerPx: "149.00",
} as OpenOrder;

const outcomeOrder = {
	...order,
	coin: "#10",
	oid: 43,
} as OpenOrder;

const MODIFICATION_UNCONFIRMED_MESSAGE =
	"The order update was not confirmed by live data. Refresh before retrying; cancellation remains available.";
const MODIFICATION_UNCONFIRMED_MESSAGE_AR =
	"لم تؤكد البيانات المباشرة تحديث الطلب. حدّث الطلبات قبل إعادة المحاولة؛ ولا يزال الإلغاء متاحاً.";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(MODIFICATION_UNCONFIRMED_MESSAGE)]: MODIFICATION_UNCONFIRMED_MESSAGE_AR,
};

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
		getFullOrderTypeLabel: (current: OpenOrder) => current.orderType,
		getOrderSideLabel: mocks.getOrderSideLabel,
		getOrderTypeLabel: (orderType: OpenOrder["orderType"]) => orderType,
		getTriggerConditionLabel: () => "Price below 149.00",
		getTriggerKindLabel: () => "Stop",
	}),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, className, to }: { children: React.ReactNode; className?: string; to: string }) => (
		<a href={to} className={className}>
			{children}
		</a>
	),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: mocks.address, isConnected: true }),
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
						kind: "builderPerp",
						name: "xyz:ORCL",
						quoteToken: { displayName: mocks.quoteSymbol, name: mocks.quoteSymbol },
						szDecimals: 3,
					},
		getSzDecimals: () => 3,
		isLoading: false,
	}),
	useMarketsInfo: () => ({
		getMarketInfo: () => ({
			markPx: mocks.markPx,
			markPriceStatus: mocks.markPriceLive ? "success" : undefined,
			markPriceReceivedAt: mocks.markPriceLive ? Date.now() : undefined,
		}),
	}),
	useSubscription: () => ({
		data: mocks.hasSnapshot ? { orders: mocks.orders } : undefined,
		error: null,
		isStale: mocks.subscriptionIsStale,
		status: mocks.subscriptionStatus,
	}),
}));

vi.mock("sonner", () => ({
	toast: {
		error: mocks.toastError,
		info: mocks.toastInfo,
		success: mocks.toastSuccess,
		warning: mocks.toastWarning,
	},
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => ({ setSide: mocks.setSide }),
}));

function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressKey(input: HTMLInputElement, key: string) {
	input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
}

async function selectOption(container: HTMLElement, fieldLabel: string, optionLabel: string) {
	const label = Array.from(container.querySelectorAll("label")).find(
		(candidate) => candidate.textContent === fieldLabel,
	);
	const trigger = label?.parentElement?.querySelector<HTMLButtonElement>('[role="combobox"]');
	expect(trigger).toBeDefined();
	await act(async () => {
		trigger?.click();
		await Promise.resolve();
	});
	const option = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find((candidate) =>
		candidate.textContent?.includes(optionLabel),
	);
	expect(option).toBeDefined();
	await act(async () => {
		option?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
		await Promise.resolve();
		option?.click();
		await Promise.resolve();
	});
}

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
		i18n.loadAndActivate({ locale: "en", messages: {} });
		getPendingTradingActionActions().reset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		mocks.address = "0x1111111111111111111111111111111111111111";
		mocks.assetId = 120_001;
		mocks.batchModifyGuard = undefined;
		mocks.cancelError = null;
		mocks.cancelGuard = undefined;
		mocks.clientKey = "0x1111111111111111111111111111111111111111";
		mocks.env = "Mainnet";
		mocks.markPx = "160";
		mocks.markPriceLive = false;
		mocks.modifyError = null;
		mocks.orders = [order];
		mocks.quoteSymbol = "USDC";
		mocks.subscriptionIsStale = false;
		mocks.hasSnapshot = true;
		mocks.subscriptionStatus = "active";
		mocks.cancelOrders.mockReset();
		mocks.getOrderSideLabel.mockClear();
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
		mocks.toastWarning.mockReset();
	});

	afterEach(() => {
		act(() => {
			for (const item of queueItems) removeOrderQueueItem(item.id);
			root.unmount();
		});
		queueItems = [];
		container.remove();
	});

	it.each([
		{ subscriptionStatus: "active" as const, hasSnapshot: false, subscriptionIsStale: false },
		{ subscriptionStatus: "subscribing" as const, hasSnapshot: true, subscriptionIsStale: false },
		{ subscriptionStatus: "error" as const, hasSnapshot: true, subscriptionIsStale: false },
		{ subscriptionStatus: "active" as const, hasSnapshot: true, subscriptionIsStale: true },
	])("keeps unavailable orders quiet without empty conclusions or cancellation: %o", (state) => {
		Object.assign(mocks, state);
		act(() => root.render(<ReviewedOrders />));
		expect(container.querySelector('[data-slot="passive-data-placeholder"]')).not.toBeNull();
		expect(container.textContent).not.toMatch(/Loading open orders|Failed to load open orders|No open orders/);
		const cancelAll = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Cancel all",
		);
		if (state.hasSnapshot) expect(cancelAll).toBeDefined();
		else expect(cancelAll).toBeUndefined();
		expect(cancelAll?.disabled ?? true).toBe(true);
		act(() => cancelAll?.click());
		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		Object.assign(mocks, { subscriptionStatus: "active", hasSnapshot: true, subscriptionIsStale: false });
		mocks.orders = [];
		act(() => root.render(<ReviewedOrders />));
		expect(container.querySelector('[data-slot="passive-data-placeholder"]')).toBeNull();
		expect(container.textContent).toContain("No open orders.");
	});

	it("renders the twelve production order fields and derives remaining metrics from sz", () => {
		act(() => root.render(<ReviewedOrders />));
		expect(container.textContent).toContain("1 order");
		expect(container.textContent).toContain("Type");
		expect(container.textContent).toContain("Direction");

		const headers = [...container.querySelectorAll("thead th")].map((cell) => cell.textContent?.trim() ?? "");
		expect(headers).toEqual([
			"Select all ordersTime",
			"Type",
			"Market",
			"Direction",
			"Size",
			"Original Size",
			"Order Value",
			"Price",
			"Reduce Only",
			"Trigger Condition",
			"TP/SL",
			"Actions",
		]);

		const cells = [...container.querySelectorAll("tbody tr td")].map((cell) => cell.textContent?.trim() ?? "");
		expect(cells).toHaveLength(12);
		expect(cells[1]).toContain("Limit");
		expect(cells[2]).toBe("ORCL");
		expect(cells[3]).toBe("Close Short");
		expect(cells[4]).toBe("2.000");
		expect(cells[5]).toBe("5.000");
		expect(cells[6]).toBe("$298.00");
		expect(cells[7]).toContain("149");
		expect(cells[8]).toBe("Yes");
		expect(cells[9]).toBe("-");
		expect(cells[10]).toBe("- / -");
		expect(container.querySelector<HTMLAnchorElement>('a[href="/portfolio"]')?.textContent).toBe("View all");
		expect(mocks.getOrderSideLabel).toHaveBeenCalledWith("B", true);
		expect(container.querySelector('button[aria-label="Edit xyz:ORCL order size"]')).not.toBeNull();
		expect(container.querySelector('button[aria-label="Edit xyz:ORCL trigger price"]')).toBeNull();
	});

	it("rewrites the order time in the active language without remounting the row", () => {
		const timeIn = (locale: string) =>
			formatDateTime(1_786_000_000_000, { locale, dateStyle: "short", timeStyle: "short" });
		act(() => root.render(<ReviewedOrders />));
		const row = container.querySelector("tbody tr");
		expect(row?.querySelector("td")?.textContent).toContain(timeIn("en"));

		act(() => i18n.loadAndActivate({ locale: "zh", messages: {} }));

		expect(container.querySelector("tbody tr")).toBe(row);
		expect(timeIn("zh")).not.toBe(timeIn("en"));
		expect(row?.querySelector("td")?.textContent).toContain(timeIn("zh"));
	});

	it("shows edit controls only for fields supported by the order capability", () => {
		mocks.orders = [{ ...order, cloid: "0x1234" } as OpenOrder];
		act(() => root.render(<ReviewedOrders />));

		expect(container.querySelector('button[aria-label="Edit xyz:ORCL order size"]')).toBeNull();
		expect(container.querySelector('button[aria-label="Edit xyz:ORCL trigger price"]')).toBeNull();
	});

	it("lets this terminal's own orders change price and sends the new price without a client order id", async () => {
		mocks.orders = [{ ...order, cloid: "0x0000000000000000000000000000abcd" } as OpenOrder];
		act(() => root.render(<ReviewedOrders />));
		expect(container.querySelector('button[aria-label="Edit xyz:ORCL order size"]')).not.toBeNull();
		const edit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order price"]');
		act(() => edit?.click());
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL order price"]');
		expect(input?.value).toBe("149.00");

		await act(async () => {
			if (!input) return;
			changeInput(input, "150.5");
			pressKey(input, "Enter");
			await Promise.resolve();
		});

		expect(mocks.modifyOrders).toHaveBeenCalledOnce();
		const params = mocks.modifyOrders.mock.calls[0]?.[0] as {
			modifies: { oid: number; order: { a: number; p: string; s: string; c?: string } }[];
		};
		expect(params.modifies).toEqual([{ oid: 42, order: expect.objectContaining({ a: 120_001, p: "150.5", s: "2" }) }]);
		expect(params.modifies[0]?.order).not.toHaveProperty("c");
		expect(getPendingTradingActionSnapshot().modifications[0]).toMatchObject({
			originalLimitPx: "149.00",
			expectedLimitPx: "150.5",
			expectedSize: null,
		});
	});

	it("changes the trigger price of a reduce-only stop with the always-place flag", async () => {
		mocks.markPriceLive = true;
		mocks.orders = [triggerOrder];
		act(() => root.render(<ReviewedOrders />));
		const edit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL trigger price"]');
		act(() => edit?.click());
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL trigger price"]');

		await act(async () => {
			if (!input) return;
			changeInput(input, "165");
			pressKey(input, "Enter");
			await Promise.resolve();
		});

		expect(mocks.modifyOrders).toHaveBeenCalledOnce();
		const params = mocks.modifyOrders.mock.calls[0]?.[0] as {
			a?: boolean;
			modifies: { oid: number; order: { r: boolean; t: unknown } }[];
		};
		expect(params.a).toBe(true);
		expect(params.modifies[0]?.order).toMatchObject({ r: true, t: { trigger: { triggerPx: "165", tpsl: "sl" } } });
		expect(getPendingTradingActionSnapshot().modifications[0]).toMatchObject({
			expectedTriggerPx: "165",
			expectedSize: null,
		});
	});

	it("refuses a trigger edit at the SDK boundary once the mark price is no longer live", async () => {
		mocks.markPriceLive = true;
		mocks.orders = [triggerOrder];
		const broadcast = vi.fn();
		mocks.modifyOrders.mockImplementation(async (params: unknown) => {
			mocks.markPriceLive = false;
			mocks.batchModifyGuard?.(params);
			broadcast(params);
			return { response: { data: { statuses: [{ resting: { oid: 42 } }] } } };
		});
		act(() => root.render(<ReviewedOrders />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL trigger price"]')?.click());
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL trigger price"]');

		await act(async () => {
			if (!input) return;
			changeInput(input, "165");
			pressKey(input, "Enter");
			await Promise.resolve();
		});

		expect(mocks.modifyOrders).toHaveBeenCalledOnce();
		expect(broadcast).not.toHaveBeenCalled();
	});

	it("formats HIP-3 order notional in its verified non-USDC quote token", () => {
		mocks.quoteSymbol = "USDT0";
		act(() => root.render(<ReviewedOrders />));

		const cells = [...container.querySelectorAll("tbody tr td")].map((cell) => cell.textContent?.trim() ?? "");
		expect(cells[6]).toBe("298.00 USDT0");
	});

	it("shows a trailing stop's activation, then its trigger and retracement, as the official terminal does", () => {
		mocks.orders = [
			{
				...triggerOrder,
				orderType: "Trailing Stop Market",
				side: "A",
				triggerCondition: "retracement 1%, activation above 160, best waiting",
				triggerPx: "0.0",
			} as unknown as OpenOrder,
		];
		act(() => root.render(<ReviewedOrders />));
		let cells = [...container.querySelectorAll("tbody tr td")].map((cell) => cell.textContent?.trim() ?? "");
		expect(cells[9]).toBe("Activation: $160 / Retracement: 1%");

		mocks.orders = [
			{
				...triggerOrder,
				orderType: "Trailing Stop Market",
				side: "A",
				triggerCondition: "retracement 1%, activation above 160, best 170",
				triggerPx: "168.3",
			} as unknown as OpenOrder,
		];
		act(() => root.render(<ReviewedOrders />));
		cells = [...container.querySelectorAll("tbody tr td")].map((cell) => cell.textContent?.trim() ?? "");
		expect(cells[9]).toMatch(/^Trigger: \$168\.30* \/ Retracement: 1%$/);
	});

	it("hides destructive bulk actions when the open-orders snapshot is empty", () => {
		mocks.orders = [];
		act(() => root.render(<ReviewedOrders />));

		expect(container.textContent).toContain("No open orders.");
		expect(container.textContent).toContain("Submitted limit and trigger orders will appear here.");
		expect(container.querySelectorAll("thead th")).toHaveLength(12);
		expect(container.querySelector('button[aria-label="Cancel selected orders"]')).toBeNull();
		expect(container.querySelector('button[aria-label="Cancel all orders"]')).toBeNull();
	});

	it("preserves raw input, focuses the editor, and cancels with Escape or an outside pointer", () => {
		act(() => root.render(<ReviewedOrders />));

		const sizeEdit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]');
		act(() => sizeEdit?.click());
		const sizeInput = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL order size"]');
		expect(sizeInput?.value).toBe("2.000");
		expect(document.activeElement).toBe(sizeInput);

		act(() => {
			if (sizeInput) changeInput(sizeInput, "1.");
		});
		expect(sizeInput?.value).toBe("1.");
		act(() => {
			if (sizeInput) pressKey(sizeInput, "Escape");
		});
		expect(container.querySelector('input[aria-label="Edit xyz:ORCL order size"]')).toBeNull();
		expect(document.activeElement).toBe(container.querySelector('button[aria-label="Edit xyz:ORCL order size"]'));

		const sizeEditAgain = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]');
		act(() => sizeEditAgain?.click());
		expect(container.querySelector('input[aria-label="Edit xyz:ORCL order size"]')).not.toBeNull();
		act(() => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
		expect(container.querySelector('input[aria-label="Edit xyz:ORCL order size"]')).toBeNull();
		expect(document.activeElement).toBe(container.querySelector('button[aria-label="Edit xyz:ORCL order size"]'));
		expect(mocks.modifyOrders).not.toHaveBeenCalled();
	});

	it("maps a blocked size plan to an i18n error without reaching the SDK", () => {
		act(() => root.render(<ReviewedOrders />));
		const edit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]');
		act(() => edit?.click());
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL order size"]');
		act(() => {
			if (!input) return;
			changeInput(input, "3.000");
			pressKey(input, "Enter");
		});

		expect(mocks.modifyOrders).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Size cannot exceed the order's remaining size.");
		expect(input?.getAttribute("aria-invalid")).toBe("true");
	});

	it("guards both SDK boundaries, locks duplicate submits, and waits for shared reconciliation", async () => {
		act(() => root.render(<ReviewedOrders />));
		const edit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]');
		act(() => edit?.click());
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL order size"]');

		await act(async () => {
			if (!input) return;
			changeInput(input, "1.000");
			pressKey(input, "Enter");
			pressKey(input, "Enter");
			await Promise.resolve();
		});

		expect(mocks.modifyOrders).toHaveBeenCalledOnce();
		const params = mocks.modifyOrders.mock.calls[0]?.[0] as {
			a?: boolean;
			modifies: { oid: number; order: { a: number; s: string } }[];
		};
		expect(params.a).toBeUndefined();
		expect(params.modifies).toEqual([
			expect.objectContaining({ oid: 42, order: expect.objectContaining({ a: 120_001, s: "1" }) }),
		]);
		expect(container.querySelector('input[aria-label="Edit xyz:ORCL order size"]')).toBeNull();
		expect(container.querySelector(LOADING_INDICATOR_SELECTOR)).toBeNull();
		expect(container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]')?.disabled).toBe(
			true,
		);
		const pendingModification = getPendingTradingActionSnapshot().modifications[0];
		expect(pendingModification?.phase).toBe("awaiting");
		expect(mocks.toastInfo).not.toHaveBeenCalled();
		expect(getOrderQueueItem(getPendingTradingActionToastId(pendingModification?.id ?? ""))).toMatchObject({
			owner: "0x1111111111111111111111111111111111111111",
			env: "Mainnet",
			status: "confirming",
		});
		expect(mocks.toastSuccess).not.toHaveBeenCalled();

		await act(async () => {
			if (pendingModification) getPendingTradingActionActions().resolveModification(pendingModification.id);
			await Promise.resolve();
		});

		expect(container.querySelector('input[aria-label="Edit xyz:ORCL order size"]')).toBeNull();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	it("returns focus to the order type filter when the edited order is no longer open", async () => {
		act(() => root.render(<ReviewedOrders />));
		const edit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]');
		act(() => edit?.click());
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL order size"]');

		await act(async () => {
			if (!input) return;
			changeInput(input, "1.000");
			pressKey(input, "Enter");
			await Promise.resolve();
		});

		const pendingModification = getPendingTradingActionSnapshot().modifications[0];
		mocks.orders = [];
		await act(async () => {
			if (pendingModification) getPendingTradingActionActions().resolveModification(pendingModification.id);
			root.render(<ReviewedOrders />);
			await Promise.resolve();
		});

		const orderTypeLabel = Array.from(container.querySelectorAll("label")).find(
			(candidate) => candidate.textContent === "Order type",
		);
		const orderTypeTrigger = orderTypeLabel?.parentElement?.querySelector<HTMLButtonElement>('[role="combobox"]');
		expect(container.querySelector('button[aria-label="Edit xyz:ORCL order size"]')).toBeNull();
		expect(document.activeElement).toBe(orderTypeTrigger);
		expect(mocks.toastInfo).not.toHaveBeenCalledWith("The modified order is no longer open.");
	});

	it("fails a queued SDK execution when the owner changes before its final guard", async () => {
		let releaseBoundary: (() => void) | undefined;
		const boundary = new Promise<void>((resolve) => {
			releaseBoundary = resolve;
		});
		mocks.modifyOrders.mockImplementationOnce(async (params: unknown) => {
			mocks.batchModifyGuard?.(params);
			await boundary;
			mocks.batchModifyGuard?.(params);
			return { response: { data: { statuses: [{ resting: { oid: 42 } }] } } };
		});
		act(() => root.render(<ReviewedOrders />));
		const edit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]');
		act(() => edit?.click());
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL order size"]');
		act(() => {
			if (!input) return;
			changeInput(input, "1.000");
			pressKey(input, "Enter");
		});
		expect(mocks.modifyOrders).toHaveBeenCalledOnce();

		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		act(() => root.render(<ReviewedOrders />));
		await act(async () => {
			releaseBoundary?.();
			await boundary;
			await Promise.resolve();
		});

		expect(mocks.toastInfo).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
		expect(getPendingTradingActionSnapshot().modifications).toHaveLength(0);
		expect(container.querySelector('input[aria-label="Edit xyz:ORCL order size"]')).toBeNull();
	});

	it("fails a queued SDK execution when the environment changes before its final guard", async () => {
		let releaseBoundary: (() => void) | undefined;
		const boundary = new Promise<void>((resolve) => {
			releaseBoundary = resolve;
		});
		mocks.modifyOrders.mockImplementationOnce(async (params: unknown) => {
			mocks.batchModifyGuard?.(params);
			await boundary;
			mocks.batchModifyGuard?.(params);
			return { response: { data: { statuses: [{ resting: { oid: 42 } }] } } };
		});
		act(() => root.render(<ReviewedOrders />));
		const edit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]');
		act(() => edit?.click());
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL order size"]');
		act(() => {
			if (!input) return;
			changeInput(input, "1.000");
			pressKey(input, "Enter");
		});

		mocks.env = "Testnet";
		act(() => root.render(<ReviewedOrders />));
		await act(async () => {
			releaseBoundary?.();
			await boundary;
			await Promise.resolve();
		});

		expect(mocks.toastInfo).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
		expect(getPendingTradingActionSnapshot().modifications).toHaveLength(0);
	});

	it("never reconciles an awaiting modification against another account's matching order", async () => {
		act(() => root.render(<ReviewedOrders />));
		const edit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]');
		act(() => edit?.click());
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL order size"]');

		await act(async () => {
			if (!input) return;
			changeInput(input, "1.000");
			pressKey(input, "Enter");
			await Promise.resolve();
		});
		const pendingModification = getPendingTradingActionSnapshot().modifications[0];
		expect(pendingModification?.phase).toBe("awaiting");
		expect(mocks.toastInfo).not.toHaveBeenCalled();
		expect(getOrderQueueItem(getPendingTradingActionToastId(pendingModification?.id ?? ""))).toMatchObject({
			owner: "0x1111111111111111111111111111111111111111",
			env: "Mainnet",
			status: "confirming",
		});

		mocks.address = "0x2222222222222222222222222222222222222222";
		mocks.clientKey = mocks.address;
		mocks.orders = [{ ...order, sz: "1.000" } as OpenOrder];
		await act(async () => {
			root.render(<ReviewedOrders />);
			await Promise.resolve();
		});

		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(mocks.toastInfo).not.toHaveBeenCalledWith("The modified order is no longer open.");
		expect(mocks.toastError).not.toHaveBeenCalled();
		expect(container.querySelector('input[aria-label="Edit xyz:ORCL order size"]')).toBeNull();
		expect(container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.disabled).toBe(false);
		expect(getPendingTradingActionSnapshot().modifications).toEqual([
			expect.objectContaining({
				id: pendingModification?.id,
				env: "Mainnet",
				owner: "0x1111111111111111111111111111111111111111",
				phase: "awaiting",
			}),
		]);
	});

	it("unlocks cancellation when shared reconciliation marks the writeback unconfirmed", async () => {
		act(() => root.render(<ReviewedOrders />));
		const edit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]');
		act(() => edit?.click());
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL order size"]');
		await act(async () => {
			if (!input) return;
			changeInput(input, "1.000");
			pressKey(input, "Enter");
			await Promise.resolve();
		});
		expect(container.querySelector('input[aria-label="Edit xyz:ORCL order size"]')).toBeNull();

		const pendingModification = getPendingTradingActionSnapshot().modifications[0];
		await act(async () => {
			if (pendingModification) {
				getPendingTradingActionActions().markModificationUnconfirmed(pendingModification.id);
			}
			await Promise.resolve();
		});

		expect(container.querySelector('input[aria-label="Edit xyz:ORCL order size"]')).toBeNull();
		expect(container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.disabled).toBe(false);
		expect(container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]')?.disabled).toBe(
			true,
		);
		expect(container.textContent).toContain("Refresh before retrying; cancellation remains available.");
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	it("retranslates an existing reconciliation error when the locale changes", async () => {
		act(() => root.render(<ReviewedOrders />));
		const edit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]');
		act(() => edit?.click());
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL order size"]');
		await act(async () => {
			if (!input) return;
			changeInput(input, "1.000");
			pressKey(input, "Enter");
			await Promise.resolve();
		});
		const pendingModification = getPendingTradingActionSnapshot().modifications[0];
		await act(async () => {
			if (pendingModification) {
				getPendingTradingActionActions().markModificationUnconfirmed(pendingModification.id);
			}
			await Promise.resolve();
		});

		const alert = container.querySelector('[role="alert"]');
		expect(alert?.textContent).toContain(MODIFICATION_UNCONFIRMED_MESSAGE);

		act(() => {
			i18n.loadAndActivate({ locale: "ar", messages: arabicMessages });
		});

		expect(alert?.textContent).toContain(MODIFICATION_UNCONFIRMED_MESSAGE_AR);
		expect(alert?.textContent).not.toContain(MODIFICATION_UNCONFIRMED_MESSAGE);
		expect(mocks.modifyOrders).toHaveBeenCalledOnce();
	});

	it("releases a modification when a transport-shaped error happens before the SDK boundary", async () => {
		mocks.modifyOrders.mockImplementationOnce(async (params: unknown) => {
			mocks.batchModifyGuard?.(params);
			throw new HttpRequestError({ detail: "Legal status unavailable" });
		});
		act(() => root.render(<ReviewedOrders />));
		const edit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]');
		act(() => edit?.click());
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL order size"]');

		await act(async () => {
			if (!input) return;
			changeInput(input, "1.000");
			pressKey(input, "Enter");
			await Promise.resolve();
		});

		expect(getPendingTradingActionSnapshot().modifications).toHaveLength(0);
		expect(mocks.toastWarning).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
		expect(queueItems.at(-1)).toMatchObject({ status: "failed" });
	});

	it("invalidates the asynchronous execution when the component unmounts", async () => {
		let releaseBoundary: (() => void) | undefined;
		const boundary = new Promise<void>((resolve) => {
			releaseBoundary = resolve;
		});
		mocks.modifyOrders.mockImplementationOnce(async (params: unknown) => {
			mocks.batchModifyGuard?.(params);
			await boundary;
			mocks.batchModifyGuard?.(params);
			return { response: { data: { statuses: [{ resting: { oid: 42 } }] } } };
		});
		act(() => root.render(<ReviewedOrders />));
		const edit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]');
		act(() => edit?.click());
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL order size"]');
		act(() => {
			if (!input) return;
			changeInput(input, "1.000");
			pressKey(input, "Enter");
		});
		act(() => root.unmount());

		await act(async () => {
			releaseBoundary?.();
			await boundary;
			await Promise.resolve();
		});

		expect(mocks.toastInfo).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		root = createI18nRoot(container);
	});

	it("opens the warning before submitting and rejects a synchronous double confirmation", async () => {
		act(() => root.render(<ReviewedOrders />));

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
		expect(document.body.textContent).not.toContain("Cancel All Orders");
		expect(document.body.textContent).not.toContain("Canceling");
		expect(document.body.querySelector("[aria-busy]")).toBeNull();
		expect(requestButton?.disabled).toBe(true);
		expect(requestButton?.textContent).toBe("Cancel all");

		const callbacks = mocks.cancelOrders.mock.calls[0]?.[1] as
			| { onSuccess: (response: unknown) => void; onSettled: () => void }
			| undefined;
		await act(async () => {
			callbacks?.onSuccess({ status: "ok", response: { type: "cancel", data: { statuses: ["success"] } } });
			await Promise.resolve();
		});
		expect(document.body.textContent).not.toContain("Cancel All Orders");
		expect(getPendingTradingActionSnapshot().orderCancellations[0]?.phase).toBe("awaiting");
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(queueItems.at(-1)).toMatchObject({ status: "confirming" });
		expect(mocks.toastError).not.toHaveBeenCalled();
		expect(mocks.toastWarning).not.toHaveBeenCalled();
	});

	it("keeps row cancellation on the existing immediate path", () => {
		act(() => root.render(<ReviewedOrders />));

		const cancelRow = container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]');
		act(() => cancelRow?.click());

		expect(document.body.textContent).not.toContain("Cancel All Orders");
		expect(mocks.cancelOrders).toHaveBeenCalledWith(
			{ cancels: [{ a: 120_001, o: 42 }] },
			expect.objectContaining({ onSettled: expect.any(Function) }),
		);
	});

	it("does not let an old account cancellation settle a new account interaction", async () => {
		act(() => root.render(<ReviewedOrders />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.click());
		const accountACallbacks = mocks.cancelOrders.mock.calls[0]?.[1] as
			| { onSuccess: (response: unknown) => void }
			| undefined;

		mocks.address = "0x2222222222222222222222222222222222222222";
		mocks.clientKey = mocks.address;
		await act(async () => {
			root.render(<ReviewedOrders />);
			await Promise.resolve();
		});
		const accountBCancel = container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]');
		expect(accountBCancel?.disabled).toBe(false);
		act(() => accountBCancel?.click());
		expect(mocks.cancelOrders).toHaveBeenCalledTimes(2);
		expect(container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.disabled).toBe(true);

		await act(async () => {
			accountACallbacks?.onSuccess({
				status: "ok",
				response: { type: "cancel", data: { statuses: ["success"] } },
			});
			await Promise.resolve();
		});

		expect(container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.disabled).toBe(true);
	});

	it("does not show a late cancellation rejection from the previous account", async () => {
		act(() => root.render(<ReviewedOrders />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.click());
		const feedbackId = queueItems.at(-1)?.id;
		expect(getOrderQueueItem(feedbackId)?.status).toBe("pending");
		const accountACallbacks = mocks.cancelOrders.mock.calls[0]?.[1] as { onError: (cause: Error) => void } | undefined;

		mocks.address = "0x2222222222222222222222222222222222222222";
		mocks.clientKey = mocks.address;
		act(() => root.render(<ReviewedOrders />));

		await act(async () => {
			accountACallbacks?.onError(cancelRejection("Account A cancellation failed"));
			await Promise.resolve();
		});

		expect(mocks.cancelError?.message).toBe("cancel 0: Account A cancellation failed");
		expect(container.textContent).not.toContain("Account A cancellation failed");
		expect(getOrderQueueItem(feedbackId)).toMatchObject({
			owner: "0x1111111111111111111111111111111111111111",
			status: "failed",
			error: { kind: "exchange-error", entries: [{ index: 0, text: "Account A cancellation failed" }] },
		});
	});

	it("shows a known cancellation rejection translated and an unrecognised error as the fallback", async () => {
		act(() => root.render(<ReviewedOrders />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.click());
		const firstCallbacks = mocks.cancelOrders.mock.calls[0]?.[1] as { onError: (cause: Error) => void } | undefined;
		await act(async () => {
			firstCallbacks?.onError(cancelRejection("Order was never placed, already canceled, or filled."));
			await Promise.resolve();
		});
		expect(container.textContent).toContain("The order was never placed, was already canceled, or has filled.");
		expect(container.textContent).not.toContain("Order was never placed, already canceled, or filled.");

		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.click());
		const secondCallbacks = mocks.cancelOrders.mock.calls[1]?.[1] as { onError: (cause: Error) => void } | undefined;
		await act(async () => {
			secondCallbacks?.onError(new Error("Cancellation request no longer matches"));
			await Promise.resolve();
		});
		expect(container.textContent).toContain("Failed to cancel order.");
		expect(container.textContent).not.toContain("Cancellation request no longer matches");
	});

	it("cancels an outcome order with its protocol action asset and keeps modification unavailable", () => {
		mocks.orders = [outcomeOrder];
		act(() => root.render(<ReviewedOrders />));

		expect(container.querySelector('button[aria-label="Edit #10 order size"]')).toBeNull();
		expect(container.querySelector('button[aria-label="Edit #10 trigger price"]')).toBeNull();
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.click());

		expect(mocks.cancelOrders).toHaveBeenCalledWith(
			{ cancels: [{ a: 100_000_010, o: 43 }] },
			expect.objectContaining({ onSettled: expect.any(Function) }),
		);
	});

	it("cancels a mixed standard and outcome selection with exact asset IDs", () => {
		mocks.orders = [order, outcomeOrder];
		act(() => root.render(<ReviewedOrders />));

		act(() => {
			container.querySelector<HTMLButtonElement>('tbody [aria-label="Select order xyz:ORCL"]')?.click();
			container.querySelector<HTMLButtonElement>('tbody [aria-label="Select order #10"]')?.click();
		});
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel selected orders"]')?.click());

		expect(mocks.cancelOrders).toHaveBeenCalledWith(
			{
				cancels: [
					{ a: 120_001, o: 42 },
					{ a: 100_000_010, o: 43 },
				],
			},
			expect.objectContaining({ onSettled: expect.any(Function) }),
		);
	});

	it("cancels all standard and outcome orders in one confirmed batch", () => {
		mocks.orders = [order, outcomeOrder];
		act(() => root.render(<ReviewedOrders />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel all orders"]')?.click());
		const confirmButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel All",
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

	it("fails closed for a malformed outcome coin instead of using a market fallback", () => {
		mocks.orders = [{ ...outcomeOrder, coin: "#12" } as OpenOrder];
		act(() => root.render(<ReviewedOrders />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Some order markets are unavailable");
	});

	it("clears selection when filters change and never cancels a hidden order", async () => {
		mocks.orders = [
			triggerOrder,
			{
				...order,
				limitPx: "155.00",
				oid: 43,
			} as OpenOrder,
		];
		act(() => root.render(<ReviewedOrders />));

		const triggerOrderCheckbox = container.querySelector<HTMLButtonElement>(
			'tbody [aria-label="Select order xyz:ORCL"]',
		);
		act(() => triggerOrderCheckbox?.click());
		expect(container.querySelector('button[aria-label="Cancel selected orders"]')).not.toBeNull();

		await selectOption(container, "Order type", "Limit");
		expect(container.querySelector('button[aria-label="Cancel selected orders"]')).toBeNull();
		expect(mocks.cancelOrders).not.toHaveBeenCalled();

		await selectOption(container, "Order type", "Trigger");
		expect(
			container
				.querySelector<HTMLButtonElement>('tbody [aria-label="Select order xyz:ORCL"]')
				?.getAttribute("aria-checked"),
		).toBe("false");
	});

	it("discards selected orders across an A to B to A session round trip", () => {
		act(() => root.render(<ReviewedOrders />));
		const accountAOrder = container.querySelector<HTMLButtonElement>('tbody [aria-label="Select order xyz:ORCL"]');
		act(() => accountAOrder?.click());
		expect(accountAOrder?.getAttribute("aria-checked")).toBe("true");

		mocks.address = "0x2222222222222222222222222222222222222222";
		mocks.clientKey = mocks.address;
		mocks.orders = [{ ...order, coin: "BTC", oid: 43 } as OpenOrder];
		act(() => root.render(<ReviewedOrders />));

		mocks.address = "0x1111111111111111111111111111111111111111";
		mocks.clientKey = mocks.address;
		mocks.orders = [order];
		act(() => root.render(<ReviewedOrders />));

		expect(
			container
				.querySelector<HTMLButtonElement>('tbody [aria-label="Select order xyz:ORCL"]')
				?.getAttribute("aria-checked"),
		).toBe("false");
		expect(container.querySelector('button[aria-label="Cancel selected orders"]')).toBeNull();
	});

	it("ignores an old account's cancellation callback without clearing the new account selection", async () => {
		act(() => root.render(<ReviewedOrders />));
		act(() => container.querySelector<HTMLButtonElement>('tbody [aria-label="Select order xyz:ORCL"]')?.click());
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel selected orders"]')?.click());
		const callbacks = mocks.cancelOrders.mock.calls[0]?.[1] as
			| { onSuccess: (response: unknown) => void; onSettled: () => void }
			| undefined;

		mocks.address = "0x2222222222222222222222222222222222222222";
		mocks.clientKey = mocks.address;
		mocks.orders = [{ ...order, coin: "BTC", oid: 43 } as OpenOrder];
		act(() => root.render(<ReviewedOrders />));
		const accountBOrder = container.querySelector<HTMLButtonElement>('tbody [aria-label="Select order BTC"]');
		act(() => accountBOrder?.click());
		expect(accountBOrder?.getAttribute("aria-checked")).toBe("true");

		await act(async () => {
			callbacks?.onSuccess({ status: "ok", response: { type: "cancel", data: { statuses: ["success"] } } });
			await Promise.resolve();
		});
		expect(accountBOrder?.getAttribute("aria-checked")).toBe("true");
	});

	it("fails row cancellation closed while the open-orders snapshot is stale", () => {
		mocks.subscriptionIsStale = true;
		act(() => root.render(<ReviewedOrders />));

		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(container.querySelector('[data-slot="passive-data-placeholder"]')).not.toBeNull();
		expect(container.textContent).not.toContain("Open orders are refreshing. Wait for live data and try again.");
	});

	it("fails selected-order cancellation closed while the open-orders snapshot is stale", () => {
		mocks.subscriptionIsStale = true;
		act(() => root.render(<ReviewedOrders />));
		act(() => container.querySelector<HTMLButtonElement>('tbody [aria-label="Select order xyz:ORCL"]')?.click());

		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel selected orders"]')?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(container.querySelector('[data-slot="passive-data-placeholder"]')).not.toBeNull();
		expect(container.textContent).not.toContain("Open orders are refreshing. Wait for live data and try again.");
	});

	it("fails row cancellation closed when the snapshot owner does not match the trading client", () => {
		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		act(() => root.render(<ReviewedOrders />));

		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(container.textContent).toContain(
			"The trading account or network changed. Reopen the confirmation and try again.",
		);
	});

	it("revalidates the cancel session at the SDK boundary", () => {
		act(() => root.render(<ReviewedOrders />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.click());
		const params = mocks.cancelOrders.mock.calls[0]?.[0];
		const queuedGuard = mocks.cancelGuard;
		expect(queuedGuard).toBeTypeOf("function");

		mocks.address = "0x2222222222222222222222222222222222222222";
		mocks.clientKey = mocks.address;
		act(() => root.render(<ReviewedOrders />));

		expect(() => queuedGuard?.(params)).toThrow("Open orders changed. Reopen the confirmation and try again.");
	});

	it("does not start cancel all while a row cancellation is unresolved", () => {
		act(() => root.render(<ReviewedOrders />));

		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.click());
		const cancelAll = container.querySelector<HTMLButtonElement>('button[aria-label="Cancel all orders"]');

		expect(cancelAll?.disabled).toBe(true);
		act(() => cancelAll?.click());
		expect(mocks.cancelOrders).toHaveBeenCalledOnce();
		expect(document.body.textContent).not.toContain("Cancel All Orders");
	});

	it("rejects the confirmation when the trading session changes after the dialog opens", () => {
		act(() => root.render(<ReviewedOrders />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel all orders"]')?.click());

		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		act(() => root.render(<ReviewedOrders />));
		const confirmButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel All",
		);
		act(() => confirmButton?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(document.body.textContent).not.toContain("Cancel All Orders");
		expect(document.body.textContent).not.toContain(
			"The trading account or network changed. Reopen the confirmation and try again.",
		);
	});

	it("does not include orders that appeared after the user opened the confirmation", () => {
		act(() => root.render(<ReviewedOrders />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel all orders"]')?.click());

		mocks.orders = [order, { ...order, coin: "BTC", oid: 43 } as OpenOrder];
		act(() => root.render(<ReviewedOrders />));
		const confirmButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel All",
		);
		act(() => confirmButton?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain("Open orders changed. Reopen the confirmation and try again.");
		expect(document.body.textContent).not.toContain("Cancel All Orders");
		expect(mocks.toastWarning).toHaveBeenCalledWith("Open orders changed. Reopen the confirmation and try again.");
	});

	it("fails closed when any order market cannot be mapped", () => {
		mocks.assetId = undefined;
		act(() => root.render(<ReviewedOrders />));

		const requestButton = container.querySelector<HTMLButtonElement>('button[aria-label="Cancel all orders"]');
		act(() => requestButton?.click());
		const confirmButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel All",
		);
		act(() => confirmButton?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain("Some order markets are unavailable");
		expect(document.body.textContent).not.toContain("Cancel All Orders");
		expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("Some order markets are unavailable"));
	});
});
