// CloudFront Function (viewer-request, JavaScript runtime 2.0) for the sairn trading terminal.
//
// Mirrors apps/terminal/src/lib/static-pages/static-pages.ts for an S3 origin: every application
// path maps to the SPA shell, and server paths are left untouched so their cache behaviors route
// them to the API origin. Missing files stay 404 (custom error response) instead of becoming
// HTML. A final segment with a dot followed by 1-16 ASCII letters or digits is file-shaped,
// including leading-dot files; the bound keeps longer dotted route segments from being mistaken
// for files. The public host is copied into x-sairn-forwarded-host so the API origin can rebuild the
// public origin. Join paths and the pairing path are tagged so the viewer-response function can
// expose the route marker and give the pairing page its uncached, referrer-free headers; a tag the
// viewer sent itself is dropped first.
var SERVER_PATHS = ['/api', '/client-error-report'];
var SERVER_PREFIXES = ['/api/'];
var RETIRED_PATH = '/mobile-agent-sync-ticket';
// The router matches this path in any letter case, so the tag does too.
var PAIRING_PATH = '/mobile-agent-sync';
var SERVER_FUNCTION_PREFIX = '/_serverFn/';
var SHELL = '/_shell.html';
var EXTENSION = /^[A-Za-z0-9]{1,16}$/;

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
	return dot >= 0 && EXTENSION.test(segment.slice(dot + 1));
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

// A release publishes this function before the viewer-response function, and a rollback does the same with the
// previous pair, so until the gatu.ai group retires both marker names are written and both are read.
function tagRoute(request, value) {
	request.headers['x-sairn-route'] = { value: value };
	request.headers['x-gatu-route'] = { value: value };
}

function handler(event) {
	var request = event.request;
	var host = request.headers.host ? request.headers.host.value : '';
	request.headers['x-sairn-forwarded-host'] = { value: host };
	// Pre-rename name, still forwarded by API origin request policies that predate X-Sairn-Forwarded-Host.
	request.headers['x-gatu-forwarded-host'] = { value: host };
	delete request.headers['x-sairn-route'];
	delete request.headers['x-gatu-route'];

	var uri = trimTrailingSlash(request.uri);
	if (uri.indexOf(SERVER_FUNCTION_PREFIX) === 0) return notFound('Server functions are not available');
	if (uri === RETIRED_PATH || uri.indexOf(RETIRED_PATH + '/') === 0) return notFound('Not found');
	if (includes(SERVER_PATHS, uri) || startsWithAny(uri, SERVER_PREFIXES)) return request;
	if (hasFileExtension(uri)) return request;

	if (uri === '/join' || uri.indexOf('/join/') === 0) {
		tagRoute(request, 'referral-join');
	} else if (uri.toLowerCase() === PAIRING_PATH) {
		tagRoute(request, 'mobile-agent-sync');
	}
	request.uri = SHELL;
	return request;
}
