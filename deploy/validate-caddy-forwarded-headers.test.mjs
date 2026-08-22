import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateAdaptedCaddyForwardedHeaders } from "./validate-caddy-forwarded-headers.mjs";

const DEPLOY_DIR = dirname(fileURLToPath(import.meta.url));
const CADDYFILE = join(DEPLOY_DIR, "Caddyfile");
const DEPLOY_SCRIPT = join(DEPLOY_DIR, "deploy.sh");
const VALIDATOR = join(DEPLOY_DIR, "validate-caddy-forwarded-headers.mjs");
const REMOTE_HOST = "{http.request.remote.host}";

function reverseProxy({ deletePatterns, set = true, upstream = "127.0.0.1:3000", ...requestOperations } = {}) {
	return {
		handler: "reverse_proxy",
		headers: {
			request: {
				...requestOperations,
				...(deletePatterns ? { delete: deletePatterns } : {}),
				...(set
					? {
							set: {
								"X-Forwarded-For": [REMOTE_HOST],
								"X-Real-Ip": [REMOTE_HOST],
							},
						}
					: {}),
			},
		},
		upstreams: [{ dial: upstream }],
	};
}

function adaptedConfig(...handlers) {
	return { apps: { http: { servers: { production: { routes: [{ handle: handlers }] } } } } };
}

test("accepts overwrite-only forwarding on the production upstream", () => {
	assert.doesNotThrow(() => validateAdaptedCaddyForwardedHeaders(adaptedConfig(reverseProxy())));
});

test("rejects exact and wildcard deletes that run after the forwarding sets", async (context) => {
	for (const pattern of ["X-Forwarded-For", "X-*", "*-Forwarded-For", "*Forwarded*", "*"]) {
		await context.test(pattern, () => {
			assert.throws(
				() => validateAdaptedCaddyForwardedHeaders(adaptedConfig(reverseProxy({ deletePatterns: [pattern] }))),
				/deletes X-Forwarded-For/,
			);
		});
	}
});

test("rejects forwarding headers configured outside the production upstream", () => {
	assert.throws(
		() =>
			validateAdaptedCaddyForwardedHeaders(
				adaptedConfig(reverseProxy({ set: false }), reverseProxy({ upstream: "127.0.0.1:4000" })),
			),
		/must overwrite X-Forwarded-For/,
	);
});

test("rejects missing, appended, replaced, duplicated, and differently sourced headers", async (context) => {
	const invalidHandlers = {
		appended: reverseProxy({ add: { "X-Forwarded-For": [REMOTE_HOST] } }),
		duplicated: reverseProxy({ set: false }),
		missing: reverseProxy({ set: false }),
		replaced: reverseProxy({ replace: { "X-Real-Ip": [{ search: "127", replace: "198" }] } }),
		"replaced globally": reverseProxy({ replace: { "*": [{ search: ".*", replace: "127.0.0.1" }] } }),
		"wrong source": reverseProxy(),
	};
	invalidHandlers.duplicated.headers.request.set = {
		"X-Forwarded-For": [REMOTE_HOST],
		"X-Real-Ip": [REMOTE_HOST],
		"x-real-ip": [REMOTE_HOST],
	};
	invalidHandlers["wrong source"].headers.request.set["X-Forwarded-For"] = ["{http.request.header.X-Forwarded-For}"];

	for (const [name, handler] of Object.entries(invalidHandlers)) {
		await context.test(name, () => {
			assert.throws(() => validateAdaptedCaddyForwardedHeaders(adaptedConfig(handler)));
		});
	}
});

test("requires exactly one production reverse proxy handler", () => {
	assert.throws(() => validateAdaptedCaddyForwardedHeaders(adaptedConfig()), /exactly one reverse_proxy/);
	assert.throws(
		() => validateAdaptedCaddyForwardedHeaders(adaptedConfig(reverseProxy(), reverseProxy())),
		/exactly one reverse_proxy/,
	);
});

test("validator CLI adapts the Caddyfile and deployment preflight invokes it", () => {
	const root = mkdtempSync(join(tmpdir(), "gatu-caddy-validator-"));
	try {
		const fakeCaddy = join(root, "caddy");
		writeFileSync(
			fakeCaddy,
			`#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(adaptedConfig(reverseProxy())))})\n`,
		);
		chmodSync(fakeCaddy, 0o755);
		const result = spawnSync(process.execPath, [VALIDATOR, CADDYFILE, fakeCaddy], { encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /Verified overwrite-only client IP forwarding/);
		assert.match(readFileSync(DEPLOY_SCRIPT, "utf8"), /validate-caddy-forwarded-headers\.mjs/);
	} finally {
		rmSync(root, { force: true, recursive: true });
	}
});

test("repository Caddyfile keeps only the two exact overwrite directives", () => {
	const forwardingLines = readFileSync(CADDYFILE, "utf8")
		.split(/\r?\n/)
		.map((line) => line.trim().split(/\s+/))
		.filter(
			([directive, field]) =>
				directive === "header_up" &&
				["x-forwarded-for", "x-real-ip"].includes((field ?? "").replace(/^[+\->?]+/, "").toLowerCase()),
		);
	assert.deepEqual(forwardingLines, [
		["header_up", "X-Forwarded-For", "{remote_host}"],
		["header_up", "X-Real-IP", "{remote_host}"],
	]);
});
