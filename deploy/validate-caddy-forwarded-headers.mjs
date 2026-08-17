#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TARGET_UPSTREAM = "127.0.0.1:3000";
const REMOTE_HOST_PLACEHOLDER = "{http.request.remote.host}";
const REQUIRED_HEADERS = ["X-Forwarded-For", "X-Real-IP"];

function collectReverseProxyHandlers(value, handlers = []) {
	if (Array.isArray(value)) {
		for (const item of value) collectReverseProxyHandlers(item, handlers);
		return handlers;
	}
	if (!value || typeof value !== "object") return handlers;
	if (value.handler === "reverse_proxy") handlers.push(value);
	for (const child of Object.values(value)) collectReverseProxyHandlers(child, handlers);
	return handlers;
}

function normalizedHeaderName(value) {
	return value.toLowerCase();
}

function deletePatternMatchesHeader(pattern, headerName) {
	const normalizedPattern = normalizedHeaderName(pattern);
	const normalizedHeader = normalizedHeaderName(headerName);
	if (normalizedPattern === "*") return true;
	const startsWithWildcard = normalizedPattern.startsWith("*");
	const endsWithWildcard = normalizedPattern.endsWith("*");
	if (startsWithWildcard && endsWithWildcard) return normalizedHeader.includes(normalizedPattern.slice(1, -1));
	if (startsWithWildcard) return normalizedHeader.endsWith(normalizedPattern.slice(1));
	if (endsWithWildcard) return normalizedHeader.startsWith(normalizedPattern.slice(0, -1));
	return normalizedHeader === normalizedPattern;
}

function matchingOperationEntries(operation, headerName) {
	if (!operation || typeof operation !== "object" || Array.isArray(operation)) return [];
	return Object.entries(operation).filter(
		([name]) => normalizedHeaderName(name) === normalizedHeaderName(headerName),
	);
}

export function validateAdaptedCaddyForwardedHeaders(config, label = "adapted Caddy config") {
	const targetHandlers = collectReverseProxyHandlers(config).filter((handler) =>
		handler.upstreams?.some((upstream) => upstream?.dial === TARGET_UPSTREAM),
	);
	if (targetHandlers.length !== 1) {
		throw new Error(`${label} must contain exactly one reverse_proxy handler for ${TARGET_UPSTREAM}`);
	}

	const requestOperations = targetHandlers[0].headers?.request ?? {};
	const deletePatterns = Array.isArray(requestOperations.delete) ? requestOperations.delete : [];
	if (
		requestOperations.replace &&
		typeof requestOperations.replace === "object" &&
		!Array.isArray(requestOperations.replace) &&
		Object.hasOwn(requestOperations.replace, "*")
	) {
		throw new Error(`${label} must not replace all request headers`);
	}
	for (const headerName of REQUIRED_HEADERS) {
		const destructivePattern = deletePatterns.find(
			(pattern) => typeof pattern === "string" && deletePatternMatchesHeader(pattern, headerName),
		);
		if (destructivePattern) {
			throw new Error(`${label} deletes ${headerName} through pattern ${JSON.stringify(destructivePattern)}`);
		}

		for (const operationName of ["add", "replace"]) {
			if (matchingOperationEntries(requestOperations[operationName], headerName).length > 0) {
				throw new Error(`${label} must not ${operationName} ${headerName}`);
			}
		}

		const setEntries = matchingOperationEntries(requestOperations.set, headerName);
		if (
			setEntries.length !== 1 ||
			!Array.isArray(setEntries[0][1]) ||
			setEntries[0][1].length !== 1 ||
			setEntries[0][1][0] !== REMOTE_HOST_PLACEHOLDER
		) {
			throw new Error(`${label} must overwrite ${headerName} exactly once with ${REMOTE_HOST_PLACEHOLDER}`);
		}
	}
}

function adaptCaddyfile(configPath, caddyBinary) {
	const result = spawnSync(caddyBinary, ["adapt", "--config", configPath, "--adapter", "caddyfile"], {
		encoding: "utf8",
		maxBuffer: 4 * 1024 * 1024,
	});
	if (result.error) throw new Error(`Unable to run ${caddyBinary}: ${result.error.message}`);
	if (result.status !== 0) {
		throw new Error(`Caddy could not adapt ${configPath}: ${result.stderr.trim() || `exit ${result.status}`}`);
	}
	try {
		return JSON.parse(result.stdout);
	} catch {
		throw new Error(`Caddy returned invalid adapted JSON for ${configPath}`);
	}
}

function main() {
	const defaultConfig = fileURLToPath(new URL("./Caddyfile", import.meta.url));
	const configPath = resolve(process.argv[2] ?? defaultConfig);
	const caddyBinary = process.argv[3] ?? "/usr/bin/caddy";
	const adaptedConfig = adaptCaddyfile(configPath, caddyBinary);
	validateAdaptedCaddyForwardedHeaders(adaptedConfig, configPath);
	console.log(`Verified overwrite-only client IP forwarding in ${configPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
