// Jurisdictions where TRADING is not available. Users from these places can still browse the
// read-only interface — only order placement, agent approval, and deposits/withdrawals are
// blocked. Keep this in sync with "Restricted Persons" in the Terms of Use (§2.2).

// Country-level blocks (ISO 3166-1 alpha-2, uppercase):
//  - US, CN — United States & China, named in Terms §2.2(a).
//  - CU, IR, KP, SY — OFAC comprehensively sanctioned ("embargoed countries"), Terms §2.2(b).
//  - JP — retained from the initial launch config (not a Terms §2.2 Restricted Person).
export const TRADE_RESTRICTED_COUNTRIES: readonly string[] = ["US", "CN", "CU", "IR", "KP", "SY", "JP"];

// Sub-national blocks: country code → restricted ISO 3166-2 region codes (the part after the
// hyphen). Ontario (CA-ON) is named in Terms §2.2(a); the rest of Canada is not restricted.
export const TRADE_RESTRICTED_REGIONS: Readonly<Record<string, readonly string[]>> = {
	CA: ["ON"],
};

export interface GeoVerdict {
	/** ISO 3166-1 alpha-2 country code, or null when undetermined. */
	country: string | null;
	/** True when trading must be blocked for this visitor. */
	tradeRestricted: boolean;
	/** True when the visitor appears to use a VPN / proxy / Tor. */
	proxy: boolean;
}

export function isTradeRestricted(country: string | null | undefined, region?: string | null | undefined): boolean {
	if (!country) return false;
	const c = country.toUpperCase();
	if (TRADE_RESTRICTED_COUNTRIES.includes(c)) return true;
	const regions = TRADE_RESTRICTED_REGIONS[c];
	if (regions && region) return regions.includes(region.toUpperCase());
	return false;
}
