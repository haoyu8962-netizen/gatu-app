#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { validateListener } from "./runtime-listener.mjs";

const EXPECTED_MAINNET_ORIGIN = "https://app.gatu.ai";
const EXPECTED_TESTNET_ORIGIN = "https://testnet.gatu.ai";
const MAINNET_RELEASE_PROFILES = new Map([
	["external-only", { sponsored: "" }],
	["both", { sponsored: "true" }],
]);
const LEGACY_MAINNET_EXTERNAL_GATE = "VITE_CCTP_EXTERNAL_DEPOSIT_MAINNET_ENABLED";
const OPTIONAL_BOOLEAN_BUILD_FLAGS = [
	"VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED",
	"VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED",
];
const FORBIDDEN_PRODUCTION_ENV_FILES = [".env", ".env.production", ".env.production.local"];

function fail(message) {
	throw new Error(message);
}

function parseEnvironmentFile(filePath) {
	let source;
	try {
		source = readFileSync(filePath, "utf8");
	} catch (error) {
		fail(`Cannot read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
	}

	const values = new Map();
	for (const [index, line] of source.split(/\r?\n/).entries()) {
		const trimmed = line.trim();
		if (trimmed.length === 0 || trimmed.startsWith("#")) continue;

		const match = /^([A-Za-z_][A-Za-z0-9_]*)[\t ]*=(.*)$/.exec(trimmed);
		if (!match) fail(`${filePath}:${index + 1} must use KEY=value syntax without export.`);

		const [, name, rawValue] = match;
		if (values.has(name)) fail(`${filePath}:${index + 1} duplicates ${name}.`);
		values.set(name, rawValue.trim());
	}

	return values;
}

function requireValue(values, filePath, name) {
	if (!values.has(name)) fail(`${filePath} must declare ${name}.`);
	return values.get(name);
}

function requireExactValue(values, filePath, name, expected) {
	const actual = requireValue(values, filePath, name);
	if (actual !== expected) {
		fail(`${filePath} requires ${name}=${expected || "<empty>"}; received ${actual || "<empty>"}.`);
	}
}

function validateBuildEnvironment(values, filePath, releaseMode) {
	const releaseProfile = MAINNET_RELEASE_PROFILES.get(releaseMode);
	if (!releaseProfile) fail(`Unsupported validated mainnet CCTP release mode: ${releaseMode}.`);

	const privyAppId = requireValue(values, filePath, "VITE_PRIVY_APP_ID");
	if (!/^[A-Za-z0-9_-]+$/.test(privyAppId)) {
		fail(`${filePath} requires a non-empty, unquoted VITE_PRIVY_APP_ID.`);
	}

	requireExactValue(values, filePath, "VITE_HYPERLIQUID_TESTNET", "");
	requireExactValue(values, filePath, "VITE_HYPERLIQUID_AGENT_NAME", "gatu");
	const legacyMainnetExternalGate = values.get(LEGACY_MAINNET_EXTERNAL_GATE);
	if (legacyMainnetExternalGate !== undefined && legacyMainnetExternalGate !== "true") {
		fail(
			`${filePath} may omit ${LEGACY_MAINNET_EXTERNAL_GATE} or keep the legacy acknowledgement at the exact literal true; Mainnet external deposits cannot be disabled by build configuration.`,
		);
	}
	requireExactValue(values, filePath, "VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED", releaseProfile.sponsored);

	for (const name of OPTIONAL_BOOLEAN_BUILD_FLAGS) {
		const value = requireValue(values, filePath, name);
		if (value !== "" && value !== "true") {
			fail(`${filePath} requires ${name} to be empty or the exact literal true.`);
		}
	}

	for (const name of ["VITE_MOBILE_PAIRING_CREATE_ENABLED", "VITE_MOBILE_PAIRING_IMPORT_ENABLED"]) {
		if (![undefined, "", "false", "true"].includes(values.get(name)))
			fail(`${filePath} requires ${name} to be absent, empty, false or true without quotes.`);
	}
	if (
		values.get("VITE_MOBILE_PAIRING_CREATE_ENABLED") === "true" &&
		values.get("VITE_MOBILE_PAIRING_IMPORT_ENABLED") !== "true"
	)
		fail("Mobile pairing CREATE requires IMPORT=true.");
	return releaseProfile;
}

function validateRuntimeEnvironment(values, filePath) {
	validateListener(Object.fromEntries(values));
	requireExactValue(values, filePath, "GATU_MAINNET_PUBLIC_BASE_URL", EXPECTED_MAINNET_ORIGIN);
	requireExactValue(values, filePath, "GATU_TESTNET_PUBLIC_BASE_URL", EXPECTED_TESTNET_ORIGIN);

	const ipdataApiKey = requireValue(values, filePath, "IPDATA_API_KEY");
	if (ipdataApiKey.length === 0 || /^(['"]).*\1$/.test(ipdataApiKey)) {
		fail(`${filePath} requires a non-empty, unquoted IPDATA_API_KEY.`);
	}

	const releaseMode = requireValue(values, filePath, "GATU_CCTP_MAINNET_RELEASE_MODE");
	if (!MAINNET_RELEASE_PROFILES.has(releaseMode)) {
		fail(
			`${filePath} requires GATU_CCTP_MAINNET_RELEASE_MODE to be external-only or both; received ${releaseMode || "<empty>"}.`,
		);
	}
	return releaseMode;
}

function validateViteEnvironmentDirectory(directoryPath) {
	for (const fileName of FORBIDDEN_PRODUCTION_ENV_FILES) {
		const filePath = resolve(directoryPath, fileName);
		if (existsSync(filePath)) {
			fail(`${filePath} must be removed because it can override the validated production .env.local.`);
		}
	}
}

function main() {
	const [buildEnvironmentPath, runtimeEnvironmentPath, viteEnvironmentDirectory] = process.argv.slice(2);
	if (!buildEnvironmentPath || !runtimeEnvironmentPath || !viteEnvironmentDirectory) {
		fail("Usage: node deploy/validate-production-env.mjs <build-env> <runtime-env> <vite-env-directory>");
	}

	validateViteEnvironmentDirectory(viteEnvironmentDirectory);
	const runtimeEnvironment = parseEnvironmentFile(runtimeEnvironmentPath);
	const releaseMode = validateRuntimeEnvironment(runtimeEnvironment, runtimeEnvironmentPath);
	const buildEnvironment = parseEnvironmentFile(buildEnvironmentPath);
	const mainnetProfile = validateBuildEnvironment(buildEnvironment, buildEnvironmentPath, releaseMode);

	const testnetExternal = requireValue(
		buildEnvironment,
		buildEnvironmentPath,
		"VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED",
	);
	const testnetSponsored = requireValue(
		buildEnvironment,
		buildEnvironmentPath,
		"VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED",
	);
	process.stdout.write(
		[
			"Production environment contract validated:",
			`mainnet=${releaseMode}`,
			"mainnet-external=enabled",
			`mainnet-sponsored=${mainnetProfile.sponsored === "true" ? "enabled" : "disabled"}`,
			`testnet-external=${testnetExternal === "true" ? "enabled" : "disabled"}`,
			`testnet-sponsored=${testnetSponsored === "true" ? "enabled" : "disabled"}`,
			`mobile-create=${buildEnvironment.get("VITE_MOBILE_PAIRING_CREATE_ENABLED") === "true"}`,
			`mobile-import=${buildEnvironment.get("VITE_MOBILE_PAIRING_IMPORT_ENABLED") === "true"}`,
		].join(" ") + "\n",
	);
}

try {
	main();
} catch (error) {
	process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
}
