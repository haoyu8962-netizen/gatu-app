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

// XYZ lists ANT and OURA in its Pre-IPO specification index, not in the general one the terminal links.
// Each references one share of the company (ANT: one Anthropic, PBC Class A common share, added 2026-10-27). XYZ converts each to a standard equity perpetual after the
// IPO, which fails `markets:snapshot --check` until this entry and the snapshot are updated in a reviewed
// commit: JIO converted after its 2026-10-28 listing and was removed on 2026-11-04. On that day the index's
// anticipated listing dates were 2026-11-20 for ANT and 2026-10-02 for OURA, whose grace period ends 2026-12-01.
const XYZ_PRE_IPO_INDEX: DeployerSource = {
	url: "https://docs.trade.xyz/perpetuals/specifications-and-schedules/pre-ipo-specification-index",
	readOn: "2026-11-04",
};

// Paragon lists ANT (para:ANTH) in its contract specifications, not on the documentation home page the terminal
// links. While the market has Pre-Listing status it tracks the expected value of one share of Anthropic, PBC;
// after a public listing Paragon moves the same market to Listed status (expected listing date TBD on 2026-11-04).
const PARAGON_SPECIFICATIONS: DeployerSource = {
	url: "https://docs.paragon.trade/resources/specifications#market-specifications",
	readOn: "2026-11-04",
};

export const PRE_IPO_DOCS: readonly PreIpoDocumentation[] = [
	{ coin: "xyz:OURA", quotedPerShare: true, source: XYZ_PRE_IPO_INDEX },
	{ coin: "xyz:ANT", quotedPerShare: true, source: XYZ_PRE_IPO_INDEX },
	{ coin: "para:ANTH", quotedPerShare: true, source: PARAGON_SPECIFICATIONS },
];
