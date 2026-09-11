import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import { spawnSync } from "node:child_process";

const SCRIPT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "validate-production-env.mjs");
const temporaryDirectories = [];
const MAINNET_RELEASE_PROFILES = [
	{ releaseMode: "external-only", mainnetSponsored: "" },
	{ releaseMode: "both", mainnetSponsored: "true" },
];

function createEnvironmentFiles({
	releaseMode = "external-only",
	mainnetExternal = null,
	mainnetSponsored = "",
	testnetExternal = "true",
	testnetSponsored = "true",
	testnetBuild = "",
	agentName = "gatu",
	mainnetOrigin = "https://app.gatu.ai",
	testnetOrigin = "https://testnet.gatu.ai",
	ipdataApiKey = "ipdata-api-key",
	host = "127.0.0.1",
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
			...(mainnetExternal === null ? [] : [`VITE_CCTP_EXTERNAL_DEPOSIT_MAINNET_ENABLED=${mainnetExternal}`]),
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
			`HOST=${host}`,
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

test("accepts every exact always-external mainnet CCTP release profile", () => {
	for (const profile of MAINNET_RELEASE_PROFILES) {
		const result = validate(profile);
		assert.equal(result.status, 0, `${profile.releaseMode}: ${result.stderr}`);
		assert.match(result.stdout, new RegExp(`mainnet=${profile.releaseMode}`));
		assert.match(result.stdout, /mainnet-external=enabled/);
		assert.match(
			result.stdout,
			new RegExp(`mainnet-sponsored=${profile.mainnetSponsored === "true" ? "enabled" : "disabled"}`),
		);
	}
});

test("accepts the legacy exact-true mainnet external acknowledgement in every profile", () => {
	for (const profile of MAINNET_RELEASE_PROFILES) {
		const result = validate({ ...profile, mainnetExternal: "true" });
		assert.equal(result.status, 0, `${profile.releaseMode}: ${result.stderr}`);
		assert.match(result.stdout, /mainnet-external=enabled/);
	}
});

test("rejects every mainnet release mode and sponsored gate mismatch", () => {
	for (const profile of MAINNET_RELEASE_PROFILES) {
		const mainnetSponsored = profile.mainnetSponsored === "true" ? "" : "true";
		const result = validate({ releaseMode: profile.releaseMode, mainnetSponsored });
		assert.equal(
			result.status,
			1,
			`${profile.releaseMode} unexpectedly accepted sponsored=${mainnetSponsored || "<empty>"}`,
		);
		assert.match(result.stderr, /VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED/);
	}
});

test("rejects legacy attempts to disable the permanent mainnet external path", () => {
	for (const legacyValue of ["", "false", "TRUE", "1", '"true"']) {
		const result = validate({ mainnetExternal: legacyValue });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /VITE_CCTP_EXTERNAL_DEPOSIT_MAINNET_ENABLED/);
	}
});

test("rejects ambiguous mainnet sponsored gate values", () => {
	for (const profile of MAINNET_RELEASE_PROFILES) {
		for (const ambiguous of ["false", "TRUE", "1", '"true"']) {
			const sponsoredResult = validate({ ...profile, mainnetSponsored: ambiguous });
			assert.equal(sponsoredResult.status, 1);
			assert.match(sponsoredResult.stderr, /VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED/);
		}
	}
});

test("rejects unsupported mainnet release modes", () => {
	for (const releaseMode of ["", "disabled", "sponsored-only", "enabled", "all", "Both"]) {
		const result = validate({ releaseMode });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /external-only or both/);
	}
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

test("mobile pairing flags are explicit and reject ambiguous release intent", () => {
	for (const value of ["TRUE", "1", '\"true\"', "yes"])
		assert.equal(validate({ extraBuild: `VITE_MOBILE_PAIRING_IMPORT_ENABLED=${value}` }).status, 1);
	assert.equal(validate({ extraBuild: "VITE_MOBILE_PAIRING_CREATE_ENABLED=true" }).status, 1);
	for (const extraBuild of [
		"",
		"VITE_MOBILE_PAIRING_CREATE_ENABLED=false",
		"VITE_MOBILE_PAIRING_IMPORT_ENABLED=true",
		"VITE_MOBILE_PAIRING_CREATE_ENABLED=true\nVITE_MOBILE_PAIRING_IMPORT_ENABLED=true",
	]) {
		const result = validate({ extraBuild });
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /mobile-create=(true|false) mobile-import=(true|false)/);
	}
});

test("rejects runtime listeners that can bypass the canonical loopback proxy", () => {
	for (const host of ["0.0.0.0", "::", "localhost", ""]) {
		const result = validate({ host });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /HOST=127\.0\.0\.1/);
	}
});
