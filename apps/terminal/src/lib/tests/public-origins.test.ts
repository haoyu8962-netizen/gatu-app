import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/brand", () => ({
	BRAND_PRIMARY_DOMAINS: {
		apex: "primary.example",
		www: "www.primary.example",
		app: "app.primary.example",
		testnet: "testnet.primary.example",
	},
	BRAND_LEGACY_DOMAINS: [
		{
			apex: "legacy.example",
			www: "www.legacy.example",
			app: "app.legacy.example",
			testnet: "testnet.legacy.example",
		},
	],
}));

describe("public origins across a primary and a legacy domain group", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("publishes only the primary group as the canonical origins", async () => {
		const { PUBLIC_ORIGINS } = await import("@/config/public-origins");
		expect(PUBLIC_ORIGINS).toEqual({
			mainnet: "https://app.primary.example",
			testnet: "https://testnet.primary.example",
		});
	});

	it("binds the app and testnet hosts of both groups to their networks", async () => {
		const { getCanonicalNetworkForHostname } = await import("@/config/public-origins");
		expect(getCanonicalNetworkForHostname("app.primary.example")).toBe("mainnet");
		expect(getCanonicalNetworkForHostname("TESTNET.PRIMARY.EXAMPLE")).toBe("testnet");
		expect(getCanonicalNetworkForHostname("app.legacy.example")).toBe("mainnet");
		expect(getCanonicalNetworkForHostname("testnet.legacy.example")).toBe("testnet");
	});

	it("rejects apex, www, suffix and lookalike hosts", async () => {
		const { getCanonicalNetworkForHostname } = await import("@/config/public-origins");
		for (const hostname of [
			"primary.example",
			"www.primary.example",
			"legacy.example",
			"app.primary.example.evil.test",
			"app.legacy.example.evil.test",
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
		expect(getCanonicalNetworkForOrigin("https://app.legacy.example")).toBe("mainnet");
		expect(getCanonicalNetworkForOrigin("https://testnet.primary.example")).toBe("testnet");
		expect(getCanonicalNetworkForOrigin("http://app.primary.example")).toBeNull();
		expect(getCanonicalNetworkForOrigin("https://app.primary.example:8443")).toBeNull();
		expect(getCanonicalNetworkForOrigin("https://app.primary.example.evil.test")).toBeNull();
	});

	it("keeps a network switch inside the group the user is on", async () => {
		const { getPublicOrigin } = await import("@/config/public-origins");
		expect(getPublicOrigin("testnet", "app.legacy.example")).toBe("https://testnet.legacy.example");
		expect(getPublicOrigin("mainnet", "testnet.primary.example")).toBe("https://app.primary.example");
		expect(getPublicOrigin("testnet", "localhost")).toBe("https://testnet.primary.example");
		expect(getPublicOrigin("mainnet")).toBe("https://app.primary.example");
	});
});
