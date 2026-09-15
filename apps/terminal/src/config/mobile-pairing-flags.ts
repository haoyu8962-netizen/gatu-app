export interface MobilePairingFeatureEnv {
	VITE_MOBILE_PAIRING_CREATE_ENABLED?: string;
	VITE_MOBILE_PAIRING_IMPORT_ENABLED?: string;
}

export interface MobilePairingFeatureFlags {
	createAndReveal: boolean;
	importFromQr: boolean;
	legacyLinkInput: false;
}

/**
 * Mobile pairing is a credential-transfer surface, so every rollout flag is
 * fail-closed. The flags are embedded at build time; changing them requires a
 * rebuild and deployment. This module has no build-time environment access so the
 * Vite config and the runtime can share it.
 */
export function resolveMobilePairingFeatureFlags(env: MobilePairingFeatureEnv): MobilePairingFeatureFlags {
	const importFromQr = env.VITE_MOBILE_PAIRING_IMPORT_ENABLED === "true";
	return {
		// Creating a same-name Mobile Agent replaces the existing one. Never
		// permit that destructive half of the flow unless phones can import it.
		createAndReveal: env.VITE_MOBILE_PAIRING_CREATE_ENABLED === "true" && importFromQr,
		importFromQr,
		legacyLinkInput: false,
	};
}
