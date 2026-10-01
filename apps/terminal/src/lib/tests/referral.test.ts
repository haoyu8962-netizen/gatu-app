import { describe, expect, it } from "vitest";
import {
	buildReferralRewardRows,
	canApplyReferralCode,
	getBrandReferralUrl,
	getDisplayedReferralDiscountPercent,
	getOfficialReferralUrl,
	getReferralActivationProgress,
	getReferralActivationTargetVolume,
	getReferralCumulativeVolume,
	getReferralDiscountPercent,
	getUnclaimedReferralRewardRows,
	getUsdcRewardsEarned,
	hasUnclaimedReferralRewards,
	isReferralMutationReconciled,
	isValidReferralCode,
	normalizeActiveReferralDiscount,
	normalizeReferralResponse,
	normalizeReferralTokenMetadata,
	type ReadyReferrerState,
	type ReferralData,
} from "@/lib/trade/referral";

const REFERRER = "0x1111111111111111111111111111111111111111";
const TRADER = "0x2222222222222222222222222222222222222222";

type ReadyReferralData = Omit<ReferralData, "referrerState"> & { referrerState: ReadyReferrerState };

function createReadyReferralResponse(): ReadyReferralData {
	return {
		referredBy: {
			referrer: REFERRER,
			code: "REFERRED",
		},
		cumVlm: "0001200.5000",
		unclaimedRewards: "1.000000000000000001",
		claimedRewards: "2.25",
		builderRewards: "3.250000000000000001",
		referrerState: {
			stage: "ready",
			data: {
				code: "SAIRN",
				nReferrals: 1,
				referralStates: [
					{
						cumVlm: "100.5",
						cumRewardedFeesSinceReferred: "0.004",
						cumFeesRewardedToReferrer: "0.01",
						timeJoined: 1_725_000_000_000,
						user: TRADER,
						tokenToState: [
							[
								0,
								{
									cumVlm: "100.5",
									cumRewardedFeesSinceReferred: "0.004",
									cumFeesRewardedToReferrer: "0.01",
								},
							],
						],
					},
				],
			},
		},
		rewardHistory: [
			{
				earned: "0.01",
				vlm: "100.5",
				referralVlm: "50.25",
				time: 1_725_100_000_000,
			},
		],
		tokenToState: [
			[
				0,
				{
					cumVlm: "1200.5",
					unclaimedRewards: "1.000000000000000001",
					claimedRewards: "2.25",
					builderRewards: "3.250000000000000001",
				},
			],
		],
	};
}

describe("normalizeReferralResponse", () => {
	it("preserves ready state, token rewards, referred traders, and legacy history", () => {
		const response = createReadyReferralResponse();
		const normalized = normalizeReferralResponse(response);

		expect(normalized).toEqual(response);
		expect(normalized?.cumVlm).toBe("0001200.5000");
		expect(normalized?.unclaimedRewards).toBe("1.000000000000000001");
		expect(normalized?.tokenToState[0]?.[1].claimedRewards).toBe("2.25");
		if (normalized?.referrerState.stage !== "ready") throw new Error("Expected ready referrer state");
		expect(normalized.referrerState.data.referralStates[0]?.tokenToState[0]?.[1]).toEqual({
			cumVlm: "100.5",
			cumRewardedFeesSinceReferred: "0.004",
			cumFeesRewardedToReferrer: "0.01",
		});
		expect(normalized.rewardHistory[0]).toEqual(response.rewardHistory[0]);
	});

	it("preserves need-to-create-code state", () => {
		const response = {
			...createReadyReferralResponse(),
			referrerState: { stage: "needToCreateCode" },
		};

		expect(normalizeReferralResponse(response)?.referrerState).toEqual({ stage: "needToCreateCode" });
	});

	it("preserves need-to-trade state and its required volume", () => {
		const response = {
			...createReadyReferralResponse(),
			referrerState: { stage: "needToTrade", data: { required: "10000.00" } },
		};

		expect(normalizeReferralResponse(response)?.referrerState).toEqual({
			stage: "needToTrade",
			data: { required: "10000.00" },
		});
	});

	it("accepts a null referred-by state", () => {
		const response = { ...createReadyReferralResponse(), referredBy: null };

		expect(normalizeReferralResponse(response)?.referredBy).toBeNull();
	});

	it.each(["-1", ".5", "1.", "1e3", "Infinity", "NaN", " 1", "1 "])(
		"rejects non-canonical unsigned decimal %s",
		(value) => {
			const response = { ...createReadyReferralResponse(), unclaimedRewards: value };

			expect(normalizeReferralResponse(response)).toBeNull();
		},
	);

	it("rejects numeric values for financial fields", () => {
		const response = { ...createReadyReferralResponse(), claimedRewards: 2.25 };

		expect(normalizeReferralResponse(response)).toBeNull();
	});

	it("rejects malformed nested referral token rewards", () => {
		const response = createReadyReferralResponse();
		const referredTrader = response.referrerState.data.referralStates[0];
		const tokenState = referredTrader?.tokenToState[0]?.[1];
		if (!tokenState) throw new Error("Expected referred trader token state fixture");
		tokenState.cumVlm = "1e8";

		expect(normalizeReferralResponse(response)).toBeNull();
	});

	it("rejects invalid addresses, timestamps, counts, and token identifiers", () => {
		const fixture = createReadyReferralResponse();
		const rewardHistoryItem = fixture.rewardHistory[0];
		const tokenState = fixture.tokenToState[0]?.[1];
		if (!rewardHistoryItem || !tokenState) throw new Error("Expected referral fixture entries");
		const invalidResponses = [
			{ ...createReadyReferralResponse(), referredBy: { referrer: "0x123", code: "BAD" } },
			{
				...createReadyReferralResponse(),
				referrerState: {
					...createReadyReferralResponse().referrerState,
					data: { ...createReadyReferralResponse().referrerState.data, nReferrals: -1 },
				},
			},
			{
				...createReadyReferralResponse(),
				rewardHistory: [{ ...rewardHistoryItem, time: 1.5 }],
			},
			{
				...createReadyReferralResponse(),
				tokenToState: [[-1, tokenState]],
			},
		];

		for (const response of invalidResponses) expect(normalizeReferralResponse(response)).toBeNull();
	});

	it("rejects missing, unknown, and structurally incomplete responses", () => {
		const withUnknownField = { ...createReadyReferralResponse(), futureField: true };
		const { rewardHistory: _rewardHistory, ...missingHistory } = createReadyReferralResponse();

		expect(normalizeReferralResponse(null)).toBeNull();
		expect(normalizeReferralResponse([])).toBeNull();
		expect(normalizeReferralResponse(withUnknownField)).toBeNull();
		expect(normalizeReferralResponse(missingHistory)).toBeNull();
	});

	it("accepts response codes as the unrestricted strings declared by the SDK", () => {
		const emptyCode = { ...createReadyReferralResponse(), referredBy: { referrer: REFERRER, code: "" } };
		const oversizedCode = {
			...createReadyReferralResponse(),
			referrerState: {
				...createReadyReferralResponse().referrerState,
				data: { ...createReadyReferralResponse().referrerState.data, code: "x".repeat(21) },
			},
		};

		expect(normalizeReferralResponse(emptyCode)).not.toBeNull();
		expect(normalizeReferralResponse(oversizedCode)).not.toBeNull();
	});
});

describe("referral display derivations", () => {
	it("maps reward token metadata without adding different assets together", () => {
		const metadata = normalizeReferralTokenMetadata({
			tokens: [{ index: 0, name: "USDC", weiDecimals: 6, fullName: "USD Coin" }],
			universe: [],
		});
		const data = createReadyReferralResponse();

		expect(buildReferralRewardRows(data, metadata)).toEqual([
			{
				builderRewards: "3.250000000000000001",
				claimedRewards: "2.25",
				cumVlm: "1200.5",
				name: "USDC",
				tokenId: 0,
				unclaimedRewards: "1.000000000000000001",
				weiDecimals: 6,
			},
		]);
		expect(getUsdcRewardsEarned(data)).toBe("3.250000000000000001");
		expect(hasUnclaimedReferralRewards(data)).toBe(true);
		expect(getUnclaimedReferralRewardRows(buildReferralRewardRows(data, metadata))).toHaveLength(1);
		expect(buildReferralRewardRows(data, metadata)[0]).not.toHaveProperty("claimableRewards");
	});

	it("uses an explicit fallback for unknown token ids", () => {
		expect(buildReferralRewardRows(createReadyReferralResponse(), new Map())[0]?.name).toBe("Token #0");
		expect(buildReferralRewardRows(createReadyReferralResponse(), new Map())[0]?.weiDecimals).toBeNull();
	});

	it("rejects malformed or duplicate spot metadata", () => {
		expect(normalizeReferralTokenMetadata(null)).toBeNull();
		expect(
			normalizeReferralTokenMetadata({
				tokens: [
					{ index: 0, name: "USDC", weiDecimals: 6 },
					{ index: 0, name: "USDC2", weiDecimals: 6 },
				],
			}),
		).toBeNull();
		expect(normalizeReferralTokenMetadata({ tokens: [{ index: 0, name: "USDC", weiDecimals: 100 }] })).toBeNull();
	});

	it("rejects duplicate referral reward token identifiers", () => {
		const topLevel = createReadyReferralResponse();
		const tokenEntry = topLevel.tokenToState[0];
		if (!tokenEntry) throw new Error("Expected top-level token state fixture");
		topLevel.tokenToState = [tokenEntry, tokenEntry];
		expect(normalizeReferralResponse(topLevel)).toBeNull();

		const nested = createReadyReferralResponse();
		const referredTrader = nested.referrerState.data.referralStates[0];
		const referredTokenEntry = referredTrader?.tokenToState[0];
		if (!referredTrader || !referredTokenEntry) throw new Error("Expected referred trader token fixture");
		referredTrader.tokenToState = [referredTokenEntry, referredTokenEntry];
		expect(normalizeReferralResponse(nested)).toBeNull();
	});

	it("normalizes the live referral discount and formats it as a percent", () => {
		expect(normalizeActiveReferralDiscount({ activeReferralDiscount: "0.04" })).toBe("0.04");
		expect(normalizeActiveReferralDiscount({ activeReferralDiscount: 0.04 })).toBeNull();
		expect(getReferralDiscountPercent("0.04")).toBe("4");
		expect(getDisplayedReferralDiscountPercent(createReadyReferralResponse(), "0.04")).toBe("4");
		expect(getDisplayedReferralDiscountPercent({ ...createReadyReferralResponse(), referredBy: null }, "0")).toBeNull();
	});

	it("caps activation progress while calculating with decimal strings", () => {
		const response = {
			...createReadyReferralResponse(),
			cumVlm: "2500",
			tokenToState: [
				[0, { ...createReadyReferralResponse().tokenToState[0][1], cumVlm: "2500" }],
			] as ReferralData["tokenToState"],
			referrerState: { stage: "needToTrade" as const, data: { required: "10000" } },
		};
		expect(getReferralActivationProgress(response)).toBe(20);
		expect(getReferralActivationTargetVolume(response)).toBe("12500");
		expect(
			getReferralActivationProgress({
				...response,
				cumVlm: "10000",
				referrerState: { stage: "needToTrade", data: { required: "0" } },
			}),
		).toBe(100);
		expect(
			getReferralActivationProgress({
				...response,
				cumVlm: "9990",
				tokenToState: [[0, { ...response.tokenToState[0][1], cumVlm: "9990" }]],
				referrerState: { stage: "needToTrade", data: { required: "10" } },
			}),
		).toBe(99.9);
	});

	it("uses all quote-asset volume for referral activation", () => {
		const response = {
			...createReadyReferralResponse(),
			cumVlm: "1000",
			tokenToState: [
				[0, { ...createReadyReferralResponse().tokenToState[0][1], cumVlm: "1000" }],
				[1, { ...createReadyReferralResponse().tokenToState[0][1], cumVlm: "2000" }],
			] as ReferralData["tokenToState"],
			referrerState: { stage: "needToTrade" as const, data: { required: "7000" } },
		};
		expect(getReferralCumulativeVolume(response)).toBe("3000");
		expect(getReferralActivationTargetVolume(response)).toBe("10000");
		expect(getReferralActivationProgress(response)).toBe(30);
	});

	it("builds environment-specific official referral links", () => {
		expect(getOfficialReferralUrl("SAIRN code", "Mainnet")).toBe("https://app.hyperliquid.xyz/join/SAIRN%20code");
		expect(getOfficialReferralUrl("SAIRN code", "Testnet")).toBe(
			"https://app.hyperliquid-testnet.xyz/join/SAIRN%20code",
		);
	});

	it("builds environment-specific Sairn invitation links from canonical origins", () => {
		expect(getBrandReferralUrl("SAIRN code", "Mainnet")).toBe("https://app.sairn.ai/join/SAIRN%20code");
		expect(getBrandReferralUrl("SAIRN code", "Testnet")).toBe("https://testnet.sairn.ai/join/SAIRN%20code");
	});

	it("validates only the SDK code length contract", () => {
		expect(isValidReferralCode("A")).toBe(true);
		expect(isValidReferralCode("code with spaces")).toBe(true);
		expect(isValidReferralCode("")).toBe(false);
		expect(isValidReferralCode("x".repeat(21))).toBe(false);
	});

	it("matches the official terminal referral-code volume gate", () => {
		const data = { ...createReadyReferralResponse(), referredBy: null };
		const rewardState = data.tokenToState[0]?.[1];
		if (!rewardState) throw new Error("Expected reward state fixture");

		expect(canApplyReferralCode({ ...data, tokenToState: [[0, { ...rewardState, cumVlm: "10000" }]] })).toBe(true);
		expect(canApplyReferralCode({ ...data, tokenToState: [[0, { ...rewardState, cumVlm: "10000.01" }]] })).toBe(false);
		expect(
			canApplyReferralCode({
				...data,
				tokenToState: [
					[0, { ...rewardState, cumVlm: "6000" }],
					[1, { ...rewardState, cumVlm: "4001" }],
				],
			}),
		).toBe(false);
		expect(canApplyReferralCode(createReadyReferralResponse())).toBe(false);
	});

	it("offers a claim action only when the protocol reports positive unclaimed rewards", () => {
		const data = createReadyReferralResponse();
		const rewardState = data.tokenToState[0]?.[1];
		if (!rewardState) throw new Error("Expected reward state fixture");
		expect(
			hasUnclaimedReferralRewards({ ...data, tokenToState: [[0, { ...rewardState, unclaimedRewards: "0" }]] }),
		).toBe(false);
		expect(
			hasUnclaimedReferralRewards({ ...data, tokenToState: [[0, { ...rewardState, unclaimedRewards: "0.01" }]] }),
		).toBe(true);
		expect(
			hasUnclaimedReferralRewards({
				...data,
				tokenToState: [[0, { ...rewardState, builderRewards: "0.01", unclaimedRewards: "0" }]],
			}),
		).toBe(false);
	});

	it("reconciles apply, create, and claim against fresh protocol state", () => {
		const before = createReadyReferralResponse();
		const rewardState = before.tokenToState[0]?.[1];
		if (!rewardState) throw new Error("Expected reward state fixture");
		expect(isReferralMutationReconciled("apply", { ...before, referredBy: null }, before, "REFERRED")).toBe(true);
		expect(isReferralMutationReconciled("create", before, before, "SAIRN")).toBe(true);
		expect(
			isReferralMutationReconciled("claim", before, {
				...before,
				tokenToState: [[0, { ...rewardState, unclaimedRewards: "0" }]],
			}),
		).toBe(true);
		expect(isReferralMutationReconciled("claim", before, before)).toBe(false);
	});
});
