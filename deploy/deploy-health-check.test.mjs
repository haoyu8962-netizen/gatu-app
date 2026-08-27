import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const DEPLOY_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "deploy.sh");
const MAINNET_API_ORIGIN = "https://api.hyperliquid.xyz";
const TESTNET_API_ORIGIN = "https://api.hyperliquid-testnet.xyz";
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
curl() {
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

function resourceHintHeader(origin) {
	return `link: <${origin}>; rel=preconnect; crossorigin=anonymous\r\n`;
}

function runResourceHintCheck({
	isTestnet,
	termsHeaders = "",
	termsStatus = "200",
	tradeHeaders = "",
	tradePreludeHeaders = "",
	tradeStatus = "200",
}) {
	const workingDirectory = mkdtempSync(join(tmpdir(), "gatu-resource-hints-"));
	const urlsFile = join(workingDirectory, "curl-urls");
	const shell = String.raw`
source "$1"
working_directory="$2"
curl_with_deadline() {
	local body_file=""
	local headers_file=""
	local url=""
	local link_headers=""
	local prelude_headers=""
	local status=""
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
		http://*|https://*)
			url="$1"
			shift
			;;
		*) shift ;;
		esac
	done
	printf '%s\n' "$url" >> "$FAKE_CURL_URLS_FILE"
	case "$url" in
	*/trade/HYPE)
		link_headers="$FAKE_TRADE_LINK_HEADERS"
		prelude_headers="$FAKE_TRADE_PRELUDE_HEADERS"
		status="$FAKE_TRADE_STATUS"
		;;
	*/terms)
		link_headers="$FAKE_TERMS_LINK_HEADERS"
		status="$FAKE_TERMS_STATUS"
		;;
	*) return 64 ;;
	esac
	printf '<!doctype html><html></html>' > "$body_file"
	{
		printf '%s' "$prelude_headers"
		printf 'HTTP/2 %s\r\n' "$status"
		printf 'content-type: text/html; charset=utf-8\r\n'
		printf '%s' "$link_headers"
		printf '\r\n'
	} > "$headers_file"
}
set +e
verify_trade_api_resource_hints "${isTestnet ? "https://testnet.gatu.ai" : "https://app.gatu.ai"}" "$working_directory" "${isTestnet ? "true" : "false"}"
exit "$?"
`;

	try {
		const result = spawnSync("bash", ["-s", DEPLOY_SCRIPT, workingDirectory], {
			encoding: "utf8",
			env: {
				...process.env,
				FAKE_CURL_URLS_FILE: urlsFile,
				FAKE_TERMS_LINK_HEADERS: termsHeaders,
				FAKE_TERMS_STATUS: termsStatus,
				FAKE_TRADE_LINK_HEADERS: tradeHeaders,
				FAKE_TRADE_PRELUDE_HEADERS: tradePreludeHeaders,
				FAKE_TRADE_STATUS: tradeStatus,
			},
			input: shell,
		});
		return {
			status: result.status,
			stderr: result.stderr,
			urls: readFileSync(urlsFile, "utf8").trim().split("\n"),
		};
	} finally {
		rmSync(workingDirectory, { force: true, recursive: true });
	}
}

test("public edge accepts only a deterministic HTTP/1.1 400 rejection", () => {
	const result = runMalformedCheck({ kind: "edge", status: "400" });
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.arguments[0], "-q");
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

test("public edge requires the network-matching API preconnect only on trade pages", async (context) => {
	for (const [name, isTestnet, expectedOrigin] of [
		["mainnet", false, MAINNET_API_ORIGIN],
		["testnet", true, TESTNET_API_ORIGIN],
	]) {
		await context.test(name, () => {
			const result = runResourceHintCheck({
				isTestnet,
				tradeHeaders: resourceHintHeader(expectedOrigin),
			});
			assert.equal(result.status, 0, result.stderr);
			assert.deepEqual(
				result.urls.map((url) => new URL(url).pathname),
				["/trade/HYPE", "/terms"],
			);
		});
	}
});

test("public edge rejects missing, duplicated, wrong-network, and non-trade API hints", async (context) => {
	await context.test("missing trade hint", () => {
		const result = runResourceHintCheck({ isTestnet: false });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /must return exactly one Link/);
	});

	await context.test("duplicated trade hint", () => {
		const hint = resourceHintHeader(MAINNET_API_ORIGIN);
		const result = runResourceHintCheck({ isTestnet: false, tradeHeaders: `${hint}${hint}` });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /must return exactly one Link/);
	});

	await context.test("coalesced encoded wrong-network hint", () => {
		const expected = `<${MAINNET_API_ORIGIN}>; rel=preconnect; crossorigin=anonymous`;
		const encodedWrongNetwork =
			"<https://api%2ehyperliquid-testnet.xyz>; rel=preconnect; crossorigin=anonymous";
		const result = runResourceHintCheck({
			isTestnet: false,
			tradeHeaders: `link: ${expected}, ${encodedWrongNetwork}\r\n`,
		});
		assert.equal(result.status, 1);
		assert.match(result.stderr, /must return exactly one Link/);
	});

	for (const [label, target] of [
		["scheme-relative wrong-network hint", "//api.hyperliquid-testnet.xyz"],
		["slash-normalized wrong-network hint", "////api.hyperliquid-testnet.xyz"],
		["trailing-dot wrong-network hint", "https://api.hyperliquid-testnet.xyz."],
		["encoded trailing-dot wrong-network hint", "https://api.hyperliquid-testnet.xyz%2e"],
		["HTTP wrong-network hint", "http://api.hyperliquid-testnet.xyz"],
		["non-default-port wrong-network hint", "https://api.hyperliquid-testnet.xyz:444"],
	]) {
		await context.test(label, () => {
			const expected = `<${MAINNET_API_ORIGIN}>; rel=preconnect; crossorigin=anonymous`;
			const result = runResourceHintCheck({
				isTestnet: false,
				tradeHeaders: `link: ${expected}, <${target}>; rel=preconnect; crossorigin=anonymous\r\n`,
			});
			assert.equal(result.status, 1);
			assert.match(result.stderr, /must return exactly one Link/);
		});
	}

	await context.test("wrong-network trade hint", () => {
		const result = runResourceHintCheck({
			isTestnet: false,
			tradeHeaders: resourceHintHeader(TESTNET_API_ORIGIN),
		});
		assert.equal(result.status, 1);
		assert.match(result.stderr, /must return exactly one Link/);
	});

	await context.test("terms leak", () => {
		const result = runResourceHintCheck({
			isTestnet: false,
			termsHeaders: resourceHintHeader(MAINNET_API_ORIGIN),
			tradeHeaders: resourceHintHeader(MAINNET_API_ORIGIN),
		});
		assert.equal(result.status, 1);
		assert.match(result.stderr, /must not return a Hyperliquid API Link/);
	});

	await context.test("scheme-relative terms leak", () => {
		const result = runResourceHintCheck({
			isTestnet: false,
			termsHeaders: "link: <//api.hyperliquid-testnet.xyz>; rel=preconnect; crossorigin=anonymous\r\n",
			tradeHeaders: resourceHintHeader(MAINNET_API_ORIGIN),
		});
		assert.equal(result.status, 1);
		assert.match(result.stderr, /must not return a Hyperliquid API Link/);
	});

	await context.test("wrong-network early hint before a valid final response", () => {
		const result = runResourceHintCheck({
			isTestnet: false,
			tradeHeaders: resourceHintHeader(MAINNET_API_ORIGIN),
			tradePreludeHeaders: [
				"HTTP/1.1 200 Connection established\r\n\r\n",
				"HTTP/1.1 103 Early Hints\r\n",
				resourceHintHeader(TESTNET_API_ORIGIN),
				"\r\n",
			].join(""),
		});
		assert.equal(result.status, 1);
		assert.match(result.stderr, /must return exactly one Link/);
	});

	for (const [label, statuses] of [
		["trade redirect", { tradeStatus: "302" }],
		["terms redirect", { termsStatus: "302" }],
	]) {
		await context.test(label, () => {
			const result = runResourceHintCheck({
				isTestnet: false,
				tradeHeaders: resourceHintHeader(MAINNET_API_ORIGIN),
				...statuses,
			});
			assert.equal(result.status, 1);
			assert.match(result.stderr, /must return HTTP 200/);
		});
	}
});
