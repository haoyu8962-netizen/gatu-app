import { describe, expect, it } from "vitest";
import { DEFAULT_DEVELOPMENT_GEO_OVERRIDE, resolveDevelopmentGeoVerdict } from "@/lib/geo/development-geo";

describe("development geo verdict", () => {
	it("defaults local development to an unrestricted jurisdiction", () => {
		expect(resolveDevelopmentGeoVerdict({ enabled: true })).toEqual({
			country: DEFAULT_DEVELOPMENT_GEO_OVERRIDE,
			proxy: false,
			tradeRestricted: false,
		});
		expect(resolveDevelopmentGeoVerdict({ enabled: true, override: "" })).toMatchObject({ country: "GB" });
	});

	it("preserves explicit restricted-country and region simulations", () => {
		expect(resolveDevelopmentGeoVerdict({ enabled: true, override: "us" })).toMatchObject({
			country: "US",
			tradeRestricted: true,
		});
		expect(resolveDevelopmentGeoVerdict({ enabled: true, override: "ca-on" })).toMatchObject({
			country: "CA",
			tradeRestricted: true,
		});
	});

	it("accepts explicit unrestricted simulations and rejects malformed overrides", () => {
		expect(resolveDevelopmentGeoVerdict({ enabled: true, override: "sg" })).toEqual({
			country: "SG",
			proxy: false,
			tradeRestricted: false,
		});
		expect(resolveDevelopmentGeoVerdict({ enabled: true, override: "not-a-country" })).toBeNull();
	});

	it("never supplies a development verdict outside development", () => {
		expect(resolveDevelopmentGeoVerdict({ enabled: false })).toBeNull();
		expect(resolveDevelopmentGeoVerdict({ enabled: false, override: "GB" })).toBeNull();
	});
});
