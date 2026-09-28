import Big from "big.js";
import { describe, expect, it } from "vitest";
import {
	buildEarnSnapshot,
	type EarnTokenMeta,
	findEarnPositionRow,
	getEarnActionBlock,
	getEarnFullPosition,
	getEarnMaxAmount,
	getEarnMinimumIssue,
	getEarnOperationRows,
	getEarnSpotAvailable,
	getHealthFactorDisplayRatio,
	getLiquidationThreshold,
	parseEarnInterest,
	parseEarnReserves,
	parseEarnUserState,
	toEarnProtocolAmount,
	validateEarnAmount,
} from "@/domain/earn";
import {
	EARN_VERIFICATION_TTL_MS,
	EarnSubmissionStaleError,
	getEarnProtocolAmount,
	verifyEarnSubmissionAtBoundary,
	verifyFreshEarnSubmission,
} from "@/domain/earn-submission";

const RESERVES_RESPONSE = [
	[
		0,
		{
			borrowYearlyRate: "0.05",
			supplyYearlyRate: "0.0285767642",
			balance: "199698099.1082552671",
			utilization: "0.6350392049",
			oraclePx: "1.0",
			ltv: "0.0",
			totalSupplied: "547176704.266036272",
			totalBorrowed: "347478659.2085876465",
		},
	],
	[
		150,
		{
			borrowYearlyRate: "0.05",
			supplyYearlyRate: "0.0",
			balance: "12011368.8075429704",
			utilization: "0.0",
			oraclePx: "92.76",
			ltv: "0.65",
			totalSupplied: "12011368.8075429704",
			totalBorrowed: "0.0",
		},
	],
	[
		197,
		{
			borrowYearlyRate: "0.05",
			supplyYearlyRate: "0.0",
			balance: "2083.6508999358",
			utilization: "0.0",
			oraclePx: "84523.0",
			ltv: "0.5",
			totalSupplied: "2083.6508999358",
			totalBorrowed: "0.0",
		},
	],
	[
		268,
		{
			borrowYearlyRate: "0.05",
			supplyYearlyRate: "0.0218288533",
			balance: "1464483.8479816001",
			utilization: "0.4850856282",
			oraclePx: "0.9999",
			ltv: "0.0",
			totalSupplied: "2844130.7000942002",
			totalBorrowed: "1379646.92738077",
		},
	],
	[
		360,
		{
			borrowYearlyRate: "0.05",
			supplyYearlyRate: "0.0051079325",
			balance: "147649.66194405",
			utilization: "0.1135096107",
			oraclePx: "1.0",
			ltv: "0.0",
			totalSupplied: "166554.89726497",
			totalBorrowed: "18905.58154513",
		},
	],
];

const TOKENS = new Map<number, EarnTokenMeta>([
	[0, { index: 0, name: "USDC", displayName: "USDC", weiDecimals: 8, szDecimals: 8 }],
	[150, { index: 150, name: "HYPE", displayName: "HYPE", weiDecimals: 8, szDecimals: 2 }],
	[197, { index: 197, name: "UBTC", displayName: "BTC", weiDecimals: 10, szDecimals: 5 }],
	[268, { index: 268, name: "USDT0", displayName: "USDT", weiDecimals: 8, szDecimals: 2 }],
	[360, { index: 360, name: "USDH", displayName: "USDH", weiDecimals: 8, szDecimals: 2 }],
]);

const USER_RESPONSE = {
	tokenToState: [
		[0, { borrow: { basis: "990", value: "1000" }, supply: { basis: "495", value: "500" } }],
		[150, { borrow: { basis: "0", value: "0" }, supply: { basis: "100", value: "100" } }],
	],
	health: "healthy",
	healthFactor: "6.0294",
};

function snapshotInputs(portfolioMargin = false) {
	return {
		tokens: TOKENS,
		portfolioMargin,
		spotBalances: new Map([
			[0, { token: 0, available: "700", total: "700" }],
			[150, { token: 150, available: "3.5", total: "3.5" }],
		]),
		availableAfterMaintenance: new Map<number, string>(),
	};
}

function buildSnapshot(user: unknown = USER_RESPONSE) {
	const reserves = parseEarnReserves(RESERVES_RESPONSE);
	const userState = parseEarnUserState(user);
	if (!reserves || !userState) throw new Error("fixture must parse");
	const snapshot = buildEarnSnapshot({ reserves, userState, ...snapshotInputs() });
	if (!snapshot) throw new Error("snapshot must build");
	return { reserves, userState, snapshot };
}

describe("earn response parsing", () => {
	it("keeps protocol decimals as normalized strings", () => {
		const reserves = parseEarnReserves(RESERVES_RESPONSE);
		expect(reserves?.[0]).toMatchObject({ token: 0, ltv: "0", oraclePx: "1", supplyYearlyRate: "0.0285767642" });
		expect(reserves?.[1]).toMatchObject({ token: 150, ltv: "0.65" });
	});

	it("fails closed on malformed reserve and user payloads", () => {
		expect(parseEarnReserves([[0, { ltv: "0.5" }]])).toBeNull();
		expect(parseEarnReserves([["0", RESERVES_RESPONSE[0][1]]])).toBeNull();
		expect(parseEarnReserves([[0, { ...(RESERVES_RESPONSE[0][1] as object), ltv: "1.2" }]])).toBeNull();
		expect(parseEarnUserState({ tokenToState: [[0, { supply: { basis: "1" } }]] })).toBeNull();
		expect(parseEarnUserState({ ...USER_RESPONSE, healthFactor: "not-a-number" })).toBeNull();
		expect(parseEarnInterest([{ time: 1, token: "USDC", supply: "x", borrow: "0" }])).toBeNull();
	});

	it("accepts a null health factor and sorts interest newest first", () => {
		expect(parseEarnUserState({ tokenToState: [], healthFactor: null })?.healthFactor).toBeNull();
		const interest = parseEarnInterest([
			{ time: 1, token: "USDC", supply: "0.1", borrow: "0" },
			{ time: 3, token: "USDC", supply: "0.2", borrow: "0" },
		]);
		expect(interest?.map((entry) => entry.time)).toEqual([3, 1]);
	});
});

describe("earn snapshot", () => {
	it("derives the official supply and borrow tables", () => {
		const { snapshot } = buildSnapshot();
		expect(snapshot.supplyRows.map((row) => row.displayName)).toEqual(["USDC", "HYPE", "BTC", "USDT"]);
		expect(snapshot.borrowRows.map((row) => row.displayName)).toEqual(["USDC", "USDT"]);
		const usdc = snapshot.supplyRows[0];
		expect(usdc.amountDecimals).toBe(2);
		expect(usdc.suppliedInterest).toBe("5");
		expect(usdc.borrowedInterest).toBe("10");
		expect(snapshot.summary.totalSuppliedUsd).toBe(Big(500).plus(Big(100).times("92.76")).toFixed());
		expect(snapshot.summary.weightedSuppliedUsd).toBe("6029.4");
		expect(snapshot.summary.totalBorrowedUsd).toBe("1000");
		expect(snapshot.summary.availableToBorrowUsd).toBe("5029.4");
	});

	it("shows USDH only while the account holds a position", () => {
		const { snapshot } = buildSnapshot({
			tokenToState: [[360, { borrow: { basis: "0", value: "0" }, supply: { basis: "1", value: "1" } }]],
			healthFactor: null,
		});
		expect(snapshot.supplyRows.map((row) => row.name)).toContain("USDH");
		expect(getEarnOperationRows("supply", snapshot).map((row) => row.name)).not.toContain("USDH");
	});

	it("orders supply choices by quote assets before collateral", () => {
		const { snapshot } = buildSnapshot();
		expect(getEarnOperationRows("supply", snapshot).map((row) => row.isCollateral)).toEqual([false, false, true, true]);
		expect(getEarnOperationRows("repay", snapshot).map((row) => row.token)).toEqual([0]);
	});

	it("finds a closed borrow in the complete snapshot even though repay no longer offers it", () => {
		const { snapshot } = buildSnapshot({
			tokenToState: [[150, { borrow: { basis: "0", value: "0" }, supply: { basis: "100", value: "100" } }]],
			healthFactor: null,
		});
		expect(getEarnOperationRows("repay", snapshot)).toEqual([]);
		expect(findEarnPositionRow("repay", snapshot, 0)).toMatchObject({ token: 0, borrowed: "0", borrowedBasis: "0" });
		expect(findEarnPositionRow("withdraw", snapshot, 150)?.supplied).toBe("100");
		expect(findEarnPositionRow("repay", snapshot, 150)).toBeNull();
	});

	it("uses the official liquidation threshold and price", () => {
		expect(getLiquidationThreshold("0.65").toFixed()).toBe("0.825");
		expect(getLiquidationThreshold("0.5").toFixed()).toBe("0.75");
		expect(getLiquidationThreshold("0.4").toFixed()).toBe(Big(0.8).div(1.4).toFixed());
		expect(getLiquidationThreshold("0").toFixed()).toBe("0");
		const { snapshot } = buildSnapshot();
		const hype = snapshot.supplyRows.find((row) => row.token === 150);
		expect(hype?.liquidationPx).toBe(Big(1000).div(82.5).toFixed());
		expect(snapshot.supplyRows.find((row) => row.token === 0)?.liquidationPx).toBeNull();
	});

	it("derives the portfolio margin liquidation price from available after maintenance", () => {
		const reserves = parseEarnReserves(RESERVES_RESPONSE);
		const userState = parseEarnUserState(USER_RESPONSE);
		if (!reserves || !userState) throw new Error("fixture must parse");
		const snapshot = buildEarnSnapshot({
			reserves,
			userState,
			...snapshotInputs(true),
			spotBalances: new Map([[150, { token: 150, available: "40", total: "100" }]]),
			availableAfterMaintenance: new Map([[150, "40"]]),
		});
		expect(snapshot?.supplyRows.find((row) => row.token === 150)?.liquidationPx).toBe(
			Big("92.76").times(0.6).toFixed(),
		);
	});

	it("fails closed when a reserve token is missing from spot metadata", () => {
		const reserves = parseEarnReserves(RESERVES_RESPONSE);
		if (!reserves) throw new Error("fixture must parse");
		expect(buildEarnSnapshot({ reserves, userState: null, ...snapshotInputs(), tokens: new Map() })).toBeNull();
	});

	it("caps the health factor display at 1000% and hides it without borrows", () => {
		const { snapshot } = buildSnapshot({ ...USER_RESPONSE, healthFactor: "25" });
		expect(getHealthFactorDisplayRatio(snapshot.summary)).toBe("10");
		const { snapshot: noBorrow } = buildSnapshot({
			tokenToState: [[150, { borrow: { basis: "0", value: "0" }, supply: { basis: "1", value: "1" } }]],
			healthFactor: null,
		});
		expect(getHealthFactorDisplayRatio(noBorrow.summary)).toBeNull();
	});
});

describe("earn max amounts", () => {
	it("follows the official Max rules for each operation", () => {
		const { snapshot } = buildSnapshot();
		const usdc = snapshot.supplyRows.find((row) => row.token === 0);
		const hype = snapshot.supplyRows.find((row) => row.token === 150);
		if (!usdc || !hype) throw new Error("rows missing");
		const summary = snapshot.summary;
		expect(getEarnMaxAmount({ operation: "supply", row: hype, summary, spotAvailable: "3.5" })).toBe("3.5");
		expect(getEarnMaxAmount({ operation: "withdraw", row: usdc, summary, spotAvailable: "700" })).toBe("500");
		expect(getEarnMaxAmount({ operation: "withdraw", row: hype, summary, spotAvailable: "3.5" })).toBe(
			Big("5029.4").div(Big("92.76").times("0.65")).round(8, Big.roundDown).toFixed(),
		);
		expect(getEarnMaxAmount({ operation: "borrow", row: usdc, summary, spotAvailable: "700" })).toBe("5029.4");
		expect(getEarnMaxAmount({ operation: "repay", row: usdc, summary, spotAvailable: "700" })).toBe("700");
		expect(getEarnMaxAmount({ operation: "repay", row: usdc, summary, spotAvailable: "5000" })).toBe("1000.00000001");
		expect(getEarnMaxAmount({ operation: "supply", row: usdc, summary, spotAvailable: null })).toBeNull();
	});
});

describe("earn amount validation", () => {
	it("rejects empty, malformed, zero, over-precise and over-max amounts", () => {
		expect(validateEarnAmount("", "1", 8)).toBe("empty");
		expect(validateEarnAmount("1e3", "1", 8)).toBe("invalid");
		expect(validateEarnAmount("0", "1", 8)).toBe("zero");
		expect(validateEarnAmount("0.000000001", "1", 8)).toBe("invalid");
		expect(validateEarnAmount("2", "1", 8)).toBe("exceedsMax");
		expect(validateEarnAmount("1", null, 8)).toBe("unavailable");
		expect(validateEarnAmount("1.00", "1", 8)).toBe("valid");
		expect(toEarnProtocolAmount("1.50")).toBe("1.5");
	});
});

describe("earn action availability", () => {
	it("matches the official button gates", () => {
		const { snapshot } = buildSnapshot();
		const input = {
			portfolioMargin: false,
			accountReady: true,
			summary: snapshot.summary,
			supplyRows: snapshot.supplyRows,
		};
		expect(getEarnActionBlock("supply", input)).toBeNull();
		expect(getEarnActionBlock("withdraw", input)).toBeNull();
		expect(getEarnActionBlock("borrow", input)).toBeNull();
		expect(getEarnActionBlock("repay", input)).toBeNull();
		expect(getEarnActionBlock("borrow", { ...input, portfolioMargin: true })).toBe("portfolioMargin");
		expect(getEarnActionBlock("supply", { ...input, accountReady: false })).toBe("unavailable");

		const { snapshot: quoteOnly } = buildSnapshot({
			tokenToState: [[0, { borrow: { basis: "0", value: "0" }, supply: { basis: "5", value: "5" } }]],
			healthFactor: null,
		});
		const quoteInput = { ...input, summary: quoteOnly.summary, supplyRows: quoteOnly.supplyRows };
		expect(getEarnActionBlock("borrow", quoteInput)).toBe("noCollateral");
		expect(getEarnActionBlock("repay", quoteInput)).toBe("noBorrows");
		const { snapshot: empty } = buildSnapshot({ tokenToState: [], healthFactor: null });
		expect(getEarnActionBlock("withdraw", { ...input, summary: empty.summary })).toBe("noSupplies");
	});
});

describe("fresh earn submission", () => {
	it("binds execution to the displayed maximum and the fresh maximum", () => {
		const { reserves, userState } = buildSnapshot();
		const base = { reserves, userState, inputs: snapshotInputs(), spotAvailable: "700" };
		expect(
			verifyFreshEarnSubmission({
				...base,
				request: { operation: "borrow", token: 0, amount: "100", displayedMax: "5029.4", full: null },
			}).max,
		).toBe("5029.4");
		expect(() =>
			verifyFreshEarnSubmission({
				...base,
				request: { operation: "borrow", token: 0, amount: "200", displayedMax: "100", full: null },
			}),
		).toThrow(EarnSubmissionStaleError);
		const lowerCollateral = parseEarnUserState({
			tokenToState: [
				[0, { borrow: { basis: "1000", value: "1000" }, supply: { basis: "0", value: "0" } }],
				[150, { borrow: { basis: "0", value: "0" }, supply: { basis: "20", value: "20" } }],
			],
			healthFactor: "1.2",
		});
		if (!lowerCollateral) throw new Error("fixture must parse");
		expect(() =>
			verifyFreshEarnSubmission({
				...base,
				userState: lowerCollateral,
				request: { operation: "borrow", token: 0, amount: "300", displayedMax: "5029.4", full: null },
			}),
		).toThrow(EarnSubmissionStaleError);
		expect(() =>
			verifyFreshEarnSubmission({
				...base,
				inputs: snapshotInputs(true),
				request: { operation: "supply", token: 0, amount: "1", displayedMax: "700", full: null },
			}),
		).toThrow(EarnSubmissionStaleError);
	});
});

describe("earn snapshot completeness", () => {
	it("rejects duplicated reserve or position entries", () => {
		expect(parseEarnReserves([...RESERVES_RESPONSE, RESERVES_RESPONSE[1]])).toBeNull();
		expect(
			parseEarnUserState({
				tokenToState: [USER_RESPONSE.tokenToState[1], USER_RESPONSE.tokenToState[1]],
				healthFactor: null,
			}),
		).toBeNull();
	});

	it("refuses to build a snapshot that would drop an open position", () => {
		const reserves = parseEarnReserves(RESERVES_RESPONSE.filter(([token]) => token !== 268));
		const userState = parseEarnUserState({
			tokenToState: [
				[150, { borrow: { basis: "0", value: "0" }, supply: { basis: "100", value: "100" } }],
				[268, { borrow: { basis: "6500", value: "6500" }, supply: { basis: "0", value: "0" } }],
			],
			healthFactor: "1",
		});
		if (!reserves || !userState) throw new Error("fixture must parse");
		expect(buildEarnSnapshot({ reserves, userState, ...snapshotInputs() })).toBeNull();
	});

	it("treats a zero oracle price as unavailable instead of dividing by zero", () => {
		const zeroPrice = (token: number) =>
			RESERVES_RESPONSE.map(([id, state]) =>
				id === token ? [id, { ...(state as object), oraclePx: "0" }] : [id, state],
			);
		const userState = parseEarnUserState(USER_RESPONSE);
		const exposedZero = parseEarnReserves(zeroPrice(0));
		if (!userState || !exposedZero) throw new Error("fixture must parse");
		expect(buildEarnSnapshot({ reserves: exposedZero, userState, ...snapshotInputs() })).toBeNull();

		const idleZero = parseEarnReserves(zeroPrice(197));
		if (!idleZero) throw new Error("fixture must parse");
		const snapshot = buildEarnSnapshot({ reserves: idleZero, userState, ...snapshotInputs() });
		const btc = snapshot?.supplyRows.find((row) => row.token === 197);
		if (!snapshot || !btc) throw new Error("rows missing");
		expect(
			getEarnMaxAmount({ operation: "withdraw", row: btc, summary: snapshot.summary, spotAvailable: "0" }),
		).toBeNull();
		expect(
			getEarnMaxAmount({ operation: "borrow", row: btc, summary: snapshot.summary, spotAvailable: "0" }),
		).toBeNull();
	});
});

describe("earn submission at the SDK boundary", () => {
	it("requires a recent verification and the latest maximum", () => {
		const { snapshot } = buildSnapshot();
		const base = {
			request: { operation: "borrow" as const, token: 0, amount: "100", displayedMax: "5029.4", full: null },
			verifiedAt: 1_000,
			now: 1_000,
			verifiedSnapshot: snapshot,
			latestSnapshot: snapshot,
			accountReady: true,
			portfolioMargin: false,
			spotAvailable: "700",
		};
		expect(() => verifyEarnSubmissionAtBoundary(base)).not.toThrow();
		expect(() => verifyEarnSubmissionAtBoundary({ ...base, now: 1_000 + EARN_VERIFICATION_TTL_MS + 1 })).toThrow(
			EarnSubmissionStaleError,
		);
		expect(() => verifyEarnSubmissionAtBoundary({ ...base, accountReady: false })).toThrow(EarnSubmissionStaleError);
		expect(() => verifyEarnSubmissionAtBoundary({ ...base, portfolioMargin: true })).toThrow(EarnSubmissionStaleError);
		expect(() =>
			verifyEarnSubmissionAtBoundary({
				...base,
				request: { ...base.request, amount: "6000", displayedMax: "6000", full: null },
			}),
		).toThrow(EarnSubmissionStaleError);
	});
});

describe("earn liquidity and spendable balance", () => {
	it("caps borrow and withdraw by the reserve's available liquidity", () => {
		const drained = RESERVES_RESPONSE.map(([id, state]) =>
			id === 0 ? [id, { ...(state as object), balance: "120" }] : [id, state],
		);
		const reserves = parseEarnReserves(drained);
		const userState = parseEarnUserState(USER_RESPONSE);
		if (!reserves || !userState) throw new Error("fixture must parse");
		const snapshot = buildEarnSnapshot({ reserves, userState, ...snapshotInputs() });
		const usdc = snapshot?.supplyRows.find((row) => row.token === 0);
		if (!snapshot || !usdc) throw new Error("rows missing");
		expect(getEarnMaxAmount({ operation: "borrow", row: usdc, summary: snapshot.summary, spotAvailable: "700" })).toBe(
			"120",
		);
		expect(
			getEarnMaxAmount({ operation: "withdraw", row: usdc, summary: snapshot.summary, spotAvailable: "700" }),
		).toBe("120");
	});

	it("uses the smaller of the transferable and post-maintenance balance", () => {
		const balance = { coin: "USDC", token: 0, total: "100", hold: "80", entryNtl: "0" };
		expect(getEarnSpotAvailable(balance, [[0, "60"]])).toBe("20");
		expect(getEarnSpotAvailable(balance, [[0, "10"]])).toBe("10");
		expect(getEarnSpotAvailable({ ...balance, hold: "0" }, [])).toBe("100");
	});
});

describe("earn minimum position and full withdrawals", () => {
	it("follows the exchange's $1 minimum supplied position", () => {
		const { snapshot } = buildSnapshot();
		const usdc = snapshot.supplyRows.find((row) => row.token === 0);
		const btc = snapshot.supplyRows.find((row) => row.token === 197);
		if (!usdc || !btc) throw new Error("rows missing");
		expect(getEarnMinimumIssue("supply", btc, "0.00001")).toBe("supplyBelowMinimum");
		expect(getEarnMinimumIssue("supply", btc, "0.0001")).toBeNull();
		expect(getEarnMinimumIssue("supply", usdc, "0.5")).toBeNull();
		expect(getEarnMinimumIssue("withdraw", usdc, "499.5")).toBe("withdrawLeavesDust");
		expect(getEarnMinimumIssue("withdraw", usdc, "500")).toBe("withdrawLeavesDust");
		expect(getEarnMinimumIssue("withdraw", usdc, "499")).toBeNull();
		expect(getEarnMinimumIssue("borrow", usdc, "0.1")).toBeNull();
	});

	it("offers a full withdrawal only when nothing limits it", () => {
		const { snapshot } = buildSnapshot();
		const usdc = snapshot.supplyRows.find((row) => row.token === 0);
		const hype = snapshot.supplyRows.find((row) => row.token === 150);
		if (!usdc || !hype) throw new Error("rows missing");
		const summary = snapshot.summary;
		expect(getEarnFullPosition({ operation: "withdraw", row: usdc, summary, spotAvailable: null })).toEqual({
			principal: "495",
		});
		expect(getEarnFullPosition({ operation: "withdraw", row: hype, summary, spotAvailable: null })).toBeNull();
		expect(
			getEarnFullPosition({
				operation: "withdraw",
				row: { ...usdc, reserveBalance: "100" },
				summary,
				spotAvailable: null,
			}),
		).toBeNull();
		expect(getEarnFullPosition({ operation: "repay", row: usdc, summary, spotAvailable: "5000" })).toEqual({
			principal: "990",
		});
		expect(getEarnFullPosition({ operation: "repay", row: usdc, summary, spotAvailable: "700" })).toBeNull();
		expect(getEarnFullPosition({ operation: "supply", row: usdc, summary, spotAvailable: "700" })).toBeNull();
	});

	it("sends a full withdrawal only while the principal is unchanged", () => {
		const { reserves, userState } = buildSnapshot();
		const base = { reserves, userState, inputs: snapshotInputs(), spotAvailable: null };
		const request = {
			operation: "withdraw" as const,
			token: 0,
			amount: "500",
			displayedMax: "500",
			full: { principal: "495" },
		};
		expect(getEarnProtocolAmount(request)).toBeNull();
		expect(verifyFreshEarnSubmission({ ...base, request }).max).toBe("500");
		const accrued = parseEarnUserState({
			...USER_RESPONSE,
			tokenToState: [
				[0, { borrow: { basis: "990", value: "1000" }, supply: { basis: "495", value: "500.01" } }],
				USER_RESPONSE.tokenToState[1],
			],
		});
		const topUp = parseEarnUserState({
			...USER_RESPONSE,
			tokenToState: [
				[0, { borrow: { basis: "990", value: "1000" }, supply: { basis: "895", value: "900" } }],
				USER_RESPONSE.tokenToState[1],
			],
		});
		if (!accrued || !topUp) throw new Error("fixture must parse");
		expect(() => verifyFreshEarnSubmission({ ...base, userState: accrued, request })).not.toThrow();
		expect(() => verifyFreshEarnSubmission({ ...base, userState: topUp, request })).toThrow(EarnSubmissionStaleError);
		expect(() =>
			verifyFreshEarnSubmission({
				...base,
				request: { ...request, amount: "499.9", displayedMax: "500", full: null },
			}),
		).toThrow(EarnSubmissionStaleError);
	});
});

describe("earn parsing strictness and repay-all allowance", () => {
	it("rejects negative principals and malformed utilization", () => {
		expect(
			parseEarnUserState({
				tokenToState: [[0, { borrow: { basis: "0", value: "0" }, supply: { basis: "-1", value: "1" } }]],
				healthFactor: null,
			}),
		).toBeNull();
		expect(parseEarnReserves([[0, { ...(RESERVES_RESPONSE[0][1] as object), utilization: "abc" }]])).toBeNull();
		expect(parseEarnReserves([[0, { ...(RESERVES_RESPONSE[0][1] as object), utilization: undefined }]])).not.toBeNull();
	});

	it("offers repay-all only when the balance also covers an hour of interest", () => {
		const { snapshot } = buildSnapshot();
		const usdc = snapshot.supplyRows.find((row) => row.token === 0);
		if (!usdc) throw new Error("rows missing");
		const summary = snapshot.summary;
		const hourOfInterest = Big(1000).times("0.05").div(8760);
		const required = Big(1000).plus(hourOfInterest).plus("0.00000001");
		expect(getEarnFullPosition({ operation: "repay", row: usdc, summary, spotAvailable: "1000.00000001" })).toBeNull();
		expect(
			getEarnFullPosition({
				operation: "repay",
				row: usdc,
				summary,
				spotAvailable: required.minus("0.00000001").toFixed(),
			}),
		).toBeNull();
		expect(getEarnFullPosition({ operation: "repay", row: usdc, summary, spotAvailable: required.toFixed() })).toEqual({
			principal: "990",
		});
	});
});

describe("earn submission at the SDK boundary with two snapshots", () => {
	it("fails when either the in-lock snapshot or the latest cached snapshot moved the principal", () => {
		const { snapshot } = buildSnapshot();
		const topUp = parseEarnUserState({
			...USER_RESPONSE,
			tokenToState: [
				[0, { borrow: { basis: "990", value: "1000" }, supply: { basis: "895", value: "900" } }],
				USER_RESPONSE.tokenToState[1],
			],
		});
		const reserves = parseEarnReserves(RESERVES_RESPONSE);
		if (!topUp || !reserves) throw new Error("fixture must parse");
		const moved = buildEarnSnapshot({ reserves, userState: topUp, ...snapshotInputs() });
		if (!moved) throw new Error("snapshot must build");
		const base = {
			request: {
				operation: "withdraw" as const,
				token: 0,
				amount: "500",
				displayedMax: "500",
				full: { principal: "495" },
			},
			verifiedAt: 1_000,
			now: 1_000,
			accountReady: true,
			portfolioMargin: false,
			spotAvailable: null,
		};
		expect(() =>
			verifyEarnSubmissionAtBoundary({ ...base, verifiedSnapshot: snapshot, latestSnapshot: snapshot }),
		).not.toThrow();
		expect(() =>
			verifyEarnSubmissionAtBoundary({ ...base, verifiedSnapshot: moved, latestSnapshot: snapshot }),
		).toThrow(EarnSubmissionStaleError);
		expect(() =>
			verifyEarnSubmissionAtBoundary({ ...base, verifiedSnapshot: snapshot, latestSnapshot: moved }),
		).toThrow(EarnSubmissionStaleError);
		expect(() => verifyEarnSubmissionAtBoundary({ ...base, verifiedSnapshot: snapshot, latestSnapshot: null })).toThrow(
			EarnSubmissionStaleError,
		);
	});
});
