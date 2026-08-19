export interface OrderbookL2FeatureEnv {
	VITE_COMPACT_ORDERBOOK_L2_ENABLED?: string;
}

export interface OrderbookL2FeatureFlags {
	incrementalFeedEnabled: boolean;
}

export function resolveOrderbookL2FeatureFlags(
	env: OrderbookL2FeatureEnv = import.meta.env as OrderbookL2FeatureEnv,
): OrderbookL2FeatureFlags {
	return {
		incrementalFeedEnabled: env.VITE_COMPACT_ORDERBOOK_L2_ENABLED !== "false",
	};
}

export const ORDERBOOK_L2_FEATURES = resolveOrderbookL2FeatureFlags();
