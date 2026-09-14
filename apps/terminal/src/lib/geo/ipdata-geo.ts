import { isTradeRestricted, TRADE_RESTRICTED_REGIONS } from "@/config/geo";
import { z } from "@/lib/zod";

const ipdataGeoResponseSchema = z
	.object({
		country_code: z.string().regex(/^[A-Z]{2}$/),
		region_code: z
			.string()
			.regex(/^[A-Z0-9]{1,3}$/)
			.nullable()
			.optional(),
		threat: z
			.object({
				is_anonymous: z.boolean(),
				is_icloud_relay: z.boolean().optional(),
				is_proxy: z.boolean(),
				is_tor: z.boolean(),
				is_vpn: z.boolean().optional(),
			})
			.passthrough(),
	})
	.passthrough();

export interface ParsedIpdataGeo {
	country: string;
	proxy: boolean;
	region: string | null;
	tradeRestricted: boolean;
}

export function parseIpdataGeoResponse(value: unknown): ParsedIpdataGeo | null {
	const result = ipdataGeoResponseSchema.safeParse(value);
	if (!result.success) return null;

	const { country_code: country, region_code: region = null, threat } = result.data;
	if (TRADE_RESTRICTED_REGIONS[country] && !region) return null;

	const proxy =
		threat.is_proxy ||
		threat.is_tor ||
		threat.is_anonymous ||
		threat.is_vpn === true ||
		threat.is_icloud_relay === true;
	return {
		country,
		proxy,
		region,
		tradeRestricted: proxy || isTradeRestricted(country, region),
	};
}
