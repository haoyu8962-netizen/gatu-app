// CloudFront Function (viewer-response, JavaScript runtime 2.0) for the gatu trading terminal.
//
// Generated from terminal-response.template.js by render-functions.mjs; do not edit the rendered
// file by hand. The application's Content-Security-Policy is longer than the 1,783 characters a
// CloudFront response headers policy accepts, so this function sets it from the same source
// (`apps/terminal/src/config/security-headers.ts`): the TradingView package gets the frame policy,
// everything else the terminal policy. The static shell cannot carry a per-path route marker in its
// body either, so the viewer-request function tags join paths on the request and this function
// surfaces the tag as a response header for the deployment health check.
var TERMINAL_CSP = "__TERMINAL_CSP__";
var CHART_CSP = "__CHART_CSP__";

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
	response.headers['content-security-policy'] = { value: isChartAsset(request.uri) ? CHART_CSP : TERMINAL_CSP };
	return response;
}
