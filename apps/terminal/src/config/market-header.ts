import { msg } from "@lingui/core/macro";

export const MARKET_HEADER_LABELS = {
	expand: msg`Expand market details`,
	collapse: msg`Collapse market details`,

	mark: msg`Mark`,
	price: msg`Price`,
	oracle: msg`Oracle`,
	change24h: msg({ message: "24h Change", context: "Market overview" }),
	volume24h: msg`24h Volume`,
	openInterest: msg`Open Interest`,
	funding: msg`Funding`,
	resetsIn: msg`Resets in`,
	marketCap: msg`Market Cap`,
	contract: msg`Contract`,
	favoritesEmpty: msg`Select favorite markets`,
};
