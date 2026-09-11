import { describe, expect, it } from "vitest";
import { type DeriveAccountOverviewInput, deriveAccountOverview } from "@/domain/trade/account-overview";
import type { AccountBalances } from "@/hooks/trade/use-account-balances";

function createBalances(overrides: Partial<AccountBalances> = {}): AccountBalances {
	return {
		accountAbstraction: "disabled",
		allDexClearinghouseStates: [],
		crossMaintenanceMarginUsed: "5",
		dex: "",
		hasAllDexsSnapshot: true,
		hasError: false,
		hasSpotStateSnapshot: true,
		isDataStale: false,
		isLoading: false,
		isPerpStateStale: false,
		isSpotStateStale: false,
		marginSummary: {
			accountValue: "100",
			totalMarginUsed: "10",
			totalNtlPos: "200",
			totalRawUsd: "100",
		} as AccountBalances["marginSummary"],
		perpPositions: [],
		perpStateReceivedAt: 1,
		perpStateStatus: "success",
		perpSummary: {
			accountValue: "100",
			totalMarginUsed: "10",
			totalNtlPos: "200",
			totalRawUsd: "100",
		} as AccountBalances["perpSummary"],
		portfolioMarginRatio: null,
		spotAvailableAfterMaintenance: [],
		spotBalances: [],
		spotStateReceivedAt: 1,
		spotStateStatus: "success",
		withdrawable: "90",
		...overrides,
	};
}

function createInput(overrides: Partial<DeriveAccountOverviewInput> = {}): DeriveAccountOverviewInput {
	const balances = createBalances();
	return {
		collaterals: [{ dex: "", tokenIndex: 0, tokenName: "USDC" }],
		defaultBalances: balances,
		isConnected: true,
		selectedBalances: balances,
		tokenUsdPrices: {},
		tokenUsdPriceStatus: "success",
		...overrides,
	};
}

describe("account overview derivation", () => {
	it("returns ready decimal-string metrics for a complete separate-account snapshot", () => {
		const overview = deriveAccountOverview(createInput());

		expect(overview.status).toBe("ready");
		expect(overview.accountMode).toBe("separate");
		expect(overview.accountEquityValue).toBe("100");
		expect(overview.riskSummary).toEqual({
			crossMaintenanceMarginUsed: "5",
			totalMarginUsed: "10",
			totalNtlPos: "200",
			unrealizedPnl: "0",
		});
		expect(overview.maintenanceMarginRatio).toBe("0.05");
		expect(overview.crossLeverage).toBe("2");
		expect(overview.summaryReady).toBe(true);
	});

	it("derives unified and portfolio-margin risk from their mode-specific sources", () => {
		const sharedBalances = createBalances({
			accountAbstraction: "unifiedAccount",
			allDexClearinghouseStates: [
				[
					"",
					{
						assetPositions: [{ position: { leverage: { type: "cross" }, marginUsed: "5", unrealizedPnl: "-2" } }],
						crossMaintenanceMarginUsed: "10",
						crossMarginSummary: {
							accountValue: "100",
							totalMarginUsed: "5",
							totalNtlPos: "20",
							totalRawUsd: "100",
						},
						marginSummary: {
							accountValue: "100",
							totalMarginUsed: "5",
							totalNtlPos: "20",
							totalRawUsd: "100",
						},
						time: 0,
						withdrawable: "0",
					},
				],
			] as AccountBalances["allDexClearinghouseStates"],
			spotBalances: [
				{ coin: "USDC", entryNtl: "0", hold: "0", token: 0, total: "100" },
			] as AccountBalances["spotBalances"],
		});
		const unified = deriveAccountOverview(
			createInput({ defaultBalances: sharedBalances, selectedBalances: sharedBalances }),
		);

		expect(unified.status).toBe("ready");
		expect(unified.accountMode).toBe("unified");
		expect(unified.accountEquityValue).toBe("100");
		expect(unified.riskSummary?.unrealizedPnl).toBe("-2");
		expect(unified.maintenanceMarginRatio).toBe("0.1");
		expect(unified.crossLeverage).toBe("0.2");

		const portfolioBalances = createBalances({
			...sharedBalances,
			accountAbstraction: "portfolioMargin",
			portfolioMarginRatio: "0.42",
		});
		const portfolio = deriveAccountOverview(
			createInput({ defaultBalances: portfolioBalances, selectedBalances: portfolioBalances }),
		);

		expect(portfolio.status).toBe("ready");
		expect(portfolio.accountMode).toBe("portfolioMargin");
		expect(portfolio.maintenanceMarginRatio).toBe("0.42");
	});

	it("preserves confirmed zeroes without using zero as an unavailable sentinel", () => {
		const zeroBalances = createBalances({
			accountAbstraction: "unifiedAccount",
			allDexClearinghouseStates: [
				[
					"",
					{
						assetPositions: [],
						crossMaintenanceMarginUsed: "0",
						crossMarginSummary: {
							accountValue: "0",
							totalMarginUsed: "0",
							totalNtlPos: "0",
							totalRawUsd: "0",
						},
						marginSummary: {
							accountValue: "0",
							totalMarginUsed: "0",
							totalNtlPos: "0",
							totalRawUsd: "0",
						},
						time: 0,
						withdrawable: "0",
					},
				],
			] as AccountBalances["allDexClearinghouseStates"],
			spotBalances: [
				{ coin: "USDC", entryNtl: "0", hold: "0", token: 0, total: "0" },
			] as AccountBalances["spotBalances"],
		});
		const overview = deriveAccountOverview(
			createInput({ defaultBalances: zeroBalances, selectedBalances: zeroBalances }),
		);

		expect(overview.status).toBe("ready");
		expect(overview.accountEquityValue).toBe("0");
		expect(overview.riskSummary).toEqual({
			crossMaintenanceMarginUsed: "0",
			totalMarginUsed: "0",
			totalNtlPos: "0",
			unrealizedPnl: "0",
		});
		expect(overview.maintenanceMarginRatio).toBe("0");

		const separateZeroBalances = createBalances({
			crossMaintenanceMarginUsed: "0",
			marginSummary: {
				accountValue: "0",
				totalMarginUsed: "0",
				totalNtlPos: "0",
				totalRawUsd: "0",
			} as AccountBalances["marginSummary"],
			perpSummary: {
				accountValue: "0",
				totalMarginUsed: "0",
				totalNtlPos: "0",
				totalRawUsd: "0",
			} as AccountBalances["perpSummary"],
		});
		const separateZero = deriveAccountOverview(
			createInput({ defaultBalances: separateZeroBalances, selectedBalances: separateZeroBalances }),
		);
		expect(separateZero.status).toBe("ready");
		expect(separateZero.accountEquityValue).toBe("0");
		expect(separateZero.maintenanceMarginRatio).toBeNull();
		expect(separateZero.valuationUnavailable).toBe(false);

		const portfolioZeroBalances = createBalances({
			...zeroBalances,
			accountAbstraction: "portfolioMargin",
			portfolioMarginRatio: null,
		});
		const portfolioZero = deriveAccountOverview(
			createInput({ defaultBalances: portfolioZeroBalances, selectedBalances: portfolioZeroBalances }),
		);
		expect(portfolioZero.status).toBe("ready");
		expect(portfolioZero.accountEquityValue).toBe("0");
		expect(portfolioZero.maintenanceMarginRatio).toBeNull();
		expect(portfolioZero.valuationUnavailable).toBe(false);
	});

	it.each([
		["loading", { perpStateStatus: "loading" }],
		["error", { hasError: true, perpStateStatus: "error" }],
		["stale", { isDataStale: true, isPerpStateStale: true, perpStateStatus: "stale" }],
	] as const)("returns %s without exposing fallback zeroes", (status, balanceOverrides) => {
		const balances = createBalances(balanceOverrides);
		const overview = deriveAccountOverview(createInput({ defaultBalances: balances, selectedBalances: balances }));

		expect(overview.status).toBe(status);
		expect(overview.snapshotReady).toBe(false);
		expect(overview.accountEquityValue).toBeNull();
		expect(overview.riskSummary).toBeNull();
		expect(overview.maintenanceMarginRatio).toBeNull();
	});

	it("prioritizes error and stale states over concurrent loading flags", () => {
		const errored = createBalances({
			hasError: true,
			isLoading: true,
			isPerpStateStale: true,
			perpStateStatus: "error",
		});
		expect(deriveAccountOverview(createInput({ defaultBalances: errored, selectedBalances: errored })).status).toBe(
			"error",
		);

		const stale = createBalances({ isLoading: true, isPerpStateStale: true, perpStateStatus: "stale" });
		expect(deriveAccountOverview(createInput({ defaultBalances: stale, selectedBalances: stale })).status).toBe(
			"stale",
		);
	});

	it("returns unavailable when a shared account snapshot is incomplete", () => {
		const balances = createBalances({
			accountAbstraction: "unifiedAccount",
			hasAllDexsSnapshot: false,
			hasSpotStateSnapshot: false,
		});
		const overview = deriveAccountOverview(createInput({ defaultBalances: balances, selectedBalances: balances }));

		expect(overview.status).toBe("unavailable");
		expect(overview.snapshotReady).toBe(false);
		expect(overview.accountEquityValue).toBeNull();
		expect(overview.riskSummary).toBeNull();
	});

	it("keeps separate Perps readable during a Spot-only failure but fails shared accounts closed", () => {
		const separateBalances = createBalances({ hasError: true, spotStateStatus: "error" });
		const separate = deriveAccountOverview(
			createInput({ defaultBalances: separateBalances, selectedBalances: separateBalances }),
		);
		expect(separate.status).toBe("ready");
		expect(separate.accountEquityValue).toBe("100");
		expect(separate.fundsActionsReady).toBe(false);

		const sharedBalances = createBalances({
			...separateBalances,
			accountAbstraction: "unifiedAccount",
		});
		const shared = deriveAccountOverview(
			createInput({ defaultBalances: sharedBalances, selectedBalances: sharedBalances }),
		);
		expect(shared.status).toBe("error");
		expect(shared.accountEquityValue).toBeNull();
	});

	it("requires a current collateral price instead of treating a non-USDC value as USD", () => {
		const balances = createBalances({ dex: "xyz" });
		const input = createInput({
			collaterals: [
				{ dex: "", tokenIndex: 0, tokenName: "USDC" },
				{ dex: "xyz", tokenIndex: 150, tokenName: "HYPE" },
			],
			defaultBalances: balances,
			selectedBalances: balances,
		});

		const missingPrice = deriveAccountOverview(input);
		expect(missingPrice.requiresUsdPrices).toBe(true);
		expect(missingPrice.status).toBe("unavailable");
		expect(missingPrice.accountEquityValue).toBeNull();
		expect(missingPrice.riskSummary).toBeNull();

		const priced = deriveAccountOverview({ ...input, tokenUsdPrices: { HYPE: "2" } });
		expect(priced.status).toBe("ready");
		expect(priced.accountEquityValue).toBe("200");
		expect(priced.riskSummary?.crossMaintenanceMarginUsed).toBe("10");
	});

	it("uses selected-Dex balances for separate mode and default Spot balances for shared modes", () => {
		const defaultBalances = createBalances();
		const selectedBalances = createBalances({
			dex: "xyz",
			crossMaintenanceMarginUsed: "1",
			marginSummary: {
				accountValue: "7",
				totalMarginUsed: "2",
				totalNtlPos: "4",
				totalRawUsd: "7",
			} as AccountBalances["marginSummary"],
			perpSummary: {
				accountValue: "6",
				totalMarginUsed: "2",
				totalNtlPos: "3",
				totalRawUsd: "6",
			} as AccountBalances["perpSummary"],
		});
		const separate = deriveAccountOverview({
			...createInput(),
			collaterals: [
				{ dex: "", tokenIndex: 0, tokenName: "USDC" },
				{ dex: "xyz", tokenIndex: 150, tokenName: "HYPE" },
			],
			defaultBalances,
			selectedBalances,
			tokenUsdPrices: { HYPE: "2" },
		});
		expect(separate.accountEquityValue).toBe("14");
		expect(separate.crossAccountEquityValue).toBe("12");
		expect(separate.riskSummary?.totalNtlPos).toBe("6");

		const defaultShared = createBalances({
			accountAbstraction: "unifiedAccount",
			spotBalances: [
				{ coin: "USDC", entryNtl: "0", hold: "0", token: 0, total: "33" },
			] as AccountBalances["spotBalances"],
		});
		const selectedShared = createBalances({
			accountAbstraction: "unifiedAccount",
			dex: "xyz",
			spotBalances: [
				{ coin: "USDC", entryNtl: "0", hold: "0", token: 0, total: "999" },
			] as AccountBalances["spotBalances"],
		});
		const shared = deriveAccountOverview({
			...createInput(),
			defaultBalances: defaultShared,
			selectedBalances: selectedShared,
		});
		expect(shared.status).toBe("ready");
		expect(shared.accountEquityValue).toBe("33");
	});

	it("keeps disconnected and unsupported account modes unavailable", () => {
		const disconnected = deriveAccountOverview(createInput({ isConnected: false }));
		expect(disconnected.status).toBe("unavailable");
		expect(disconnected.accountEquityValue).toBeNull();

		const unsupported = createBalances({ accountAbstraction: "unknown" });
		const unsupportedOverview = deriveAccountOverview(
			createInput({ defaultBalances: unsupported, selectedBalances: unsupported }),
		);
		expect(unsupportedOverview.status).toBe("unavailable");
		expect(unsupportedOverview.accountMode).toBe("unavailable");
		expect(unsupportedOverview.accountEquityValue).toBeNull();
	});
});
