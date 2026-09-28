// @vitest-environment jsdom

import { ApiRequestError } from "@nktkas/hyperliquid";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderBatchResolutionError } from "@/domain/trade/order-tracking";
import { createI18nRoot } from "./harness/react";

const SPOT_BALANCE_REJECTION = "Order has insufficient spot balance to trade";

function spotBalanceRejection() {
	return new ApiRequestError(
		{ status: "ok", response: { type: "order", data: { statuses: [{ error: SPOT_BALANCE_REJECTION }] } } },
		`order 0: ${SPOT_BALANCE_REJECTION}`,
	);
}

const mocks = vi.hoisted(() => ({
	closeSwap: vi.fn(),
	owner: "0x1111111111111111111111111111111111111111",
	executionGuard: null as null | ((params: unknown) => void),
	modalType: "swap" as string | null,
	submitOrder: vi.fn(),
}));

vi.mock("@gatu/ui", () => ({
	Button: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("button", { ...props, type: "button" }, children),
	Modal: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? createElement("div", { role: "dialog" }, children) : null,
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalPopup: ({ children }: { children: ReactNode }) => createElement("section", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}));

vi.mock("@/components/ui/number-input", () => ({
	NumberInput: ({
		value,
		onChange,
		disabled,
	}: {
		value: string;
		onChange?: (event: unknown) => void;
		disabled?: boolean;
	}) => createElement("input", { "aria-label": "Swap amount", value, disabled, readOnly: !onChange, onChange }),
}));

vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin }: { coin: string }) => createElement("span", null, coin),
}));

vi.mock("@/components/trade/components/token-selector-dropdown", () => ({
	TokenSelectorDropdown: () => null,
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({
		children,
		disabled,
		onClick,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick: () => void;
	}) => createElement("button", { type: "button", "data-testid": "swap-confirm", disabled, onClick }, children),
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: () => true,
	useDefaultDexBalances: () => ({
		accountAbstraction: "default",
		spotBalances: [{ coin: "USDC", total: "1000", hold: "0" }],
		spotAvailableAfterMaintenance: undefined,
		spotStateStatus: "success",
		spotStateReceivedAt: Date.now(),
		isDataStale: false,
		hasError: false,
	}),
}));

vi.mock("@/hooks/trade/use-fee-rates", () => ({ useFeeRates: () => ({ takerRate: 0.0007 }) }));

vi.mock("@/hooks/trade/use-tracked-order", () => ({
	useTrackedOrder: ({ executionGuard }: { executionGuard: (params: unknown) => void }) => {
		mocks.executionGuard = executionGuard;
		return { submitOrder: mocks.submitOrder, isPending: false };
	},
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({
		builderConfig: null,
		clientKey: mocks.owner,
		env: "Mainnet",
		sessionMode: "owner",
	}),
	useSubscription: () => ({
		data: {
			coin: "@107",
			levels: [[{ px: "24.9", sz: "500" }], [{ px: "25", sz: "500" }]],
		},
		status: "active",
		isStale: false,
		lastMessageAt: Date.now(),
	}),
}));

vi.mock("@/lib/hyperliquid/hooks/useMarketsInfo", () => ({
	useMarketsInfo: () => ({
		spotMarkets: [
			{
				name: "@107",
				assetId: 10_107,
				szDecimals: 2,
				markPx: "25",
				isStablePair: false,
				tokensInfo: [
					{ name: "HYPE", displayName: "HYPE", szDecimals: 2 },
					{ name: "USDC", displayName: "USDC", szDecimals: 8 },
				],
			},
		],
	}),
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useGlobalModalType: () => mocks.modalType,
	useSwapModalActions: () => ({ close: mocks.closeSwap }),
	useSwapModalFromToken: () => "USDC",
	useSwapModalMode: () => "spot",
	useSwapModalOpen: () => mocks.modalType === "swap",
	useSwapModalToToken: () => "HYPE",
}));

import { SpotSwapModal } from "@/components/trade/components/spot-swap-modal";
import { getOrderQueueItem, removeOrderQueueItem } from "@/stores/use-order-queue-store";

function setInputValue(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("SpotSwapModal submission", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.modalType = "swap";
		mocks.owner = "0x1111111111111111111111111111111111111111";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(createElement(SpotSwapModal)));
		const amount = container.querySelector<HTMLInputElement>('input[aria-label="Swap amount"]');
		if (!amount) throw new Error("Expected the swap amount input");
		act(() => setInputValue(amount, "100"));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		for (const call of mocks.submitOrder.mock.calls) {
			if (call[1]?.queueId) removeOrderQueueItem(call[1].queueId);
		}
		vi.clearAllMocks();
	});

	function confirm(): HTMLButtonElement {
		const button = container.querySelector<HTMLButtonElement>('[data-testid="swap-confirm"]');
		if (!button) throw new Error("Expected the swap confirm control");
		return button;
	}

	function queuedItem() {
		return getOrderQueueItem(mocks.submitOrder.mock.calls.at(-1)?.[1]?.queueId);
	}

	function filledResponse(size?: string) {
		return {
			state: "submitted",
			result: {
				response: {
					data: {
						statuses: [
							{
								filled: { totalSz: size ?? mocks.submitOrder.mock.calls.at(-1)?.[0].orders[0].s, avgPx: "25", oid: 1 },
							},
						],
					},
				},
			},
		};
	}

	it("hides the dialog at click and creates one scoped pending task before receiving the outcome", async () => {
		let resolveSubmission: ((value: unknown) => void) | undefined;
		mocks.submitOrder.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveSubmission = resolve;
				}),
		);
		expect(confirm().textContent).toBe("Swap");
		act(() => {
			confirm().click();
			container.querySelector<HTMLButtonElement>('[data-testid="swap-confirm"]')?.click();
		});
		expect(mocks.submitOrder).toHaveBeenCalledOnce();
		expect(container.querySelector('[role="dialog"]')).toBeNull();
		expect(queuedItem()).toMatchObject({
			owner: mocks.owner,
			env: "Mainnet",
			operation: "spot-swap",
			status: "pending",
		});
		expect(mocks.closeSwap).not.toHaveBeenCalled();
		await act(async () => {
			resolveSubmission?.(filledResponse());
		});
		expect(queuedItem()).toMatchObject({ status: "success", outcome: "filled" });
		expect(mocks.closeSwap).toHaveBeenCalledOnce();
	});

	it.each(["unmount", "identity"])(
		"records the original account outcome after %s without closing another dialog",
		async (change) => {
			let resolveSubmission: ((value: unknown) => void) | undefined;
			mocks.submitOrder.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveSubmission = resolve;
					}),
			);
			act(() => confirm().click());
			const originalOwner = mocks.owner;
			const guard = mocks.executionGuard;
			expect(() => guard?.(mocks.submitOrder.mock.calls[0]?.[0])).not.toThrow();
			if (change === "unmount") act(() => root.render(null));
			else {
				mocks.owner = "0x2222222222222222222222222222222222222222";
				act(() => root.render(createElement(SpotSwapModal, { key: mocks.owner })));
			}
			if (change === "unmount") expect(() => guard?.(mocks.submitOrder.mock.calls[0]?.[0])).toThrow();
			await act(async () => {
				resolveSubmission?.(filledResponse());
			});
			expect(queuedItem()).toMatchObject({ owner: originalOwner, status: "success" });
			expect(mocks.closeSwap).not.toHaveBeenCalled();
		},
	);

	it("records a late error after the original controller has unmounted", async () => {
		let rejectSubmission: ((value: unknown) => void) | undefined;
		mocks.submitOrder.mockImplementationOnce(
			() =>
				new Promise((_, reject) => {
					rejectSubmission = reject;
				}),
		);
		act(() => confirm().click());
		act(() => root.render(null));
		await act(async () => {
			rejectSubmission?.(spotBalanceRejection());
		});
		expect(queuedItem()).toMatchObject({
			status: "failed",
			error: { kind: "exchange-error", entries: [{ index: 0, text: SPOT_BALANCE_REJECTION }] },
		});
		expect(mocks.closeSwap).not.toHaveBeenCalled();
	});

	it.each([
		["blocked", "failed"],
		["reconciling", "confirming"],
	] as const)("keeps a %s submission in the same notification task", async (state, status) => {
		mocks.submitOrder.mockResolvedValueOnce({ state });
		await act(async () => confirm().click());
		expect(queuedItem()).toMatchObject({ status });
		expect(mocks.closeSwap).toHaveBeenCalledOnce();
	});

	it("does not describe a partial fill as complete", async () => {
		mocks.submitOrder.mockImplementationOnce(() => Promise.resolve(filledResponse("1")));
		await act(async () => confirm().click());
		expect(queuedItem()).toMatchObject({ status: "partial", children: [{ status: "partial", filledSize: "1" }] });
	});

	it.each([
		[
			new Error("Order could not immediately match against any resting orders"),
			{ kind: "spot-swap", code: "no-liquidity" },
		],
		[spotBalanceRejection(), { kind: "exchange-error", entries: [{ index: 0, text: SPOT_BALANCE_REJECTION }] }],
		[
			new OrderBatchResolutionError({
				status: "rejected",
				totalCount: 1,
				acceptedCount: 0,
				rejectedCount: 1,
				errors: [{ text: "A rejection the terminal does not know yet" }],
			}),
			{ kind: "exchange-error", entries: [{ text: "A rejection the terminal does not know yet" }] },
		],
		[new Error("Swap request no longer matches the quote"), { kind: "spot-swap", code: "failed" }],
		["not an error", { kind: "spot-swap", code: "failed" }],
	])("keeps a stable semantic error in the failed task: %s", async (cause, error) => {
		mocks.submitOrder.mockRejectedValueOnce(cause);
		await act(async () => confirm().click());
		expect(queuedItem()).toMatchObject({ status: "failed", error });
		expect(mocks.closeSwap).toHaveBeenCalledOnce();
	});
});
