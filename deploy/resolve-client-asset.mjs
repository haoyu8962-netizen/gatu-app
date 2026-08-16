#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { init, parse } from "es-module-lexer";

const CLIENT_ASSET_PATH = /^\/assets\/[A-Za-z0-9_][A-Za-z0-9._-]*\.js$/;
const TARGET_NAME = /^[a-z0-9][a-z0-9-]*$/;
const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_NODES = 96;
const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_OVERALL_TIMEOUT_MS = 60_000;

function parseAttributes(tag) {
	const attributes = new Map();
	const pattern = /([A-Za-z_:][A-Za-z0-9:._-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
	for (const match of tag.matchAll(pattern)) {
		const [, name, doubleQuoted, singleQuoted, unquoted] = match;
		attributes.set(name.toLowerCase(), doubleQuoted ?? singleQuoted ?? unquoted ?? "");
	}
	return attributes;
}

function validateClientAssetPath(path, label) {
	if (!CLIENT_ASSET_PATH.test(path)) {
		throw new Error(`${label} must be a root-relative, flat JavaScript asset path; received ${JSON.stringify(path)}`);
	}
	return path;
}

export function extractHtmlModuleAssetPaths(html) {
	const paths = new Set();
	for (const match of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
		const tag = match[0];
		const tagName = /^<(script|link)\b/i.exec(tag)?.[1]?.toLowerCase();
		const attributes = parseAttributes(tag);
		let path;
		if (tagName === "script" && attributes.get("type")?.toLowerCase() === "module") {
			path = attributes.get("src");
		} else if (
			tagName === "link" &&
			attributes
				.get("rel")
				?.toLowerCase()
				.split(/\s+/)
				.includes("modulepreload")
		) {
			path = attributes.get("href");
		}
		if (path) paths.add(validateClientAssetPath(path, "HTML module asset"));
	}
	if (paths.size === 0) throw new Error("HTML did not reference a client module script or modulepreload asset");
	return [...paths];
}

function resolveClientImportPath(specifier, parentPath, origin) {
	if (specifier.includes("\\") || specifier.includes("%") || specifier.includes("?") || specifier.includes("#")) {
		throw new Error(`Client asset ${parentPath} contains an unsafe import specifier ${JSON.stringify(specifier)}`);
	}
	if (specifier.split("/").includes("..")) {
		throw new Error(`Client asset ${parentPath} contains a parent-directory import ${JSON.stringify(specifier)}`);
	}
	if (!specifier.startsWith("./") && !specifier.startsWith("/")) {
		throw new Error(`Client asset ${parentPath} contains a non-local import specifier ${JSON.stringify(specifier)}`);
	}

	const resolved = new URL(specifier, new URL(parentPath, origin));
	if (resolved.origin !== origin.origin || resolved.search || resolved.hash) {
		throw new Error(`Client asset ${parentPath} imports outside the permitted asset origin`);
	}
	if (!resolved.pathname.endsWith(".js")) return;
	return validateClientAssetPath(resolved.pathname, `Import from ${parentPath}`);
}

async function readJavaScriptResponse(response, path, maxFileBytes) {
	const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
	if (!contentType.includes("javascript") && !contentType.includes("ecmascript")) {
		throw new Error(`Client asset ${path} returned unexpected Content-Type ${JSON.stringify(contentType || "missing")}`);
	}

	const declaredLength = Number(response.headers.get("content-length"));
	if (Number.isFinite(declaredLength) && declaredLength > maxFileBytes) {
		throw new Error(`Client asset ${path} exceeds the ${maxFileBytes}-byte per-file limit`);
	}
	if (!response.body) throw new Error(`Client asset ${path} returned an empty response body`);

	const chunks = [];
	let bytes = 0;
	const reader = response.body.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		bytes += value.byteLength;
		if (bytes > maxFileBytes) {
			await reader.cancel();
			throw new Error(`Client asset ${path} exceeds the ${maxFileBytes}-byte per-file limit`);
		}
		chunks.push(Buffer.from(value));
	}
	return { bytes, source: Buffer.concat(chunks, bytes).toString("utf8") };
}

async function fetchJavaScript(path, origin, fetchImpl, requestTimeoutMs, maxFileBytes, overallSignal) {
	let response;
	try {
		response = await fetchImpl(new URL(path, origin), {
			redirect: "error",
			signal: AbortSignal.any([AbortSignal.timeout(requestTimeoutMs), overallSignal]),
		});
	} catch (error) {
		if (overallSignal.aborted) {
			throw new Error(`Client asset graph exceeded its overall timeout while fetching ${path}`);
		}
		throw new Error(`Failed to fetch client asset ${path}: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!response.ok) throw new Error(`Client asset ${path} returned HTTP ${response.status}`);
	return readJavaScriptResponse(response, path, maxFileBytes);
}

function validatePositiveInteger(value, name) {
	if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
	return value;
}

export async function resolveReachableClientAsset({
	baseUrl,
	html,
	targetName,
	fetchImpl = globalThis.fetch,
	maxDepth = DEFAULT_MAX_DEPTH,
	maxNodes = DEFAULT_MAX_NODES,
	maxFileBytes = DEFAULT_MAX_FILE_BYTES,
	maxTotalBytes = DEFAULT_MAX_TOTAL_BYTES,
	requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
	overallTimeoutMs = DEFAULT_OVERALL_TIMEOUT_MS,
}) {
	if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required");
	if (!TARGET_NAME.test(targetName)) throw new Error(`Invalid client asset target name ${JSON.stringify(targetName)}`);
	validatePositiveInteger(maxDepth, "maxDepth");
	validatePositiveInteger(maxNodes, "maxNodes");
	validatePositiveInteger(maxFileBytes, "maxFileBytes");
	validatePositiveInteger(maxTotalBytes, "maxTotalBytes");
	validatePositiveInteger(requestTimeoutMs, "requestTimeoutMs");
	validatePositiveInteger(overallTimeoutMs, "overallTimeoutMs");

	const parsedBaseUrl = new URL(baseUrl);
	if (parsedBaseUrl.protocol !== "http:" && parsedBaseUrl.protocol !== "https:") {
		throw new Error("baseUrl must use HTTP or HTTPS");
	}
	if (parsedBaseUrl.username || parsedBaseUrl.password) throw new Error("baseUrl must not contain credentials");
	const origin = new URL("/", parsedBaseUrl);
	const targetPattern = new RegExp(`^/assets/${targetName}-[A-Za-z0-9_-]+\\.js$`);
	const overallSignal = AbortSignal.timeout(overallTimeoutMs);

	await init;
	const visited = new Set();
	let pending = extractHtmlModuleAssetPaths(html);
	let totalBytes = 0;

	for (let depth = 0; pending.length > 0; depth++) {
		const layer = [...new Set(pending)].filter((path) => !visited.has(path));
		if (layer.length === 0) break;
		if (depth > maxDepth) throw new Error(`Client asset graph exceeds the maximum depth of ${maxDepth}`);
		if (visited.size + layer.length > maxNodes) {
			throw new Error(`Client asset graph exceeds the maximum node count of ${maxNodes}`);
		}

		const targets = new Set(layer.filter((path) => targetPattern.test(path)));
		const next = [];
		for (const path of layer) {
			visited.add(path);
			const { bytes, source } = await fetchJavaScript(
				path,
				origin,
				fetchImpl,
				requestTimeoutMs,
				maxFileBytes,
				overallSignal,
			);
			totalBytes += bytes;
			if (totalBytes > maxTotalBytes) {
				throw new Error(`Client asset graph exceeds the ${maxTotalBytes}-byte aggregate limit`);
			}

			const [imports] = parse(source, path);
			for (const imported of imports) {
				if (typeof imported.n !== "string") continue;
				const importedPath = resolveClientImportPath(imported.n, path, origin);
				if (!importedPath) continue;
				if (targetPattern.test(importedPath)) targets.add(importedPath);
				else if (!visited.has(importedPath)) next.push(importedPath);
			}
		}

		if (targets.size > 1) {
			throw new Error(
				`Client graph discovery layer references multiple ${targetName} assets: ${[...targets].sort().join(", ")}`,
			);
		}
		if (targets.size === 1) {
			const [target] = targets;
			if (!visited.has(target)) {
				if (depth + 1 > maxDepth) {
					throw new Error(`Client asset graph exceeds the maximum depth of ${maxDepth}`);
				}
				if (visited.size + 1 > maxNodes) {
					throw new Error(`Client asset graph exceeds the maximum node count of ${maxNodes}`);
				}
				const { bytes } = await fetchJavaScript(
					target,
					origin,
					fetchImpl,
					requestTimeoutMs,
					maxFileBytes,
					overallSignal,
				);
				visited.add(target);
				totalBytes += bytes;
				if (totalBytes > maxTotalBytes) {
					throw new Error(`Client asset graph exceeds the ${maxTotalBytes}-byte aggregate limit`);
				}
			}
			return target;
		}

		pending = next;
	}

	throw new Error(`Client asset graph did not reference ${targetName}-*.js`);
}

async function main() {
	const [baseUrl, htmlFile, targetName] = process.argv.slice(2);
	if (!baseUrl || !htmlFile || !targetName) {
		throw new Error("Usage: resolve-client-asset.mjs <base-url> <html-file> <target-name>");
	}
	const target = await resolveReachableClientAsset({
		baseUrl,
		html: readFileSync(htmlFile, "utf8"),
		targetName,
	});
	process.stdout.write(target);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
	main().catch((error) => {
		process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	});
}
