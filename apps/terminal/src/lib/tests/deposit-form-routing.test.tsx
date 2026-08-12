// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DepositForm } from "@/components/trade/tradebox/deposit/deposit-form";
import type { UsdcRoutingQueryStatus, UsdcTransferRoute } from "@/domain/trade/usdc-routing";

vi.mock("@/components/trade/tradebox/deposit/asset-select", () => ({
	AssetSelect: () => createElement("div", { "data-testid": "asset-select" }),
}));

vi.mock("@/components/trade/tradebox/deposit/funding-address-card", () => ({
	FundingAddressCard: () => createElement("div", { "data-testid": "funding-address" }),
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
		expect(container.querySelector('[data-testid="deposit-instructions"]')).not.toBeNull();
		expect(container.firstElementChild?.className).toContain("font-market-close");
		expect(container.textContent).toContain("Deposit USDC from Arbitrum");
		expect(container.textContent).toContain("You send");
		expect(container.textContent).toContain("Minimum 5 USDC");
	});

	it.each([
		{ status: "loading" as const, route: null },
		{ status: "error" as const, route: null },
		{ status: "unknown" as const, route: null },
		{ status: "ready" as const, route: "cctp" as const },
	])("hides all funding instructions for $status/$route", async ({ route, status }) => {
		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, createProps(status, route))));
		});

		expect(container.querySelector('[data-testid="funding-address"]')).toBeNull();
		expect(container.querySelector('[data-testid="deposit-instructions"]')).toBeNull();
	});
});
