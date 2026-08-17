import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const DEPLOY_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "deploy.sh");
const VALID_UPSTREAM_HEADERS = [
	"HTTP/1.1 404 Not Found",
	"cache-control: no-store",
	"referrer-policy: no-referrer",
	"x-robots-tag: noindex, nofollow",
	"",
	"",
].join("\r\n");

function runMalformedCheck({ body = "Bad Request", exitCode = 0, headers = "", kind, status }) {
	const workingDirectory = mkdtempSync(join(tmpdir(), "gatu-deploy-health-"));
	const argumentsFile = join(workingDirectory, "curl-arguments");
	const shell = String.raw`
source "$1"
working_directory="$2"
curl_with_deadline() {
	local body_file=""
	local headers_file=""
	printf '%s\n' "$@" > "$FAKE_CURL_ARGUMENTS_FILE"
	while [ "$#" -gt 0 ]; do
		case "$1" in
			-D)
				headers_file="$2"
				shift 2
				;;
			-o)
				body_file="$2"
				shift 2
				;;
			*) shift ;;
		esac
	done
	printf '%s' "$FAKE_CURL_BODY" > "$body_file"
	if [ -n "$headers_file" ]; then
		printf '%s' "$FAKE_CURL_HEADERS" > "$headers_file"
	fi
	printf '%s' "$FAKE_CURL_STATUS"
	return "$FAKE_CURL_EXIT_CODE"
}
set +e
case "$FAKE_CHECK_KIND" in
	edge) verify_edge_rejects_malformed_referral_deep_link "https://example.test" "$working_directory" ;;
	upstream) verify_upstream_malformed_referral_deep_link "http://127.0.0.1:3000" "$working_directory" ;;
	*) exit 64 ;;
esac
exit "$?"
`;

	try {
		const result = spawnSync("bash", ["-s", DEPLOY_SCRIPT, workingDirectory], {
			encoding: "utf8",
			env: {
				...process.env,
				FAKE_CHECK_KIND: kind,
				FAKE_CURL_ARGUMENTS_FILE: argumentsFile,
				FAKE_CURL_BODY: body,
				FAKE_CURL_EXIT_CODE: String(exitCode),
				FAKE_CURL_HEADERS: headers,
				FAKE_CURL_STATUS: status,
			},
			input: shell,
		});
		return {
			arguments: readFileSync(argumentsFile, "utf8").trim().split("\n"),
			status: result.status,
			stderr: result.stderr,
		};
	} finally {
		rmSync(workingDirectory, { force: true, recursive: true });
	}
}

test("public edge accepts only a deterministic HTTP/1.1 400 rejection", () => {
	const result = runMalformedCheck({ kind: "edge", status: "400" });
	assert.equal(result.status, 0, result.stderr);
	assert.ok(result.arguments.includes("--http1.1"));
	assert.ok(result.arguments.includes("--path-as-is"));
	assert.ok(!result.arguments.includes("-f"));
	assert.ok(result.arguments.includes("https://example.test/join/%"));
});

test("public edge rejects transport failures instead of treating them as safe", async (context) => {
	for (const exitCode of [7, 28, 60, 92]) {
		await context.test(`curl exit ${exitCode}`, () => {
			const result = runMalformedCheck({ exitCode, kind: "edge", status: "000" });
			assert.equal(result.status, 1);
			assert.match(result.stderr, /failed to verify the public edge rejection/);
			assert.match(result.stderr, new RegExp(`curl ${exitCode}`));
		});
	}
});

test("public edge rejects every unexpected HTTP response", async (context) => {
	for (const status of ["000", "200", "404", "500"]) {
		await context.test(`HTTP ${status}`, () => {
			const result = runMalformedCheck({ kind: "edge", status });
			assert.equal(result.status, 1);
			assert.match(result.stderr, new RegExp(`received ${status}`));
		});
	}
});

test("public edge rejects an HTML fallback even when its status is 400", () => {
	const result = runMalformedCheck({ body: "<!doctype html><html></html>", kind: "edge", status: "400" });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /HTML application fallback/);
});

test("Node upstream requires a 404 with every referral safety header", () => {
	const result = runMalformedCheck({ headers: VALID_UPSTREAM_HEADERS, kind: "upstream", status: "404" });
	assert.equal(result.status, 0, result.stderr);
	assert.ok(result.arguments.includes("--http1.1"));
	assert.ok(result.arguments.includes("--path-as-is"));
	assert.ok(!result.arguments.includes("-f"));
	assert.ok(result.arguments.includes("http://127.0.0.1:3000/join/%"));
});

test("Node upstream rejects transport errors, edge statuses, and ambiguous headers", async (context) => {
	await context.test("transport error", () => {
		const result = runMalformedCheck({ exitCode: 7, kind: "upstream", status: "000" });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /failed to request malformed referral deep link/);
		assert.match(result.stderr, /curl 7/);
	});

	await context.test("HTTP 400", () => {
		const result = runMalformedCheck({ headers: VALID_UPSTREAM_HEADERS, kind: "upstream", status: "400" });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /must return 404/);
	});

	await context.test("duplicate security header", () => {
		const duplicateHeaders = VALID_UPSTREAM_HEADERS.replace(
			"cache-control: no-store\r\n",
			"cache-control: no-store\r\ncache-control: no-store\r\n",
		);
		const result = runMalformedCheck({ headers: duplicateHeaders, kind: "upstream", status: "404" });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /must return exactly one cache-control/);
	});

	await context.test("missing security header", () => {
		const missingHeader = VALID_UPSTREAM_HEADERS.replace("referrer-policy: no-referrer\r\n", "");
		const result = runMalformedCheck({ headers: missingHeader, kind: "upstream", status: "404" });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /must return exactly one referrer-policy/);
	});
});
