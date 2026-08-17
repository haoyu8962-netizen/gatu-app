import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { isTradeRestricted } from "@/config/geo";
import { parseIpdataGeoResponse } from "@/lib/geo/ipdata-geo";

const IPDATA_BASE = "https://api.ipdata.co";
const REFERRAL_GEO_LEASE_MS = 60_000;
const REFERRAL_GEO_TIMEOUT_MS = 5_000;

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

export function deriveReferralActionGeoDecision(
	value: unknown,
	checkedAt: number,
): Extract<ReferralActionGeoDecision, { status: "allowed" | "blocked" }> | null {
	const parsed = parseIpdataGeoResponse(value);
	if (!parsed) return null;

	const { country, proxy, tradeRestricted } = parsed;
	if (proxy) {
		return { checkedAt, country, reason: "proxy", status: "blocked" };
	}
	if (tradeRestricted) {
		return { checkedAt, country, reason: "jurisdiction", status: "blocked" };
	}
	return { checkedAt, country, status: "allowed", ttlMs: REFERRAL_GEO_LEASE_MS };
}

function createDevelopmentDecision(override: string, checkedAt: number): ReferralActionGeoDecision {
	const [country, region] = override.toUpperCase().split("-");
	if (!country || !/^[A-Z]{2}$/.test(country)) {
		return { checkedAt, reason: "invalid_response", status: "unavailable" };
	}
	if (isTradeRestricted(country, region)) {
		return { checkedAt, country, reason: "jurisdiction", status: "blocked" };
	}
	return { checkedAt, country, status: "allowed", ttlMs: REFERRAL_GEO_LEASE_MS };
}

export const getReferralActionGeo = createServerFn({ method: "POST" })
	.validator((input: { override?: string | null } | undefined): { override: string | null } => ({
		override: input?.override ?? null,
	}))
	.handler(async ({ data }): Promise<ReferralActionGeoDecision> => {
		const checkedAt = Date.now();
		if (import.meta.env.DEV && data.override) return createDevelopmentDecision(data.override, checkedAt);

		const apiKey = process.env.IPDATA_API_KEY;
		if (!apiKey) return { checkedAt, reason: "missing_config", status: "unavailable" };

		const ip = getRequestIP({ xForwardedFor: true });
		if (!ip) return { checkedAt, reason: "missing_ip", status: "unavailable" };

		try {
			const response = await fetch(
				`${IPDATA_BASE}/${encodeURIComponent(ip)}?api-key=${apiKey}&fields=country_code,region_code,threat`,
				{ cache: "no-store", signal: AbortSignal.timeout(REFERRAL_GEO_TIMEOUT_MS) },
			);
			if (!response.ok) return { checkedAt, reason: "provider_error", status: "unavailable" };
			const decision = deriveReferralActionGeoDecision(await response.json(), checkedAt);
			return decision ?? { checkedAt, reason: "invalid_response", status: "unavailable" };
		} catch {
			return { checkedAt, reason: "provider_error", status: "unavailable" };
		}
	});
