import { describe, expect, it } from "vitest";
import { deriveReferralActionGeoDecision } from "@/lib/geo/get-referral-action-geo";

function createResponse(overrides: Record<string, unknown> = {}) {
	return {
		country_code: "GB",
		region_code: "ENG",
		threat: {
			is_anonymous: false,
			is_proxy: false,
			is_tor: false,
		},
		...overrides,
	};
}

describe("deriveReferralActionGeoDecision", () => {
	it("creates a short-lived allowed decision for a supported location", () => {
		expect(deriveReferralActionGeoDecision(createResponse(), 1_000)).toEqual({
			checkedAt: 1_000,
			country: "GB",
			status: "allowed",
			ttlMs: 60_000,
		});
	});

	it("blocks restricted jurisdictions and proxy traffic", () => {
		expect(deriveReferralActionGeoDecision(createResponse({ country_code: "US" }), 1_000)).toEqual({
			checkedAt: 1_000,
			country: "US",
			reason: "jurisdiction",
			status: "blocked",
		});
		expect(
			deriveReferralActionGeoDecision(
				createResponse({ threat: { is_anonymous: false, is_proxy: true, is_tor: false } }),
				1_000,
			),
		).toEqual({ checkedAt: 1_000, country: "GB", reason: "proxy", status: "blocked" });
	});

	it("rejects incomplete or malformed provider responses", () => {
		expect(deriveReferralActionGeoDecision({}, 1_000)).toBeNull();
		expect(
			deriveReferralActionGeoDecision(createResponse({ threat: { is_anonymous: false, is_proxy: false } }), 1_000),
		).toBeNull();
		expect(deriveReferralActionGeoDecision(createResponse({ country_code: "United Kingdom" }), 1_000)).toBeNull();
	});
});
