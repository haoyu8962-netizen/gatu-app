export interface MobilePairingFeatureEnv {
	VITE_MOBILE_PAIRING_ENABLED?: string;
}

export interface MobilePairingFeatureFlags {
	enabled: boolean;
}

/**
 * Mobile pairing is a credential-transfer surface, so the rollout flag is fail-closed and
 * covers both halves of the flow: the desktop cannot create a key that phones cannot import.
 * The flag is embedded at build time; changing it requires a rebuild and deployment. This
 * module has no build-time environment access so the Vite config and the runtime can share it.
 */
export function resolveMobilePairingFeatureFlags(env: MobilePairingFeatureEnv): MobilePairingFeatureFlags {
	return { enabled: env.VITE_MOBILE_PAIRING_ENABLED === "true" };
}
