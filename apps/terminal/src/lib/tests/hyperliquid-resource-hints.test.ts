import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MAINNET_API_URL, TESTNET_API_URL } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIR, "../../../../..");
const caddyfile = readFileSync(resolve(REPOSITORY_ROOT, "deploy/Caddyfile"), "utf8")
	.split("\n")
	.map((line) => line.replace(/\s*#.*$/, ""))
	.join("\n");

function getDirectiveLines(block: string) {
	return block
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

function getNamedMatcher(name: string) {
	const match = new RegExp(`\\n\\t@${name} \\{([\\s\\S]*?)\\n\\t\\}`).exec(caddyfile);
	if (!match?.[1]) throw new Error(`Missing Caddy matcher @${name}`);
	return match[1];
}

function getHeaderBlock(name: string) {
	const match = new RegExp(`\\n\\theader @${name} \\{([\\s\\S]*?)\\n\\t\\}`).exec(caddyfile);
	if (!match?.[1]) throw new Error(`Missing Caddy header block for @${name}`);
	return match[1];
}

describe("Hyperliquid API resource hints", () => {
	it("maps each canonical trading host to its matching pinned SDK API origin", () => {
		expect(getDirectiveLines(getNamedMatcher("mainnet_trade"))).toEqual([
			"host app.gatu.ai",
			"method GET",
			"path /trade /trade/*",
		]);
		expect(getDirectiveLines(getNamedMatcher("testnet_trade"))).toEqual([
			"host testnet.gatu.ai",
			"method GET",
			"path /trade /trade/*",
		]);
		expect(getDirectiveLines(getHeaderBlock("mainnet_trade"))).toEqual([
			`+Link "<${MAINNET_API_URL}>; rel=preconnect; crossorigin=anonymous"`,
			"defer",
		]);
		expect(getDirectiveLines(getHeaderBlock("testnet_trade"))).toEqual([
			`+Link "<${TESTNET_API_URL}>; rel=preconnect; crossorigin=anonymous"`,
			"defer",
		]);
	});

	it("limits both hints to the exact trade root and descendants", () => {
		for (const name of ["mainnet_trade", "testnet_trade"]) {
			const matcher = getDirectiveLines(getNamedMatcher(name));
			expect(matcher.filter((directive) => directive.startsWith("method "))).toEqual(["method GET"]);
			expect(matcher.filter((directive) => directive.startsWith("path "))).toEqual(["path /trade /trade/*"]);
		}
	});

	it("defines each network API hint exactly once", () => {
		const apiHostnames = new Set([MAINNET_API_URL, TESTNET_API_URL].map((url) => new URL(url).hostname.toLowerCase()));
		const apiTargets = [...caddyfile.matchAll(/<([^>]+)>/g)]
			.map((match) => match[1])
			.filter((target): target is string => typeof target === "string")
			.filter((target) => {
				try {
					const hostname = new URL(target, "https://link-context.invalid/").hostname.toLowerCase().replace(/\.+$/, "");
					return apiHostnames.has(hostname);
				} catch {
					return false;
				}
			});
		expect(apiTargets.sort()).toEqual([MAINNET_API_URL, TESTNET_API_URL].sort());
	});
});
