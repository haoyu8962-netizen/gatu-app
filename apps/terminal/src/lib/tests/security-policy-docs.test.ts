import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { chartingLibrarySecurityHeaders, cspDirectives, securityHeaders } from "@/config/security-headers";

const REPOSITORY_ROOT = resolve(__dirname, "../../../../..");

function readRepositoryFile(path: string): string {
	return readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");
}

describe("security policy documentation", () => {
	it("keeps application route rules as the CSP owner", () => {
		const viteConfig = readRepositoryFile("apps/terminal/vite.config.ts");
		const caddyfile = readRepositoryFile("deploy/Caddyfile");
		const deployReadme = readRepositoryFile("deploy/README.md");

		expect(viteConfig).toContain("headers: securityHeaders");
		expect(viteConfig).toContain("headers: { ...chartingLibrarySecurityHeaders");
		expect(caddyfile).toContain("Nitro route rules emit the path-specific Content-Security-Policy");
		expect(caddyfile).not.toContain("Content-Security-Policy is intentionally NOT");
		expect(deployReadme).toContain("CSP(应用层已启用)");
		expect(deployReadme).toContain("apps/terminal/src/config/security-headers.ts");
		expect(deployReadme).not.toContain("CSP(默认未开)");
	});

	it("documents the current inline-script exception without weakening iframe isolation", () => {
		const deployReadme = readRepositoryFile("deploy/README.md");
		const allowsInlineScripts = cspDirectives["script-src"].includes("'unsafe-inline'");

		expect(deployReadme.includes("`'unsafe-inline'`")).toBe(allowsInlineScripts);
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

	it("allows only Circle production and sandbox APIs used for CCTP deposit fees and recovery", () => {
		expect(cspDirectives["connect-src"]).toContain("https://iris-api.circle.com");
		expect(cspDirectives["connect-src"]).toContain("https://iris-api-sandbox.circle.com");
	});
});
