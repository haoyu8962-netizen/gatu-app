// CloudFront Function (viewer-response, JavaScript runtime 2.0) for the sairn trading terminal.
//
// GENERATED FILE: rendered from terminal-response.template.js by render-functions.mjs; do not
// edit by hand. The application's Content-Security-Policy is longer than the 1,783 characters a
// CloudFront response headers policy accepts, so this function sets it from the same source
// (`apps/terminal/src/config/security-headers.ts`). Every policy is the same directive list with
// three slots (frame-ancestors, img-src, script-src), which keeps the function under its 10 KB
// limit with two releases' inline script hashes: the TradingView package gets the frame policy,
// everything else the terminal policy plus the stricter report-only policy. The static shell cannot
// carry a per-path route marker in its body either, so the viewer-request function tags join paths
// on the request and this function surfaces the tag as a response header for the health check. The
// pairing page shares the cached shell, so its `no-store` / `no-referrer` are written here: the
// response headers policy is applied before this function runs, which lets these values win.
var CSP_TEMPLATE = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors {FA}; form-action 'self'; img-src {IMG}; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src {SCRIPT}; connect-src 'self' https://api.hyperliquid.xyz https://api.hyperliquid-testnet.xyz https://app.hyperliquid.xyz https://stats-data.hyperliquid.xyz https://rpc.hyperliquid.xyz https://rpc.hyperliquid-testnet.xyz wss://api.hyperliquid.xyz wss://api.hyperliquid-testnet.xyz https://auth.privy.io wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org https://*.rpc.privy.systems https://explorer-api.walletconnect.com https://relay.walletconnect.com https://relay.walletconnect.org https://api.web3modal.com https://api.web3modal.org https://pulse.walletconnect.org https://rpc.zerodev.app https://iris-api.circle.com https://iris-api-sandbox.circle.com https://li.quest https://api.tenderly.co https://gas.api.infura.io https://ethereum-rpc.publicnode.com https://arb1.arbitrum.io https://sepolia-rollup.arbitrum.io https://eth.merkle.io https://polygon-rpc.com https://mainnet.optimism.io https://mainnet.base.org https://56.rpc.thirdweb.com https://api.avax.network https://250.rpc.thirdweb.com https://rpc.gnosischain.com https://mainnet.era.zksync.io https://rpc.scroll.io https://rpc.linea.build https://mainnet.mode.network https://rpc.blast.io https://rpc.mantle.xyz https://forno.celo.org https://moonbeam.public.blastapi.io https://mainnet.aurora.dev https://zkevm-rpc.com; worker-src 'self' blob:; child-src 'self' blob: https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com; frame-src 'self' blob: https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://secure.walletconnect.com; manifest-src 'self'";
var IMG_SRC = "'self' data: blob: https:";
var STRICT_IMG_SRC = "'self' data: blob: https://app.hyperliquid.xyz https://*.privy.io https://explorer-api.walletconnect.com https://*.walletconnect.com https://*.coinbase.com";
var SCRIPT_SRC = "'self' blob: 'unsafe-inline' https://challenges.cloudflare.com";
var STRICT_SCRIPT_SRC = "'self' https://challenges.cloudflare.com 'report-sample'";
// Hashes of the prerendered pages' inline scripts for the current release and the one before it
// (the edge may still serve its pages for a minute after a release). Empty in the committed file:
// `deploy.mjs functions` fills both lines from the build and the live function when publishing.
var SCRIPT_HASHES_CURRENT = "";
var SCRIPT_HASHES_PREVIOUS = "";
// "report-only": only the report-only policy names the hashes; "enforce": the enforced policy too.
var SCRIPT_HASHES_MODE = "enforce";
// Same switch for the narrowed image sources.
var IMAGE_SOURCES_MODE = "enforce";
// Report receiver from edge-config.json; empty switches the report-only header off.
var REPORT_URI = "https://siqpvdjvlkzrxgcpsevl4f5kui0ynupf.lambda-url.ap-northeast-1.on.aws/";

function policy(frameAncestors, imgSrc, scriptSrc) {
	return CSP_TEMPLATE.replace('{FA}', frameAncestors).replace('{IMG}', imgSrc).replace('{SCRIPT}', scriptSrc);
}

var SCRIPT_HASHES = (SCRIPT_HASHES_CURRENT + ' ' + SCRIPT_HASHES_PREVIOUS).trim();
var HASHED_SCRIPT_SRC = SCRIPT_HASHES ? STRICT_SCRIPT_SRC + ' ' + SCRIPT_HASHES : STRICT_SCRIPT_SRC;
var ENFORCE_HASHES = SCRIPT_HASHES_MODE === 'enforce';
var ENFORCE_IMAGES = IMAGE_SOURCES_MODE === 'enforce';
var REPORT_SUFFIX = REPORT_URI ? '; report-uri ' + REPORT_URI : '';
var TERMINAL_CSP = policy("'none'", ENFORCE_IMAGES ? STRICT_IMG_SRC : IMG_SRC, ENFORCE_HASHES ? HASHED_SCRIPT_SRC : SCRIPT_SRC) + (ENFORCE_HASHES || ENFORCE_IMAGES ? REPORT_SUFFIX : '');
var CHART_CSP = policy("'self'", IMG_SRC, SCRIPT_SRC);
var CANDIDATE_CSP = REPORT_URI ? policy("'none'", STRICT_IMG_SRC, HASHED_SCRIPT_SRC) + REPORT_SUFFIX : '';
// Once every stricter directive is enforced the candidate repeats the enforced policy; sending it again would only double every report.
var TERMINAL_CSP_REPORT_ONLY = CANDIDATE_CSP !== TERMINAL_CSP ? CANDIDATE_CSP : '';

function isChartAsset(uri) {
	return uri.indexOf('/charting_library/') === 0 || uri.indexOf('/tradingview-theme-') === 0;
}

function handler(event) {
	var request = event.request;
	var response = event.response;
	var route = request.headers['x-sairn-route'];
	if (route && route.value) {
		response.headers['x-sairn-route'] = { value: route.value };
	}
	if (route && route.value === 'mobile-agent-sync') {
		response.headers['cache-control'] = { value: 'no-store' };
		response.headers['referrer-policy'] = { value: 'no-referrer' };
	}
	if (isChartAsset(request.uri)) {
		response.headers['content-security-policy'] = { value: CHART_CSP };
		return response;
	}
	response.headers['content-security-policy'] = { value: TERMINAL_CSP };
	if (TERMINAL_CSP_REPORT_ONLY) {
		response.headers['content-security-policy-report-only'] = { value: TERMINAL_CSP_REPORT_ONLY };
	}
	return response;
}
