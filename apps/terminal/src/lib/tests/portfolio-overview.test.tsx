// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortfolioOverview } from "@/components/portfolio/portfolio-overview";
import type { InfoResponse } from "@/lib/hyperliquid";

const mocks = vi.hoisted(() => ({
	isConnected: true,
	portfolioData: undefined as InfoResponse<"portfolio"> | undefined,
	portfolioError: true,
	accountSummary: {
		spotAccountValue: 42,
		perpAccountValue: 0,
		usesSpotStateForPerps: true,
	},
	balances: {
		accountAbstraction: "unifiedAccount",
		allDexClearinghouseStates: [["", { marginSummary: { accountValue: "0" } }]],
		hasAllDexsSnapshot: true,
		hasSpotStateSnapshot: true,
	},
	builderPerpMarkets: [] as Array<{ dex: string; quoteToken?: { index: number; name: string } }>,
	tokenUsdPrices: undefined as Record<string, string> | undefined,
	auxiliaryDataAvailable: true,
	feesData: undefined as
		| {
				dailyUserVlm: [];
				userAddRate: string;
				userCrossRate: string;
				userSpotAddRate: string;
				userSpotCrossRate: string;
		  }
		| undefined,
	refetchPortfolio: vi.fn(),
	refetchFees: vi.fn(),
}));

vi.mock("@gatu/ui", () => ({
	Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
	Select: ({ value }: { value?: string }) => <span>{value}</span>,
}));

vi.mock("@/domain/trade/balances", () => ({
	getAccountBalanceSummary: () => mocks.accountSummary,
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: (value: unknown) =>
		value === "disabled" || value === "unifiedAccount" || value === "portfolioMargin",
	useDefaultDexBalances: () => mocks.balances,
}));

vi.mock("@/hooks/trade/use-spot-token-usd-prices", () => ({
	useSpotTokenUsdPriceState: () => ({ prices: mocks.tokenUsdPrices, status: "success" }),
	useSpotTokenUsdPrices: () => mocks.tokenUsdPrices,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: "0x0000000000000000000000000000000000000001",
		isConnected: mocks.isConnected,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarkets: () => ({
		builderPerp: mocks.builderPerpMarkets,
		getToken: (name: string) => (name === "USDC" ? { index: 0, name } : undefined),
	}),
	useInfo: (method: string) => {
		if (method === "portfolio") {
			return {
				data: mocks.portfolioData,
				isError: mocks.portfolioError,
				isFetching: false,
				isPending: false,
				refetch: mocks.refetchPortfolio,
			};
		}

		if (method === "userFees") {
			return {
				data: mocks.feesData,
				isError: false,
				isFetching: false,
				isPending: false,
				refetch: mocks.refetchFees,
			};
		}

		const auxiliaryData = method === "borrowLendUserState" ? { tokenToState: [] } : [];

		return {
			data: mocks.auxiliaryDataAvailable ? auxiliaryData : undefined,
			isError: false,
			isFetching: false,
			isPending: false,
		};
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("PortfolioOverview", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.isConnected = true;
		mocks.portfolioData = undefined;
		mocks.portfolioError = true;
		mocks.accountSummary = {
			spotAccountValue: 42,
			perpAccountValue: 0,
			usesSpotStateForPerps: true,
		};
		mocks.balances = {
			accountAbstraction: "unifiedAccount",
			allDexClearinghouseStates: [["", { marginSummary: { accountValue: "0" } }]],
			hasAllDexsSnapshot: true,
			hasSpotStateSnapshot: true,
		};
		mocks.builderPerpMarkets = [];
		mocks.tokenUsdPrices = undefined;
		mocks.auxiliaryDataAvailable = true;
		mocks.feesData = {
			dailyUserVlm: [],
			userAddRate: "0.00015",
			userCrossRate: "0.00045",
			userSpotAddRate: "0.0004",
			userSpotCrossRate: "0.0007",
		};
		mocks.refetchPortfolio.mockReset();
		mocks.refetchFees.mockReset();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("does not present unavailable portfolio history as real zero values", () => {
		renderOverview(root);

		expect(summaryValue(container, "PNL")).toBe("—");
		expect(summaryValue(container, "Volume")).toBe("—");
		expect(summaryValue(container, "Max Drawdown")).toBe("—");
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Something went wrong");

		const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry");
		act(() => retry?.click());
		expect(mocks.refetchPortfolio).toHaveBeenCalledOnce();
		expect(mocks.refetchFees).toHaveBeenCalledOnce();
	});

	it("does not present unavailable fee rates as real zero values", () => {
		mocks.feesData = undefined;
		renderOverview(root);

		expect(metricValue(container, "Fees (Taker / Maker)")).toBe("—");
	});

	it("does not present unavailable account balances as real zero values", () => {
		mocks.accountSummary = {
			spotAccountValue: 0,
			perpAccountValue: 0,
			usesSpotStateForPerps: false,
		};
		mocks.balances = {
			accountAbstraction: "disabled",
			allDexClearinghouseStates: [],
			hasAllDexsSnapshot: false,
			hasSpotStateSnapshot: false,
		};
		mocks.auxiliaryDataAvailable = false;
		renderOverview(root);

		expect(summaryValue(container, "Total Equity")).toBe("—");
		expect(summaryValue(container, "Perps Account Equity")).toBe("—");
		expect(summaryValue(container, "Spot Account Equity")).toBe("—");
		expect(summaryValue(container, "Earn Balance")).toBe("—");
	});

	it("does not retain account values after the wallet disconnects", () => {
		mocks.isConnected = false;
		renderOverview(root);

		expect(summaryValue(container, "Total Equity")).toBe("—");
		expect(summaryValue(container, "Spot Account Equity")).toBe("—");
		expect(summaryValue(container, "Earn Balance")).toBe("—");
	});

	it("includes every separately collateralized DEX in standard account equity", () => {
		mocks.accountSummary = {
			spotAccountValue: 42,
			perpAccountValue: 500,
			usesSpotStateForPerps: false,
		};
		mocks.balances = {
			accountAbstraction: "disabled",
			allDexClearinghouseStates: [
				["", { marginSummary: { accountValue: "500" } }],
				["xyz", { marginSummary: { accountValue: "100" } }],
			],
			hasAllDexsSnapshot: true,
			hasSpotStateSnapshot: true,
		};
		mocks.builderPerpMarkets = [{ dex: "xyz", quoteToken: { index: 150, name: "USDH" } }];
		mocks.tokenUsdPrices = { USDH: "0.99" };
		renderOverview(root);

		expect(summaryValue(container, "Total Equity")).toBe("$641.00");
		expect(summaryValue(container, "Perps Account Equity")).toBe("$599.00");
		expect(summaryValue(container, "Spot Account Equity")).toBe("$42.00");
	});

	it("does not expose a non-additive perps equity row in unified account mode", () => {
		mocks.accountSummary = {
			spotAccountValue: 500,
			perpAccountValue: 500,
			usesSpotStateForPerps: true,
		};
		renderOverview(root);

		expect(summaryValue(container, "Total Equity")).toBe("$500.00");
		expect(summaryValue(container, "Perps Account Equity")).toBeUndefined();
		expect(summaryValue(container, "Spot Account Equity")).toBe("$500.00");
	});

	it("does not present raw spot equity while the account mode is unresolved", () => {
		mocks.balances.accountAbstraction = "default";
		mocks.balances.hasSpotStateSnapshot = true;
		mocks.accountSummary = {
			...mocks.accountSummary,
			spotAccountValue: 42,
			usesSpotStateForPerps: false,
		};
		renderOverview(root);

		expect(summaryValue(container, "Spot Account Equity")).toBe("—");
	});

	it("keeps valid zero values visible even after a background refresh error", () => {
		mocks.portfolioData = createZeroPortfolio();
		renderOverview(root);

		expect(summaryValue(container, "PNL")).toMatch(/0\.00/);
		expect(summaryValue(container, "Volume")).toMatch(/0\.00/);
		expect(summaryValue(container, "Max Drawdown")).toBe("0.00%");
		expect(container.querySelector('[role="alert"]')).toBeNull();
	});
});

function renderOverview(root: Root) {
	act(() =>
		root.render(
			<I18nProvider i18n={i18n}>
				<PortfolioOverview />
			</I18nProvider>,
		),
	);
}

function summaryValue(container: HTMLElement, label: string): string | null | undefined {
	const labelElement = [...container.querySelectorAll("span")].find((element) => element.textContent === label);
	return labelElement?.nextElementSibling?.textContent;
}

function metricValue(container: HTMLElement, label: string): string | null | undefined {
	const labelElement = [...container.querySelectorAll("span")].find((element) => element.textContent === label);
	return labelElement?.closest("section")?.querySelector("p")?.textContent;
}

function createZeroPortfolio(): InfoResponse<"portfolio"> {
	const snapshot = {
		accountValueHistory: [[1, "0"]],
		pnlHistory: [[1, "0"]],
		vlm: "0",
	} satisfies InfoResponse<"portfolio">[number][1];

	return [
		["day", snapshot],
		["week", snapshot],
		["month", snapshot],
		["allTime", snapshot],
		["perpDay", snapshot],
		["perpWeek", snapshot],
		["perpMonth", snapshot],
		["perpAllTime", snapshot],
	];
}
