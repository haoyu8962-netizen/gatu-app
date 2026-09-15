// CloudFront Function (viewer-response, JavaScript runtime 2.0) for the gatu trading terminal.
//
// Generated from terminal-response.template.js by render-functions.mjs; do not edit the rendered
// file by hand. The application's Content-Security-Policy is longer than the 1,783 characters a
// CloudFront response headers policy accepts, so this function sets it from the same source
// (`apps/terminal/src/config/security-headers.ts`). Every policy is the same directive list with
// three slots (frame-ancestors, img-src, script-src), which keeps the function under its 10 KB
// limit with two releases' inline script hashes: the TradingView package gets the frame policy,
// everything else the terminal policy plus the stricter report-only policy. The static shell cannot
// carry a per-path route marker in its body either, so the viewer-request function tags join paths
// on the request and this function surfaces the tag as a response header for the health check.
var CSP_TEMPLATE = "__CSP_TEMPLATE__";
var IMG_SRC = "__IMG_SRC__";
var STRICT_IMG_SRC = "__STRICT_IMG_SRC__";
var SCRIPT_SRC = "__SCRIPT_SRC__";
var STRICT_SCRIPT_SRC = "__STRICT_SCRIPT_SRC__";
// Hashes of the prerendered pages' inline scripts for the current release and the one before it
// (the edge may still serve its pages for a minute after a release). Empty in the committed file:
// `deploy.mjs functions` fills both lines from the build and the live function when publishing.
var SCRIPT_HASHES_CURRENT = "";
var SCRIPT_HASHES_PREVIOUS = "";
// "report-only": only the report-only policy names the hashes; "enforce": the enforced policy too.
var SCRIPT_HASHES_MODE = "__SCRIPT_HASHES_MODE__";
// Same switch for the narrowed image sources.
var IMAGE_SOURCES_MODE = "__IMAGE_SOURCES_MODE__";
// Report receiver from edge-config.json; empty switches the report-only header off.
var REPORT_URI = "__REPORT_URI__";

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
	var route = request.headers['x-gatu-route'];
	if (route && route.value) {
		response.headers['x-gatu-route'] = { value: route.value };
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
