/** @vitest-environment jsdom */

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { HttpRequestError } from "@nktkas/hyperliquid";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileOrdersTab } from "@/components/trade/mobile/mobile-orders-tab";
import type { OpenOrder } from "@/lib/trade/open-orders";
import {
	getPendingTradingActionActions,
	getPendingTradingActionSnapshot,
	getPendingTradingActionToastId,
} from "@/stores/use-pending-trading-action-store";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111",
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
	toastWarning: vi.fn(),
}));

const triggerOrder = {
	children: [],
	cloid: null,
	coin: "xyz:ORCL",
	isPositionTpsl: false,
	isTrigger: false,
	limitPx: "170",
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
} as OpenOrder;

const unsafeTriggerOrder = {
	...triggerOrder,
	isTrigger: true,
	orderType: "Stop Market",
	tif: null,
	triggerCondition: "Price above 170",
	triggerPx: "170",
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

vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => vi.fn(),
}));

vi.mock("@/hooks/trade/use-order-display-labels", () => ({
	useOrderDisplayLabels: () => ({
		getFullOrderTypeLabel: (order: OpenOrder) => `${order.orderType}${order.reduceOnly ? " · Reduce Only" : ""}`,
		getOrderSideLabel: () => "Close Short",
		getOrderTypeLabel: (orderType: OpenOrder["orderType"]) => orderType,
		getTriggerConditionLabel: (condition: string) => condition,
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
			return { mutateAsync: mocks.modifyOrders, error: null, reset: mocks.resetModifyError };
		}
		return { mutateAsync: mocks.cancelOrders, error: null, reset: mocks.resetCancelError };
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
		warning: mocks.toastWarning,
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
		i18n.loadAndActivate({ locale: "en", messages: {} });
		getPendingTradingActionActions().reset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		mocks.address = "0x1111111111111111111111111111111111111111";
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
		mocks.toastWarning.mockReset();
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
		expect(document.body.textContent).toContain("Limit · Reduce Only");
		expect(size?.value).toBe("2.000");
		expect(trigger).toBeNull();
		expect(size?.className).toContain("text-base");
		expect(size?.className).not.toContain("text-sm");

		act(() => {
			if (size) changeInput(size, "1.");
		});
		expect(size?.value).toBe("1.");
		const submit = document.body.querySelector<HTMLButtonElement>('button[type="submit"]');
		expect(submit?.className).toContain("min-h-11");
		expect(submit?.className).toContain("text-market-close-on-control");
		expect(submit?.className).not.toContain("text-market-close-control-text");
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

	it("submits one complete guarded payload and waits for shared reconciliation", async () => {
		const { size } = openEditor();
		await act(async () => {
			if (!size) return;
			changeInput(size, "1.500");
			pressKey(size, "Enter");
			pressKey(size, "Enter");
			await Promise.resolve();
		});

		expect(mocks.modifyOrders).toHaveBeenCalledOnce();
		expect(mocks.modifyOrders).toHaveBeenCalledWith({
			modifies: [
				{
					oid: 42,
					order: {
						a: 120_001,
						b: true,
						p: "170",
						s: "1.5",
						r: true,
						t: { limit: { tif: "Gtc" } },
					},
				},
			],
		});
		const pendingModification = getPendingTradingActionSnapshot().modifications[0];
		expect(pendingModification?.phase).toBe("awaiting");
		expect(mocks.toastInfo).toHaveBeenCalledWith("Order modification submitted. Waiting for the open-orders update.", {
			id: getPendingTradingActionToastId(pendingModification?.id ?? ""),
		});
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(document.body.querySelector('input[aria-label="Size"]')).toBeNull();
		expect(document.body.textContent).not.toContain("Modifying");
		expect(document.body.textContent).not.toContain("Waiting for confirmation");
		expect(findButton("Modify Order", container)?.disabled).toBe(true);

		await act(async () => {
			if (pendingModification) getPendingTradingActionActions().resolveModification(pendingModification.id);
			await Promise.resolve();
		});
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
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

	it("does not claim success when shared reconciliation marks the writeback unconfirmed", async () => {
		const { size } = openEditor();
		await act(async () => {
			if (!size) return;
			changeInput(size, "1.500");
			pressKey(size, "Enter");
			await Promise.resolve();
		});
		const pendingModification = getPendingTradingActionSnapshot().modifications[0];
		await act(async () => {
			if (pendingModification) {
				getPendingTradingActionActions().markModificationUnconfirmed(pendingModification.id);
			}
			await Promise.resolve();
		});

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

	it("retranslates an existing reconciliation error when the locale changes", async () => {
		const { size } = openEditor();
		await act(async () => {
			if (!size) return;
			changeInput(size, "1.500");
			pressKey(size, "Enter");
			await Promise.resolve();
		});
		const pendingModification = getPendingTradingActionSnapshot().modifications[0];
		await act(async () => {
			if (pendingModification) {
				getPendingTradingActionActions().markModificationUnconfirmed(pendingModification.id);
			}
			await Promise.resolve();
		});

		const alert = document.body.querySelector('[role="alert"]');
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
		const { size } = openEditor();

		await act(async () => {
			if (!size) return;
			changeInput(size, "1.500");
			pressKey(size, "Enter");
			await Promise.resolve();
		});

		expect(getPendingTradingActionSnapshot().modifications).toHaveLength(0);
		expect(mocks.toastWarning).not.toHaveBeenCalled();
		expect(mocks.toastError).toHaveBeenCalledOnce();
	});

	it("keeps an awaiting modification isolated to its original account", async () => {
		const { size } = openEditor();
		await act(async () => {
			if (!size) return;
			changeInput(size, "1.500");
			pressKey(size, "Enter");
			await Promise.resolve();
		});

		mocks.address = "0x2222222222222222222222222222222222222222";
		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		mocks.orders = [triggerOrder];
		await act(async () => {
			root.render(<MobileOrdersTab scrollMode="page" />);
			await Promise.resolve();
		});

		const sessionChanged = "The trading account or network changed. Reopen the editor and try again.";
		expect(mocks.toastError).not.toHaveBeenCalled();
		expect(mocks.toastInfo).not.toHaveBeenCalledWith("The modified order is no longer open.");
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(container.textContent).not.toContain(sessionChanged);
		expect(document.body.querySelector('input[aria-label="Size"]')).toBeNull();
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Expand ORCL order details"]')?.click());
		expect(findButton("Cancel", container)?.disabled).toBe(false);
		expect(getPendingTradingActionSnapshot().modifications).toEqual([
			expect.objectContaining({
				env: "Mainnet",
				owner: "0x1111111111111111111111111111111111111111",
				phase: "awaiting",
			}),
		]);
	});

	it("explains unsupported modifications on touch without submitting an order", () => {
		mocks.orders = [unsafeTriggerOrder];
		act(() => root.render(<MobileOrdersTab scrollMode="page" />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Expand ORCL order details"]')?.click());
		const modify = findButton("Modify Order", container);
		expect(modify?.disabled).toBe(false);
		expect(modify?.getAttribute("aria-disabled")).toBe("true");
		expect(modify?.title).toBe("This order type cannot be modified safely. Cancel and replace it instead.");
		act(() => modify?.click());
		expect(mocks.toastInfo).toHaveBeenCalledWith(
			"This order type cannot be modified safely. Cancel and replace it instead.",
		);
		expect(mocks.modifyOrders).not.toHaveBeenCalled();
	});
});
