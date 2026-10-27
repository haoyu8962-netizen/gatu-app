// Build-time fee figures for the Fees block (plan §4 07, R8). HIP-3 protocol fees follow the terminal's rule in
// apps/terminal/src/domain/trade/fees.ts (growth mode ×0.1, then the deployer fee scale); the builder fee comes
// from the terminal's builder config. tests/fees.test.mjs runs the terminal's own function against these.

import Big from "big.js";
import { DEFAULT_BUILDER_CONFIG } from "../../../../terminal/src/config/hyperliquid.ts";
import { findSnapshotMarket, type MarketStructureSnapshot } from "./rules.ts";

/** Hyperliquid's base-tier perpetual rates as fractions (https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees). */
export const HYPERLIQUID_BASE_PERP_RATE = { taker: "0.00045", maker: "0.00015" } as const;

const GROWTH_MODE_FEE_SCALE = "0.1";
/** Builder fee units are tenths of a basis point: f = 10 is 0.0001 (order-fee-quote.ts). */
const BUILDER_FEE_UNITS_PER_RATE = 100_000;

function toBig(value: string | null): Big | null {
	if (value === null || value.trim() === "") return null;
	try {
		return new Big(value.trim());
	} catch {
		return null;
	}
}

/** getHip3DeployerFeeScale: below 1 the scale is 1 + s, otherwise 2s; a missing or negative value means 1. */
export function hip3DeployerFeeScale(deployerFeeScale: string | null): Big {
	const parsed = toBig(deployerFeeScale);
	if (!parsed || parsed.lt(0)) return new Big(1);
	return parsed.lt(1) ? parsed.plus(1) : parsed.times(2);
}

/** applyMarketFeeScale for a HIP-3 perpetual, without staking or referral discounts (base tier). */
export function hip3ProtocolFeeRate(baseRate: string, market: { growthMode: boolean; deployerFeeScale: string | null }): Big {
	const growthScaled = market.growthMode ? new Big(baseRate).times(GROWTH_MODE_FEE_SCALE) : new Big(baseRate);
	if (growthScaled.lte(0)) return growthScaled;
	return growthScaled.times(hip3DeployerFeeScale(market.deployerFeeScale));
}

export function builderFeeRate(): Big {
	return new Big(DEFAULT_BUILDER_CONFIG.f).div(BUILDER_FEE_UNITS_PER_RATE);
}

/** 0.00009 → "0.009%": the exact decimal, trailing zeros dropped. */
export function formatFeePercent(rate: Big): string {
	return `${rate.times(100).toFixed(6).replace(/\.?0+$/, "")}%`;
}

export interface GrowthModeFeeExample {
	coin: string;
	takerPercent: string;
	makerPercent: string;
	builderPercent: string;
	/** The builder fee is more than half of a taker's total on this market. */
	builderFeeIsLargerPart: boolean;
}

/** The first of `coins` that is a HIP-3 market in growth mode in the snapshot, with its base-tier fees. */
export function findGrowthModeFeeExample(
	snapshot: MarketStructureSnapshot,
	coins: readonly string[],
): GrowthModeFeeExample | null {
	for (const coin of coins) {
		const found = findSnapshotMarket(snapshot, coin);
		if (!found || found.dex.dex === "" || !found.market.growthMode) continue;
		const taker = hip3ProtocolFeeRate(HYPERLIQUID_BASE_PERP_RATE.taker, found.market);
		const builder = builderFeeRate();
		return {
			coin,
			takerPercent: formatFeePercent(taker),
			makerPercent: formatFeePercent(hip3ProtocolFeeRate(HYPERLIQUID_BASE_PERP_RATE.maker, found.market)),
			builderPercent: formatFeePercent(builder),
			builderFeeIsLargerPart: builder.gt(taker),
		};
	}
	return null;
}
