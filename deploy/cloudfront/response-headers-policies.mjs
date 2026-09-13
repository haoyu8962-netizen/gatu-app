#!/usr/bin/env node
// Generates CloudFront response headers policies from the application's own header definitions
// so the CDN emits exactly what the Nitro route rules emit today. Run with
// `node --experimental-strip-types deploy/cloudfront/response-headers-policies.mjs --network mainnet`.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	chartingLibrarySecurityHeaders,
	referralJoinHeaders,
	securityHeaders,
} from "../../apps/terminal/src/config/security-headers.ts";

export const HYPERLIQUID_API_ORIGINS = Object.freeze({
	mainnet: "https://api.hyperliquid.xyz",
	testnet: "https://api.hyperliquid-testnet.xyz",
});
export const NOINDEX = "noindex, nofollow";
const HSTS_MAX_AGE_SECONDS = 31_536_000;
const FRAME_OPTIONS = new Set(["DENY", "SAMEORIGIN"]);
const REFERRER_POLICIES = new Set([
	"no-referrer",
	"no-referrer-when-downgrade",
	"origin",
	"origin-when-cross-origin",
	"same-origin",
	"strict-origin",
	"strict-origin-when-cross-origin",
	"unsafe-url",
]);

function preconnectLink(network) {
	return `<${HYPERLIQUID_API_ORIGINS[network]}>; rel=preconnect; crossorigin=anonymous`;
}

/**
 * Maps a flat header map onto CloudFront's policy shape: the standard security headers use the
 * typed SecurityHeadersConfig, everything else becomes a custom header that overrides the origin.
 * The Content-Security-Policy is deliberately left out: the application's policy exceeds the
 * 1,783 characters a response headers policy accepts, so the viewer-response CloudFront Function
 * (`render-functions.mjs`) sets it from the same source instead.
 */
export function toResponseHeadersPolicyConfig(name, headers, comment) {
	const security = {
		StrictTransportSecurity: {
			Override: true,
			IncludeSubdomains: true,
			Preload: false,
			AccessControlMaxAgeSec: HSTS_MAX_AGE_SECONDS,
		},
	};
	const custom = [];
	for (const [rawName, value] of Object.entries(headers)) {
		const header = rawName.toLowerCase();
		if (header === "content-security-policy") {
			continue;
		}
		if (header === "x-frame-options" && FRAME_OPTIONS.has(value.toUpperCase())) {
			security.FrameOptions = { Override: true, FrameOption: value.toUpperCase() };
		} else if (header === "x-content-type-options" && value.toLowerCase() === "nosniff") {
			security.ContentTypeOptions = { Override: true };
		} else if (header === "referrer-policy" && REFERRER_POLICIES.has(value.toLowerCase())) {
			security.ReferrerPolicy = { Override: true, ReferrerPolicy: value.toLowerCase() };
		} else {
			custom.push({ Header: header, Value: value, Override: true });
		}
	}
	return {
		Name: name,
		Comment: comment,
		SecurityHeadersConfig: security,
		CustomHeadersConfig: { Quantity: custom.length, Items: custom },
	};
}

export function createResponseHeadersPolicies(network) {
	if (network !== "mainnet" && network !== "testnet") throw new Error("network must be mainnet or testnet");
	const robots = network === "testnet" ? { "x-robots-tag": NOINDEX } : {};
	return [
		toResponseHeadersPolicyConfig(
			`gatu-terminal-base-${network}`,
			{ ...securityHeaders, ...robots },
			"Application shell, documents and hashed assets",
		),
		toResponseHeadersPolicyConfig(
			`gatu-terminal-trade-${network}`,
			{ ...securityHeaders, ...robots, link: preconnectLink(network) },
			"Terminal navigations with the network-specific Hyperliquid API preconnect",
		),
		toResponseHeadersPolicyConfig(
			`gatu-terminal-join-${network}`,
			{ ...referralJoinHeaders },
			"Referral deep links: never cached, never leaked through Referer, never indexed",
		),
		toResponseHeadersPolicyConfig(
			`gatu-terminal-chart-${network}`,
			{ ...chartingLibrarySecurityHeaders, ...robots },
			"TradingView package: same-origin frames and revalidated caching",
		),
	];
}

function main() {
	const argv = process.argv.slice(2);
	const networkIndex = argv.indexOf("--network");
	const network = networkIndex === -1 ? "mainnet" : argv[networkIndex + 1];
	process.stdout.write(`${JSON.stringify(createResponseHeadersPolicies(network), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
