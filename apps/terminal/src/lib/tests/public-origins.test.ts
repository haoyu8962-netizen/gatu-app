import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/brand", () => ({
	BRAND_PRIMARY_DOMAINS: {
		apex: "primary.example",
		www: "www.primary.example",
		app: "app.primary.example",
		testnet: "testnet.primary.example",
	},
}));

describe("public origins of the primary domain group", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("publishes the primary group as the canonical origins", async () => {
		const { getPublicOrigin, PUBLIC_ORIGINS } = await import("@/config/public-origins");
		expect(PUBLIC_ORIGINS).toEqual({
			mainnet: "https://app.primary.example",
			testnet: "https://testnet.primary.example",
		});
		expect(getPublicOrigin("mainnet")).toBe("https://app.primary.example");
		expect(getPublicOrigin("testnet")).toBe("https://testnet.primary.example");
	});

	it("binds the app and testnet hosts to their networks", async () => {
		const { getCanonicalNetworkForHostname } = await import("@/config/public-origins");
		expect(getCanonicalNetworkForHostname("app.primary.example")).toBe("mainnet");
		expect(getCanonicalNetworkForHostname("TESTNET.PRIMARY.EXAMPLE")).toBe("testnet");
	});

	it("rejects apex, www, suffix, lookalike and other-domain hosts", async () => {
		const { getCanonicalNetworkForHostname } = await import("@/config/public-origins");
		for (const hostname of [
			"primary.example",
			"www.primary.example",
			"app.other.example",
			"testnet.other.example",
			"app.primary.example.evil.test",
			"evilapp.primary.example",
			"",
			null,
			undefined,
		]) {
			expect(getCanonicalNetworkForHostname(hostname)).toBeNull();
		}
	});

	it("matches origins exactly, including scheme and port", async () => {
		const { getCanonicalNetworkForOrigin } = await import("@/config/public-origins");
		expect(getCanonicalNetworkForOrigin("https://app.primary.example")).toBe("mainnet");
		expect(getCanonicalNetworkForOrigin("HTTPS://TESTNET.PRIMARY.EXAMPLE")).toBe("testnet");
		expect(getCanonicalNetworkForOrigin("https://app.other.example")).toBeNull();
		expect(getCanonicalNetworkForOrigin("http://app.primary.example")).toBeNull();
		expect(getCanonicalNetworkForOrigin("https://app.primary.example:8443")).toBeNull();
		expect(getCanonicalNetworkForOrigin("https://app.primary.example.evil.test")).toBeNull();
	});
});
