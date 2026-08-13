import type { ReferralResponse } from "@nktkas/hyperliquid";
import Big from "big.js";
import { z } from "zod";
import { getPublicOrigin } from "@/config/public-origins";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const UNSIGNED_DECIMAL_PATTERN = /^[0-9]+(?:\.[0-9]+)?$/;

const addressSchema = z.custom<`0x${string}`>((value) => typeof value === "string" && ADDRESS_PATTERN.test(value));
const unsignedDecimalSchema = z.string().regex(UNSIGNED_DECIMAL_PATTERN);
const nonNegativeSafeIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

function hasUniqueTokenIds(entries: readonly (readonly [number, unknown])[]): boolean {
	return new Set(entries.map(([tokenId]) => tokenId)).size === entries.length;
}

const referredBySchema = z
	.object({
		referrer: addressSchema,
		code: z.string(),
	})
	.strict();

const referredTraderTokenStateSchema = z
	.object({
		cumVlm: unsignedDecimalSchema,
		cumRewardedFeesSinceReferred: unsignedDecimalSchema,
		cumFeesRewardedToReferrer: unsignedDecimalSchema,
	})
	.strict();

const referredTraderTokenToStateSchema = z
	.array(z.tuple([nonNegativeSafeIntegerSchema, referredTraderTokenStateSchema]))
	.refine(hasUniqueTokenIds);

const referredTraderSchema = z
	.object({
		cumVlm: unsignedDecimalSchema,
		cumRewardedFeesSinceReferred: unsignedDecimalSchema,
		cumFeesRewardedToReferrer: unsignedDecimalSchema,
		timeJoined: nonNegativeSafeIntegerSchema,
		user: addressSchema,
		tokenToState: referredTraderTokenToStateSchema,
	})
	.strict();

const referrerStateSchema = z.discriminatedUnion("stage", [
	z
		.object({
			stage: z.literal("ready"),
			data: z
				.object({
					code: z.string(),
					nReferrals: nonNegativeSafeIntegerSchema,
					referralStates: z.array(referredTraderSchema),
				})
				.strict(),
		})
		.strict(),
	z
		.object({
			stage: z.literal("needToCreateCode"),
		})
		.strict(),
	z
		.object({
			stage: z.literal("needToTrade"),
			data: z
				.object({
					required: unsignedDecimalSchema,
				})
				.strict(),
		})
		.strict(),
]);

const rewardHistoryItemSchema = z
	.object({
		earned: unsignedDecimalSchema,
		vlm: unsignedDecimalSchema,
		referralVlm: unsignedDecimalSchema,
		time: nonNegativeSafeIntegerSchema,
	})
	.strict();

const tokenRewardStateSchema = z
	.object({
		cumVlm: unsignedDecimalSchema,
		unclaimedRewards: unsignedDecimalSchema,
		claimedRewards: unsignedDecimalSchema,
		builderRewards: unsignedDecimalSchema,
	})
	.strict();

const tokenRewardEntriesSchema = z
	.array(z.tuple([nonNegativeSafeIntegerSchema, tokenRewardStateSchema]))
	.refine(hasUniqueTokenIds);

const referralResponseSchema: z.ZodType<ReferralResponse> = z
	.object({
		referredBy: referredBySchema.nullable(),
		cumVlm: unsignedDecimalSchema,
		unclaimedRewards: unsignedDecimalSchema,
		claimedRewards: unsignedDecimalSchema,
		builderRewards: unsignedDecimalSchema,
		referrerState: referrerStateSchema,
		rewardHistory: z.array(rewardHistoryItemSchema),
		tokenToState: tokenRewardEntriesSchema,
	})
	.strict();

export type ReferralData = ReferralResponse;
export type ReadyReferrerState = Extract<ReferralData["referrerState"], { stage: "ready" }>;
export type ReferredTrader = ReadyReferrerState["data"]["referralStates"][number];
export type ReferralRewardHistoryItem = ReferralData["rewardHistory"][number];
export type ReferralTokenRewardEntry = ReferralData["tokenToState"][number];

export interface ReferralTokenMetadata {
	index: number;
	name: string;
	weiDecimals: number;
}

export interface ReferralRewardRow {
	builderRewards: string;
	claimableRewards: string;
	claimedRewards: string;
	cumVlm: string;
	name: string;
	tokenId: number;
	unclaimedRewards: string;
	weiDecimals: number | null;
}

export type ReferralMutationKind = "apply" | "claim" | "create";

export function normalizeReferralResponse(value: unknown): ReferralData | null {
	const result = referralResponseSchema.safeParse(value);
	return result.success ? result.data : null;
}

const referralTokenMetadataSchema = z
	.object({
		tokens: z.array(
			z
				.object({
					index: nonNegativeSafeIntegerSchema,
					name: z.string().min(1),
					weiDecimals: nonNegativeSafeIntegerSchema.max(20),
				})
				.passthrough(),
		),
	})
	.passthrough();

export function normalizeReferralTokenMetadata(value: unknown): Map<number, ReferralTokenMetadata> | null {
	const result = referralTokenMetadataSchema.safeParse(value);
	if (!result.success) return null;

	const tokens = new Map<number, ReferralTokenMetadata>();
	for (const token of result.data.tokens) {
		if (tokens.has(token.index)) return null;
		tokens.set(token.index, token);
	}
	return tokens;
}

export function normalizeActiveReferralDiscount(value: unknown): string | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const discount = (value as Record<string, unknown>).activeReferralDiscount;
	return typeof discount === "string" && UNSIGNED_DECIMAL_PATTERN.test(discount) ? discount : null;
}

export function buildReferralRewardRows(
	data: ReferralData,
	tokens: ReadonlyMap<number, ReferralTokenMetadata> | null,
): ReferralRewardRow[] {
	return data.tokenToState.map(([tokenId, state]) => ({
		...state,
		claimableRewards: state.unclaimedRewards,
		name: tokens?.get(tokenId)?.name ?? `Token #${tokenId}`,
		tokenId,
		weiDecimals: tokens?.get(tokenId)?.weiDecimals ?? null,
	}));
}

export function hasClaimableReferralRewards(data: ReferralData): boolean {
	return data.tokenToState.some(([, state]) => Big(state.unclaimedRewards).gt(0));
}

export function getClaimableReferralRewardRows(rows: readonly ReferralRewardRow[]): ReferralRewardRow[] {
	return rows.filter((row) => Big(row.unclaimedRewards).gt(0));
}

export function getUsdcRewardsEarned(data: ReferralData): string {
	return Big(data.claimedRewards).plus(data.unclaimedRewards).toString();
}

export function getReferralDiscountPercent(discount: string): string {
	return Big(discount).times(100).toString();
}

export function getDisplayedReferralDiscountPercent(data: ReferralData, discount: string | null): string | null {
	if (data.referredBy === null || discount === null) return null;
	return getReferralDiscountPercent(discount);
}

export function getReferralCumulativeVolume(data: ReferralData): string {
	if (data.tokenToState.length === 0) return data.cumVlm;
	return data.tokenToState.reduce((total, [, state]) => total.plus(state.cumVlm), new Big(0)).toString();
}

export function getReferralActivationProgress(data: ReferralData): number | null {
	if (data.referrerState.stage !== "needToTrade") return null;
	const completed = Big(getReferralCumulativeVolume(data));
	const remaining = Big(data.referrerState.data.required);
	const target = completed.plus(remaining);
	if (remaining.lte(0) || target.lte(0)) return 100;
	return Math.max(0, Math.min(100, Number(completed.div(target).times(100).toFixed(2))));
}

export function getReferralActivationTargetVolume(data: ReferralData): string | null {
	if (data.referrerState.stage !== "needToTrade") return null;
	return Big(getReferralCumulativeVolume(data)).plus(data.referrerState.data.required).toString();
}

export function getOfficialReferralUrl(code: string, env: "Mainnet" | "Testnet"): string {
	const host = env === "Testnet" ? "https://app.hyperliquid-testnet.xyz" : "https://app.hyperliquid.xyz";
	return `${host}/join/${encodeURIComponent(code)}`;
}

export function getGatuReferralUrl(code: string, env: "Mainnet" | "Testnet"): string {
	const origin = getPublicOrigin(env === "Testnet" ? "testnet" : "mainnet");
	return `${origin}/join/${encodeURIComponent(code)}`;
}

export function isValidReferralCode(code: string): boolean {
	return code.length >= 1 && code.length <= 20;
}

export function canApplyReferralCode(data: ReferralData): boolean {
	if (data.referredBy !== null) return false;
	return Big(getReferralCumulativeVolume(data)).lte(10_000);
}

export function isReferralMutationReconciled(
	action: ReferralMutationKind,
	before: ReferralData,
	after: ReferralData,
	code?: string,
): boolean {
	if (action === "apply") return typeof code === "string" && after.referredBy?.code === code;
	if (action === "create") {
		return typeof code === "string" && after.referrerState.stage === "ready" && after.referrerState.data.code === code;
	}

	const afterRewards = new Map(after.tokenToState);
	return before.tokenToState.some(([tokenId, state]) => {
		const previousUnclaimed = Big(state.unclaimedRewards);
		if (previousUnclaimed.lte(0)) return false;
		const next = afterRewards.get(tokenId);
		if (!next) return true;
		return Big(next.unclaimedRewards).lt(previousUnclaimed) || Big(next.claimedRewards).gt(state.claimedRewards);
	});
}
