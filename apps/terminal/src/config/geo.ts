// Countries (ISO 3166-1 alpha-2, uppercase) where TRADING is not available. Users from
// these jurisdictions can still browse the read-only interface — only order placement and
// agent approval are blocked. Keep this in sync with the "trading not available" disclosure
// in the Terms of Use.
export const TRADE_RESTRICTED_COUNTRIES: readonly string[] = ["JP"];

export interface GeoVerdict {
	/** ISO 3166-1 alpha-2 country code, or null when undetermined. */
	country: string | null;
	/** True when trading must be blocked for this visitor. */
	tradeRestricted: boolean;
	/** True when the visitor appears to use a VPN / proxy / Tor. */
	proxy: boolean;
}

export function isTradeRestrictedCountry(country: string | null | undefined): boolean {
	if (!country) return false;
	return TRADE_RESTRICTED_COUNTRIES.includes(country.toUpperCase());
}
