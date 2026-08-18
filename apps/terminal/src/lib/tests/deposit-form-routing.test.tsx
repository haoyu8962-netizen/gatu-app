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
	FundingAddressCard: ({
		action,
		address,
		message,
		state,
	}: {
		action?: ReactNode;
		address?: string;
		message?: ReactNode;
		state: string;
	}) =>
		createElement(
			"div",
			{
				"data-address": address,
				"data-address-state": state,
				"data-has-message": message == null ? "false" : "true",
				"data-testid": "funding-address",
			},
			message,
			action,
		),
}));

vi.mock("@/components/trade/tradebox/deposit/shared-ui", () => ({
	NetworkSelect: () => createElement("div", { "data-testid": "network-select" }),
}));

vi.mock("@/components/trade/tradebox/deposit/unit-deposit-info", () => ({
	UnitDepositInfo: ({
		cctpFee,
		cctpFeeError,
		cctpFeeLoading,
		cctpNetAmount,
		presentation,
	}: {
		cctpFee?: string | null;
		cctpFeeError?: boolean;
		cctpFeeLoading?: boolean;
		cctpNetAmount?: string | null;
		presentation?: string;
	}) =>
		createElement("div", {
			"data-cctp-fee": cctpFee,
			"data-cctp-fee-error": cctpFeeError,
			"data-cctp-fee-loading": cctpFeeLoading,
			"data-cctp-net": cctpNetAmount,
			"data-presentation": presentation,
			"data-testid": "deposit-instructions",
		}),
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
		sponsoredCctpEnabled: true,
		sponsoredCctpReadiness: {
			status: "ready" as const,
			failure: null,
			retry: vi.fn(),
		},
		requiresExplicitFundingDeposit: false,
		cctpFee: null,
		cctpNetAmount: null,
		cctpFeeLoading: false,
		cctpFeeError: false,
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

	it("shows the embedded funding address only for a verified sponsored CCTP route", async () => {
		const props = {
			...createProps("ready", "cctp"),
			cctpFee: "0.2",
			cctpNetAmount: "8.8",
		};
		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, props)));
		});

		expect(container.querySelector('[data-testid="funding-address"]')).not.toBeNull();
		expect(container.querySelector('[data-address-state="ready"]')?.getAttribute("data-address")).toBe(FUNDING_ADDRESS);
		const instructions = container.querySelector('[data-testid="deposit-instructions"]');
		expect(instructions?.getAttribute("data-cctp-fee")).toBe("0.2");
		expect(instructions?.getAttribute("data-cctp-net")).toBe("8.8");
		expect(instructions?.getAttribute("data-presentation")).toBe("funding");
		expect(container.firstElementChild?.className).toContain("font-market-close");
		expect(container.textContent).toContain("Deposit USDC from Arbitrum");
		expect(container.textContent).toContain("You send");
		expect(container.textContent).toContain("Minimum 5 USDC");
	});

	it("withholds a ready funding address when deposit capability is unavailable", async () => {
		const props = {
			...createProps("ready", "cctp"),
			depositUnavailableReason: "Unable to verify regional availability.",
		};

		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, props)));
		});

		const fundingAddress = container.querySelector('[data-testid="funding-address"]');
		expect(fundingAddress?.getAttribute("data-address-state")).toBe("unavailable");
		expect(fundingAddress?.hasAttribute("data-address")).toBe(false);
		expect(container.textContent).toContain("Unable to verify regional availability.");
		expect(container.querySelector('[data-testid="deposit-instructions"]')).toBeNull();
	});

	it("keeps testnet funding automatic without rendering the mainnet confirmation action", async () => {
		const props = createProps("ready", "cctp");

		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, props)));
		});

		expect(
			[...container.querySelectorAll("button")].some((button) => button.textContent?.includes("Deposit 9 USDC")),
		).toBe(false);
		expect(props.onSubmit).not.toHaveBeenCalled();
	});

	it("requires an explicit enabled action for a mainnet full-balance sponsored deposit", async () => {
		const props = {
			...createProps("ready", "cctp"),
			requiresExplicitFundingDeposit: true,
			validation: { valid: true, error: null },
		};

		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, props)));
		});

		const submitButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Deposit 9 USDC"),
		);
		expect(submitButton?.disabled).toBe(false);
		act(() => submitButton?.click());
		expect(props.onSubmit).toHaveBeenCalledOnce();
	});

	it.each([
		{
			name: "validation is not ready",
			overrides: {},
		},
		{
			name: "the balance is loading",
			overrides: { balanceStatus: "loading" as const, validation: { valid: true, error: null } },
		},
		{
			name: "the balance failed to load",
			overrides: {
				balanceError: new Error("balance unavailable"),
				balanceStatus: "error" as const,
				validation: { valid: true, error: null },
			},
		},
		{
			name: "the Circle fee is loading",
			overrides: { cctpFeeLoading: true, validation: { valid: true, error: null } },
		},
		{
			name: "a deposit is being submitted",
			overrides: { isPending: true, validation: { valid: true, error: null } },
		},
		{
			name: "an earlier deposit is still being recovered",
			overrides: { pendingCctpRecovery: true, validation: { valid: true, error: null } },
		},
	])("keeps the mainnet confirmation action visible but disabled while $name", async ({ overrides }) => {
		const props = {
			...createProps("ready", "cctp"),
			requiresExplicitFundingDeposit: true,
			...overrides,
		};

		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, props)));
		});

		const submitButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Deposit 9 USDC"),
		);
		expect(submitButton).toBeDefined();
		expect(submitButton?.disabled).toBe(true);
		expect(submitButton?.getAttribute("aria-busy")).toBe(String(props.isPending));
		if (props.balanceStatus === "error") {
			expect(container.querySelector('[role="alert"]')?.textContent).toContain("balance unavailable");
		}
		act(() => submitButton?.click());
		expect(props.onSubmit).not.toHaveBeenCalled();
	});

	it.each([
		{ expectedState: "loading", status: "loading" as const, route: null },
		{ expectedState: "unavailable", status: "error" as const, route: null },
		{ expectedState: "unavailable", status: "unknown" as const, route: null },
		{ expectedState: "unavailable", status: "ready" as const, route: "bridge" as const },
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
			...createProps("ready", "cctp"),
			fundingAddress: undefined,
			fundingAddressPending: true,
		};

		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, props)));
		});

		expect(container.querySelector('[data-address-state="loading"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="deposit-instructions"]')).not.toBeNull();
		expect(container.querySelector('[data-deposit-notice="funding-network"]')).not.toBeNull();
	});

	it("shows a recoverable wallet-creation error instead of waiting on readiness forever", async () => {
		const onRetryFundingAddress = vi.fn();
		const props = {
			...createProps("ready", "cctp"),
			fundingAddress: undefined,
			fundingAddressError: "Embedded wallet creation failed.",
			onRetryFundingAddress,
			sponsoredCctpReadiness: {
				status: "loading" as const,
				failure: null,
				retry: vi.fn(),
			},
		};

		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, props)));
		});

		expect(container.querySelector('[data-address-state="unavailable"]')).not.toBeNull();
		expect(container.textContent).toContain("Embedded wallet creation failed.");
		const retryButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry");
		act(() => retryButton?.click());
		expect(onRetryFundingAddress).toHaveBeenCalledOnce();
	});

	it("shows a silent funding skeleton without a transient gas-readiness prompt", async () => {
		const props = {
			...createProps("ready", "cctp"),
			requiresExplicitFundingDeposit: true,
			validation: { valid: true, error: null },
			sponsoredCctpReadiness: {
				status: "loading" as const,
				failure: null,
				retry: vi.fn(),
			},
		};

		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, props)));
		});

		const fundingAddress = container.querySelector('[data-testid="funding-address"]');
		expect(fundingAddress?.getAttribute("data-address-state")).toBe("loading");
		expect(fundingAddress?.getAttribute("data-has-message")).toBe("false");
		expect(container.querySelector('[data-testid="deposit-instructions"]')).not.toBeNull();
		expect(container.querySelector('[data-deposit-notice="funding-network"]')).not.toBeNull();
		expect(container.textContent).not.toContain("Checking gas-sponsored wallet readiness");
		const submitButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Deposit 9 USDC"),
		);
		expect(submitButton?.disabled).toBe(true);
		act(() => submitButton?.click());
		expect(props.onSubmit).not.toHaveBeenCalled();
	});

	it("keeps the desktop funding shell stable while sponsored readiness settles", async () => {
		const loadingProps = {
			...createProps("ready", "cctp"),
			requiresExplicitFundingDeposit: true,
			validation: { valid: true, error: null },
			sponsoredCctpReadiness: {
				status: "loading" as const,
				failure: null,
				retry: vi.fn(),
			},
		};

		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, loadingProps)));
		});

		const loadingShell = container.querySelector<HTMLElement>('[data-deposit-layout="funding-address"]');
		expect(loadingShell?.getAttribute("data-deposit-readiness")).toBe("loading");
		expect(loadingShell?.className).toContain("min-[1001px]:min-h-[37.5rem]");
		expect(loadingShell?.className).not.toContain(" min-h-[37.5rem]");
		expect(container.querySelector('[data-address-state="loading"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="deposit-instructions"]')).not.toBeNull();
		expect(container.querySelector('[data-deposit-notice="funding-network"]')).not.toBeNull();
		const loadingChildCount = loadingShell?.children.length;

		const readyProps = {
			...loadingProps,
			sponsoredCctpReadiness: {
				status: "ready" as const,
				failure: null,
				retry: vi.fn(),
			},
		};
		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, readyProps)));
		});

		const readyShell = container.querySelector<HTMLElement>('[data-deposit-layout="funding-address"]');
		expect(readyShell).toBe(loadingShell);
		expect(readyShell?.getAttribute("data-deposit-readiness")).toBe("ready");
		expect(readyShell?.children.length).toBe(loadingChildCount);
		expect(container.querySelector('[data-address-state="ready"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="deposit-instructions"]')).not.toBeNull();
		expect(container.querySelector('[data-deposit-notice="funding-network"]')).not.toBeNull();
		const doneButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Done");
		expect(doneButton?.className).toContain("mt-auto");
	});

	it("keeps destination slots stable from route loading through sponsored readiness", async () => {
		const routeLoadingProps = {
			...createProps("loading", null),
			balance: "9",
			maxAmount: "9",
			maxDepositRaw: 9_000_000n,
			requiresExplicitFundingDeposit: true,
			sponsoredCctpReadiness: {
				status: "idle" as const,
				failure: null,
				retry: vi.fn(),
			},
			validation: { valid: true, error: null },
		};

		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, routeLoadingProps)));
		});

		const routeLoadingShell = container.querySelector<HTMLElement>('[data-deposit-layout="funding-address"]');
		const detailsPlaceholder = container.querySelector<HTMLElement>('[data-deposit-placeholder="funding-details"]');
		const noticePlaceholder = container.querySelector<HTMLElement>(
			'[data-deposit-placeholder="funding-network-notice"]',
		);
		expect(detailsPlaceholder?.getAttribute("aria-hidden")).toBe("true");
		expect(detailsPlaceholder?.getAttribute("data-deposit-slot")).toBe("funding-details");
		expect(noticePlaceholder?.getAttribute("aria-hidden")).toBe("true");
		expect(noticePlaceholder?.getAttribute("data-deposit-slot")).toBe("funding-network-notice");
		expect(noticePlaceholder?.querySelector("span")?.className).toContain("invisible");
		expect(container.querySelector('[data-testid="deposit-instructions"]')).toBeNull();
		expect(container.querySelector('[data-deposit-notice="funding-network"]')).toBeNull();
		const routeLoadingDepositButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Deposit 9 USDC"),
		);
		expect(routeLoadingDepositButton?.disabled).toBe(true);
		const routeLoadingChildCount = routeLoadingShell?.children.length;
		const detailsSlotIndex = [...(routeLoadingShell?.children ?? [])].indexOf(detailsPlaceholder as Element);
		const noticeSlotIndex = [...(routeLoadingShell?.children ?? [])].indexOf(noticePlaceholder as Element);

		const readinessLoadingProps = {
			...routeLoadingProps,
			depositRoute: "cctp" as const,
			routingStatus: "ready" as const,
			sponsoredCctpReadiness: {
				status: "loading" as const,
				failure: null,
				retry: vi.fn(),
			},
		};
		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, readinessLoadingProps)));
		});

		const readinessLoadingShell = container.querySelector<HTMLElement>('[data-deposit-layout="funding-address"]');
		const readinessDetailsSlot = container.querySelector<HTMLElement>('[data-deposit-slot="funding-details"]');
		const readinessNoticeSlot = container.querySelector<HTMLElement>('[data-deposit-slot="funding-network-notice"]');
		expect(readinessLoadingShell).toBe(routeLoadingShell);
		expect(readinessLoadingShell?.children.length).toBe(routeLoadingChildCount);
		expect(container.querySelector('[data-deposit-placeholder="funding-details"]')).toBeNull();
		expect(container.querySelector('[data-deposit-placeholder="funding-network-notice"]')).toBeNull();
		expect(container.querySelector('[data-testid="deposit-instructions"]')).not.toBeNull();
		expect(container.querySelector('[data-deposit-notice="funding-network"]')).not.toBeNull();
		const readinessDepositButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Deposit 9 USDC"),
		);
		expect(readinessDepositButton).toBe(routeLoadingDepositButton);
		expect(readinessDepositButton?.disabled).toBe(true);
		expect([...(readinessLoadingShell?.children ?? [])].indexOf(readinessDetailsSlot as Element)).toBe(
			detailsSlotIndex,
		);
		expect([...(readinessLoadingShell?.children ?? [])].indexOf(readinessNoticeSlot as Element)).toBe(noticeSlotIndex);

		const readyProps = {
			...readinessLoadingProps,
			sponsoredCctpReadiness: {
				status: "ready" as const,
				failure: null,
				retry: vi.fn(),
			},
		};
		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, readyProps)));
		});

		const readyShell = container.querySelector<HTMLElement>('[data-deposit-layout="funding-address"]');
		expect(readyShell).toBe(routeLoadingShell);
		expect(readyShell?.children.length).toBe(routeLoadingChildCount);
		expect(container.querySelector('[data-address-state="ready"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="deposit-instructions"]')).not.toBeNull();
		expect(container.querySelector('[data-deposit-notice="funding-network"]')).not.toBeNull();
		const readyDepositButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Deposit 9 USDC"),
		);
		expect(readyDepositButton).toBe(routeLoadingDepositButton);
		expect(readyDepositButton?.disabled).toBe(false);
	});

	it.each([
		{ balanceStatus: "success" as const, maxDepositRaw: 0n, name: "confirmed as zero" },
		{ balanceStatus: "loading" as const, maxDepositRaw: undefined, name: "not resolved yet" },
	])("hides the explicit deposit action while the balance is $name", async ({ balanceStatus, maxDepositRaw }) => {
		const props = {
			...createProps("ready", "cctp"),
			balance: "0",
			balanceStatus,
			maxAmount: "0",
			maxDepositRaw,
			requiresExplicitFundingDeposit: true,
		};

		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, props)));
		});

		expect(container.querySelector('[data-address-state="ready"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="deposit-instructions"]')).not.toBeNull();
		expect(
			[...container.querySelectorAll("button")].some((button) => button.textContent?.includes("Deposit 0 USDC")),
		).toBe(false);
		expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Done")).toBe(true);
		expect(props.onSubmit).not.toHaveBeenCalled();
	});

	it.each([
		{
			failure: "build-gate-disabled" as const,
			message: "Gas-sponsored CCTP deposits are not enabled",
			canRetry: false,
		},
		{
			failure: "smart-client-unavailable" as const,
			message: "Unable to prepare the gas-sponsored wallet",
			canRetry: true,
		},
		{
			failure: "wrong-chain" as const,
			message: "configured for a different Arbitrum network",
			canRetry: true,
		},
		{
			failure: "paymaster-unavailable" as const,
			message: "Gas sponsorship is unavailable",
			canRetry: true,
		},
	])("withholds the funding address when readiness fails with $failure", async ({ canRetry, failure, message }) => {
		const retry = vi.fn();
		const props = {
			...createProps("ready", "cctp"),
			requiresExplicitFundingDeposit: true,
			validation: { valid: true, error: null },
			sponsoredCctpReadiness: { status: "error" as const, failure, retry },
		};

		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, props)));
		});

		expect(container.querySelector('[data-address-state="unavailable"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="funding-address"]')?.hasAttribute("data-address")).toBe(false);
		expect(container.querySelector('[data-testid="deposit-instructions"]')).toBeNull();
		expect(container.textContent).toContain(message);
		expect(
			[...container.querySelectorAll("button")].some((button) => button.textContent?.includes("Deposit 9 USDC")),
		).toBe(false);

		const retryButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry");
		expect(!!retryButton).toBe(canRetry);
		act(() => retryButton?.click());
		expect(retry).toHaveBeenCalledTimes(canRetry ? 1 : 0);
	});

	it("does not expose the funding address when sponsored CCTP is disabled", async () => {
		const props = { ...createProps("ready", "cctp"), sponsoredCctpEnabled: false };

		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositForm, props)));
		});

		expect(container.querySelector('[data-address-state="unavailable"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="deposit-instructions"]')).toBeNull();
		expect(container.textContent).toContain("Gas-sponsored CCTP deposits are not enabled");
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
