import { msg } from "@lingui/core/macro";

export const MARKET_HEADER_LABELS = {
	mark: { ...msg`Mark`, message: "Mark" },
	price: { ...msg`Price`, message: "Price" },
	oracle: { ...msg`Oracle`, message: "Oracle" },
	change24h: { ...msg({ message: "24h Change", context: "Market overview" }), message: "24h Change" },
	volume24h: { ...msg`24h Volume`, message: "24h Volume" },
	openInterest: { ...msg`Open Interest`, message: "Open Interest" },
	funding: { ...msg`Funding`, message: "Funding" },
	resetsIn: { ...msg`Resets in`, message: "Resets in" },
	marketCap: { ...msg`Market Cap`, message: "Market Cap" },
	contract: { ...msg`Contract`, message: "Contract" },
	favoritesEmpty: { ...msg`Select favorite markets`, message: "Select favorite markets" },
};
