import { REFERRAL_GEO_API_PATH } from "@/config/api-paths";
import { type ReferralActionGeoDecision, referralActionGeoDecisionSchema } from "@/lib/geo/geo-contracts";

export { deriveReferralActionGeoDecision, type ReferralActionGeoDecision } from "@/lib/geo/geo-contracts";

const REFERRAL_GEO_UNAVAILABLE_MESSAGE = "Referral geo check unavailable";

export interface GetReferralActionGeoInput {
	data: { override: string | null };
}

/**
 * Asks the same-origin referral geo endpoint for a fresh, short-lived decision before a referral
 * or staking action. A transport failure throws so the caller aborts the action; an unavailable
 * provider is reported inside the decision instead.
 */
export async function getReferralActionGeo({ data }: GetReferralActionGeoInput): Promise<ReferralActionGeoDecision> {
	const response = await fetch(REFERRAL_GEO_API_PATH, {
		method: "POST",
		headers: { accept: "application/json", "content-type": "application/json" },
		body: JSON.stringify({ override: data.override }),
		cache: "no-store",
		credentials: "omit",
		mode: "same-origin",
	});
	if (!response.ok) throw new Error(REFERRAL_GEO_UNAVAILABLE_MESSAGE);

	const parsed = referralActionGeoDecisionSchema.safeParse(await response.json());
	if (!parsed.success) throw new Error(REFERRAL_GEO_UNAVAILABLE_MESSAGE);
	return parsed.data;
}
