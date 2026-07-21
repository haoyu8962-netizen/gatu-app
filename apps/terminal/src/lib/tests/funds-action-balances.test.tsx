// @vitest-environment jsdom

import { act, createElement, Fragment, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SendModal } from "@/components/trade/positions/send-modal";
import { TransferModal } from "@/components/trade/positions/transfer-modal";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	balances: {
		accountAbstraction: "disabled",
		marginSummary: {
			accountValue: "1620.34",
			totalMarginUsed: "1564.34",
			totalRawUsd: "1620.34",
		},
		perpSummary: {
			accountValue: "1620.34",
			totalMarginUsed: "1564.34",
		},
		spotAvailableAfterMaintenance: [[0, "4947.18019669"]],
		spotBalances: [
			{
				coin: "USDC",
				entryNtl: "0",
				hold: "3140.833333",
				token: 0,
				total: "8105.34686269",
			},
		],
		withdrawable: "40",
	},
}));

function renderChildren(children: ReactNode) {
	return createElement(Fragment, null, children);
}

vi.mock("@gatu/ui", () => ({
	Button: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("button", { ...props, type: "button" }, children),
	Modal: ({ children, open }: { children: ReactNode; open: boolean }) => (open ? renderChildren(children) : null),
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalPopup: ({ children }: { children: ReactNode }) => createElement("section", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
	Select: ({ options, value }: { options: Array<{ label: string; value: string }>; value: string }) =>
		createElement(
			"select",
			{ "aria-label": "select", value, onChange: () => {} },
			options.map((option) => createElement("option", { key: option.value, value: option.value }, option.label)),
		),
	TextInput: (props: Record<string, unknown>) => createElement("input", props),
}));

vi.mock("@/components/ui/number-input", () => ({
	NumberInput: ({
		label,
		labelValue,
		onChange,
		onLabelValueClick,
		value,
	}: {
		label: string;
		labelValue: ReactNode;
		onChange: (event: { target: { value: string } }) => void;
		onLabelValueClick: () => void;
		value: string;
	}) =>
		createElement(
			"div",
			null,
			createElement("span", null, label),
			createElement(
				"button",
				{ "data-testid": "available-balance", onClick: onLabelValueClick, type: "button" },
				labelValue,
			),
			createElement("input", {
				"aria-label": label,
				onChange,
				value,
			}),
		),
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isTokenSpotBalance: (balance: object) => "token" in balance,
	useDefaultDexBalances: () => testState.balances,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		hasWalletAccess: true,
		walletAddress: "0x1111111111111111111111111111111111111111",
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

vi.mock("@/lib/hyperliquid/markets/use-spot-tokens", () => ({
	useSpotTokens: () => ({
		getToken: (coin: string) => ({ name: coin, tokenId: 0, transferDecimals: 6 }),
	}),
}));

function getAmountInput(container: HTMLElement): HTMLInputElement {
	const input = container.querySelector('input[aria-label="Amount"]');
	if (!(input instanceof HTMLInputElement)) throw new Error("Amount input not found");
	return input;
}

function clickAvailableBalance(container: HTMLElement) {
	const button = container.querySelector<HTMLButtonElement>('[data-testid="available-balance"]');
	if (!button) throw new Error("Available balance button not found");
	act(() => button.click());
}

describe("funds action balance wiring", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("uses clearinghouseState.withdrawable for Perp to Spot transfers", () => {
		act(() => root.render(createElement(TransferModal, { onOpenChange: vi.fn(), open: true })));

		expect(container.textContent).toContain("40.00 USDC");
		expect(container.textContent).not.toContain("56.00 USDC");
		clickAvailableBalance(container);
		expect(getAmountInput(container).value).toBe("40.00");
	});

	it("uses settled Spot total minus hold for Spot to Perp transfers", () => {
		act(() =>
			root.render(createElement(TransferModal, { initialDirection: "toPerp", onOpenChange: vi.fn(), open: true })),
		);

		expect(container.textContent).toContain("4964.51 USDC");
		expect(container.textContent).not.toContain("4947.18 USDC");
		clickAvailableBalance(container);
		expect(getAmountInput(container).value).toBe("4964.51");
	});

	it("uses clearinghouseState.withdrawable for sends from the Perps account", () => {
		act(() => root.render(createElement(SendModal, { initialAccountType: "perp", onOpenChange: vi.fn(), open: true })));

		expect(container.textContent).toContain("40.00 USDC");
		expect(container.textContent).not.toContain("56.00 USDC");
		clickAvailableBalance(container);
		expect(getAmountInput(container).value).toBe("40.00");
	});

	it("uses settled Spot total minus hold for spot sends", () => {
		act(() => root.render(createElement(SendModal, { onOpenChange: vi.fn(), open: true })));

		expect(container.textContent).toContain("4964.51 USDC");
		expect(container.textContent).not.toContain("4947.18 USDC");
		clickAvailableBalance(container);
		expect(getAmountInput(container).value).toBe("4964.51");
	});
});
