import type { PredictedFundingsResponse } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import {
	buildFundingComparisonRows,
	deriveFundingComparisonPage,
	type FundingComparisonMarketContext,
	type FundingComparisonSourceRow,
	getFundingComparisonArb,
	getFundingComparisonHourlyRate,
	getFundingComparisonPeriodRate,
	getFundingComparisonRateTone,
	getFundingComparisonSnapshotRemainingMs,
	isFundingComparisonSnapshotFresh,
	observeFundingComparisonSnapshot,
	parsePredictedFundings,
	toggleFundingComparisonSort,
} from "@/domain/market/funding-comparison";
import { LIVE_MARK_MAX_STALE_MS } from "@/domain/trade/market-price";

const NEXT = 1_790_000_000_000;

function venue(fundingRate: string, fundingIntervalHours?: number) {
	return fundingIntervalHours === undefined
		? { fundingRate, nextFundingTime: NEXT }
		: { fundingRate, nextFundingTime: NEXT, fundingIntervalHours };
}

const SNAPSHOT: PredictedFundingsResponse = [
	[
		"PONS",
		[
			["BinPerp", venue("0.00012985", 4)],
			["HlPerp", venue("0.0000284027", 1)],
			["BybitPerp", null],
		],
	],
	[
		"BTC",
		[
			["BinPerp", venue("0.0001", 8)],
			["HlPerp", venue("0.0000125")],
			["BybitPerp", venue("-0.00005", 1)],
		],
	],
	[
		"HYPE",
		[
			["BinPerp", null],
			["HlPerp", venue("0.0000125", 1)],
			["BybitPerp", null],
		],
	],
	[
		"OLD",
		[
			["BinPerp", venue("0.0", 8)],
			["HlPerp", venue("0.0", 1)],
		],
	],
	[
		"ZERO",
		[
			["BinPerp", venue("0.0")],
			["HlPerp", venue("0", 1)],
			["BybitPerp", venue("0.0", 4)],
		],
	],
];

const PRICE_RECEIVED_AT = 1_800_000_000_000;
const LIVE_CONTEXTS = { perpContextsLive: true, now: PRICE_RECEIVED_AT };

function market(
	name: string,
	openInterest?: string,
	markPx?: string,
	overrides: Partial<FundingComparisonMarketContext> = {},
): FundingComparisonMarketContext {
	const live = openInterest !== undefined && markPx !== undefined;
	return {
		name,
		openInterest,
		markPx,
		markPriceStatus: live ? "success" : "loading",
		markPriceReceivedAt: live ? PRICE_RECEIVED_AT : undefined,
		...overrides,
	};
}

const MARKETS: FundingComparisonMarketContext[] = [
	market("PONS", "1000", "0.5"),
	market("BTC", "10.5", "100000"),
	market("HYPE", "5", "40"),
	market("ZERO"),
];

function sourceRow(coin: string, hourly: Partial<FundingComparisonSourceRow["hourlyRates"]>, oi: string | null) {
	return {
		coin,
		openInterestUsd: oi,
		hourlyRates: { HlPerp: null, BinPerp: null, BybitPerp: null, ...hourly },
	} satisfies FundingComparisonSourceRow;
}

function page(
	rows: readonly FundingComparisonSourceRow[],
	overrides: Partial<Parameters<typeof deriveFundingComparisonPage>[0]> = {},
) {
	return deriveFundingComparisonPage({
		rows,
		period: "8h",
		sortKey: "openInterest",
		sortDirection: "descending",
		query: "",
		page: 1,
		rowsPerPage: 25,
		...overrides,
	});
}

describe("parsePredictedFundings", () => {
	it("accepts the protocol shape, null venue data and unknown venues", () => {
		const value: unknown = [
			...SNAPSHOT,
			[
				"ETH",
				[
					["OkxPerp", { anything: true }],
					["HlPerp", null],
				],
			],
		];
		expect(parsePredictedFundings(value)).toBe(value);
		expect(parsePredictedFundings([])).toEqual([]);
	});

	it.each([
		["a non-array top level", { BTC: [] }],
		["an entry that is not a tuple", [["BTC"]]],
		["an empty asset name", [["", []]]],
		["a venue list that is not an array", [["BTC", {}]]],
		["a venue entry that is not a tuple", [["BTC", [["HlPerp"]]]]],
		["a non-object venue payload", [["BTC", [["HlPerp", "0.1"]]]]],
		["a non-object unknown venue payload", [["BTC", [["OkxPerp", 1]]]]],
		["a non-decimal rate", [["BTC", [["HlPerp", { fundingRate: "1e-5", nextFundingTime: NEXT }]]]]],
		["a numeric rate", [["BTC", [["HlPerp", { fundingRate: 0.0001, nextFundingTime: NEXT }]]]]],
		["a fractional next funding time", [["BTC", [["HlPerp", { fundingRate: "0.1", nextFundingTime: 1.5 }]]]]],
		[
			"a zero interval",
			[["BTC", [["BinPerp", { fundingRate: "0.1", nextFundingTime: NEXT, fundingIntervalHours: 0 }]]]],
		],
		[
			"a fractional interval",
			[["BTC", [["BinPerp", { fundingRate: "0.1", nextFundingTime: NEXT, fundingIntervalHours: 0.5 }]]]],
		],
		[
			"a duplicate asset",
			[
				["BTC", []],
				["BTC", []],
			],
		],
		[
			"a duplicate venue",
			[
				[
					"BTC",
					[
						["HlPerp", null],
						["HlPerp", null],
					],
				],
			],
		],
	])("fails closed on %s", (_label, value) => {
		expect(parsePredictedFundings(value)).toBeNull();
	});
});

describe("isFundingComparisonSnapshotFresh", () => {
	const RECEIVED = 1_800_000_000_000;
	const MAX_AGE = 120_000;

	it("accepts a snapshot younger than the bound and rejects it from the bound on", () => {
		expect(isFundingComparisonSnapshotFresh(RECEIVED, RECEIVED, MAX_AGE)).toBe(true);
		expect(isFundingComparisonSnapshotFresh(RECEIVED, RECEIVED + MAX_AGE - 1, MAX_AGE)).toBe(true);
		expect(isFundingComparisonSnapshotFresh(RECEIVED, RECEIVED + MAX_AGE, MAX_AGE)).toBe(false);
		expect(isFundingComparisonSnapshotFresh(RECEIVED, RECEIVED + 10 * MAX_AGE, MAX_AGE)).toBe(false);
	});

	it("fails closed without a receipt time or when the receipt is ahead of the local clock", () => {
		expect(isFundingComparisonSnapshotFresh(0, RECEIVED, MAX_AGE)).toBe(false);
		expect(isFundingComparisonSnapshotFresh(Number.NaN, RECEIVED, MAX_AGE)).toBe(false);
		expect(isFundingComparisonSnapshotFresh(RECEIVED, Number.NaN, MAX_AGE)).toBe(false);
		expect(isFundingComparisonSnapshotFresh(RECEIVED + 1, RECEIVED, MAX_AGE)).toBe(false);
	});
});

describe("funding comparison snapshot receipt", () => {
	const RECEIVED = 1_800_000_000_000;
	const OBSERVED = 5_000;
	const MAX_AGE = 120_000;
	const RECEIPT = { receivedAt: RECEIVED, monotonicDeadline: OBSERVED + MAX_AGE };

	it("anchors the monotonic deadline to the local age at the first observation", () => {
		expect(observeFundingComparisonSnapshot(RECEIVED, RECEIVED, OBSERVED, MAX_AGE)).toEqual(RECEIPT);
		expect(observeFundingComparisonSnapshot(RECEIVED, RECEIVED + 50_000, OBSERVED, MAX_AGE)).toEqual({
			receivedAt: RECEIVED,
			monotonicDeadline: OBSERVED + 70_000,
		});
		expect(observeFundingComparisonSnapshot(RECEIVED, RECEIVED + MAX_AGE, OBSERVED, MAX_AGE)).toBeNull();
		expect(observeFundingComparisonSnapshot(RECEIVED + 1, RECEIVED, OBSERVED, MAX_AGE)).toBeNull();
		expect(observeFundingComparisonSnapshot(0, RECEIVED, OBSERVED, MAX_AGE)).toBeNull();
		expect(observeFundingComparisonSnapshot(RECEIVED, RECEIVED, Number.NaN, MAX_AGE)).toBeNull();
	});

	it("keeps the monotonic bound when the wall clock is rolled back", () => {
		expect(getFundingComparisonSnapshotRemainingMs(RECEIPT, RECEIVED, OBSERVED, MAX_AGE)).toBe(MAX_AGE);
		expect(getFundingComparisonSnapshotRemainingMs(RECEIPT, RECEIVED + 30_000, OBSERVED + 90_000, MAX_AGE)).toBe(
			30_000,
		);
		expect(getFundingComparisonSnapshotRemainingMs(RECEIPT, RECEIVED + 30_000, OBSERVED + MAX_AGE, MAX_AGE)).toBe(0);
		expect(getFundingComparisonSnapshotRemainingMs(RECEIPT, RECEIVED - 3_600_000, OBSERVED + 1, MAX_AGE)).toBe(0);
	});

	it("keeps the wall-clock bound when the monotonic clock did not advance", () => {
		expect(getFundingComparisonSnapshotRemainingMs(RECEIPT, RECEIVED + 100_000, OBSERVED + 10_000, MAX_AGE)).toBe(
			20_000,
		);
		expect(getFundingComparisonSnapshotRemainingMs(RECEIPT, RECEIVED + MAX_AGE, OBSERVED + 10_000, MAX_AGE)).toBe(0);
		expect(getFundingComparisonSnapshotRemainingMs(RECEIPT, RECEIVED, Number.NaN, MAX_AGE)).toBe(0);
	});
});

describe("funding rate normalisation", () => {
	it("keeps Hyperliquid hourly with or without an interval and divides exchange rates by their interval", () => {
		expect(getFundingComparisonHourlyRate("HlPerp", venue("0.0000125"))).toBe("0.0000125");
		expect(getFundingComparisonHourlyRate("HlPerp", venue("0.0000125", 1))).toBe("0.0000125");
		expect(getFundingComparisonHourlyRate("BybitPerp", venue("0.00001", 1))).toBe("0.00001");
		expect(getFundingComparisonHourlyRate("BinPerp", venue("0.00012985", 4))).toBe("0.0000324625");
		expect(getFundingComparisonHourlyRate("BinPerp", venue("0.0001", 8))).toBe("0.0000125");
	});

	it("does not guess a missing exchange interval and treats a zero rate as a value", () => {
		expect(getFundingComparisonHourlyRate("BinPerp", venue("0.0001"))).toBeNull();
		expect(getFundingComparisonHourlyRate("BybitPerp", null)).toBeNull();
		expect(getFundingComparisonHourlyRate("BinPerp", venue("0.0", 8))).toBe("0");
	});

	it.each([
		["1h", "0.0000284027"],
		["8h", "0.0002272216"],
		["1d", "0.0006816648"],
		["1w", "0.0047716536"],
		["1y", "0.248807652"],
	] as const)("multiplies the hourly rate for %s", (period, expected) => {
		expect(getFundingComparisonPeriodRate("0.0000284027", period)).toBe(expected);
	});

	it("returns no period rate without an hourly rate", () => {
		expect(getFundingComparisonPeriodRate(null, "8h")).toBeNull();
	});
});

describe("funding differences and tones", () => {
	it("reports the exchange minus Hyperliquid difference as magnitude and factual direction", () => {
		expect(getFundingComparisonArb("0.0002597", "0.0002272216")).toEqual({
			value: "0.0000324784",
			magnitude: "0.0000324784",
			direction: "venueHigher",
		});
		expect(getFundingComparisonArb("-0.0004", "0.0001")).toEqual({
			value: "-0.0005",
			magnitude: "0.0005",
			direction: "hyperliquidHigher",
		});
		expect(getFundingComparisonArb("0", "0")).toEqual({ value: "0", magnitude: "0", direction: "equal" });
		expect(getFundingComparisonArb(null, "0.0001")).toBeNull();
		expect(getFundingComparisonArb("0.0001", null)).toBeNull();
	});

	it("classifies tones by the eight-hour equivalent of the hourly rate", () => {
		expect(getFundingComparisonRateTone("-0.000000001")).toBe("negative");
		expect(getFundingComparisonRateTone("0")).toBe("neutral");
		expect(getFundingComparisonRateTone("0.0000125")).toBe("neutral");
		expect(getFundingComparisonRateTone("0.0000125001")).toBe("positive");
		expect(getFundingComparisonRateTone(null)).toBe("neutral");
	});
});

describe("buildFundingComparisonRows", () => {
	it("keeps catalog perps with exchange data and joins open interest from the market context", () => {
		const rows = buildFundingComparisonRows(SNAPSHOT, MARKETS, LIVE_CONTEXTS);

		expect(rows.map((row) => row.coin)).toEqual(["PONS", "BTC", "ZERO"]);
		expect(rows[0]).toEqual({
			coin: "PONS",
			openInterestUsd: "500",
			hourlyRates: { HlPerp: "0.0000284027", BinPerp: "0.0000324625", BybitPerp: null },
		});
		expect(rows[1].openInterestUsd).toBe("1050000");
		expect(rows[2]).toEqual({
			coin: "ZERO",
			openInterestUsd: null,
			hourlyRates: { HlPerp: "0", BinPerp: null, BybitPerp: "0" },
		});
	});

	it("drops every asset that is missing from the catalog", () => {
		expect(buildFundingComparisonRows(SNAPSHOT, [], LIVE_CONTEXTS)).toEqual([]);
	});

	it("joins open interest only while the market's mark price is live and keeps the funding rates", () => {
		function btcRow(overrides: Partial<FundingComparisonMarketContext>, now = PRICE_RECEIVED_AT) {
			return buildFundingComparisonRows(SNAPSHOT, [market("BTC", "10.5", "100000", overrides)], {
				perpContextsLive: true,
				now,
			})[0];
		}

		expect(btcRow({}).openInterestUsd).toBe("1050000");
		expect(btcRow({}, PRICE_RECEIVED_AT + LIVE_MARK_MAX_STALE_MS).openInterestUsd).toBe("1050000");
		for (const markPriceStatus of ["idle", "loading", "stale", "error"] as const) {
			expect(btcRow({ markPriceStatus })).toEqual({
				coin: "BTC",
				openInterestUsd: null,
				hourlyRates: { HlPerp: "0.0000125", BinPerp: "0.0000125", BybitPerp: "-0.00005" },
			});
		}
		expect(btcRow({}, PRICE_RECEIVED_AT + LIVE_MARK_MAX_STALE_MS + 1).openInterestUsd).toBeNull();
		expect(btcRow({}, PRICE_RECEIVED_AT - 1).openInterestUsd).toBeNull();
		expect(btcRow({ markPriceReceivedAt: undefined }).openInterestUsd).toBeNull();
		expect(btcRow({ markPx: "0" }).openInterestUsd).toBeNull();
		expect(btcRow({ openInterest: undefined }).openInterestUsd).toBeNull();
	});

	it("joins open interest only while the perp asset contexts are live, even with a live mark price", () => {
		const btc = [market("BTC", "10.5", "100000")];

		expect(buildFundingComparisonRows(SNAPSHOT, btc, LIVE_CONTEXTS)[0].openInterestUsd).toBe("1050000");
		expect(buildFundingComparisonRows(SNAPSHOT, btc, { perpContextsLive: false, now: PRICE_RECEIVED_AT })).toEqual([
			{
				coin: "BTC",
				openInterestUsd: null,
				hourlyRates: { HlPerp: "0.0000125", BinPerp: "0.0000125", BybitPerp: "-0.00005" },
			},
		]);
	});

	it("sorts rows without live perp contexts by market name in both directions and keeps their rates", () => {
		const rows = buildFundingComparisonRows(SNAPSHOT, MARKETS, { perpContextsLive: false, now: PRICE_RECEIVED_AT });

		expect(rows.map((row) => row.openInterestUsd)).toEqual([null, null, null]);
		for (const sortDirection of ["descending", "ascending"] as const) {
			const result = page(rows, { sortDirection });
			expect(result.rows.map((row) => row.coin)).toEqual(["BTC", "PONS", "ZERO"]);
			expect(result.rows[1].rates.HlPerp.value).toBe("0.0002272216");
		}
	});
});

describe("deriveFundingComparisonPage", () => {
	const rows = buildFundingComparisonRows(SNAPSHOT, MARKETS, LIVE_CONTEXTS);

	it("derives period rates, differences and tones for each row", () => {
		const result = page(rows);
		const pons = result.rows.find((row) => row.coin === "PONS");

		expect(pons?.rates).toEqual({
			HlPerp: { value: "0.0002272216", tone: "positive" },
			BinPerp: { value: "0.0002597", tone: "positive" },
			BybitPerp: { value: null, tone: "neutral" },
		});
		expect(pons?.arbs).toEqual({
			BinPerp: { value: "0.0000324784", magnitude: "0.0000324784", direction: "venueHigher" },
			BybitPerp: null,
		});
		expect(page(rows, { period: "1y" }).rows.find((row) => row.coin === "BTC")?.rates.BybitPerp).toEqual({
			value: "-0.438",
			tone: "negative",
		});
	});

	it("sorts by open interest with missing values last in both directions", () => {
		expect(page(rows).rows.map((row) => row.coin)).toEqual(["BTC", "PONS", "ZERO"]);
		expect(page(rows, { sortDirection: "ascending" }).rows.map((row) => row.coin)).toEqual(["PONS", "BTC", "ZERO"]);
	});

	it("sorts differences by magnitude and breaks ties by market", () => {
		const diffRows = [
			sourceRow("AAA", { HlPerp: "0.00001", BybitPerp: "0.00003" }, "1"),
			sourceRow("BBB", { HlPerp: "0.00001", BybitPerp: "-0.00004" }, "1"),
			sourceRow("CCC", { HlPerp: "0.00001", BybitPerp: "0.00007" }, "1"),
			sourceRow("DDD", { HlPerp: null, BybitPerp: "0.9" }, "1"),
			sourceRow("aab", { HlPerp: "0.00001", BybitPerp: "0.00003" }, "1"),
		];

		expect(page(diffRows, { sortKey: "bybitArb" }).rows.map((row) => row.coin)).toEqual([
			"CCC",
			"BBB",
			"AAA",
			"aab",
			"DDD",
		]);
		expect(page(diffRows, { sortKey: "bybitArb", sortDirection: "ascending" }).rows.map((row) => row.coin)).toEqual([
			"AAA",
			"aab",
			"BBB",
			"CCC",
			"DDD",
		]);
		expect(page(diffRows, { sortKey: "BybitPerp" }).rows.map((row) => row.coin)).toEqual([
			"DDD",
			"CCC",
			"AAA",
			"aab",
			"BBB",
		]);
		expect(page(diffRows, { sortKey: "market", sortDirection: "ascending" }).rows.map((row) => row.coin)).toEqual([
			"AAA",
			"aab",
			"BBB",
			"CCC",
			"DDD",
		]);
	});

	it("filters by market search and paginates with clamped bounds", () => {
		const many = Array.from({ length: 12 }, (_, index) =>
			sourceRow(
				`C${String(index + 1).padStart(2, "0")}`,
				{ HlPerp: "0.00001", BinPerp: "0.0001" },
				String(100 - index),
			),
		);

		expect(page(many, { query: "  c1 " }).rows.map((row) => row.coin)).toEqual(["C10", "C11", "C12"]);
		expect(page(many, { query: "missing" })).toMatchObject({ rows: [], totalRows: 0, totalPages: 1, start: 0, end: 0 });

		const second = page(many, { rowsPerPage: 10, page: 2 });
		expect(second).toMatchObject({ totalRows: 12, totalPages: 2, page: 2, start: 11, end: 12 });
		expect(second.rows.map((row) => row.coin)).toEqual(["C11", "C12"]);
		expect(page(many, { rowsPerPage: 10, page: 9 })).toMatchObject({ page: 2, start: 11, end: 12 });
		expect(page(many, { rowsPerPage: 10, page: 0 })).toMatchObject({ page: 1, start: 1, end: 10 });
	});
});

describe("toggleFundingComparisonSort", () => {
	it("starts numeric columns descending, markets ascending, and flips the active column", () => {
		expect(toggleFundingComparisonSort("openInterest", "descending", "HlPerp")).toEqual({
			sortKey: "HlPerp",
			sortDirection: "descending",
		});
		expect(toggleFundingComparisonSort("openInterest", "descending", "market")).toEqual({
			sortKey: "market",
			sortDirection: "ascending",
		});
		expect(toggleFundingComparisonSort("HlPerp", "descending", "HlPerp")).toEqual({
			sortKey: "HlPerp",
			sortDirection: "ascending",
		});
		expect(toggleFundingComparisonSort("HlPerp", "ascending", "HlPerp")).toEqual({
			sortKey: "HlPerp",
			sortDirection: "descending",
		});
	});
});
