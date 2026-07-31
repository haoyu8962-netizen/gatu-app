export interface LiFiBridgeFeatureEnv {
	VITE_LIFI_BRIDGE_CREATE_ENABLED?: string;
}

export interface LiFiBridgeFeatureFlags {
	createNewRoute: boolean;
}

export function resolveLiFiBridgeFeatureFlags(
	env: LiFiBridgeFeatureEnv = import.meta.env as LiFiBridgeFeatureEnv,
): LiFiBridgeFeatureFlags {
	return {
		createNewRoute: env.VITE_LIFI_BRIDGE_CREATE_ENABLED === "true",
	};
}

export function shouldShowLiFiBridgeTab({
	isEmbeddedDeposit,
	hasExistingExecution,
	createNewRoute,
}: {
	isEmbeddedDeposit: boolean;
	hasExistingExecution: boolean;
	createNewRoute: boolean;
}): boolean {
	return !isEmbeddedDeposit && (createNewRoute || hasExistingExecution);
}

export const LIFI_BRIDGE_FEATURES = resolveLiFiBridgeFeatureFlags();
