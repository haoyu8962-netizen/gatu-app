import { type GeoVerdict, isTradeRestricted } from "@/config/geo";

export const DEFAULT_DEVELOPMENT_GEO_OVERRIDE = "GB";

interface DevelopmentGeoInput {
	enabled: boolean;
	override?: string | null;
}

/**
 * Local requests use loopback/private addresses that IP geolocation providers
 * intentionally reject. Development therefore defaults to an unrestricted GB
 * verdict, while `?geo=US` and `?geo=CA-ON` continue to exercise restricted
 * paths. Production callers receive `null` and must use the real provider.
 */
export function resolveDevelopmentGeoVerdict({ enabled, override }: DevelopmentGeoInput): GeoVerdict | null {
	if (!enabled) return null;

	const normalized = (override?.trim() || DEFAULT_DEVELOPMENT_GEO_OVERRIDE).toUpperCase();
	const match = /^([A-Z]{2})(?:-([A-Z0-9]{1,3}))?$/.exec(normalized);
	if (!match) return null;

	const [, country, region = null] = match;
	return {
		country,
		proxy: false,
		tradeRestricted: isTradeRestricted(country, region),
	};
}
