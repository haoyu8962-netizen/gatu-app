const hyperliquidConnectSources = [
	"https://api.hyperliquid.xyz",
	"https://api.hyperliquid-testnet.xyz",
	"https://app.hyperliquid.xyz",
	"https://stats-data.hyperliquid.xyz",
	"https://rpc.hyperliquid.xyz",
	"https://rpc.hyperliquid-testnet.xyz",
	"wss://api.hyperliquid.xyz",
	"wss://api.hyperliquid-testnet.xyz",
] as const;

const privyConnectSources = [
	"https://auth.privy.io",
	"wss://relay.walletconnect.com",
	"wss://relay.walletconnect.org",
	"wss://www.walletlink.org",
	"https://*.rpc.privy.systems",
	"https://explorer-api.walletconnect.com",
] as const;

const walletConnectConnectSources = [
	"https://relay.walletconnect.com",
	"https://relay.walletconnect.org",
	"https://api.web3modal.com",
	"https://api.web3modal.org",
	"https://pulse.walletconnect.org",
] as const;

const smartWalletConnectSources = ["https://rpc.zerodev.app"] as const;

const circleCctpConnectSources = ["https://iris-api.circle.com", "https://iris-api-sandbox.circle.com"] as const;

const bridgeConnectSources = [
	"https://li.quest",
	"https://api.tenderly.co",
	"https://gas.api.infura.io",
	"https://ethereum-rpc.publicnode.com",
	"https://arb1.arbitrum.io",
	"https://sepolia-rollup.arbitrum.io",
	"https://eth.merkle.io",
	"https://polygon-rpc.com",
	"https://mainnet.optimism.io",
	"https://mainnet.base.org",
	"https://56.rpc.thirdweb.com",
	"https://api.avax.network",
	"https://250.rpc.thirdweb.com",
	"https://rpc.gnosischain.com",
	"https://mainnet.era.zksync.io",
	"https://rpc.scroll.io",
	"https://rpc.linea.build",
	"https://mainnet.mode.network",
	"https://rpc.blast.io",
	"https://rpc.mantle.xyz",
	"https://forno.celo.org",
	"https://moonbeam.public.blastapi.io",
	"https://mainnet.aurora.dev",
	"https://zkevm-rpc.com",
] as const;

/**
 * Stripe's embedded crypto onramp, which Privy's card funding flow loads into the page (ADR 0034).
 * The hosts follow Stripe's published CSP for Stripe.js, Link and the embedded crypto onramp. Other
 * card providers open in a separate window and need no entry here.
 */
const stripeOnrampConnectSources = ["https://api.stripe.com", "https://link.com", "https://*.link.com"] as const;

const stripeOnrampFrameSources = [
	"https://js.stripe.com",
	"https://*.js.stripe.com",
	"https://hooks.stripe.com",
	"https://link.com",
	"https://*.link.com",
] as const;

const privyFrameSources = [
	"https://auth.privy.io",
	"https://verify.walletconnect.com",
	"https://verify.walletconnect.org",
	"https://challenges.cloudflare.com",
] as const;

/** Hosts besides the application that may serve scripts (Turnstile, Stripe's embedded onramp). */
const scriptHosts = [
	"https://challenges.cloudflare.com",
	"https://js.stripe.com",
	"https://*.js.stripe.com",
	"https://crypto-js.stripe.com",
] as const;

const knownImageSources = [
	"'self'",
	"data:",
	"blob:",
	"https://app.hyperliquid.xyz",
	"https://*.privy.io",
	"https://explorer-api.walletconnect.com",
	"https://*.walletconnect.com",
	"https://*.coinbase.com",
	"https://*.stripe.com",
	"https://*.link.com",
] as const;

export const cspDirectives: Record<string, string> = {
	"default-src": "'self'",
	"base-uri": "'self'",
	"object-src": "'none'",
	"frame-ancestors": "'none'",
	"form-action": "'self'",
	"img-src": "'self' data: blob: https:",
	"font-src": "'self' data:",
	"style-src": "'self' 'unsafe-inline'",
	"script-src": ["'self'", "blob:", "'unsafe-inline'", ...scriptHosts].join(" "),
	"connect-src": [
		"'self'",
		...hyperliquidConnectSources,
		...privyConnectSources,
		...walletConnectConnectSources,
		...smartWalletConnectSources,
		...circleCctpConnectSources,
		...stripeOnrampConnectSources,
		...bridgeConnectSources,
	].join(" "),
	"worker-src": "'self' blob:",
	"child-src": ["'self'", "blob:", ...privyFrameSources, ...stripeOnrampFrameSources].join(" "),
	"frame-src": [
		"'self'",
		"blob:",
		...privyFrameSources,
		"https://secure.walletconnect.com",
		...stripeOnrampFrameSources,
	].join(" "),
	"manifest-src": "'self'",
};

export function serializeContentSecurityPolicy(directives: Record<string, string>) {
	return Object.entries(directives)
		.map(([directive, value]) => `${directive} ${value}`)
		.join("; ");
}

export const contentSecurityPolicy = serializeContentSecurityPolicy(cspDirectives);

/**
 * The stricter directives under evaluation: image sources limited to hosts the application is known
 * to use, and scripts limited to the allowed hosts plus the `sha256-…` hashes of the prerendered
 * pages' inline scripts (no `'unsafe-inline'`, no `blob:`). The edge emits them as
 * `Content-Security-Policy-Report-Only`, and as the enforced policy's `script-src` once
 * `deploy/cloudfront/edge-config.json` switches to `enforce`; the hashes come from the build at
 * publish time (`deploy/cloudfront/README.md`), so they are empty here. `'report-sample'` makes
 * reports carry the first 40 characters of a blocked inline script.
 */
export function createStrictCspDirectives(scriptHashes: readonly string[] = []): Record<string, string> {
	return {
		...cspDirectives,
		"img-src": knownImageSources.join(" "),
		"script-src": ["'self'", ...scriptHosts, "'report-sample'", ...scriptHashes.map((hash) => `'${hash}'`)].join(" "),
	};
}

export const cspReportOnlyDirectives = createStrictCspDirectives();

export const contentSecurityPolicyReportOnly = serializeContentSecurityPolicy(cspReportOnlyDirectives);

export const chartingLibraryContentSecurityPolicy = serializeContentSecurityPolicy({
	...cspDirectives,
	"frame-ancestors": "'self'",
});

const commonSecurityHeaders = {
	"permissions-policy": "camera=(self), microphone=(), geolocation=(), payment=()",
	"referrer-policy": "strict-origin-when-cross-origin",
	"x-content-type-options": "nosniff",
} as const;

export const securityHeaders: Record<string, string> = {
	"content-security-policy": contentSecurityPolicy,
	...commonSecurityHeaders,
	"x-frame-options": "DENY",
};

export const chartingLibrarySecurityHeaders: Record<string, string> = {
	"content-security-policy": chartingLibraryContentSecurityPolicy,
	...commonSecurityHeaders,
	"x-frame-options": "SAMEORIGIN",
};

// Referral landing paths carry user-controlled codes: never cache them, never leak them through
// Referer, and keep them out of search results. Shared by the Nitro route rules and the static
// shell responder so both delivery shapes emit the same headers.
export const referralJoinHeaders: Record<string, string> = {
	...securityHeaders,
	"cache-control": "no-store",
	"referrer-policy": "no-referrer",
	"x-robots-tag": "noindex, nofollow",
};
