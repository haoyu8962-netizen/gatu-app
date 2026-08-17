import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import { spawnSync } from "node:child_process";

const SCRIPT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "validate-production-env.mjs");
const temporaryDirectories = [];

function createEnvironmentFiles({
	releaseMode = "sponsored-only",
	mainnetExternal = "",
	mainnetSponsored = "true",
	testnetExternal = "true",
	testnetSponsored = "true",
	testnetBuild = "",
	agentName = "gatu",
	mainnetOrigin = "https://app.gatu.ai",
	testnetOrigin = "https://testnet.gatu.ai",
	ipdataApiKey = "ipdata-api-key",
	extraBuild = "",
} = {}) {
	const directory = mkdtempSync(resolve(tmpdir(), "gatu-production-env-"));
	temporaryDirectories.push(directory);
	const buildEnvironmentPath = resolve(directory, ".env.local");
	const runtimeEnvironmentPath = resolve(directory, ".env.runtime");

	writeFileSync(
		buildEnvironmentPath,
		[
			"VITE_PRIVY_APP_ID=privy-app-id",
			`VITE_HYPERLIQUID_TESTNET=${testnetBuild}`,
			`VITE_HYPERLIQUID_AGENT_NAME=${agentName}`,
			`VITE_CCTP_EXTERNAL_DEPOSIT_MAINNET_ENABLED=${mainnetExternal}`,
			`VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED=${testnetExternal}`,
			`VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=${mainnetSponsored}`,
			`VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=${testnetSponsored}`,
			extraBuild,
		].join("\n"),
	);
	writeFileSync(
		runtimeEnvironmentPath,
		[
			...(ipdataApiKey === null ? [] : [`IPDATA_API_KEY=${ipdataApiKey}`]),
			`GATU_MAINNET_PUBLIC_BASE_URL=${mainnetOrigin}`,
			`GATU_TESTNET_PUBLIC_BASE_URL=${testnetOrigin}`,
			`GATU_CCTP_MAINNET_RELEASE_MODE=${releaseMode}`,
		].join("\n"),
	);

	return { buildEnvironmentPath, directory, runtimeEnvironmentPath };
}

function validate(options) {
	const { buildEnvironmentPath, directory, runtimeEnvironmentPath } = createEnvironmentFiles(options);
	return spawnSync(process.execPath, [SCRIPT_PATH, buildEnvironmentPath, runtimeEnvironmentPath, directory], {
		encoding: "utf8",
	});
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

test("accepts the sponsored-only mainnet production profile", () => {
	const result = validate();
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /mainnet=sponsored-only/);
	assert.match(result.stdout, /mainnet-external=disabled/);
});

test("accepts the emergency disabled profile only when both mainnet paths are disabled", () => {
	const result = validate({ releaseMode: "disabled", mainnetSponsored: "" });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /mainnet=disabled/);
});

test("rejects a mainnet external wallet rollout", () => {
	const result = validate({ mainnetExternal: "true" });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /VITE_CCTP_EXTERNAL_DEPOSIT_MAINNET_ENABLED=<empty>/);
});

test("rejects a sponsored-only profile without the sponsored gate", () => {
	const result = validate({ mainnetSponsored: "" });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true/);
});

test("rejects a testnet-default shared production bundle", () => {
	const result = validate({ testnetBuild: "true" });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /VITE_HYPERLIQUID_TESTNET=<empty>/);
});

test("rejects an Agent slot that can replace another deployment", () => {
	const result = validate({ agentName: "gatu-preview" });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /VITE_HYPERLIQUID_AGENT_NAME=gatu/);
});

test("rejects duplicate build variables", () => {
	const result = validate({ extraBuild: "VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true" });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /duplicates VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED/);
});

test("rejects non-canonical public origins", () => {
	const result = validate({ mainnetOrigin: "https://preview.gatu.ai" });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /GATU_MAINNET_PUBLIC_BASE_URL=https:\/\/app\.gatu\.ai/);
});

test("rejects a missing or quoted geo lookup credential", () => {
	for (const [ipdataApiKey, expectedError] of [
		[null, /must declare IPDATA_API_KEY/],
		["", /non-empty, unquoted IPDATA_API_KEY/],
		['"ipdata-api-key"', /non-empty, unquoted IPDATA_API_KEY/],
		["'ipdata-api-key'", /non-empty, unquoted IPDATA_API_KEY/],
	]) {
		const result = validate({ ipdataApiKey });
		assert.equal(result.status, 1);
		assert.match(result.stderr, expectedError);
	}
});

test("rejects ambiguous testnet gate values", () => {
	const result = validate({ testnetSponsored: "false" });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /empty or the exact literal true/);
});

test("rejects a higher-priority Vite production environment file", () => {
	const paths = createEnvironmentFiles();
	writeFileSync(resolve(paths.directory, ".env.production.local"), "VITE_CCTP_EXTERNAL_DEPOSIT_MAINNET_ENABLED=true\n");
	const result = spawnSync(
		process.execPath,
		[SCRIPT_PATH, paths.buildEnvironmentPath, paths.runtimeEnvironmentPath, paths.directory],
		{ encoding: "utf8" },
	);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /\.env\.production\.local must be removed/);
});
