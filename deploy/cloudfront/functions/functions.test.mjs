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
	contentSecurityPolicyReportOnly,
	createStrictCspDirectives,
	cspDirectives,
	serializeContentSecurityPolicy,
} from "../../../apps/terminal/src/config/security-headers.ts";
import { fillScriptHashes, FUNCTION_CODE_LIMIT_BYTES, readEdgeConfig } from "../function-code.mjs";
import { createCspTemplate, renderCurrentResponseFunction, renderResponseFunction, RESPONSE_TEMPLATE_PATH } from "../render-functions.mjs";

const directory = dirname(fileURLToPath(import.meta.url));

function loadFunctionSource(source, extra = "") {
	return vm.runInNewContext(`${source}\n({ handler: handler ${extra} })`, {});
}

function loadFunction(file, extra = "") {
	return loadFunctionSource(readFileSync(join(directory, file), "utf8"), extra);
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
	const { cspReportUri, cspScriptHashes, cspImageSources } = readEdgeConfig();
	const reportSuffix = cspReportUri ? `; report-uri ${cspReportUri}` : "";
	const strict = createStrictCspDirectives();
	const enforcedDirectives = {
		...cspDirectives,
		...(cspScriptHashes === "enforce" ? { "script-src": strict["script-src"] } : {}),
		...(cspImageSources === "enforce" ? { "img-src": strict["img-src"] } : {}),
	};
	const enforced = cspScriptHashes === "enforce" || cspImageSources === "enforce" ? `${serializeContentSecurityPolicy(enforcedDirectives)}${reportSuffix}` : contentSecurityPolicy;
	assert.equal(shell.headers["content-security-policy"].value, enforced);
	const candidate = cspReportUri ? `${contentSecurityPolicyReportOnly}${reportSuffix}` : "";
	assert.equal(shell.headers["content-security-policy-report-only"]?.value, candidate && candidate !== enforced ? candidate : undefined);
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
	assert.equal(chart.headers["content-security-policy-report-only"], undefined);
});

const HASHES = ["sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", "sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="];
const PREVIOUS = ["sha256-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC="];

function renderWith({ scriptHashesMode, imageSourcesMode = "report-only", reportUri }) {
	const strict = createStrictCspDirectives();
	return renderResponseFunction({
		template: readFileSync(RESPONSE_TEMPLATE_PATH, "utf8"),
		cspTemplate: createCspTemplate(),
		imgSrc: cspDirectives["img-src"],
		strictImgSrc: strict["img-src"],
		scriptSrc: cspDirectives["script-src"],
		strictScriptSrc: strict["script-src"],
		scriptHashesMode,
		imageSourcesMode,
		reportUri,
	});
}

function headersFor(source, uri) {
	const { handler } = loadFunctionSource(source);
	const response = handler({ request: onRequest(viewerRequest(uri)), response: { statusCode: 200, headers: {} } });
	return { enforced: response.headers["content-security-policy"]?.value, reportOnly: response.headers["content-security-policy-report-only"]?.value };
}

test("the filled inline script hashes reach the policies the mode selects", () => {
	const hashedScriptSrc = createStrictCspDirectives([...HASHES, ...PREVIOUS])["script-src"];
	const strictWithHashes = serializeContentSecurityPolicy(createStrictCspDirectives([...HASHES, ...PREVIOUS]));

	const reportOnly = fillScriptHashes(renderWith({ scriptHashesMode: "report-only", reportUri: "https://reports.example/" }), { current: HASHES, previous: PREVIOUS });
	const observed = headersFor(reportOnly, "/trade/BTC");
	assert.equal(observed.enforced, contentSecurityPolicy);
	assert.equal(observed.reportOnly, `${strictWithHashes}; report-uri https://reports.example/`);
	assert.ok(observed.reportOnly.includes(`'${HASHES[0]}' '${HASHES[1]}' '${PREVIOUS[0]}'`));
	const reportOnlyScriptSrc = /script-src ([^;]*)/.exec(observed.reportOnly)[1];
	assert.ok(!reportOnlyScriptSrc.includes("'unsafe-inline'") && !reportOnlyScriptSrc.includes("blob:"));

	const enforce = fillScriptHashes(renderWith({ scriptHashesMode: "enforce", reportUri: "https://reports.example/" }), { current: HASHES, previous: PREVIOUS });
	const enforced = headersFor(enforce, "/docs");
	assert.equal(enforced.enforced, `${serializeContentSecurityPolicy({ ...cspDirectives, "script-src": hashedScriptSrc })}; report-uri https://reports.example/`);
	assert.equal(enforced.reportOnly, `${strictWithHashes}; report-uri https://reports.example/`);
	assert.equal(headersFor(enforce, "/charting_library/charting_library.js").enforced, chartingLibraryContentSecurityPolicy);

	const images = fillScriptHashes(renderWith({ scriptHashesMode: "enforce", imageSourcesMode: "enforce", reportUri: "https://reports.example/" }), { current: HASHES, previous: PREVIOUS });
	const both = headersFor(images, "/trade/BTC");
	assert.equal(both.enforced, `${strictWithHashes}; report-uri https://reports.example/`, "with every directive enforced the enforced policy is the candidate");
	assert.equal(both.reportOnly, undefined, "the report-only header is omitted once it would repeat the enforced policy");
	assert.equal(headersFor(images, "/charting_library/charting_library.js").enforced, chartingLibraryContentSecurityPolicy);
	const imagesOnly = fillScriptHashes(renderWith({ scriptHashesMode: "report-only", imageSourcesMode: "enforce", reportUri: "https://reports.example/" }), { current: HASHES, previous: [] });
	const imagesOnlyHeaders = headersFor(imagesOnly, "/trade/BTC");
	assert.equal(imagesOnlyHeaders.enforced, `${serializeContentSecurityPolicy({ ...cspDirectives, "img-src": createStrictCspDirectives()["img-src"] })}; report-uri https://reports.example/`);
	assert.equal(imagesOnlyHeaders.reportOnly, `${serializeContentSecurityPolicy(createStrictCspDirectives(HASHES))}; report-uri https://reports.example/`);

	const silent = fillScriptHashes(renderWith({ scriptHashesMode: "enforce", reportUri: "" }), { current: HASHES, previous: [] });
	const quiet = headersFor(silent, "/trade/BTC");
	assert.equal(quiet.enforced, serializeContentSecurityPolicy({ ...cspDirectives, "script-src": createStrictCspDirectives(HASHES)["script-src"] }));
	assert.equal(quiet.reportOnly, undefined);
	assert.ok(Buffer.byteLength(enforce, "utf8") <= FUNCTION_CODE_LIMIT_BYTES);
});

test("the renderer rejects unknown modes, unsafe values and templates without placeholders", () => {
	assert.throws(() => renderWith({ scriptHashesMode: "off", reportUri: "" }), /scriptHashesMode/);
	assert.throws(() => renderWith({ scriptHashesMode: "enforce", imageSourcesMode: "off", reportUri: "" }), /imageSourcesMode/);
	assert.throws(() => renderResponseFunction({ template: "var handler = 1;", cspTemplate: "x", imgSrc: "x", strictImgSrc: "x", scriptSrc: "x", strictScriptSrc: "x", scriptHashesMode: "enforce" }), /has no __CSP_TEMPLATE__/);
	const template = readFileSync(RESPONSE_TEMPLATE_PATH, "utf8");
	const base = { template, cspTemplate: createCspTemplate(), imgSrc: "x", strictImgSrc: "x", scriptSrc: "x", strictScriptSrc: "x", scriptHashesMode: "enforce" };
	assert.throws(() => renderResponseFunction({ ...base, imgSrc: 'x"y' }), /must not contain/);
	assert.throws(() => renderResponseFunction({ ...base, scriptSrc: "{SCRIPT}" }), /must not contain/);
	assert.ok(createCspTemplate().includes("frame-ancestors {FA}; form-action 'self'; img-src {IMG}"));
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

test("the report-only policy is emitted only when a report receiver is configured", () => {
	const withReceiver = renderWith({ scriptHashesMode: "report-only", reportUri: "https://reports.example/" });
	assert.equal(headersFor(withReceiver, "/trade/BTC").reportOnly, `${contentSecurityPolicyReportOnly}; report-uri https://reports.example/`);
	const withoutReceiver = renderWith({ scriptHashesMode: "report-only", reportUri: "" });
	assert.equal(headersFor(withoutReceiver, "/trade/BTC").reportOnly, undefined);
	assert.ok(withoutReceiver.includes('var SCRIPT_HASHES_CURRENT = "";') && withoutReceiver.includes('var SCRIPT_HASHES_PREVIOUS = "";'));
	assert.equal(typeof readEdgeConfig().cspReportUri, "string");
});
