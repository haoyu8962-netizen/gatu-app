import { describe, expect, it } from "vitest";
import { resolveMobilePairingFeatureFlags } from "@/config/mobile-pairing";

describe("mobile pairing feature gates", () => {
	it("fails closed when configuration is absent", () => {
		expect(resolveMobilePairingFeatureFlags({})).toEqual({
			createAndReveal: false,
			importFromQr: false,
			legacyLinkInput: false,
		});
	});

	it("only accepts an exact true value", () => {
		expect(
			resolveMobilePairingFeatureFlags({
				VITE_MOBILE_PAIRING_CREATE_ENABLED: "TRUE",
				VITE_MOBILE_PAIRING_IMPORT_ENABLED: "1",
			}),
		).toEqual({
			createAndReveal: false,
			importFromQr: false,
			legacyLinkInput: false,
		});
	});

	it("requires import before creation while allowing import-only rollout", () => {
		expect(
			resolveMobilePairingFeatureFlags({
				VITE_MOBILE_PAIRING_CREATE_ENABLED: "true",
			}),
		).toEqual({
			createAndReveal: false,
			importFromQr: false,
			legacyLinkInput: false,
		});
		expect(
			resolveMobilePairingFeatureFlags({
				VITE_MOBILE_PAIRING_IMPORT_ENABLED: "true",
			}),
		).toEqual({
			createAndReveal: false,
			importFromQr: true,
			legacyLinkInput: false,
		});
		expect(
			resolveMobilePairingFeatureFlags({
				VITE_MOBILE_PAIRING_CREATE_ENABLED: "true",
				VITE_MOBILE_PAIRING_IMPORT_ENABLED: "true",
			}),
		).toEqual({
			createAndReveal: true,
			importFromQr: true,
			legacyLinkInput: false,
		});
	});
});
