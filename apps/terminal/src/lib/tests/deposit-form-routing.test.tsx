// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DepositForm } from "@/components/trade/tradebox/deposit/deposit-form";
import type { UsdcRoutingQueryStatus, UsdcTransferRoute } from "@/domain/trade/usdc-routing";

vi.mock("@/components/trade/tradebox/deposit/asset-select", () => ({
	AssetSelect: () => createElement("div", { "data-testid": "asset-select" }),
}));

vi.mock("@/components/trade/tradebox/deposit/funding-address-card", () => ({
	FundingAddressCard: ({ action, address, state }: { action?: ReactNode; address?: string; state: string }) =>
		createElement(
			"div",
			{ "data-address": address, "data-address-state": state, "data-testid": "funding-address" },
			action,
		),
}));

vi.mock("@/components/trade/tradebox/deposit/shared-ui", () => ({
	NetworkSelect: () => createElement("div", { "data-testid": "network-select" }),
}));

vi.mock("@/components/trade/tradebox/deposit/unit-deposit-info", () => ({
	UnitDepositInfo: () => createElement("div", { "data-testid": "deposit-instructions" }),
}));

vi.mock("@/components/trade/tradebox/deposit/amount-input", () => ({
	AmountInput: () => createElement("div", { "data-testid": "amount-input" }),
}));

const FUNDING_ADDRESS = "0x1111111111111111111111111111111111111111" as const;

function createProps(routingStatus: UsdcRoutingQueryStatus, depositRoute: UsdcTransferRoute | null) {
	return {
		amount: "",
		onAmountChange: vi.fn(),
		balance: "9",
		maxAmount: "9",
		maxDepositRaw: 9_000_000n,
		balanceStatus: "success" as const,
		balanceError: null,
		validation: { valid: false, error: null },
		isPending: false,
		onSubmit: vi.fn(),
		routingStatus,
		depositRoute,
		onRetryRouting: vi.fn(),
		networkName: "Arbitrum",
		smartDepositEnabled: true,
		cctpFee: null,
		cctpNetAmount: null,
		cctpFeeLoading: false,
		pendingCctpRecovery: false,
		usesFundingAddressFlow: true,
		fundingAddressPending: false,
		fundingAddress: FUNDING_ADDRESS,
		onDone: vi.fn(),
	};
}

describe("DepositForm routing gate", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("shows the embedded funding address only for a verified Bridge2 route", async () => {
		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, createProps("ready", "bridge"))));
		});

		expect(container.querySelector('[data-testid="funding-address"]')).not.toBeNull();
		expect(container.querySelector('[data-address-state="ready"]')?.getAttribute("data-address")).toBe(FUNDING_ADDRESS);
		expect(container.querySelector('[data-testid="deposit-instructions"]')).not.toBeNull();
		expect(container.firstElementChild?.className).toContain("font-market-close");
		expect(container.textContent).toContain("Deposit USDC from Arbitrum");
		expect(container.textContent).toContain("You send");
		expect(container.textContent).toContain("Minimum 5 USDC");
	});

	it.each([
		{ expectedState: "loading", status: "loading" as const, route: null },
		{ expectedState: "unavailable", status: "error" as const, route: null },
		{ expectedState: "unavailable", status: "unknown" as const, route: null },
		{ expectedState: "unavailable", status: "ready" as const, route: "cctp" as const },
	])("never exposes the funding address for $status/$route", async ({ expectedState, route, status }) => {
		const props = createProps(status, route);
		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, props)));
		});

		const fundingAddress = container.querySelector('[data-testid="funding-address"]');
		expect(fundingAddress?.getAttribute("data-address-state")).toBe(expectedState);
		expect(fundingAddress?.hasAttribute("data-address")).toBe(false);
		expect(container.querySelector('[data-testid="deposit-instructions"]')).toBeNull();
		if (status === "error" || status === "unknown") {
			const retryButton = container.querySelector<HTMLButtonElement>("button");
			expect(retryButton?.textContent).toBe("Retry");
			act(() => retryButton?.click());
			expect(props.onRetryRouting).toHaveBeenCalledOnce();
		}
	});

	it("keeps the funding address placeholder stable while the embedded wallet is created", async () => {
		const props = {
			...createProps("ready", "bridge"),
			fundingAddress: undefined,
			fundingAddressPending: true,
		};

		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, props)));
		});

		expect(container.querySelector('[data-address-state="loading"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="deposit-instructions"]')).toBeNull();
	});

	it.each(["bridge", "cctp"] as const)("preserves the external-wallet amount flow for %s", async (route) => {
		const props = {
			...createProps("ready", route),
			usesFundingAddressFlow: false,
			fundingAddress: undefined,
		};

		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, props)));
		});

		expect(container.querySelector('[data-testid="funding-address"]')).toBeNull();
		expect(container.querySelector('[data-testid="amount-input"]')).not.toBeNull();
	});
});
