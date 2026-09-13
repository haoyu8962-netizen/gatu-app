import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { DOCUMENT_ROUTE_PATHS } from "../../../apps/terminal/src/config/document-routes.ts";
import {
	chartingLibraryContentSecurityPolicy,
	contentSecurityPolicy,
} from "../../../apps/terminal/src/config/security-headers.ts";
import { FUNCTION_CODE_LIMIT_BYTES, renderCurrentResponseFunction } from "../render-functions.mjs";

const directory = dirname(fileURLToPath(import.meta.url));

function loadFunction(file, extra = "") {
	const source = readFileSync(join(directory, file), "utf8");
	return vm.runInNewContext(`${source}\n({ handler: handler ${extra} })`, {});
}

function viewerRequest(uri, headers = { host: { value: "app.gatu.ai" } }) {
	return { request: { method: "GET", uri, querystring: {}, headers: { ...headers }, cookies: {} } };
}

const { handler: onRequest, DOCUMENT_ROUTES } = loadFunction("terminal-request.js", ", DOCUMENT_ROUTES: DOCUMENT_ROUTES");
const { handler: onResponse } = loadFunction("terminal-response.js");

test("the request function embeds the same document routes as the application", () => {
	assert.deepEqual([...DOCUMENT_ROUTES].sort(), [...DOCUMENT_ROUTE_PATHS].sort());
});

test("the rendered response function matches the template and the application headers", () => {
	const committed = readFileSync(join(directory, "terminal-response.js"), "utf8");
	assert.equal(committed, renderCurrentResponseFunction(), "run: node --experimental-strip-types deploy/cloudfront/render-functions.mjs");
	assert.ok(Buffer.byteLength(committed, "utf8") <= FUNCTION_CODE_LIMIT_BYTES);
});

test("application navigations rewrite to the shell and document routes to their index files", () => {
	for (const uri of ["/trade/BTC", "/trade/xyz:CXMT/", "/portfolio", "/", "/no/such/page"]) {
		const result = onRequest(viewerRequest(uri));
		assert.equal(result.uri, "/_shell.html", uri);
		assert.equal(result.headers["x-gatu-forwarded-host"].value, "app.gatu.ai");
	}
	for (const path of DOCUMENT_ROUTE_PATHS) {
		assert.equal(onRequest(viewerRequest(path)).uri, `${path}/index.html`);
		assert.equal(onRequest(viewerRequest(`${path}/`)).uri, `${path}/index.html`);
	}
});

test("server paths and file-like paths pass through untouched", () => {
	for (const uri of [
		"/api/geo",
		"/api/leaderboard",
		"/api/client-error-report",
		"/client-error-report",
		"/mobile-agent-sync-ticket",
		"/mobile-agent-sync-ticket/consume",
		"/assets/app-abc.js",
		"/build-meta.json",
		"/charting_library/charting_library.js",
		"/favicon.ico",
	]) {
		assert.equal(onRequest(viewerRequest(uri)).uri, uri, uri);
	}
	const gone = onRequest(viewerRequest("/_serverFn/abc"));
	assert.equal(gone.statusCode, 404);
	assert.equal(gone.headers["cache-control"].value, "no-store");
});

test("the response function sets the terminal or chart content security policy", () => {
	const shell = onResponse({ request: onRequest(viewerRequest("/trade/BTC")), response: { statusCode: 200, headers: {} } });
	assert.equal(shell.headers["content-security-policy"].value, contentSecurityPolicy);
	const chart = onResponse({
		request: onRequest(viewerRequest("/charting_library/charting_library.js")),
		response: { statusCode: 200, headers: {} },
	});
	assert.equal(chart.headers["content-security-policy"].value, chartingLibraryContentSecurityPolicy);
	const theme = onResponse({
		request: onRequest(viewerRequest("/tradingview-theme-dark.css")),
		response: { statusCode: 200, headers: {} },
	});
	assert.equal(theme.headers["content-security-policy"].value, chartingLibraryContentSecurityPolicy);
});

test("join paths carry the referral marker through to the response headers", () => {
	const request = onRequest(viewerRequest("/join/__gatu_healthcheck__"));
	assert.equal(request.uri, "/_shell.html");
	assert.equal(request.headers["x-gatu-route"].value, "referral-join");
	const response = onResponse({ request, response: { statusCode: 200, headers: {} } });
	assert.equal(response.headers["x-gatu-route"].value, "referral-join");

	const plain = onRequest(viewerRequest("/joiner"));
	assert.equal(plain.headers["x-gatu-route"], undefined);
	const untouched = onResponse({ request: plain, response: { statusCode: 200, headers: {} } });
	assert.equal(untouched.headers["x-gatu-route"], undefined);
});
