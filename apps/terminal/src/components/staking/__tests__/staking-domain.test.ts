import { describe, expect, it } from "vitest";
import { getNumberFormatters } from "@/lib/format";
import {
	calculateDelegationWeightedApr,
	canUndelegate,
	createStakingActionSubmission,
	createValidatorViews,
	deriveStakingPageState,
	formatStakingAmount,
	formatStakingRatio,
	isSystemFinalizedWithdrawal,
	parseSpotHypeAvailable,
	parseStakingDelegations,
	parseStakingHistory,
	parseStakingLink,
	parseStakingRewards,
	parseStakingSummary,
	parseValidatorSummaries,
	sumApproximateNetworkStake,
	validateHypeActionAmount,
} from "../domain/staking";

const VALIDATOR = "0x1111111111111111111111111111111111111111" as const;
const SIGNER = "0x2222222222222222222222222222222222222222" as const;
const HASH = `0x${"ab".repeat(32)}` as const;

function validator(overrides: Record<string, unknown> = {}) {
	return {
		validator: VALIDATOR,
		signer: SIGNER,
		name: "Exact Validator",
		description: "Verified fixture",
		nRecentBlocks: 100,
		stake: 12_345_678_901_234_568,
		isJailed: false,
		unjailableAfter: null,
		isActive: true,
		commission: "0.03",
		stats: [
			["day", { uptimeFraction: "0.99", predictedApr: "0.02", nSamples: 10 }],
			["week", { uptimeFraction: "0.98", predictedApr: "0.03", nSamples: 70 }],
			["month", { uptimeFraction: "0.97", predictedApr: "0.04", nSamples: 300 }],
		],
		...overrides,
	};
}

describe("staking domain", () => {
	it("runtime-validates validators and keeps unsafe network stake explicitly approximate", () => {
		const parsed = parseValidatorSummaries([
			validator(),
			validator({
				validator: "0x3333333333333333333333333333333333333333",
				signer: "0x4444444444444444444444444444444444444444",
				stake: 100_000_000,
				isJailed: true,
				isActive: false,
			}),
		]);

		expect(parsed).not.toBeNull();
		expect(parsed?.[0]).toMatchObject({ status: "active", stakeApproximateHype: "123456789.01234568" });
		expect(parsed?.[1]).toMatchObject({ status: "jailed", stakeApproximateHype: "1" });
		expect(sumApproximateNetworkStake(parsed ?? [])).toBe("123456790.01234568");
	});

	it("rejects malformed, duplicate, and out-of-range validator snapshots", () => {
		expect(parseValidatorSummaries([validator({ commission: "3%" })])).toBeNull();
		expect(parseValidatorSummaries([validator(), validator()])).toBeNull();
		expect(
			parseValidatorSummaries([
				validator({
					stats: [
						["day", { uptimeFraction: "1.1", predictedApr: "0.02", nSamples: 1 }],
						["week", { uptimeFraction: "1", predictedApr: "0.02", nSamples: 1 }],
						["month", { uptimeFraction: "1", predictedApr: "0.02", nSamples: 1 }],
					],
				}),
			]),
		).toBeNull();
	});

	it("normalizes exact account summaries and rejects missing values instead of inventing zero", () => {
		expect(
			parseStakingSummary({
				delegated: "100.5000",
				undelegated: "20.00",
				totalPendingWithdrawal: "4.5",
				nPendingWithdrawals: 2,
			}),
		).toEqual({ delegated: "100.5", undelegated: "20", totalPendingWithdrawal: "4.5", nPendingWithdrawals: 2 });
		expect(parseStakingSummary({ delegated: "100" })).toBeNull();
	});

	it("uses maintenance availability for Spot HYPE and otherwise subtracts holds with Big.js", () => {
		expect(
			parseSpotHypeAvailable({
				balances: [{ coin: "HYPE", token: 150, total: "10.12345678", hold: "1.00000001", entryNtl: "0" }],
				tokenToAvailableAfterMaintenance: [[150, "8.5"]],
			}),
		).toBe("8.5");
		expect(
			parseSpotHypeAvailable({
				balances: [{ coin: "HYPE", token: 150, total: "10.12345678", hold: "1.00000001", entryNtl: "0" }],
			}),
		).toBe("9.12345677");
		expect(parseSpotHypeAvailable({ balances: [] })).toBe("0");
		expect(parseSpotHypeAvailable({ balances: [{ coin: "HYPE", total: "1", hold: "2" }] })).toBeNull();
	});

	it("accepts only documented reward sources and maps action history without merging undelegate into withdrawal", () => {
		expect(parseStakingRewards([{ time: 1_700_000_000_000, source: "delegation", totalAmount: "0.25" }])).toEqual([
			{ time: 1_700_000_000_000, source: "delegation", totalAmount: "0.25" },
		]);
		expect(parseStakingRewards([{ time: 1_700_000_000_000, source: VALIDATOR, totalAmount: "0.25" }])).toBeNull();

		expect(
			parseStakingHistory([
				{
					time: 1_700_000_000_000,
					hash: HASH,
					delta: { delegate: { validator: VALIDATOR, amount: "2", isUndelegate: true } },
				},
				{
					time: 1_700_000_000_001,
					hash: HASH,
					delta: { withdrawal: { amount: "2", phase: "initiated" } },
				},
			]),
		).toMatchObject([{ action: { type: "undelegate" } }, { action: { type: "withdrawalInitiated" } }]);
	});

	it("recognizes only finalized withdrawals with the protocol zero-hash sentinel as system finalizations", () => {
		const zeroHash = `0x${"0".repeat(64)}` as const;
		expect(
			isSystemFinalizedWithdrawal({
				time: 1_700_000_000_000,
				hash: zeroHash,
				action: { type: "withdrawalFinalized", amount: "2" },
			}),
		).toBe(true);
		expect(
			isSystemFinalizedWithdrawal({
				time: 1_700_000_000_000,
				hash: zeroHash,
				action: { type: "withdrawalInitiated", amount: "2" },
			}),
		).toBe(false);
		expect(
			isSystemFinalizedWithdrawal({
				time: 1_700_000_000_000,
				hash: HASH,
				action: { type: "withdrawalFinalized", amount: "2" },
			}),
		).toBe(false);
	});

	it("validates the read-only permanent staking-link discriminant", () => {
		expect(parseStakingLink({ stakingLink: null })).toBeNull();
		expect(parseStakingLink({ stakingLink: { type: "requested", stakingUser: VALIDATOR } })).toEqual({
			type: "requested",
			stakingUser: VALIDATOR,
		});
		expect(parseStakingLink({ stakingLink: { type: "unlinked", stakingUser: VALIDATOR } })).toBeUndefined();
	});

	it("joins exact delegations and calculates period-weighted APR with Big.js", () => {
		const validators =
			parseValidatorSummaries([
				validator(),
				validator({
					validator: "0x3333333333333333333333333333333333333333",
					signer: "0x4444444444444444444444444444444444444444",
					stats: [
						["day", { uptimeFraction: "1", predictedApr: "0.04", nSamples: 10 }],
						["week", { uptimeFraction: "1", predictedApr: "0.05", nSamples: 70 }],
						["month", { uptimeFraction: "1", predictedApr: "0.06", nSamples: 300 }],
					],
				}),
			]) ?? [];
		const delegations =
			parseStakingDelegations([
				{ validator: VALIDATOR, amount: "100", lockedUntilTimestamp: 1_700_000_000_000 },
				{
					validator: "0x3333333333333333333333333333333333333333",
					amount: "300",
					lockedUntilTimestamp: 1_700_000_000_000,
				},
			]) ?? [];

		expect(calculateDelegationWeightedApr(validators, delegations, "week")).toBe("0.045");
		expect(createValidatorViews(validators, delegations, "day")[0]).toMatchObject({
			delegatedAmount: "100",
			selectedStats: { predictedApr: "0.02" },
		});
	});

	it("scales HYPE with eight exact decimals and fails closed beyond safe integers", () => {
		expect(validateHypeActionAmount("1.23456789", "2")).toEqual({
			valid: true,
			amount: "1.23456789",
			wei: 123_456_789,
		});
		expect(validateHypeActionAmount("1.234567891", "2")).toEqual({ valid: false, reason: "format" });
		expect(validateHypeActionAmount("3", "2")).toEqual({ valid: false, reason: "maximum" });
		expect(validateHypeActionAmount("90071992.54740991")).toMatchObject({ valid: true, wei: Number.MAX_SAFE_INTEGER });
		expect(validateHypeActionAmount("90071992.54740992")).toEqual({ valid: false, reason: "unsafe" });
		expect(validateHypeActionAmount("0.0000001")).toEqual({ valid: true, amount: "0.0000001", wei: 10 });
		expect(validateHypeActionAmount("0.00000001")).toEqual({ valid: true, amount: "0.00000001", wei: 1 });
		expect(createStakingActionSubmission({ kind: "cWithdraw", maxAmount: "2" }, "1.00000000")).toEqual({
			request: { kind: "cWithdraw", maxAmount: "2" },
			amount: "1",
			wei: 100_000_000,
		});
	});

	it("derives every account/signing page state without treating errors as empty balances", () => {
		expect(
			deriveStakingPageState({ publicState: "loading", accountState: "disconnected", hasExactMasterSigner: false }),
		).toBe("loading");
		expect(deriveStakingPageState({ publicState: "failed", accountState: "ready", hasExactMasterSigner: true })).toBe(
			"error",
		);
		expect(deriveStakingPageState({ publicState: "ready", accountState: "failed", hasExactMasterSigner: true })).toBe(
			"error",
		);
		expect(
			deriveStakingPageState({ publicState: "retained", accountState: "retained", hasExactMasterSigner: true }),
		).toBe("normal");
		expect(
			deriveStakingPageState({ publicState: "ready", accountState: "disconnected", hasExactMasterSigner: false }),
		).toBe("disconnected");
		expect(deriveStakingPageState({ publicState: "ready", accountState: "ready", hasExactMasterSigner: false })).toBe(
			"nonSigning",
		);
		expect(deriveStakingPageState({ publicState: "ready", accountState: "ready", hasExactMasterSigner: true })).toBe(
			"normal",
		);
	});

	it("keeps validator lock checks separate from the seven-day withdrawal queue", () => {
		expect(canUndelegate({ amount: "1", lockedUntilTimestamp: 999 }, 1_000)).toBe(true);
		expect(canUndelegate({ amount: "1", lockedUntilTimestamp: 1_001 }, 1_000)).toBe(false);
		expect(formatStakingAmount("1234567.89000000", getNumberFormatters(), 8)).toBe("1,234,567.89");
	});

	it("truncates HYPE amounts and ratios toward zero and keeps tiny ratios out of exponent notation", () => {
		const numberFormat = getNumberFormatters();
		expect(formatStakingAmount("9.99999", numberFormat)).toBe("9.9999");
		expect(formatStakingRatio("0.12345", numberFormat)).toBe("12.34%");
		expect(formatStakingRatio("0.0000000001", numberFormat)).toBe("0%");
		expect(formatStakingAmount("not-a-number", numberFormat)).toBe("—");
		expect(formatStakingAmount("1", numberFormat, -1)).toBe("—");
	});
});
