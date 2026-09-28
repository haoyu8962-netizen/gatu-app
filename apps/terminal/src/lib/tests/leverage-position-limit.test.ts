import Big from "big.js";
import { describe, expect, it } from "vitest";
import {
	getLeveragePositionLimit,
	hasLeveragePositionLimits,
	type MarginTierInput,
	resolveMarketMarginTiers,
} from "@/domain/trade/order/liquidation";

const BTC_TIERS = [
	{ lowerBound: "0.0", maxLeverage: 40 },
	{ lowerBound: "150000000.0", maxLeverage: 20 },
] as const;

const THREE_TIERS = [
	{ lowerBound: "0", maxLeverage: 50 },
	{ lowerBound: "100000000", maxLeverage: 25 },
	{ lowerBound: "500000000", maxLeverage: 10 },
] as const;

interface ProtocolMarginTier {
	lowerBound: string;
	maxLeverage: number;
}

const MAINNET_2026_09_27_TABLES: readonly (readonly ProtocolMarginTier[])[] = [
	[
		{ lowerBound: "0.0", maxLeverage: 10 },
		{ lowerBound: "3000000.0", maxLeverage: 5 },
	],
	[
		{ lowerBound: "0.0", maxLeverage: 10 },
		{ lowerBound: "20000000.0", maxLeverage: 5 },
	],
	[
		{ lowerBound: "0.0", maxLeverage: 20 },
		{ lowerBound: "40000000.0", maxLeverage: 10 },
	],
	[
		{ lowerBound: "0.0", maxLeverage: 20 },
		{ lowerBound: "70000000.0", maxLeverage: 10 },
	],
	[
		{ lowerBound: "0.0", maxLeverage: 25 },
		{ lowerBound: "100000000.0", maxLeverage: 15 },
	],
	BTC_TIERS,
	THREE_TIERS,
];

function officialLeveragePositionLimit(tiers: readonly ProtocolMarginTier[], leverage: number): string | null {
	for (const tier of tiers) if (tier.maxLeverage < leverage) return tier.lowerBound;
	return null;
}

describe("getLeveragePositionLimit", () => {
	it("caps leverage above a lower tier at that tier's lower bound", () => {
		expect(getLeveragePositionLimit(BTC_TIERS, 40)).toEqual({ status: "limited", maxPositionNotional: "150000000" });
		expect(getLeveragePositionLimit(BTC_TIERS, 21)).toEqual({ status: "limited", maxPositionNotional: "150000000" });
		expect(getLeveragePositionLimit(BTC_TIERS, 20)).toEqual({ status: "unlimited" });
		expect(getLeveragePositionLimit(BTC_TIERS, 1)).toEqual({ status: "unlimited" });
	});

	it("uses the first tier whose maximum leverage is below the selected leverage", () => {
		expect(getLeveragePositionLimit(THREE_TIERS, 50)).toEqual({ status: "limited", maxPositionNotional: "100000000" });
		expect(getLeveragePositionLimit(THREE_TIERS, 26)).toEqual({ status: "limited", maxPositionNotional: "100000000" });
		expect(getLeveragePositionLimit(THREE_TIERS, 25)).toEqual({ status: "limited", maxPositionNotional: "500000000" });
		expect(getLeveragePositionLimit(THREE_TIERS, 11)).toEqual({ status: "limited", maxPositionNotional: "500000000" });
		expect(getLeveragePositionLimit(THREE_TIERS, 10)).toEqual({ status: "unlimited" });
	});

	it("matches the official first-match loop for every leverage of the mainnet tables", () => {
		for (const tiers of MAINNET_2026_09_27_TABLES) {
			const maxLeverage = tiers[0]?.maxLeverage ?? 0;
			for (let leverage = 1; leverage <= maxLeverage; leverage++) {
				const official = officialLeveragePositionLimit(tiers, leverage);
				const expected =
					official === null
						? { status: "unlimited" }
						: { status: "limited", maxPositionNotional: Big(official).toFixed() };
				expect(getLeveragePositionLimit(tiers, leverage), `${maxLeverage}x table at ${leverage}x`).toEqual(expected);
			}
		}
	});

	it("keeps large lower bounds exact without exponent notation", () => {
		expect(
			getLeveragePositionLimit(
				[
					{ lowerBound: "0", maxLeverage: 10 },
					{ lowerBound: "123456789012345678901.5", maxLeverage: 5 },
				],
				6,
			),
		).toEqual({ status: "limited", maxPositionNotional: "123456789012345678901.5" });
	});

	it.each([0, 1.5, Number.NaN, -1, 41, Number.POSITIVE_INFINITY])("fails closed for leverage %s", (leverage) => {
		expect(getLeveragePositionLimit(BTC_TIERS, leverage)).toEqual({ status: "unavailable" });
	});

	it.each(invalidTables())("fails closed for %s", (_name, tiers) => {
		expect(getLeveragePositionLimit(tiers, 5)).toEqual({ status: "unavailable" });
	});

	it("reports a single-tier table as unlimited within its maximum", () => {
		expect(getLeveragePositionLimit([{ lowerBound: "0", maxLeverage: 20 }], 20)).toEqual({ status: "unlimited" });
	});
});

describe("hasLeveragePositionLimits", () => {
	it("is true only for valid tables with more than one tier", () => {
		expect(hasLeveragePositionLimits(BTC_TIERS)).toBe(true);
		expect(hasLeveragePositionLimits(THREE_TIERS)).toBe(true);
		expect(hasLeveragePositionLimits([{ lowerBound: "0.0", maxLeverage: 50 }])).toBe(false);
		expect(
			hasLeveragePositionLimits(resolveMarketMarginTiers({ marginTableId: 20, maxLeverage: 20, marginTables: [] })),
		).toBe(false);
		expect(hasLeveragePositionLimits(null)).toBe(false);
		expect(hasLeveragePositionLimits(undefined)).toBe(false);
	});

	it.each(invalidTables())("is false for %s", (_name, tiers) => {
		expect(hasLeveragePositionLimits(tiers)).toBe(false);
	});
});

function invalidTables(): [string, readonly MarginTierInput[] | null | undefined][] {
	return [
		["missing tiers", undefined],
		["null tiers", null],
		["an empty table", []],
		[
			"unsorted lower bounds",
			[
				{ lowerBound: "0", maxLeverage: 20 },
				{ lowerBound: "200", maxLeverage: 10 },
				{ lowerBound: "100", maxLeverage: 5 },
			],
		],
		[
			"a duplicate lower bound",
			[
				{ lowerBound: "0", maxLeverage: 20 },
				{ lowerBound: "0", maxLeverage: 10 },
			],
		],
		[
			"a first lower bound other than zero",
			[
				{ lowerBound: "10", maxLeverage: 20 },
				{ lowerBound: "100", maxLeverage: 10 },
			],
		],
		[
			"a non-integer maximum leverage",
			[
				{ lowerBound: "0", maxLeverage: 20 },
				{ lowerBound: "100", maxLeverage: 7.5 },
			],
		],
		[
			"an increasing maximum leverage",
			[
				{ lowerBound: "0", maxLeverage: 10 },
				{ lowerBound: "100", maxLeverage: 20 },
			],
		],
		[
			"a malformed lower bound",
			[
				{ lowerBound: "0", maxLeverage: 20 },
				{ lowerBound: "abc", maxLeverage: 10 },
			],
		],
	];
}
