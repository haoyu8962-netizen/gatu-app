import { describe, expect, it } from "vitest";
import { assertIsolatedRiskIncreaseAllowed, resolveIsolatedRiskFeatureFlags } from "@/config/isolated-risk";

describe("isolated risk increase feature gate", () => {
	it("fails closed unless the build flag is exactly true", () => {
		expect(resolveIsolatedRiskFeatureFlags({})).toEqual({ increaseEnabled: false });
		expect(
			resolveIsolatedRiskFeatureFlags({
				VITE_ISOLATED_RISK_INCREASE_ENABLED: "TRUE",
			}),
		).toEqual({ increaseEnabled: false });
		expect(
			resolveIsolatedRiskFeatureFlags({
				VITE_ISOLATED_RISK_INCREASE_ENABLED: "1",
			}),
		).toEqual({ increaseEnabled: false });
		expect(
			resolveIsolatedRiskFeatureFlags({
				VITE_ISOLATED_RISK_INCREASE_ENABLED: "true",
			}),
		).toEqual({ increaseEnabled: true });
	});

	it("blocks isolated leverage and mode changes while preserving cross", () => {
		expect(() => assertIsolatedRiskIncreaseAllowed("isolated", false)).toThrow(
			"Opening or increasing isolated positions is temporarily unavailable",
		);
		expect(() => assertIsolatedRiskIncreaseAllowed("cross", false)).not.toThrow();
		expect(() => assertIsolatedRiskIncreaseAllowed("isolated", true)).not.toThrow();
	});
});
