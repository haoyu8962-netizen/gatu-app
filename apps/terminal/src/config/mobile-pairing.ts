import { type MobilePairingFeatureEnv, resolveMobilePairingFeatureFlags } from "./mobile-pairing-flags";

export type { MobilePairingFeatureEnv, MobilePairingFeatureFlags } from "./mobile-pairing-flags";
export { resolveMobilePairingFeatureFlags } from "./mobile-pairing-flags";

export const MOBILE_PAIRING_FEATURES = resolveMobilePairingFeatureFlags(import.meta.env as MobilePairingFeatureEnv);
