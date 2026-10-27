// Pre-IPO units and settlement facts, per coin, each with the page it was read from. A source not re-read
// within 90 days, or a scheduled settlement date that has passed, fails `markets:snapshot` and the home
// page build. A preipo market without PRE_IPO_TERMS shows no price, implied valuation or settlement date.
// Deployer documentation links come from apps/terminal/src/config/hip3-deployers.ts; PRE_IPO_DOCS only
// names a more specific page for a coin that the deployer's general link does not cover.

export interface DeployerSource {
	url: string;
	/** `YYYY-MM-DD` (UTC) on which the page was read. */
	readOn: string;
}

export interface PreIpoTerms {
	coin: string;
	/** Implied company valuation in USD for each 1 USD of the market's price, as an integer string. */
	valuationPerPriceUsd: string;
	unitSource: DeployerSource;
	/** `YYYY-MM-DD`: the market settles on this date if the company has not listed by then. */
	scheduledSettlement: string;
	settlementSource: DeployerSource;
	/** The deployer may settle earlier by giving notice. */
	earlySettlementOnNotice: boolean;
	earlySettlementSource: DeployerSource;
}

const ENTROPY_UNIT: DeployerSource = {
	url: "https://docs.entropy.io/market-types/pre-ipo-perpetuals",
	readOn: "2026-10-25",
};
const ENTROPY_ASSETS: DeployerSource = {
	url: "https://docs.entropy.io/asset-directory/pre-ipo-assets",
	readOn: "2026-10-25",
};
const ENTROPY_NO_IPO_RESOLUTION: DeployerSource = {
	url: "https://docs.entropy.io/pre-ipo-perp-mechanics/no-ipo-resolution",
	readOn: "2026-10-25",
};

export const PRE_IPO_TERMS: readonly PreIpoTerms[] = [
	{
		coin: "io:OAI",
		valuationPerPriceUsd: "1000000000",
		unitSource: ENTROPY_UNIT,
		scheduledSettlement: "2028-09-02",
		settlementSource: ENTROPY_ASSETS,
		earlySettlementOnNotice: true,
		earlySettlementSource: ENTROPY_NO_IPO_RESOLUTION,
	},
	{
		coin: "io:ANTH",
		valuationPerPriceUsd: "1000000000",
		unitSource: ENTROPY_UNIT,
		scheduledSettlement: "2028-08-18",
		settlementSource: ENTROPY_ASSETS,
		earlySettlementOnNotice: true,
		earlySettlementSource: ENTROPY_NO_IPO_RESOLUTION,
	},
];

export interface PreIpoDocumentation {
	coin: string;
	/** The deployer's page quotes the market per share of the company, not by implied valuation. */
	quotedPerShare: boolean;
	source: DeployerSource;
}

// XYZ lists ANT, JIO and OURA in its Pre-IPO specification index, not in the general one the terminal links.
// Each references one share of the company (ANT: one Anthropic, PBC Class A common share, added 2026-10-27). XYZ converts each to a standard equity perpetual after the
// IPO (JIO's anticipated listing date is 2026-10-28), which fails `markets:snapshot --check` until this
// entry and the snapshot are updated in a reviewed commit.
const XYZ_PRE_IPO_INDEX: DeployerSource = {
	url: "https://docs.trade.xyz/perpetuals/specifications-and-schedules/pre-ipo-specification-index",
	readOn: "2026-10-27",
};

export const PRE_IPO_DOCS: readonly PreIpoDocumentation[] = [
	{ coin: "xyz:JIO", quotedPerShare: true, source: XYZ_PRE_IPO_INDEX },
	{ coin: "xyz:OURA", quotedPerShare: true, source: XYZ_PRE_IPO_INDEX },
	{ coin: "xyz:ANT", quotedPerShare: true, source: XYZ_PRE_IPO_INDEX },
];
