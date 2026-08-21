import { describe, expect, it } from "vitest";
import {
	areProspectiveAccountSnapshotsFresh,
	areProspectiveAccountSnapshotsIndividuallyFresh,
	canEstimateProspectiveLiquidationDraft,
	estimateProspectiveLiquidation,
	type ProspectiveLiquidationInput,
	resolveCrossMarginAccount,
	resolveMarketMarginTiers,
} from "@/domain/trade/order/liquidation";

const FORTY_X_TIER = [{ lowerBound: "0", maxLeverage: 40 }] as const;

function isolatedInput(overrides: Partial<ProspectiveLiquidationInput> = {}): ProspectiveLiquidationInput {
	return {
		price: 100,
		orderSize: 1,
		leverage: 40,
		side: "buy",
		marginMode: "isolated",
		accountMode: "disabled",
		marginTiers: FORTY_X_TIER,
		dataReady: true,
		...overrides,
	};
}

describe("estimateProspectiveLiquidation", () => {
	it("estimates a new cross position from account equity and maintenance without using selected leverage", () => {
		const base = isolatedInput({
			marginMode: "cross",
			orderSize: 10,
			crossMarginAccount: { accountValue: "100", maintenanceMarginUsed: "0" },
		});

		const fortyX = estimateProspectiveLiquidation(base);
		const fiveX = estimateProspectiveLiquidation({ ...base, leverage: 5 });

		expect(fortyX.status).toBe("available");
		expect(fortyX.liqPrice).toBeCloseTo(91.13924050632912, 12);
		expect(fiveX.liqPrice).toBeCloseTo(fortyX.liqPrice ?? Number.NaN, 12);
	});

	it("keeps other cross positions' maintenance requirement in the candidate equation", () => {
		const result = estimateProspectiveLiquidation(
			isolatedInput({
				marginMode: "cross",
				orderSize: 10,
				crossMarginAccount: { accountValue: "100", maintenanceMarginUsed: "20" },
			}),
		);

		expect(result.status).toBe("available");
		expect(result.liqPrice).toBeCloseTo(93.16455696202532, 12);
	});

	it("deducts the estimated execution fee from cross equity", () => {
		const result = estimateProspectiveLiquidation(
			isolatedInput({
				marginMode: "cross",
				orderSize: 10,
				crossMarginAccount: { accountValue: "100", maintenanceMarginUsed: "0" },
				executionFee: "1",
			}),
		);

		expect(result.status).toBe("available");
		expect(result.liqPrice).toBeCloseTo(91.24050632911393, 12);
	});

	it("replaces the target position's current maintenance when adding in cross mode", () => {
		const result = estimateProspectiveLiquidation(
			isolatedInput({
				marginMode: "cross",
				orderSize: 1,
				crossMarginAccount: { accountValue: "20", maintenanceMarginUsed: "1.25" },
				existingPosition: {
					signedSize: "1",
					positionValue: "100",
					marginUsed: "2.5",
					marginMode: "cross",
					leverage: 40,
				},
			}),
		);

		expect(result.status).toBe("available");
		expect(result.liqPrice).toBeCloseTo(91.13924050632912, 12);
	});

	it("uses Hyperliquid maintenance margin for a new 40x isolated long", () => {
		const result = estimateProspectiveLiquidation(isolatedInput());

		expect(result.status).toBe("available");
		expect(result.liqPrice).toBeCloseTo(98.73417721518987, 12);
		expect(result.liqWarning).toBe(true);
	});

	it("uses Hyperliquid maintenance margin for a new 40x isolated short", () => {
		const result = estimateProspectiveLiquidation(isolatedInput({ side: "sell" }));

		expect(result.status).toBe("available");
		expect(result.liqPrice).toBeCloseTo(101.23456790123457, 12);
		expect(result.liqWarning).toBe(true);
	});

	it("solves against the tier containing the candidate liquidation notional", () => {
		const result = estimateProspectiveLiquidation(
			isolatedInput({
				price: 90,
				orderSize: 10,
				leverage: 5,
				side: "sell",
				marginTiers: [
					{ lowerBound: "0", maxLeverage: 10 },
					{ lowerBound: "1000", maxLeverage: 5 },
				],
			}),
		);

		expect(result.status).toBe("available");
		if (result.status !== "available") throw new Error("Expected an available estimate");
		expect(result.tierIndex).toBe(1);
		expect(result.liqPrice).toBeCloseTo(102.72727272727273, 12);
	});

	it("uses the higher tier at an exact liquidation-notional boundary", () => {
		const result = estimateProspectiveLiquidation(
			isolatedInput({
				price: 87.5,
				orderSize: 10,
				leverage: 5,
				side: "sell",
				marginTiers: [
					{ lowerBound: "0", maxLeverage: 10 },
					{ lowerBound: "1000", maxLeverage: 5 },
				],
			}),
		);

		expect(result.status).toBe("available");
		if (result.status !== "available") throw new Error("Expected an available estimate");
		expect(result.tierIndex).toBe(1);
		expect(result.liqPrice).toBe(100);
	});

	it("projects an existing same-direction isolated position from its live snapshot", () => {
		const result = estimateProspectiveLiquidation(
			isolatedInput({
				price: 110,
				orderSize: 1,
				leverage: 20,
				existingPosition: {
					signedSize: "1",
					positionValue: "100",
					marginUsed: "5",
					marginMode: "isolated",
					leverage: 20,
				},
			}),
		);

		expect(result.status).toBe("available");
		expect(result.liqPrice).toBeCloseTo(101.0126582278481, 12);
	});

	it("matches the official isolated snapshot without double-counting unrealized PnL", () => {
		// The estimator requires a prospective add, so a negligible positive size
		// is used to approach the official snapshot's server liquidationPx.
		const result = estimateProspectiveLiquidation(
			isolatedInput({
				price: "2985.9",
				orderSize: "0.000000000001",
				leverage: 20,
				marginTiers: [{ lowerBound: "0", maxLeverage: 50 }],
				existingPosition: {
					signedSize: "0.0335",
					positionValue: "100.02765",
					marginUsed: "4.967826",
					marginMode: "isolated",
					leverage: 20,
				},
			}),
		);

		expect(result.status).toBe("available");
		expect(result.liqPrice).toBeCloseTo(2866.26936529, 4);
	});

	it.each([
		["cross margin without an account snapshot", { marginMode: "cross" }],
		["portfolio margin", { accountMode: "portfolioMargin" }],
		["stale data", { dataReady: false }],
		["missing tiers", { marginTiers: null }],
		["reduce-only", { reduceOnly: true }],
		[
			"a reversing order",
			{
				side: "sell",
				existingPosition: {
					signedSize: "1",
					positionValue: "100",
					marginUsed: "5",
					marginMode: "isolated",
					leverage: 40,
				},
			},
		],
		[
			"a cross existing position",
			{
				existingPosition: {
					signedSize: "1",
					positionValue: "100",
					marginUsed: "5",
					marginMode: "cross",
					leverage: 40,
				},
			},
		],
		[
			"an already under-maintained projection",
			{
				orderSize: "0.001",
				existingPosition: {
					signedSize: "1",
					positionValue: "100",
					marginUsed: "0.1",
					marginMode: "isolated",
					leverage: 40,
				},
			},
		],
	] satisfies [string, Partial<ProspectiveLiquidationInput>][])("returns unavailable for %s", (_name, overrides) => {
		const result = estimateProspectiveLiquidation(isolatedInput(overrides));

		expect(result.status).toBe("unavailable");
		expect(result.liqPrice).toBeNull();
		expect(result.liqWarning).toBe(false);
	});
});

describe("resolveCrossMarginAccount", () => {
	it("uses the selected DEX cross summary for a standard account", () => {
		expect(
			resolveCrossMarginAccount({
				accountMode: "disabled",
				selectedDex: "",
				selectedCollateralToken: 0,
				selectedCrossAccountValue: "125",
				selectedCrossMaintenanceMarginUsed: "12.5",
				allDexStates: [],
				dexCollateralTokens: [],
				spotBalances: [],
				dataReady: true,
			}),
		).toEqual({ accountValue: "125", maintenanceMarginUsed: "12.5" });
	});

	it("aggregates unified collateral equity and cross maintenance by token", () => {
		expect(
			resolveCrossMarginAccount({
				accountMode: "unifiedAccount",
				selectedDex: "",
				selectedCollateralToken: 0,
				selectedCrossAccountValue: null,
				selectedCrossMaintenanceMarginUsed: null,
				allDexStates: [
					{
						dex: "",
						crossMaintenanceMarginUsed: "10",
						positions: [{ marginMode: "cross", marginUsed: "25" }],
					},
					{
						dex: "xyz",
						crossMaintenanceMarginUsed: "5",
						positions: [{ marginMode: "isolated", marginUsed: "20" }],
					},
					{
						dex: "other-collateral",
						crossMaintenanceMarginUsed: "99",
						positions: [{ marginMode: "isolated", marginUsed: "30" }],
					},
				],
				dexCollateralTokens: [
					{ dex: "", token: 0 },
					{ dex: "xyz", token: 0 },
					{ dex: "other-collateral", token: 1 },
				],
				spotBalances: [
					{ token: 0, total: "100" },
					{ token: 1, total: "1000" },
				],
				dataReady: true,
			}),
		).toEqual({ accountValue: "80", maintenanceMarginUsed: "15" });
	});

	it("fails closed for portfolio mode, stale snapshots, and incomplete DEX mappings", () => {
		const input = {
			accountMode: "unifiedAccount",
			selectedDex: "",
			selectedCollateralToken: 0,
			selectedCrossAccountValue: null,
			selectedCrossMaintenanceMarginUsed: null,
			allDexStates: [{ dex: "", crossMaintenanceMarginUsed: "1", positions: [] }],
			dexCollateralTokens: [{ dex: "", token: 0 }],
			spotBalances: [{ token: 0, total: "100" }],
			dataReady: true,
		} as const;

		expect(resolveCrossMarginAccount({ ...input, accountMode: "portfolioMargin" })).toBeNull();
		expect(resolveCrossMarginAccount({ ...input, dataReady: false })).toBeNull();
		expect(
			resolveCrossMarginAccount({
				...input,
				allDexStates: [...input.allDexStates, { dex: "unmapped", crossMaintenanceMarginUsed: "1", positions: [] }],
			}),
		).toBeNull();
	});
});

describe("prospective account snapshot freshness", () => {
	const now = 1_000_000;

	it("accepts a fresh standard-account perp snapshot", () => {
		expect(
			areProspectiveAccountSnapshotsFresh({
				perpReceivedAt: now - 1_000,
				requireSpot: false,
				now,
			}),
		).toBe(true);
	});

	it("requires unified perp and spot snapshots to be fresh and synchronized", () => {
		expect(
			areProspectiveAccountSnapshotsFresh({
				perpReceivedAt: now - 2_000,
				spotReceivedAt: now - 3_000,
				requireSpot: true,
				now,
			}),
		).toBe(true);
		expect(
			areProspectiveAccountSnapshotsFresh({
				perpReceivedAt: now - 1_000,
				spotReceivedAt: now - 7_000,
				requireSpot: true,
				now,
			}),
		).toBe(false);
	});

	it("rejects missing, stale, and future-dated snapshots", () => {
		expect(areProspectiveAccountSnapshotsFresh({ perpReceivedAt: undefined, requireSpot: false, now })).toBe(false);
		expect(areProspectiveAccountSnapshotsFresh({ perpReceivedAt: now - 60_001, requireSpot: false, now })).toBe(false);
		expect(areProspectiveAccountSnapshotsFresh({ perpReceivedAt: now + 1, requireSpot: false, now })).toBe(false);
		expect(
			areProspectiveAccountSnapshotsFresh({
				perpReceivedAt: now - 1_000,
				spotReceivedAt: undefined,
				requireSpot: true,
				now,
			}),
		).toBe(false);
	});

	it("distinguishes a fresh one-leg update from a stale snapshot", () => {
		expect(
			areProspectiveAccountSnapshotsIndividuallyFresh({
				perpReceivedAt: now - 500,
				spotReceivedAt: now - 5_501,
				now,
			}),
		).toBe(true);
		expect(
			areProspectiveAccountSnapshotsFresh({
				perpReceivedAt: now - 500,
				spotReceivedAt: now - 5_501,
				requireSpot: true,
				now,
			}),
		).toBe(false);
		expect(
			areProspectiveAccountSnapshotsIndividuallyFresh({
				perpReceivedAt: now - 500,
				spotReceivedAt: now - 60_001,
				now,
			}),
		).toBe(false);
	});
});

describe("prospective liquidation draft support", () => {
	it("fails closed for an underfunded cross draft instead of inventing a top-up", () => {
		expect(canEstimateProspectiveLiquidationDraft({ marginMode: "cross", orderSize: "1.01", maxOrderSize: "1" })).toBe(
			false,
		);
		expect(canEstimateProspectiveLiquidationDraft({ marginMode: "cross", orderSize: "1", maxOrderSize: "1" })).toBe(
			true,
		);
	});

	it("allows isolated drafts because their initial margin is explicit in the estimator", () => {
		expect(canEstimateProspectiveLiquidationDraft({ marginMode: "isolated", orderSize: "10", maxOrderSize: "1" })).toBe(
			true,
		);
	});
});

describe("resolveMarketMarginTiers", () => {
	it("resolves explicit margin table tiers", () => {
		const tiers = [{ lowerBound: "0", maxLeverage: 40 }];

		expect(
			resolveMarketMarginTiers({
				marginTableId: 50,
				maxLeverage: 40,
				marginTables: [[50, { marginTiers: tiers }]],
			}),
		).toBe(tiers);
	});

	it("synthesizes protocol-defined implicit tables below id 50", () => {
		expect(resolveMarketMarginTiers({ marginTableId: 20, maxLeverage: 20, marginTables: [] })).toEqual([
			{ lowerBound: "0", maxLeverage: 20 },
		]);
	});

	it("fails closed when margin metadata is inconsistent", () => {
		expect(resolveMarketMarginTiers({ marginTableId: 20, maxLeverage: 10, marginTables: [] })).toBeNull();
		expect(
			resolveMarketMarginTiers({
				marginTableId: 50,
				maxLeverage: 40,
				marginTables: [[50, { marginTiers: [{ lowerBound: "0", maxLeverage: 20 }] }]],
			}),
		).toBeNull();
	});
});
