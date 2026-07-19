// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortfolioOverview } from "@/components/portfolio/portfolio-overview";
import type { InfoResponse } from "@/lib/hyperliquid";

const mocks = vi.hoisted(() => ({
	portfolioData: undefined as InfoResponse<"portfolio"> | undefined,
	portfolioError: true,
	refetchPortfolio: vi.fn(),
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
	getAccountBalanceSummary: () => ({
		spotAccountValue: "42",
		perpAccountValue: "0",
		usesSpotStateForPerps: true,
	}),
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	useDefaultDexBalances: () => ({}),
}));

vi.mock("@/hooks/trade/use-spot-token-usd-prices", () => ({
	useSpotTokenUsdPrices: () => new Map(),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: "0x0000000000000000000000000000000000000001",
		isConnected: true,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
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
				data: {
					dailyUserVlm: [],
					userAddRate: "0.00015",
					userCrossRate: "0.00045",
					userSpotAddRate: "0.0004",
					userSpotCrossRate: "0.0007",
				},
				isError: false,
				isFetching: false,
				isPending: false,
			};
		}

		return {
			data: method === "userVaultEquities" || method === "allBorrowLendReserveStates" ? [] : undefined,
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
		mocks.portfolioData = undefined;
		mocks.portfolioError = true;
		mocks.refetchPortfolio.mockReset();
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
