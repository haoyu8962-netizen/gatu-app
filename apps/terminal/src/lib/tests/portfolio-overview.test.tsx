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
	frozenNow: Date.UTC(2026, 8, 7),
	queryAge: 0,
	fetchStatus: "idle" as "fetching" | "paused" | "idle",
	auxiliaryError: false,
	priceStatus: "success",
	borrowLendData: { tokenToState: [], health: "healthy", healthFactor: null } as InfoResponse<"borrowLendUserState">,
	reserveData: [] as InfoResponse<"allBorrowLendReserveStates">,
	balances: {
		accountAbstraction: "unifiedAccount",
		allDexClearinghouseStates: [["", { marginSummary: { accountValue: "0" } }]],
		hasAllDexsSnapshot: true,
		hasSpotStateSnapshot: true,
		spotStateStatus: "success",
		perpStateStatus: "success",
		spotBalances: [{ coin: "USDC", token: 0, total: "42", hold: "0", entryNtl: "0" }],
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
	refetchAuxiliary: vi.fn(),
}));

vi.mock("@sairn/ui", () => ({
	Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
	Select: ({ value, triggerAriaLabel }: { value?: string; triggerAriaLabel?: string }) => (
		<button type="button" role="combobox" aria-expanded="false" aria-label={triggerAriaLabel}>
			{value}
		</button>
	),
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: (value: unknown) =>
		value === "disabled" || value === "unifiedAccount" || value === "portfolioMargin",
	useDefaultDexBalances: () => mocks.balances,
}));

vi.mock("@/hooks/trade/use-spot-token-usd-prices", () => ({
	useSpotTokenUsdPriceState: () => ({ prices: mocks.tokenUsdPrices, status: mocks.priceStatus }),
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
		spot: [],
		builderPerp: mocks.builderPerpMarkets,
		getToken: (name: string) => (name === "USDC" ? { index: 0, name } : undefined),
	}),
}));

vi.mock("@/hooks/portfolio/use-portfolio-info", () => ({
	usePortfolioInfo: (method: string) => {
		if (method === "portfolio") {
			return {
				data: mocks.portfolioData,
				isError: mocks.portfolioError,
				dataUpdatedAt: mocks.frozenNow - mocks.queryAge,
				fetchStatus: mocks.fetchStatus,
				isPlaceholderData: false,
				isFetchedAfterMount: true,
				isFetching: false,
				isPending: false,
				refetch: mocks.refetchPortfolio,
			};
		}

		if (method === "userFees") {
			return {
				data: mocks.feesData,
				isError: mocks.auxiliaryError,
				dataUpdatedAt: mocks.frozenNow - mocks.queryAge,
				fetchStatus: mocks.fetchStatus,
				isPlaceholderData: false,
				isFetchedAfterMount: true,
				isFetching: false,
				isPending: false,
				refetch: mocks.refetchFees,
			};
		}

		const auxiliaryData =
			method === "borrowLendUserState"
				? mocks.borrowLendData
				: method === "allBorrowLendReserveStates"
					? mocks.reserveData
					: [];

		return {
			data: mocks.auxiliaryDataAvailable ? auxiliaryData : undefined,
			isError: mocks.auxiliaryError,
			dataUpdatedAt: mocks.frozenNow - mocks.queryAge,
			fetchStatus: mocks.fetchStatus,
			isPlaceholderData: false,
			isFetchedAfterMount: true,
			isFetching: false,
			isPending: false,
			refetch: mocks.refetchAuxiliary,
		};
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("PortfolioOverview", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(mocks.frozenNow);
		mocks.isConnected = true;
		mocks.queryAge = 0;
		mocks.fetchStatus = "idle";
		mocks.auxiliaryError = false;
		mocks.priceStatus = "success";
		mocks.borrowLendData = { tokenToState: [], health: "healthy", healthFactor: null };
		mocks.reserveData = [];
		mocks.portfolioData = undefined;
		mocks.portfolioError = true;
		mocks.balances = {
			spotStateStatus: "success",
			perpStateStatus: "success",
			spotBalances: [{ coin: "USDC", token: 0, total: "42", hold: "0", entryNtl: "0" }],
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
		mocks.refetchAuxiliary.mockReset();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	it("shows zero placeholders for unavailable history while preserving retry", () => {
		renderOverview(root);

		expect(summaryValue(container, "PNL")).toBe("$0.00");
		expect(summaryValue(container, "Volume")).toBe("$0.00");
		expect(summaryValue(container, "Max Drawdown")).toBe("—");
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Something went wrong");

		const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry");
		act(() => retry?.click());
		expect(mocks.refetchPortfolio).toHaveBeenCalledOnce();
		expect(mocks.refetchFees).toHaveBeenCalledOnce();
		expect(mocks.refetchAuxiliary).toHaveBeenCalledTimes(3);
		for (const refetch of [mocks.refetchPortfolio, mocks.refetchFees, mocks.refetchAuxiliary]) {
			for (const call of refetch.mock.calls) expect(call).toEqual([{ cancelRefetch: false }]);
		}
	});

	it("shows formatted zero placeholders for unavailable fee rates", () => {
		mocks.feesData = undefined;
		renderOverview(root);

		expect(metricValue(container, "Fees (Taker / Maker)")).toBe("0.0000% / 0.0000%");
	});

	it("gives each portfolio selector a purpose-specific accessible name", () => {
		renderOverview(root);

		expect(
			container.querySelector('[role="combobox"][aria-label="Fee market for taker and maker rates"]'),
		).not.toBeNull();
		expect(container.querySelector('[role="combobox"][aria-label="Portfolio account scope"]')).not.toBeNull();
		expect(container.querySelector('[role="combobox"][aria-label="Portfolio performance period"]')).not.toBeNull();
	});

	it("shows zero placeholders until complete account snapshots arrive", () => {
		mocks.balances = {
			spotStateStatus: "success",
			perpStateStatus: "success",
			spotBalances: [{ coin: "USDC", token: 0, total: "42", hold: "0", entryNtl: "0" }],
			accountAbstraction: "disabled",
			allDexClearinghouseStates: [],
			hasAllDexsSnapshot: false,
			hasSpotStateSnapshot: false,
		};
		mocks.auxiliaryDataAvailable = false;
		renderOverview(root);

		expect(summaryValue(container, "Total Equity")).toBe("$0.00");
		expect(summaryValue(container, "Perps Account Equity")).toBe("$0.00");
		expect(summaryValue(container, "Spot Account Equity")).toBe("$0.00");
		expect(summaryValue(container, "Lending Net Balance")).toBe("$0.00");
	});

	it("does not retain account values after the wallet disconnects", () => {
		mocks.isConnected = false;
		renderOverview(root);

		expect(summaryValue(container, "Total Equity")).toBe("$0.00");
		expect(summaryValue(container, "Spot Account Equity")).toBe("$0.00");
		expect(summaryValue(container, "Lending Net Balance")).toBe("$0.00");
	});

	it("includes every separately collateralized DEX in standard account equity", () => {
		mocks.balances = {
			spotStateStatus: "success",
			perpStateStatus: "success",
			spotBalances: [{ coin: "USDC", token: 0, total: "42", hold: "0", entryNtl: "0" }],
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
		mocks.balances.spotBalances[0].total = "500";
		renderOverview(root);

		expect(summaryValue(container, "Total Equity")).toBe("$500.00");
		expect(summaryValue(container, "Perps Account Equity")).toBeUndefined();
		expect(summaryValue(container, "Spot Account Equity")).toBe("$500.00");
	});

	it("does not present raw spot equity while the account mode is unresolved", () => {
		mocks.balances.accountAbstraction = "default";
		mocks.balances.hasSpotStateSnapshot = true;
		renderOverview(root);

		expect(summaryValue(container, "Spot Account Equity")).toBe("$0.00");
	});

	it("keeps valid zero values visible after a successful refresh", () => {
		mocks.portfolioData = createZeroPortfolio();
		mocks.portfolioError = false;
		renderOverview(root);

		expect(summaryValue(container, "PNL")).toMatch(/0\.00/);
		expect(summaryValue(container, "Volume")).toMatch(/0\.00/);
		expect(summaryValue(container, "Max Drawdown")).toBe("—");
		expect(container.querySelector('[role="alert"]')).toBeNull();
	});

	it("uses market direction colors only for directional values", () => {
		mocks.portfolioData = createPortfolio("5");
		mocks.portfolioError = false;
		renderOverview(root);

		expect(summaryElement(container, "PNL")?.classList).toContain("text-market-up");
		expect(summaryElement(container, "Total Equity")?.classList).toContain("text-fg");

		mocks.portfolioData = createPortfolio("-5");
		renderOverview(root);

		expect(summaryElement(container, "PNL")?.classList).toContain("text-market-down");
		expect(summaryElement(container, "PNL")?.classList).not.toContain("text-error");
	});
	it("never shows a numeric drawdown while the metric is unavailable, even with a falling history", () => {
		mocks.portfolioError = false;
		mocks.portfolioData = createZeroPortfolio();
		for (const [, snapshot] of mocks.portfolioData)
			snapshot.accountValueHistory = [
				[1, "1000"],
				[2, "500"],
			];
		renderOverview(root);
		expect(summaryValue(container, "Max Drawdown")).toBe("—");
		expect(container.textContent).toContain("cash-flow-adjusted history");
		expect(container.textContent).not.toContain("-50.00%");
	});

	it("does not use entry cost when an airdrop or held asset has no price", () => {
		mocks.balances.spotBalances = [{ coin: "HYPE", token: 150, total: "10", hold: "0", entryNtl: "100" }];
		mocks.portfolioData = createPortfolio("5");
		mocks.portfolioError = false;
		renderOverview(root);
		expect(summaryValue(container, "Spot Account Equity")).toBe("$0.00");
		expect(summaryValue(container, "Total Equity")).toBe("$0.00");
		expect(summaryValue(container, "PNL")).toContain("5.00");
		mocks.balances.spotBalances[0].entryNtl = "0";
		renderOverview(root);
		expect(summaryValue(container, "Spot Account Equity")).toBe("$0.00");
	});

	it("does not require market prices for USDC-only or empty balances", () => {
		mocks.priceStatus = "error";
		renderOverview(root);
		expect(summaryValue(container, "Total Equity")).toBe("$42.00");
		mocks.balances.spotBalances = [];
		renderOverview(root);
		expect(summaryValue(container, "Total Equity")).toBe("$0.00");
	});

	it.each(["error", "stale"])("rejects %s balance snapshots even when cached data exists", (status) => {
		mocks.balances.spotStateStatus = status;
		renderOverview(root);
		expect(summaryValue(container, "Spot Account Equity")).toBe("$0.00");
		expect(summaryValue(container, "Total Equity")).toBe("$0.00");
	});

	it("rejects failed cached history and lending without substituting historical equity", () => {
		mocks.portfolioData = createPortfolio("5");
		mocks.auxiliaryError = true;
		renderOverview(root);
		expect(summaryValue(container, "PNL")).toBe("$0.00");
		expect(summaryValue(container, "Total Equity")).toBe("$0.00");
		expect(summaryValue(container, "Lending Net Balance")).toBe("$0.00");
		expect(summaryValue(container, "Spot Account Equity")).toBe("$42.00");
	});

	it("keeps the last portfolio on screen while the request after a return to the tab is on its way", () => {
		mocks.queryAge = 130_000;
		mocks.portfolioError = false;
		mocks.portfolioData = createPortfolio("5");
		mocks.fetchStatus = "fetching";
		renderOverview(root);

		expect(summaryValue(container, "PNL")).not.toBe("$0.00");
		expect(summaryValue(container, "Total Equity")).toBe("$42.00");
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.textContent).not.toContain("Something went wrong");
		expect(container.textContent).not.toContain("Some balances cannot be valued");
	});

	it("waits instead of reporting a failure when expired data has no request on its way", () => {
		mocks.queryAge = 130_000;
		mocks.portfolioError = false;
		mocks.portfolioData = createPortfolio("5");
		renderOverview(root);

		expect(summaryValue(container, "PNL")).toBe("$0.00");
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.textContent).not.toContain("Something went wrong");
	});

	it("expires successful cached responses", () => {
		mocks.queryAge = 120_000;
		mocks.portfolioError = false;
		mocks.portfolioData = createPortfolio("5");
		renderOverview(root);
		expect(summaryValue(container, "PNL")).toBe("$0.00");
		expect(summaryValue(container, "Total Equity")).toBe("$0.00");
	});

	it.each(["unifiedAccount", "portfolioMargin"])("does not add unverified lending to %s spot equity", (mode) => {
		mocks.balances.accountAbstraction = mode;
		mocks.borrowLendData.tokenToState = [
			[0, { supply: { basis: "100", value: "100" }, borrow: { basis: "0", value: "0" } }],
		];
		mocks.reserveData = [[0, { oraclePx: "1" }]] as InfoResponse<"allBorrowLendReserveStates">;
		renderOverview(root);
		expect(summaryValue(container, "Total Equity")).toBe("$0.00");
		expect(summaryValue(container, "Lending Net Balance")).toBe("$100.00");
		expect(container.textContent).toContain("may overlap");
	});
	it("expires data on the clock without waiting for another network response", () => {
		renderOverview(root);
		expect(summaryValue(container, "Total Equity")).toBe("$42.00");
		act(() => vi.advanceTimersByTime(120_000));
		expect(summaryValue(container, "Total Equity")).toBe("$0.00");
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

function summaryElement(container: HTMLElement, label: string): Element | null | undefined {
	const labelElement = [...container.querySelectorAll("span")].find((element) => element.textContent === label);
	return labelElement?.nextElementSibling;
}

function metricValue(container: HTMLElement, label: string): string | null | undefined {
	const labelElement = [...container.querySelectorAll("span")].find((element) => element.textContent === label);
	return labelElement?.closest("section")?.querySelector("p")?.textContent;
}

function createPortfolio(pnl: string): InfoResponse<"portfolio"> {
	const snapshot = {
		accountValueHistory: [[1, "0"]],
		pnlHistory: [[1, pnl]],
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

function createZeroPortfolio(): InfoResponse<"portfolio"> {
	return createPortfolio("0");
}
