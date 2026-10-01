import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cspHash } from "../../scripts/collect-inline-script-hashes.mjs";
import { parseScriptHashes } from "./function-code.mjs";
import {
	assertReleaseIdentity,
	assertReleaseMarkersUploaded,
	buildFunctionUpdateCommands,
	buildInvalidationCommand,
	buildLambdaCommands,
	buildRetiredPageCommands,
	buildReuploadCommands,
	buildSyncCommands,
	collectServedScriptHashes,
	evaluateReleaseGates,
	HTML_CACHE_CONTROL,
	IMMUTABLE_CACHE_CONTROL,
	NO_STORE,
	objectCacheControl,
	planUpload,
	prepareResponseFunction,
	releaseFunctionPath,
	releaseGateState,
	RETIRED_PAGE_KEYS,
	resolveAwsProfile,
	REVALIDATE_CACHE_CONTROL,
	verifyDeployment,
} from "./deploy.mjs";

test("objects get the cache policy the edge expects", () => {
	assert.equal(objectCacheControl("assets/index-abc.js"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/bundles/runtime.4d986d07cb97d8edacba.js"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/bundles/1227.68542dac293294290d44.rtl.css"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/bundles/EuclidCircular.be8f862db48c2976009f.woff2"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/bundles/library.js"), REVALIDATE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/charting_library.0123456789abcdef.js"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/charting_library.js"), REVALIDATE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/charting_library.0123456789abcdef.js.br"), null);
	assert.equal(objectCacheControl("charting_library/charting_library.esm.js"), REVALIDATE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/sameorigin.html"), REVALIDATE_CACHE_CONTROL);
	assert.ok(HTML_CACHE_CONTROL.includes("s-maxage=60") && HTML_CACHE_CONTROL.includes("stale-while-revalidate"));
	assert.equal(objectCacheControl("tradingview-theme-dark.css"), REVALIDATE_CACHE_CONTROL);
	assert.equal(objectCacheControl("_shell.html"), HTML_CACHE_CONTROL);
	assert.equal(objectCacheControl("docs/index.html"), HTML_CACHE_CONTROL);
	assert.equal(objectCacheControl("build-meta.json"), NO_STORE);
	assert.equal(objectCacheControl("sw.js"), NO_STORE);
	assert.equal(objectCacheControl("manifest.json"), REVALIDATE_CACHE_CONTROL);
	assert.equal(objectCacheControl("assets/index-abc.js.br"), null);
	assert.equal(objectCacheControl("sw.js.gz"), null);
});

test("html and build metadata upload after every asset, precompressed siblings are skipped", () => {
	const files = ["_shell.html", "assets/a.js", "assets/a.js.br", "build-meta.json", "docs/index.html", "sw.js"];
	const plan = planUpload(files);
	assert.deepEqual(
		plan.early.map((item) => item.file),
		["assets/a.js", "sw.js"],
	);
	assert.deepEqual(
		plan.late.map((item) => item.file),
		["_shell.html", "build-meta.json", "docs/index.html"],
	);
	const commands = buildSyncCommands({ publicDir: "/out/public", bucket: "sairn-terminal", files });
	assert.equal(commands.length, 4);
	for (const command of commands) {
		assert.deepEqual(command.slice(0, 4), ["s3", "sync", "/out/public", "s3://sairn-terminal"]);
		assert.ok(!command.includes("--delete"));
		assert.ok(command.includes("--exclude") && command.includes("--cache-control"));
	}
	assert.ok(commands[0].includes("assets/a.js") && commands[0].includes(IMMUTABLE_CACHE_CONTROL));
	assert.ok(commands.at(-1).includes("build-meta.json") || commands.at(-1).includes("_shell.html"));
	assert.ok(!commands.flat().includes("assets/a.js.br"));
});

test("reupload rewrites the metadata of the selected objects in the bucket, never uploading a local body", () => {
	const files = ["_shell.html", "assets/a.js", "charting_library/bundles/x.0123456789abcdef0123.js", "charting_library/charting_library.js", "docs/index.html"];
	const commands = buildReuploadCommands({ bucket: "b", files, prefixes: ["charting_library/bundles/", "_shell.html"] });
	assert.equal(commands.length, 2);
	assert.deepEqual(commands[0].slice(0, 5), ["s3", "cp", "s3://b", "s3://b", "--recursive"]);
	assert.ok(commands.every((command) => command.includes("--metadata-directive") && command.includes("REPLACE")));
	assert.ok(commands.every((command) => !command.some((argument) => argument.startsWith("/"))));
	assert.ok(commands[0].includes("charting_library/bundles/x.0123456789abcdef0123.js") && commands[0].includes(IMMUTABLE_CACHE_CONTROL));
	assert.ok(commands[1].includes("_shell.html") && commands[1].includes(HTML_CACHE_CONTROL));
	assert.ok(!commands.flat().includes("docs/index.html") && !commands.flat().includes("charting_library/charting_library.js"));
	const many = Array.from({ length: 1_001 }, (_, index) => `charting_library/bundles/${index}.0123456789abcdef0123.js`);
	assert.equal(buildReuploadCommands({ bucket: "b", files: many, prefixes: ["charting_library/"] }).length, 3);
});

test("an executing sync overwrites the retired document pages with the shell unless the build still ships them", () => {
	assert.deepEqual(RETIRED_PAGE_KEYS, [
		"cookies/index.html",
		"docs/index.html",
		"privacy/index.html",
		"risk/index.html",
		"support/index.html",
		"terms/index.html",
	]);
	const commands = buildRetiredPageCommands({ publicDir: "/out", bucket: "b", files: ["_shell.html", "assets/a.js"] });
	assert.deepEqual(
		commands.map((command) => command.slice(0, 4)),
		RETIRED_PAGE_KEYS.map((key) => ["s3", "cp", join("/out", "_shell.html"), `s3://b/${key}`]),
	);
	for (const command of commands) {
		assert.equal(command[command.indexOf("--cache-control") + 1], HTML_CACHE_CONTROL);
		assert.equal(command[command.indexOf("--content-type") + 1], "text/html; charset=utf-8");
		assert.ok(!command.includes("rm") && !command.includes("--recursive") && !command.includes("--delete"));
	}
	const rollback = buildRetiredPageCommands({ publicDir: "/out", bucket: "b", files: ["_shell.html", "terms/index.html"] });
	assert.ok(!rollback.flat().includes("s3://b/terms/index.html"));
	assert.equal(rollback.length, 5);
});

test("a sync that stopped before the shell is reported instead of passing silently", () => {
	const publicDir = createPublicDir();
	const sizes = { "_shell.html": SHELL_HTML.length, "build-meta.json": JSON.stringify(BUILD_META).length };
	assert.doesNotThrow(() => assertReleaseMarkersUploaded({ bucket: "b", publicDir, headObject: (_, key) => sizes[key] }));
	assert.throws(
		() => assertReleaseMarkersUploaded({ bucket: "b", publicDir, headObject: (_, key) => (key === "_shell.html" ? 12_677 : sizes[key]) }),
		/_shell.html in s3:\/\/b is 12677 bytes/,
	);
});

test("cloudfront functions are updated from their files and published with the returned etag", () => {
	const [update, publish] = buildFunctionUpdateCommands({ name: "gatu-terminal-response", file: "/repo/deploy/cloudfront/functions/terminal-response.js", etag: "E1", comment: "sairn route marker + csp" });
	assert.deepEqual(update.slice(0, 6), ["cloudfront", "update-function", "--name", "gatu-terminal-response", "--if-match", "E1"]);
	assert.ok(update.includes("fileb:///repo/deploy/cloudfront/functions/terminal-response.js"));
	assert.ok(update.includes("Comment=sairn route marker + csp,Runtime=cloudfront-js-2.0"));
	assert.deepEqual(publish, ["cloudfront", "publish-function", "--name", "gatu-terminal-response", "--if-match", "<updated-etag>"]);
});

test("invalidation and lambda commands are explicit and bounded", () => {
	assert.deepEqual(buildInvalidationCommand("E123"), [
		"cloudfront",
		"create-invalidation",
		"--distribution-id",
		"E123",
		"--paths",
		"/*",
	]);
	const [update, wait] = buildLambdaCommands({ functionName: "gatu-terminal-api", zipPath: "/tmp/lambda.zip" });
	assert.ok(update.includes("update-function-code") && update.includes("fileb:///tmp/lambda.zip") && update.includes("--publish"));
	assert.ok(wait.includes("function-updated"));
});

const SHELL_PRELOADS = Array.from({ length: 24 }, (_, index) => `/assets/chunk-${index}.js`);
const CHART_ENTRY = "/charting_library/charting_library.0123456789abcdef.js";
const THEME_SCRIPT = '(()=>{document.documentElement.classList.add("dark")})();';
const THEME_HASH = cspHash(THEME_SCRIPT);
const SHELL_HTML = `<html><head><script>${THEME_SCRIPT}</script>${SHELL_PRELOADS.map((href) => `<link rel="modulepreload" href="${href}"/>`).join("")}<link rel="preload" href="${CHART_ENTRY}" as="script" media="(min-width: 1001px)"/><meta name="sairn-preload-desktop" content="/assets/chunk-1.js"/><meta name="sairn-preload-mobile" content=""/><meta name="sairn-chart-prefetch" content="/charting_library/sameorigin.html"/></head></html>`;
const GATES_OFF = {
	mobileSync: { enabled: false },
	cctpDeposits: { mainnetSponsoredWallet: false, testnetExternalWallet: false, testnetSponsoredWallet: false },
};
const BUILD_META = { commit: "abc", release: "r1", ...GATES_OFF };
const REPORT_ONLY_HEADER = `default-src 'self'; img-src 'self' data: https://app.hyperliquid.xyz; script-src 'self' 'report-sample' '${THEME_HASH}'; report-uri https://reports.example/`;

function createPublicDir() {
	const dir = mkdtempSync(join(tmpdir(), "sairn-cf-verify-"));
	mkdirSync(join(dir, "assets"), { recursive: true });
	for (const href of SHELL_PRELOADS) writeFileSync(join(dir, href.slice(1)), "js");
	writeFileSync(join(dir, "_shell.html"), SHELL_HTML);
	writeFileSync(join(dir, "build-meta.json"), JSON.stringify(BUILD_META));
	mkdirSync(join(dir, "charting_library", "bundles"), { recursive: true });
	writeFileSync(join(dir, "charting_library", "bundles", "runtime.4d986d07cb97d8edacba.js"), "js");
	writeFileSync(join(dir, CHART_ENTRY.slice(1)), "js");
	return dir;
}

function edgeSequence(route) {
	let hits = 0;
	return () => ({ ...route, headers: { ...route.headers, "x-cache": hits++ === 0 ? "Miss from cloudfront" : "Hit from cloudfront" } });
}

function legalRoutes(body) {
	const routes = {};
	for (const route of ["cookies", "docs", "privacy", "risk", "support", "terms"]) {
		routes[`/${route}`] = { body };
		routes[`/${route}/index.html`] = { body };
	}
	return routes;
}

function fakeFetch(routes) {
	return async (url, init) => {
		const path = new URL(url).pathname;
		const route = routes[path] ?? routes["*"];
		const { status = 200, body = "", headers = {} } = typeof route === "function" ? route(init) : route;
		return new Response(body, { status, headers });
	};
}

test("verification passes when the edge serves the build with the expected headers", async () => {
	const publicDir = createPublicDir();
	const headers = { "content-security-policy": "default-src 'self'", "content-security-policy-report-only": REPORT_ONLY_HEADER, link: "<https://api.hyperliquid.xyz>; rel=preconnect" };
	const results = await verifyDeployment({
		origin: "https://app.gatu.ai/",
		publicDir,
		network: "mainnet",
		scriptHashesMode: "report-only",
		fetchImpl: fakeFetch({
			"/trade/HYPE": edgeSequence({ body: SHELL_HTML, headers: { ...headers, "cache-control": HTML_CACHE_CONTROL } }),
			[SHELL_PRELOADS.at(-1)]: { body: "js", headers: { "cache-control": IMMUTABLE_CACHE_CONTROL } },
			"/api/health": { status: 204, body: null, headers: { "cache-control": NO_STORE } },
			"/charting_library/bundles/runtime.4d986d07cb97d8edacba.js": edgeSequence({ body: "js", headers: { "cache-control": IMMUTABLE_CACHE_CONTROL } }),
			...legalRoutes(SHELL_HTML),
			"/build-meta.json": { body: JSON.stringify(BUILD_META) },
			"/api/geo": { body: JSON.stringify({ country: "GB", proxy: false, tradeRestricted: false }) },
			"/api/referral-geo": (init) => ({
				status: init?.method === "POST" && /^[0-9a-f]{64}$/.test(init.headers?.["x-amz-content-sha256"] ?? "") ? 200 : 403,
				body: JSON.stringify({ checkedAt: 1, country: "GB", status: "allowed", ttlMs: 60_000 }),
			}),
			"/join/__sairn_healthcheck__": {
				body: SHELL_HTML,
				headers: { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow", "x-sairn-route": "referral-join" },
			},
			"/mobile-agent-sync": {
				body: SHELL_HTML,
				headers: { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-sairn-route": "mobile-agent-sync" },
			},
			[CHART_ENTRY]: { body: "js", headers: { "cache-control": IMMUTABLE_CACHE_CONTROL } },
			"/charting_library/charting_library.js": { body: "js", headers: { "cache-control": REVALIDATE_CACHE_CONTROL } },
			"*": { status: 404, body: "missing" },
		}),
	});
	assert.deepEqual(
		results.filter((result) => !result.ok),
		[],
	);
	assert.equal(results.length, 15);
	assert.equal(results.find((result) => result.name === "shell preloads the startup closure")?.detail, "24 links");
	assert.equal(results.find((result) => result.name === "inline scripts are allowed by the edge policy")?.detail, "1 pages, 1 inline scripts, report-only");
	assert.equal(results.find((result) => result.name === "image sources follow the edge config")?.detail, "3 sources, report-only");
	assert.equal(results.find((result) => result.name.startsWith("chart entry"))?.detail, CHART_ENTRY);
	assert.equal(results.find((result) => result.name === "shell repeats from the edge")?.detail, "Hit from cloudfront");
	assert.equal(results.find((result) => result.name === "legal pages match the build")?.detail, "6 shell, 0 standalone");
	assert.equal(results.find((result) => result.name.startsWith("signed lambda post"))?.detail, "status allowed");
	assert.equal(results.find((result) => result.name === "build metadata parity")?.detail, "abc / r1 / sponsored-mainnet-deposits=off mobile-pairing=off");
});

test("verifying a rollback checks each legal page against the page the build ships", async () => {
	const publicDir = createPublicDir();
	for (const route of ["terms", "privacy"]) {
		mkdirSync(join(publicDir, route), { recursive: true });
		writeFileSync(join(publicDir, route, "index.html"), `<html>${route}</html>`);
	}
	async function run(overrides) {
		const results = await verifyDeployment({
			origin: "https://app.gatu.ai",
			publicDir,
			network: "mainnet",
			fetchImpl: fakeFetch({
				...legalRoutes(SHELL_HTML),
				"/terms": { body: "<html>terms</html>" },
				"/terms/index.html": { body: "<html>terms</html>" },
				"/privacy": { body: "<html>privacy</html>" },
				"/privacy/index.html": { body: "<html>privacy</html>" },
				...overrides,
				"*": { status: 404, body: "missing" },
			}),
		});
		return results.find((result) => result.name === "legal pages match the build");
	}
	const rollback = await run({});
	assert.equal(rollback.ok, true);
	assert.equal(rollback.detail, "4 shell, 2 standalone");
	assert.match((await run({ "/privacy": { body: SHELL_HTML } })).detail, /^\/privacy body differs from local privacy\/index\.html/);
	assert.match((await run({ "/risk/index.html": { body: "<html>old risk</html>" } })).detail, /^\/risk\/index\.html body differs from local _shell\.html/);
	assert.match((await run({ "/docs/index.html": { status: 404, body: "missing" } })).detail, /^\/docs\/index\.html status 404/);
});

test("verification fails when the live origin exposes a gate the local build does not", async () => {
	const publicDir = createPublicDir();
	const live = { ...BUILD_META, cctpDeposits: { ...GATES_OFF.cctpDeposits, mainnetSponsoredWallet: true } };
	const results = await verifyDeployment({
		origin: "https://app.gatu.ai",
		publicDir,
		network: "mainnet",
		fetchImpl: fakeFetch({ "/build-meta.json": { body: JSON.stringify(live) }, "*": { status: 404, body: "missing" } }),
	});
	const parity = results.find((result) => result.name === "build metadata parity");
	assert.equal(parity.ok, false);
	assert.match(parity.detail, /sponsored-mainnet-deposits=on mobile-pairing=off\) differ from the local build \(sponsored-mainnet-deposits=off/);
});

test("an upload that exposes a funds or credential path needs its own acknowledgement", () => {
	assert.deepEqual(evaluateReleaseGates({ buildMeta: BUILD_META }), {
		state: { "sponsored-mainnet-deposits": false, "mobile-pairing": false },
		problems: [],
	});

	const sponsored = { ...BUILD_META, cctpDeposits: { ...GATES_OFF.cctpDeposits, mainnetSponsoredWallet: true } };
	assert.match(evaluateReleaseGates({ buildMeta: sponsored }).problems.join("\n"), /exposes sponsored Mainnet CCTP deposits; pass --allow-sponsored-mainnet-deposits/);
	assert.deepEqual(evaluateReleaseGates({ buildMeta: sponsored, acknowledged: ["sponsored-mainnet-deposits"] }).problems, []);

	for (const mobileSync of [
		{ enabled: true },
		{ createAndReveal: false, importFromQr: true },
		{ createAndReveal: true, importFromQr: true },
	]) {
		const pairing = { ...BUILD_META, mobileSync };
		assert.match(evaluateReleaseGates({ buildMeta: pairing }).problems.join("\n"), /exposes Mobile Agent pairing; pass --allow-mobile-pairing/);
		assert.deepEqual(evaluateReleaseGates({ buildMeta: pairing, acknowledged: ["mobile-pairing"] }).problems, []);
	}

	const both = evaluateReleaseGates({ buildMeta: { ...sponsored, mobileSync: { enabled: true } }, acknowledged: ["mobile-pairing"] });
	assert.equal(both.problems.length, 1);
	assert.match(both.problems[0], /sponsored Mainnet/);
});

test("an acknowledgement the build does not match is refused, and so is a build that records no gates", () => {
	const mismatch = evaluateReleaseGates({ buildMeta: BUILD_META, acknowledged: ["sponsored-mainnet-deposits", "mobile-pairing"] });
	assert.equal(mismatch.problems.length, 2);
	assert.match(mismatch.problems[0], /--allow-sponsored-mainnet-deposits was passed but this build does not expose/);
	assert.match(mismatch.problems[1], /--allow-mobile-pairing was passed but this build does not expose/);

	assert.throws(() => releaseGateState({ commit: "abc", release: "r1", mobileSync: GATES_OFF.mobileSync }), /does not record sponsored Mainnet CCTP deposits; rebuild/);
	assert.throws(() => releaseGateState({ commit: "abc", release: "r1", cctpDeposits: GATES_OFF.cctpDeposits }), /does not record Mobile Agent pairing; rebuild/);
	assert.throws(
		() => releaseGateState({ ...BUILD_META, cctpDeposits: { ...GATES_OFF.cctpDeposits, mainnetSponsoredWallet: "true" } }),
		/does not record sponsored Mainnet CCTP deposits/,
	);
});

test("verification reports a stale shell, a wrong preconnect and a failed geo verdict", async () => {
	const publicDir = createPublicDir();
	const results = await verifyDeployment({
		origin: "https://testnet.gatu.ai",
		publicDir,
		network: "testnet",
		fetchImpl: fakeFetch({
			"/trade/HYPE": { body: "<html>old shell</html>", headers: { "content-security-policy": "x", link: "<https://api.hyperliquid.xyz>; rel=preconnect" } },
			"/build-meta.json": { body: JSON.stringify({ ...BUILD_META, commit: "old", release: "r0" }) },
			"/api/geo": { status: 503, body: JSON.stringify({ error: "unavailable", reason: "missing_config" }) },
			"/join/__sairn_healthcheck__": { body: "x", headers: { "cache-control": "no-store" } },
			[CHART_ENTRY]: { body: "js", headers: { "cache-control": "max-age=0" } },
			"*": { status: 200, body: "<html>shell</html>" },
		}),
	});
	const failed = results.filter((result) => !result.ok).map((result) => result.name);
	assert.deepEqual(failed, [
		"shell for a trade navigation",
		"legal pages match the build",
		"build metadata parity",
		"geo endpoint answers with a real verdict",
		"signed lambda post with a payload hash",
		"referral deep link headers",
		"pairing page headers",
		"missing files stay 404",
		"chart entry is immutable and preloaded by the shell",
		"shell preloads the startup closure",
		"inline scripts are allowed by the edge policy",
		"image sources follow the edge config",
		"health probe answers 204",
		"shell repeats from the edge",
		"chart bundles are immutable at the edge",
		"testnet stays out of search results",
	]);
});

test("the enforced stage rejects a policy that still allows unsafe-inline or misses a page's script", async () => {
	const publicDir = createPublicDir();
	async function run(header) {
		const results = await verifyDeployment({
			origin: "https://app.gatu.ai",
			publicDir,
			network: "mainnet",
			scriptHashesMode: "enforce",
			fetchImpl: fakeFetch({
				"/trade/HYPE": { body: SHELL_HTML, headers: { "content-security-policy": header } },
				"*": { status: 404, body: "missing" },
			}),
		});
		return results.find((result) => result.name === "inline scripts are allowed by the edge policy");
	}
	assert.equal((await run(`default-src 'self'; script-src 'self' '${THEME_HASH}'`)).ok, true);
	assert.match((await run(`default-src 'self'; script-src 'self' 'unsafe-inline' '${THEME_HASH}'`)).detail, /still allows 'unsafe-inline'/);
	assert.match((await run("default-src 'self'; script-src 'self'")).detail, /does not allow inline script sha256-/);
	assert.match((await run("default-src 'self'")).detail, /has no content-security-policy with a script-src/);
	async function images(header) {
		const results = await verifyDeployment({
			origin: "https://app.gatu.ai",
			publicDir,
			network: "mainnet",
			scriptHashesMode: "enforce",
			imageSourcesMode: "enforce",
			fetchImpl: fakeFetch({ "/trade/HYPE": { body: SHELL_HTML, headers: { "content-security-policy": header } }, "*": { status: 404, body: "missing" } }),
		});
		return results.find((result) => result.name === "image sources follow the edge config");
	}
	assert.equal((await images("default-src 'self'; img-src 'self' data: https://app.hyperliquid.xyz")).ok, true);
	assert.match((await images("default-src 'self'; img-src 'self' data: blob: https:")).detail, /still allows any https origin/);
	assert.match((await images("default-src 'self'")).detail, /no content-security-policy with an img-src/);
});

test("a rotation keeps the hashes of a legal page file an interrupted sync left on an older build", async () => {
	const publicDir = createPublicDir();
	const olderScript = '(()=>{document.documentElement.dataset.release="a"})();';
	const olderPage = `<html><head><script>${olderScript}</script></head></html>`;
	const served = await collectServedScriptHashes({
		origin: "https://app.gatu.ai/",
		publicDir,
		fetchImpl: fakeFetch({
			"/trade/HYPE": { body: SHELL_HTML },
			"/terms/index.html": { body: olderPage },
			"/privacy/index.html": { body: SHELL_HTML },
			"*": { status: 404, body: "missing" },
		}),
	});
	assert.deepEqual(served, [cspHash(olderScript), THEME_HASH].sort());
	const committed = 'var SCRIPT_HASHES_CURRENT = "";\nvar SCRIPT_HASHES_PREVIOUS = "";\nfunction handler(event) { return event.response; }\n';
	const nextBuild = "sha256-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=";
	const rotated = prepareResponseFunction({ committedCode: committed, buildHashes: [nextBuild], servedHashes: served });
	assert.ok([...rotated.current, ...rotated.previous].includes(cspHash(olderScript)));
	await assert.rejects(
		collectServedScriptHashes({
			origin: "https://app.gatu.ai",
			publicDir,
			fetchImpl: fakeFetch({ "/trade/HYPE": { body: SHELL_HTML }, "/docs/index.html": { status: 503, body: "x" }, "*": { status: 404, body: "missing" } }),
		}),
		/\/docs\/index\.html answered 503/,
	);
});

test("a release fills the committed function with the build's hashes and keeps the live set as previous", () => {
	const committed = 'var SCRIPT_HASHES_CURRENT = "";\nvar SCRIPT_HASHES_PREVIOUS = "";\nfunction handler(event) { return event.response; }\n';
	const A = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
	const B = "sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
	const first = prepareResponseFunction({ committedCode: committed, buildHashes: [A] });
	assert.deepEqual([first.current, first.previous], [[A], []]);
	assert.deepEqual(parseScriptHashes(first.code), { current: [A], previous: [] });
	const second = prepareResponseFunction({ committedCode: committed, buildHashes: [B], liveCode: first.code });
	assert.deepEqual(parseScriptHashes(second.code), { current: [B], previous: [A] });
	const third = prepareResponseFunction({ committedCode: committed, buildHashes: [B], liveCode: second.code });
	assert.deepEqual(parseScriptHashes(third.code), { current: [B], previous: [A] });
	const migrated = prepareResponseFunction({ committedCode: committed, buildHashes: [A], liveCode: "var TERMINAL_CSP = 'legacy';\nfunction handler(event) { return event.response; }\n" });
	assert.deepEqual(parseScriptHashes(migrated.code), { current: [A], previous: [] });
	assert.throws(() => prepareResponseFunction({ committedCode: committed, buildHashes: [] }), /no inline scripts/);
	assert.ok(releaseFunctionPath("/repo/apps/terminal/.output/public").endsWith(join(".output", "edge", "terminal-response.js")));
});

test("every aws command runs as the release profile unless one is chosen explicitly", () => {
	assert.equal(resolveAwsProfile({ env: {} }), "gatu-edge");
	assert.equal(resolveAwsProfile({ env: { AWS_PROFILE: "ci-release" } }), "ci-release");
	assert.equal(resolveAwsProfile({ profile: "other", env: { AWS_PROFILE: "ci-release" } }), "other");
	assert.throws(() => resolveAwsProfile({ profile: "  ", env: {} }), /profile name/);
});

test("an executing release refuses the account root and unknown identities", () => {
	assert.equal(
		assertReleaseIdentity("arn:aws:iam::018252911946:user/gatu-edge"),
		"arn:aws:iam::018252911946:user/gatu-edge",
	);
	assert.equal(
		assertReleaseIdentity("arn:aws:sts::018252911946:assumed-role/release/ci"),
		"arn:aws:sts::018252911946:assumed-role/release/ci",
	);
	assert.throws(() => assertReleaseIdentity("arn:aws:iam::018252911946:root"), /account root/);
	assert.throws(() => assertReleaseIdentity(""), /caller identity/);
	assert.throws(() => assertReleaseIdentity("arn:aws:iam::018252911946:group/ops"), /Unexpected/);
});
