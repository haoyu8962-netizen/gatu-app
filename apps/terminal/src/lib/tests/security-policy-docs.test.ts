import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	chartingLibrarySecurityHeaders,
	cspDirectives,
	cspReportOnlyDirectives,
	securityHeaders,
} from "@/config/security-headers";

const REPOSITORY_ROOT = resolve(__dirname, "../../../../..");

function readRepositoryFile(path: string): string {
	return readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");
}

describe("security policy documentation", () => {
	it("keeps the application header definitions as the CSP owner", () => {
		const viteConfig = readRepositoryFile("apps/terminal/vite.config.ts");
		const edgePolicies = readRepositoryFile("deploy/cloudfront/response-headers-policies.mjs");
		const edgeReadme = readRepositoryFile("deploy/cloudfront/README.md");

		expect(viteConfig).toContain("headers: securityHeaders");
		expect(viteConfig).toContain("headers: { ...chartingLibrarySecurityHeaders");
		expect(edgePolicies).toContain('from "../../apps/terminal/src/config/security-headers.ts"');
		expect(edgeReadme).toContain("src/config/security-headers.ts");
	});

	it("keeps the main document unframeable and the chart package same-origin only", () => {
		expect(securityHeaders["content-security-policy"]).toContain("frame-ancestors 'none'");
		expect(chartingLibrarySecurityHeaders["content-security-policy"]).toContain("frame-ancestors 'self'");
	});

	it("allows the HyperEVM RPC endpoints used for CCTP fee discovery", () => {
		expect(cspDirectives["connect-src"]).toContain("https://rpc.hyperliquid.xyz");
		expect(cspDirectives["connect-src"]).toContain("https://rpc.hyperliquid-testnet.xyz");
	});

	it("allows the network-scoped public stats datasets used by Vaults and Leaderboard", () => {
		expect(cspDirectives["connect-src"]).toContain("https://stats-data.hyperliquid.xyz");
	});

	it("allows exactly Stripe's documented embedded onramp hosts for card funding", () => {
		const stripeSources = (directives: Record<string, string>, directive: string) =>
			directives[directive].split(" ").filter((source) => /(?:stripe|link)\.com$/.test(source));
		const frames = [
			"https://js.stripe.com",
			"https://*.js.stripe.com",
			"https://hooks.stripe.com",
			"https://link.com",
			"https://*.link.com",
		];
		const scripts = ["https://js.stripe.com", "https://*.js.stripe.com", "https://crypto-js.stripe.com"];

		expect(stripeSources(cspDirectives, "script-src")).toEqual(scripts);
		expect(stripeSources(cspDirectives, "frame-src")).toEqual(frames);
		expect(stripeSources(cspDirectives, "child-src")).toEqual(frames);
		expect(stripeSources(cspDirectives, "connect-src")).toEqual([
			"https://api.stripe.com",
			"https://link.com",
			"https://*.link.com",
		]);
		expect(stripeSources(cspReportOnlyDirectives, "script-src")).toEqual(scripts);
		expect(stripeSources(cspReportOnlyDirectives, "img-src")).toEqual(["https://*.stripe.com", "https://*.link.com"]);
		for (const directive of ["script-src", "frame-src", "child-src", "connect-src"]) {
			expect(cspDirectives[directive].split(" ")).not.toContain("https:");
		}
	});

	it("allows only Circle production and sandbox APIs used for CCTP deposit fees and recovery", () => {
		expect(cspDirectives["connect-src"]).toContain("https://iris-api.circle.com");
		expect(cspDirectives["connect-src"]).toContain("https://iris-api-sandbox.circle.com");
	});
});
