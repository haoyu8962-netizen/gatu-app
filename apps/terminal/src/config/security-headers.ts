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

const privyFrameSources = [
	"https://auth.privy.io",
	"https://verify.walletconnect.com",
	"https://verify.walletconnect.org",
	"https://challenges.cloudflare.com",
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
	"script-src": "'self' blob: 'unsafe-inline' https://challenges.cloudflare.com",
	"connect-src": [
		"'self'",
		...hyperliquidConnectSources,
		...privyConnectSources,
		...walletConnectConnectSources,
		...smartWalletConnectSources,
		...circleCctpConnectSources,
		...bridgeConnectSources,
	].join(" "),
	"worker-src": "'self' blob:",
	"child-src": ["'self'", "blob:", ...privyFrameSources].join(" "),
	"frame-src": ["'self'", "blob:", ...privyFrameSources, "https://secure.walletconnect.com"].join(" "),
	"manifest-src": "'self'",
};

function serializeContentSecurityPolicy(directives: Record<string, string>) {
	return Object.entries(directives)
		.map(([directive, value]) => `${directive} ${value}`)
		.join("; ");
}

export const contentSecurityPolicy = serializeContentSecurityPolicy(cspDirectives);

/**
 * The stricter policy under evaluation: image sources limited to hosts the application is known to
 * use, and no `blob:` scripts. It is emitted as `Content-Security-Policy-Report-Only` by the edge so
 * violations reach the report receiver without blocking anything; once the reports stay quiet the
 * directives move into `cspDirectives`.
 */
export const cspReportOnlyDirectives: Record<string, string> = {
	...cspDirectives,
	"img-src": [
		"'self'",
		"data:",
		"blob:",
		"https://app.hyperliquid.xyz",
		"https://*.privy.io",
		"https://explorer-api.walletconnect.com",
		"https://*.walletconnect.com",
		"https://*.coinbase.com",
	].join(" "),
	"script-src": "'self' 'unsafe-inline' https://challenges.cloudflare.com",
};

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
