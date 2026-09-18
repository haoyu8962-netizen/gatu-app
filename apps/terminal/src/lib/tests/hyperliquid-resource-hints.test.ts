import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MAINNET_API_URL, TESTNET_API_URL } from "@nktkas/hyperliquid";
import { beforeAll, describe, expect, it } from "vitest";
import { TRADE_ROUTE_PREFIXES } from "@/config/nav";

type Network = "mainnet" | "testnet";

interface ResponseHeadersPolicy {
	Name: string;
	CustomHeadersConfig: { Items: Array<{ Header: string; Value: string }> };
}

interface EdgePoliciesModule {
	HYPERLIQUID_API_ORIGINS: Record<Network, string>;
	createResponseHeadersPolicies: (network: Network) => ResponseHeadersPolicy[];
}

interface EdgeDistributionModule {
	TRADE_PATH_PATTERNS: readonly string[];
}

const EDGE_ROOT = resolve(__dirname, "../../../../../deploy/cloudfront");
const SDK_API_URLS: Record<Network, string> = { mainnet: MAINNET_API_URL, testnet: TESTNET_API_URL };

function importEdgeModule<T>(fileName: string): Promise<T> {
	return import(/* @vite-ignore */ pathToFileURL(resolve(EDGE_ROOT, fileName)).href) as Promise<T>;
}

describe("Hyperliquid API resource hints", () => {
	let policies: EdgePoliciesModule;
	let distribution: EdgeDistributionModule;

	beforeAll(async () => {
		policies = await importEdgeModule<EdgePoliciesModule>("response-headers-policies.mjs");
		distribution = await importEdgeModule<EdgeDistributionModule>("distribution-config.mjs");
	});

	it("maps each network's trade policy to its matching pinned SDK API origin", () => {
		for (const network of ["mainnet", "testnet"] as const) {
			const linkHeaders = policies.createResponseHeadersPolicies(network).flatMap((policy) =>
				policy.CustomHeadersConfig.Items.filter((header) => header.Header === "link").map((header) => ({
					policy: policy.Name,
					value: header.Value,
				})),
			);

			expect(policies.HYPERLIQUID_API_ORIGINS[network]).toBe(SDK_API_URLS[network]);
			expect(linkHeaders).toEqual([
				{
					policy: `gatu-terminal-trade-${network}`,
					value: `<${SDK_API_URLS[network]}>; rel=preconnect; crossorigin=anonymous`,
				},
			]);
		}
	});

	it("limits the hint to the rendered trade route roots and descendants", () => {
		expect([...distribution.TRADE_PATH_PATTERNS]).toEqual(TRADE_ROUTE_PREFIXES.map((prefix) => `${prefix}*`));
	});
});
