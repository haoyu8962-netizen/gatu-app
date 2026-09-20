// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	closeSwap: vi.fn(),
	modalType: "swap" as string | null,
	submitOrder: vi.fn(),
	toastError: vi.fn(),
	toastInfo: vi.fn(),
	toastSuccess: vi.fn(),
	toastWarning: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		error: mocks.toastError,
		info: mocks.toastInfo,
		success: mocks.toastSuccess,
		warning: mocks.toastWarning,
	},
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
	useTrackedOrder: () => ({ submitOrder: mocks.submitOrder, isPending: false }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({
		builderConfig: null,
		clientKey: "0x1111111111111111111111111111111111111111",
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
		vi.clearAllMocks();
	});

	function confirm(): HTMLButtonElement {
		const button = container.querySelector<HTMLButtonElement>('[data-testid="swap-confirm"]');
		if (!button) throw new Error("Expected the swap confirm control");
		return button;
	}

	it("hides the dialog at the click, keeps a static label and closes the modal only after the outcome", async () => {
		let resolveSubmission: ((value: unknown) => void) | undefined;
		mocks.submitOrder.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveSubmission = resolve;
				}),
		);
		expect(confirm().textContent).toBe("Swap");
		expect(confirm().disabled).toBe(false);

		act(() => {
			confirm().click();
			container.querySelector<HTMLButtonElement>('[data-testid="swap-confirm"]')?.click();
		});

		expect(mocks.submitOrder).toHaveBeenCalledOnce();
		expect(container.querySelector('[role="dialog"]')).toBeNull();
		expect(container.textContent).not.toContain("Swapping");
		expect(mocks.closeSwap).not.toHaveBeenCalled();

		await act(async () => {
			resolveSubmission?.({
				state: "submitted",
				result: { response: { data: { statuses: [{ filled: { totalSz: "4", avgPx: "25", oid: 1 } }] } } },
			});
			await Promise.resolve();
		});

		expect(mocks.toastSuccess).toHaveBeenCalledWith("Swap submitted", {
			description: expect.stringContaining("100 USDC"),
		});
		expect(mocks.closeSwap).toHaveBeenCalledOnce();
	});

	it.each([
		["blocked", "toastWarning", "Another order for this market is still being confirmed."],
		["reconciling", "toastInfo", "Order submitted. Confirming exchange status; do not retry."],
	] as const)("reports a %s submission through a notification", async (state, notify, message) => {
		mocks.submitOrder.mockResolvedValueOnce({ state });

		await act(async () => confirm().click());

		expect(mocks[notify]).toHaveBeenCalledWith(message);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(container.textContent).not.toContain(message);
		expect(mocks.closeSwap).toHaveBeenCalledOnce();
	});

	it.each([
		[
			new Error("Order could not immediately match against any resting orders"),
			"No liquidity was available within the",
		],
		[new Error("Insufficient spot balance"), "Insufficient spot balance"],
		["not an error", "Swap failed"],
	])("reports a failed swap through a notification and closes: %s", async (cause, message) => {
		mocks.submitOrder.mockRejectedValueOnce(cause);

		await act(async () => confirm().click());

		expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining(message));
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(mocks.closeSwap).toHaveBeenCalledOnce();
	});
});
