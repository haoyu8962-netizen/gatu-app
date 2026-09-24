import { describe, expect, it } from "vitest";
import { resolveMobilePairingFeatureFlags } from "@/config/mobile-pairing";

describe("mobile pairing feature gate", () => {
	it("fails closed when configuration is absent", () => {
		expect(resolveMobilePairingFeatureFlags({})).toEqual({ enabled: false });
	});

	it("only accepts an exact true value", () => {
		expect(resolveMobilePairingFeatureFlags({ VITE_MOBILE_PAIRING_ENABLED: "TRUE" })).toEqual({ enabled: false });
		expect(resolveMobilePairingFeatureFlags({ VITE_MOBILE_PAIRING_ENABLED: "1" })).toEqual({ enabled: false });
		expect(resolveMobilePairingFeatureFlags({ VITE_MOBILE_PAIRING_ENABLED: "true" })).toEqual({ enabled: true });
	});
});
