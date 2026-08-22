import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	createDescriptionEntries,
	createGeneratedModule,
	createSocialEntries,
	createSpotIdentityEntries,
	validateAssetInfoSnapshot,
} from "./spot-asset-info-generator.mjs";

const SPOT_META_URL = "https://api.hyperliquid.xyz/info";
const OUTPUT_DIRECTORY = resolve("apps/terminal/src/domain/market");

function readJsonFile(inputPath) {
	return JSON.parse(readFileSync(resolve(inputPath), "utf8"));
}

function readSnapshot(inputPath) {
	const source = readFileSync(resolve(inputPath), "utf8");
	return {
		data: validateAssetInfoSnapshot(JSON.parse(source)),
		sha256: createHash("sha256").update(source).digest("hex"),
	};
}

async function fetchSpotMeta() {
	const response = await fetch(SPOT_META_URL, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ type: "spotMeta" }),
	});
	if (!response.ok) {
		throw new Error(`Failed to fetch spot metadata: HTTP ${response.status}.`);
	}
	return response.json();
}

const inputArgument = process.argv[2];
if (!inputArgument) {
	throw new Error("Usage: node scripts/generate-spot-asset-info.mjs <snapshot.json> [spot-meta.json]");
}

const snapshotSource = readSnapshot(inputArgument);
const snapshot = snapshotSource.data;
const spotMeta = process.argv[3] ? readJsonFile(process.argv[3]) : await fetchSpotMeta();
const spotIdentities = createSpotIdentityEntries(spotMeta);
const descriptions = createDescriptionEntries(snapshot.spot, spotIdentities);
const socials = createSocialEntries(snapshot.spot, spotIdentities);
const descriptionOutputPath = resolve(OUTPUT_DIRECTORY, "spot-asset-descriptions.generated.ts");
const socialOutputPath = resolve(OUTPUT_DIRECTORY, "spot-asset-socials.generated.ts");

writeFileSync(
	descriptionOutputPath,
	createGeneratedModule(
		"SpotAssetDescriptionEntry",
		"SPOT_ASSET_DESCRIPTIONS",
		descriptions,
		snapshot.generatedAt,
		snapshotSource.sha256,
	),
);
writeFileSync(
	socialOutputPath,
	createGeneratedModule(
		"SpotAssetSocialEntry",
		"SPOT_ASSET_SOCIALS",
		socials,
		snapshot.generatedAt,
		snapshotSource.sha256,
	),
);
execFileSync(resolve("node_modules/.bin/biome"), ["format", "--write", descriptionOutputPath, socialOutputPath], {
	stdio: "inherit",
});

console.log(
	`Generated ${Object.keys(descriptions).length} spot descriptions and ${Object.keys(socials).length} spot social entries.`,
);
