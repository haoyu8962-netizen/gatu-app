import { describe, expect, it } from "vitest";
import { resolveLiFiBridgeFeatureFlags, shouldShowLiFiBridgeTab } from "@/config/lifi-bridge";

describe("LI.FI bridge feature gate", () => {
	it("fails closed and only accepts an exact true value", () => {
		expect(resolveLiFiBridgeFeatureFlags({})).toEqual({ createNewRoute: false });
		expect(resolveLiFiBridgeFeatureFlags({ VITE_LIFI_BRIDGE_CREATE_ENABLED: "TRUE" })).toEqual({
			createNewRoute: false,
		});
		expect(resolveLiFiBridgeFeatureFlags({ VITE_LIFI_BRIDGE_CREATE_ENABLED: "1" })).toEqual({
			createNewRoute: false,
		});
		expect(resolveLiFiBridgeFeatureFlags({ VITE_LIFI_BRIDGE_CREATE_ENABLED: "true" })).toEqual({
			createNewRoute: true,
		});
	});

	it("hides new bridge entry while keeping existing execution accessible", () => {
		expect(
			shouldShowLiFiBridgeTab({
				isEmbeddedDeposit: false,
				hasExistingExecution: false,
				createNewRoute: false,
			}),
		).toBe(false);
		expect(
			shouldShowLiFiBridgeTab({
				isEmbeddedDeposit: false,
				hasExistingExecution: true,
				createNewRoute: false,
			}),
		).toBe(true);
		expect(
			shouldShowLiFiBridgeTab({
				isEmbeddedDeposit: true,
				hasExistingExecution: true,
				createNewRoute: true,
			}),
		).toBe(false);
	});
});
