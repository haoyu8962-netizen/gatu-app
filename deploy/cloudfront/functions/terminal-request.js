// CloudFront Function (viewer-request, JavaScript runtime 2.0) for the gatu trading terminal.
//
// Mirrors apps/terminal/src/lib/static-pages/static-pages.ts for an S3 origin: document routes
// map to their prerendered index.html, every other application path maps to the SPA shell, and
// server paths are left untouched so their cache behaviors route them to the API origin. Missing
// files stay 404 (custom error response) instead of becoming HTML. The public host is copied
// into x-gatu-forwarded-host so the API origin can rebuild the public origin. Join paths and the
// pairing path are tagged so the viewer-response function can expose the route marker and give the
// pairing page its uncached, referrer-free headers; a tag the viewer sent itself is dropped first.
var DOCUMENT_ROUTES = ['/cookies', '/docs', '/privacy', '/risk', '/support', '/terms'];
var SERVER_PATHS = ['/api', '/client-error-report'];
var SERVER_PREFIXES = ['/api/'];
var RETIRED_PATH = '/mobile-agent-sync-ticket';
// The router matches this path in any letter case, so the tag does too.
var PAIRING_PATH = '/mobile-agent-sync';
var SERVER_FUNCTION_PREFIX = '/_serverFn/';
var SHELL = '/_shell.html';
var EXTENSION = /^[A-Za-z0-9]{1,8}$/;

function trimTrailingSlash(uri) {
	var end = uri.length;
	while (end > 1 && uri.charAt(end - 1) === '/') end -= 1;
	return uri.slice(0, end);
}

function includes(list, value) {
	for (var i = 0; i < list.length; i += 1) {
		if (list[i] === value) return true;
	}
	return false;
}

function startsWithAny(value, prefixes) {
	for (var i = 0; i < prefixes.length; i += 1) {
		if (value.indexOf(prefixes[i]) === 0) return true;
	}
	return false;
}

function hasFileExtension(uri) {
	var segment = uri.slice(uri.lastIndexOf('/') + 1);
	var dot = segment.lastIndexOf('.');
	return dot > 0 && EXTENSION.test(segment.slice(dot + 1));
}

function notFound(message) {
	return {
		statusCode: 404,
		statusDescription: 'Not Found',
		headers: {
			'content-type': { value: 'application/json; charset=utf-8' },
			'cache-control': { value: 'no-store' },
		},
		body: JSON.stringify({ error: message }),
	};
}

function handler(event) {
	var request = event.request;
	var host = request.headers.host ? request.headers.host.value : '';
	request.headers['x-gatu-forwarded-host'] = { value: host };
	delete request.headers['x-gatu-route'];

	var uri = trimTrailingSlash(request.uri);
	if (uri.indexOf(SERVER_FUNCTION_PREFIX) === 0) return notFound('Server functions are not available');
	if (uri === RETIRED_PATH || uri.indexOf(RETIRED_PATH + '/') === 0) return notFound('Not found');
	if (includes(SERVER_PATHS, uri) || startsWithAny(uri, SERVER_PREFIXES)) return request;
	if (hasFileExtension(uri)) return request;

	if (uri === '/join' || uri.indexOf('/join/') === 0) {
		request.headers['x-gatu-route'] = { value: 'referral-join' };
	} else if (uri.toLowerCase() === PAIRING_PATH) {
		request.headers['x-gatu-route'] = { value: 'mobile-agent-sync' };
	}
	request.uri = includes(DOCUMENT_ROUTES, uri) ? uri + '/index.html' : SHELL;
	return request;
}
