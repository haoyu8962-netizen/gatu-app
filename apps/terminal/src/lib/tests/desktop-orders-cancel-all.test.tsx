/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OrdersTab } from "@/components/trade/positions/orders-tab";
import type { OpenOrder } from "@/lib/trade/open-orders";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111",
	assetId: 120_001 as number | undefined,
	batchModifyGuard: undefined as ((params: unknown) => void) | undefined,
	cancelGuard: undefined as ((params: unknown) => void) | undefined,
	cancelOrders: vi.fn(),
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	getOrderSideLabel: vi.fn(() => "Close Short"),
	markPx: "160",
	modifyOrders: vi.fn(),
	orders: [] as OpenOrder[],
	quoteSymbol: "USDC" as string,
	resetCancelError: vi.fn(),
	resetModifyError: vi.fn(),
	setSide: vi.fn(),
	subscriptionIsStale: false,
	subscriptionStatus: "active" as "active" | "error" | "idle" | "subscribing",
	toastError: vi.fn(),
	toastInfo: vi.fn(),
	toastSuccess: vi.fn(),
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
		getOrderSideLabel: mocks.getOrderSideLabel,
		getOrderTypeLabel: () => "Stop Market",
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
			return { mutateAsync: mocks.modifyOrders, error: null, reset: mocks.resetModifyError };
		}
		mocks.cancelGuard = options?.executionGuard;
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
						quoteToken: { displayName: mocks.quoteSymbol, name: mocks.quoteSymbol },
						szDecimals: 3,
					},
		getSzDecimals: () => 3,
		isLoading: false,
	}),
	useMarketsInfo: () => ({ getMarketInfo: () => ({ markPx: mocks.markPx }) }),
	useSubscription: () => ({
		data: { orders: mocks.orders },
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
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		mocks.address = "0x1111111111111111111111111111111111111111";
		mocks.assetId = 120_001;
		mocks.batchModifyGuard = undefined;
		mocks.cancelGuard = undefined;
		mocks.clientKey = "0x1111111111111111111111111111111111111111";
		mocks.env = "Mainnet";
		mocks.markPx = "160";
		mocks.orders = [order];
		mocks.quoteSymbol = "USDC";
		mocks.subscriptionIsStale = false;
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
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("renders the twelve production order fields and derives remaining metrics from sz", () => {
		act(() => root.render(<OrdersTab />));
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
		expect(cells[1]).toContain("Stop");
		expect(cells[2]).toBe("ORCL");
		expect(cells[3]).toBe("Close Short");
		expect(cells[4]).toBe("2.000");
		expect(cells[5]).toBe("5.000");
		expect(cells[6]).toBe("$298.00");
		expect(cells[7]).toBe("Market");
		expect(cells[8]).toBe("Yes");
		expect(cells[9]).toContain("≤ 149.00");
		expect(cells[9]).toContain("Distance to mark -6.9%");
		expect(cells[10]).toBe("- / -");
		expect(container.querySelector<HTMLAnchorElement>('a[href="/portfolio"]')?.textContent).toBe("View all");
		expect(mocks.getOrderSideLabel).toHaveBeenCalledWith("B", true);
		expect(container.querySelector('button[aria-label="Edit xyz:ORCL order size"]')).not.toBeNull();
		expect(container.querySelector('button[aria-label="Edit xyz:ORCL trigger price"]')).not.toBeNull();
	});

	it("shows edit controls only for fields supported by the order capability", () => {
		mocks.orders = [{ ...order, cloid: "0x1234" } as OpenOrder];
		act(() => root.render(<OrdersTab />));

		expect(container.querySelector('button[aria-label="Edit xyz:ORCL order size"]')).toBeNull();
		expect(container.querySelector('button[aria-label="Edit xyz:ORCL trigger price"]')).toBeNull();
	});

	it("formats HIP-3 order notional in its verified non-USDC quote token", () => {
		mocks.quoteSymbol = "USDT0";
		act(() => root.render(<OrdersTab />));

		const cells = [...container.querySelectorAll("tbody tr td")].map((cell) => cell.textContent?.trim() ?? "");
		expect(cells[6]).toBe("298.00 USDT0");
	});

	it("hides destructive bulk actions when the open-orders snapshot is empty", () => {
		mocks.orders = [];
		act(() => root.render(<OrdersTab />));

		expect(container.textContent).toContain("No open orders.");
		expect(container.textContent).toContain("Submitted limit and trigger orders will appear here.");
		expect(container.querySelectorAll("thead th")).toHaveLength(12);
		expect(container.querySelector('button[aria-label="Cancel selected orders"]')).toBeNull();
		expect(container.querySelector('button[aria-label="Cancel all orders"]')).toBeNull();
	});

	it("preserves raw input, focuses the editor, and cancels with Escape or an outside pointer", () => {
		act(() => root.render(<OrdersTab />));

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

		const triggerEdit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL trigger price"]');
		act(() => triggerEdit?.click());
		expect(container.querySelector('input[aria-label="Edit xyz:ORCL trigger price"]')).not.toBeNull();
		act(() => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
		expect(container.querySelector('input[aria-label="Edit xyz:ORCL trigger price"]')).toBeNull();
		expect(document.activeElement).toBe(container.querySelector('button[aria-label="Edit xyz:ORCL trigger price"]'));
		expect(mocks.modifyOrders).not.toHaveBeenCalled();
	});

	it("maps a blocked size plan to an i18n error without reaching the SDK", () => {
		act(() => root.render(<OrdersTab />));
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

	it("guards both SDK boundaries, locks duplicate submits, and waits for the subscription writeback", async () => {
		act(() => root.render(<OrdersTab />));
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
			a: boolean;
			modifies: { oid: number; order: { a: number; s: string } }[];
		};
		expect(params.a).toBe(true);
		expect(params.modifies).toEqual([
			expect.objectContaining({ oid: 42, order: expect.objectContaining({ a: 120_001, s: "1" }) }),
		]);
		expect(input?.disabled).toBe(true);
		expect(mocks.toastInfo).toHaveBeenCalledWith("Order modification submitted. Waiting for the open-orders update.");
		expect(mocks.toastSuccess).not.toHaveBeenCalled();

		mocks.orders = [{ ...order, sz: "1.000" } as OpenOrder];
		await act(async () => {
			root.render(<OrdersTab />);
			await Promise.resolve();
		});

		expect(container.querySelector('input[aria-label="Edit xyz:ORCL order size"]')).toBeNull();
		expect(mocks.toastSuccess).toHaveBeenCalledWith("Order modification confirmed.");
	});

	it("returns focus to the order type filter when the edited order is no longer open", async () => {
		act(() => root.render(<OrdersTab />));
		const edit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]');
		act(() => edit?.click());
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL order size"]');

		await act(async () => {
			if (!input) return;
			changeInput(input, "1.000");
			pressKey(input, "Enter");
			await Promise.resolve();
		});

		mocks.orders = [];
		await act(async () => {
			root.render(<OrdersTab />);
			await Promise.resolve();
		});

		const orderTypeLabel = Array.from(container.querySelectorAll("label")).find(
			(candidate) => candidate.textContent === "Order type",
		);
		const orderTypeTrigger = orderTypeLabel?.parentElement?.querySelector<HTMLButtonElement>('[role="combobox"]');
		expect(container.querySelector('button[aria-label="Edit xyz:ORCL order size"]')).toBeNull();
		expect(document.activeElement).toBe(orderTypeTrigger);
		expect(mocks.toastInfo).toHaveBeenCalledWith("The modified order is no longer open.");
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
		act(() => root.render(<OrdersTab />));
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
		act(() => root.render(<OrdersTab />));
		await act(async () => {
			releaseBoundary?.();
			await boundary;
			await Promise.resolve();
		});

		expect(mocks.toastInfo).not.toHaveBeenCalled();
		expect(mocks.toastError).toHaveBeenCalledWith(
			"The trading account or network changed. Reopen the editor and try again.",
		);
		expect(input?.disabled).toBe(false);
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
		act(() => root.render(<OrdersTab />));
		const edit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]');
		act(() => edit?.click());
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL order size"]');
		act(() => {
			if (!input) return;
			changeInput(input, "1.000");
			pressKey(input, "Enter");
		});

		mocks.env = "Testnet";
		act(() => root.render(<OrdersTab />));
		await act(async () => {
			releaseBoundary?.();
			await boundary;
			await Promise.resolve();
		});

		expect(mocks.toastInfo).not.toHaveBeenCalled();
		expect(mocks.toastError).toHaveBeenCalledWith(
			"The trading account or network changed. Reopen the editor and try again.",
		);
	});

	it("never reconciles an awaiting modification against another account's matching order", async () => {
		act(() => root.render(<OrdersTab />));
		const edit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]');
		act(() => edit?.click());
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL order size"]');

		await act(async () => {
			if (!input) return;
			changeInput(input, "1.000");
			pressKey(input, "Enter");
			await Promise.resolve();
		});
		expect(mocks.toastInfo).toHaveBeenCalledWith("Order modification submitted. Waiting for the open-orders update.");

		mocks.address = "0x2222222222222222222222222222222222222222";
		mocks.clientKey = mocks.address;
		mocks.orders = [{ ...order, sz: "1.000" } as OpenOrder];
		await act(async () => {
			root.render(<OrdersTab />);
			await Promise.resolve();
		});

		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(mocks.toastInfo).not.toHaveBeenCalledWith("The modified order is no longer open.");
		expect(mocks.toastError).toHaveBeenCalledWith(
			"The trading account or network changed. Reopen the editor and try again.",
		);
		expect(container.textContent).toContain("The trading account or network changed. Reopen the editor and try again.");
	});

	it("unlocks cancellation after an unconfirmed writeback timeout without claiming success", async () => {
		vi.useFakeTimers();
		try {
			act(() => root.render(<OrdersTab />));
			const edit = container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]');
			act(() => edit?.click());
			const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit xyz:ORCL order size"]');
			await act(async () => {
				if (!input) return;
				changeInput(input, "1.000");
				pressKey(input, "Enter");
				await Promise.resolve();
			});
			expect(input?.disabled).toBe(true);

			act(() => vi.advanceTimersByTime(15_000));

			expect(container.querySelector('input[aria-label="Edit xyz:ORCL order size"]')).toBeNull();
			expect(container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.disabled).toBe(false);
			expect(
				container.querySelector<HTMLButtonElement>('button[aria-label="Edit xyz:ORCL order size"]')?.disabled,
			).toBe(true);
			expect(container.textContent).toContain("Refresh before retrying; cancellation remains available.");
			expect(mocks.toastSuccess).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
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
		act(() => root.render(<OrdersTab />));
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

	it("clears selection when filters change and never cancels a hidden order", async () => {
		mocks.orders = [
			order,
			{
				...order,
				isTrigger: false,
				limitPx: "155.00",
				oid: 43,
				orderType: "Limit",
				triggerCondition: "N/A",
				triggerPx: "0",
			} as OpenOrder,
		];
		act(() => root.render(<OrdersTab />));

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
		act(() => root.render(<OrdersTab />));
		const accountAOrder = container.querySelector<HTMLButtonElement>('tbody [aria-label="Select order xyz:ORCL"]');
		act(() => accountAOrder?.click());
		expect(accountAOrder?.getAttribute("aria-checked")).toBe("true");

		mocks.address = "0x2222222222222222222222222222222222222222";
		mocks.clientKey = mocks.address;
		mocks.orders = [{ ...order, coin: "BTC", oid: 43 } as OpenOrder];
		act(() => root.render(<OrdersTab />));

		mocks.address = "0x1111111111111111111111111111111111111111";
		mocks.clientKey = mocks.address;
		mocks.orders = [order];
		act(() => root.render(<OrdersTab />));

		expect(
			container
				.querySelector<HTMLButtonElement>('tbody [aria-label="Select order xyz:ORCL"]')
				?.getAttribute("aria-checked"),
		).toBe("false");
		expect(container.querySelector('button[aria-label="Cancel selected orders"]')).toBeNull();
	});

	it("ignores an old account's cancellation callback without clearing the new account selection", () => {
		act(() => root.render(<OrdersTab />));
		act(() => container.querySelector<HTMLButtonElement>('tbody [aria-label="Select order xyz:ORCL"]')?.click());
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel selected orders"]')?.click());
		const callbacks = mocks.cancelOrders.mock.calls[0]?.[1] as
			| { onSuccess: () => void; onSettled: () => void }
			| undefined;

		mocks.address = "0x2222222222222222222222222222222222222222";
		mocks.clientKey = mocks.address;
		mocks.orders = [{ ...order, coin: "BTC", oid: 43 } as OpenOrder];
		act(() => root.render(<OrdersTab />));
		const accountBOrder = container.querySelector<HTMLButtonElement>('tbody [aria-label="Select order BTC"]');
		act(() => accountBOrder?.click());
		expect(accountBOrder?.getAttribute("aria-checked")).toBe("true");

		act(() => callbacks?.onSuccess());
		expect(accountBOrder?.getAttribute("aria-checked")).toBe("true");
		act(() => callbacks?.onSettled());
	});

	it("fails row cancellation closed while the open-orders snapshot is stale", () => {
		mocks.subscriptionIsStale = true;
		act(() => root.render(<OrdersTab />));

		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Open orders are refreshing. Wait for live data and try again.");
	});

	it("fails selected-order cancellation closed while the open-orders snapshot is stale", () => {
		mocks.subscriptionIsStale = true;
		act(() => root.render(<OrdersTab />));
		act(() => container.querySelector<HTMLButtonElement>('tbody [aria-label="Select order xyz:ORCL"]')?.click());

		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel selected orders"]')?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Open orders are refreshing. Wait for live data and try again.");
	});

	it("fails row cancellation closed when the snapshot owner does not match the trading client", () => {
		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		act(() => root.render(<OrdersTab />));

		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(container.textContent).toContain(
			"The trading account or network changed. Reopen the confirmation and try again.",
		);
	});

	it("revalidates the cancel session at the SDK boundary", () => {
		act(() => root.render(<OrdersTab />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.click());
		const params = mocks.cancelOrders.mock.calls[0]?.[0];
		const queuedGuard = mocks.cancelGuard;
		expect(queuedGuard).toBeTypeOf("function");

		mocks.address = "0x2222222222222222222222222222222222222222";
		mocks.clientKey = mocks.address;
		act(() => root.render(<OrdersTab />));

		expect(() => queuedGuard?.(params)).toThrow(
			"The trading account or network changed. Reopen the confirmation and try again.",
		);
	});

	it("does not start cancel all while a row cancellation is unresolved", () => {
		act(() => root.render(<OrdersTab />));

		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]')?.click());
		const cancelAll = container.querySelector<HTMLButtonElement>('button[aria-label="Cancel all orders"]');

		expect(cancelAll?.disabled).toBe(true);
		act(() => cancelAll?.click());
		expect(mocks.cancelOrders).toHaveBeenCalledOnce();
		expect(document.body.textContent).not.toContain("Cancel All Orders");
	});

	it("rejects the confirmation when the trading session changes after the dialog opens", () => {
		act(() => root.render(<OrdersTab />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel all orders"]')?.click());

		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		act(() => root.render(<OrdersTab />));
		const confirmButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel All",
		);
		act(() => confirmButton?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain(
			"The trading account or network changed. Reopen the confirmation and try again.",
		);
	});

	it("does not include orders that appeared after the user opened the confirmation", () => {
		act(() => root.render(<OrdersTab />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cancel all orders"]')?.click());

		mocks.orders = [order, { ...order, coin: "BTC", oid: 43 } as OpenOrder];
		act(() => root.render(<OrdersTab />));
		const confirmButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Cancel All",
		);
		act(() => confirmButton?.click());

		expect(mocks.cancelOrders).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain("Open orders changed. Reopen the confirmation and try again.");
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
