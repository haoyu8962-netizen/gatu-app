import type { GeoVerdict } from "@/config/geo";
import { resolveDevelopmentGeoVerdict } from "@/lib/geo/development-geo";
import { type ParsedIpdataGeo, parseIpdataGeoResponse } from "@/lib/geo/ipdata-geo";
import { z } from "@/lib/zod";

export const REFERRAL_GEO_LEASE_MS = 60_000;

export type ReferralActionGeoDecision =
	| {
			checkedAt: number;
			country: string;
			status: "allowed";
			ttlMs: number;
	  }
	| {
			checkedAt: number;
			country: string;
			reason: "jurisdiction" | "proxy";
			status: "blocked";
	  }
	| {
			checkedAt: number;
			reason: "invalid_response" | "missing_config" | "missing_ip" | "provider_error";
			status: "unavailable";
	  };

export const geoVerdictSchema: z.ZodType<GeoVerdict> = z.object({
	country: z.string().nullable(),
	tradeRestricted: z.boolean(),
	proxy: z.boolean(),
});

export const referralActionGeoDecisionSchema: z.ZodType<ReferralActionGeoDecision> = z.discriminatedUnion("status", [
	z.object({ status: z.literal("allowed"), checkedAt: z.number(), country: z.string(), ttlMs: z.number() }),
	z.object({
		status: z.literal("blocked"),
		checkedAt: z.number(),
		country: z.string(),
		reason: z.enum(["jurisdiction", "proxy"]),
	}),
	z.object({
		status: z.literal("unavailable"),
		checkedAt: z.number(),
		reason: z.enum(["invalid_response", "missing_config", "missing_ip", "provider_error"]),
	}),
]);

export function toGeoVerdict(parsed: ParsedIpdataGeo): GeoVerdict {
	return { country: parsed.country, tradeRestricted: parsed.tradeRestricted, proxy: parsed.proxy };
}

export function deriveReferralActionGeoDecisionFromParsed(
	parsed: ParsedIpdataGeo,
	checkedAt: number,
): Extract<ReferralActionGeoDecision, { status: "allowed" | "blocked" }> {
	const { country, proxy, tradeRestricted } = parsed;
	if (proxy) {
		return { checkedAt, country, reason: "proxy", status: "blocked" };
	}
	if (tradeRestricted) {
		return { checkedAt, country, reason: "jurisdiction", status: "blocked" };
	}
	return { checkedAt, country, status: "allowed", ttlMs: REFERRAL_GEO_LEASE_MS };
}

export function deriveReferralActionGeoDecision(
	value: unknown,
	checkedAt: number,
): Extract<ReferralActionGeoDecision, { status: "allowed" | "blocked" }> | null {
	const parsed = parseIpdataGeoResponse(value);
	if (!parsed) return null;
	return deriveReferralActionGeoDecisionFromParsed(parsed, checkedAt);
}

export function createDevelopmentReferralActionGeoDecision(
	override: string | null,
	checkedAt: number,
): ReferralActionGeoDecision {
	const verdict = resolveDevelopmentGeoVerdict({ enabled: true, override });
	if (!verdict?.country) {
		return { checkedAt, reason: "invalid_response", status: "unavailable" };
	}
	if (verdict.tradeRestricted) {
		return { checkedAt, country: verdict.country, reason: "jurisdiction", status: "blocked" };
	}
	return { checkedAt, country: verdict.country, status: "allowed", ttlMs: REFERRAL_GEO_LEASE_MS };
}
