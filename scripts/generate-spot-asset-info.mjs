import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const EXPECTED_SCHEMA = "hyperliquid-asset-info-snapshot/v1";
const SUPPORTED_DESCRIPTION_LOCALES = new Set(["en", "es", "fr", "zh-CN"]);
const DESCRIPTION_TRUST_TIER = 1;
const DESCRIPTION_ORIGIN = "hyperliquid-official-i18n";
const SOCIAL_TRUST_TIER = 3;
const SOCIAL_ORIGIN = "hyperliquid-frontend-curated-whitelist";
const UNIT_DOC_TRUST_TIER = 2;
const UNIT_SOCIAL_LINKS = {
	x: "https://x.com/unitxyz",
	website: "https://hyperunit.xyz/",
};
const OUTPUT_DIRECTORY = resolve("apps/terminal/src/domain/market");

function readSnapshot(inputPath) {
	const snapshot = JSON.parse(readFileSync(inputPath, "utf8"));
	if (snapshot.schema !== EXPECTED_SCHEMA) {
		throw new Error(`Unsupported asset info schema: ${String(snapshot.schema)}`);
	}
	if (!Array.isArray(snapshot.spot)) {
		throw new Error("Asset info snapshot must contain a spot array.");
	}
	if (typeof snapshot.generatedAt !== "string" || snapshot.generatedAt.length === 0) {
		throw new Error("Asset info snapshot must contain generatedAt.");
	}
	return snapshot;
}

function requireIdentity(entry) {
	if (
		typeof entry.pair !== "string" ||
		entry.pair.length === 0 ||
		typeof entry.base !== "string" ||
		entry.base.length === 0 ||
		typeof entry.quote !== "string" ||
		entry.quote.length === 0
	) {
		throw new Error("Every spot asset info entry must contain pair, base, and quote.");
	}
	return { pair: entry.pair, base: entry.base, quote: entry.quote };
}

function isUsableDescription(value) {
	return typeof value === "string" && value.trim().length > 0 && !value.trimEnd().endsWith("\\");
}

function isSafeExternalUrl(value) {
	if (typeof value !== "string" || !value.startsWith("https://")) return false;
	try {
		return new URL(value).protocol === "https:";
	} catch {
		return false;
	}
}

function sortEntries(entries) {
	return Object.fromEntries(
		Object.entries(entries).sort(([left], [right]) => {
			const leftIndex = left.startsWith("@") ? Number(left.slice(1)) : -1;
			const rightIndex = right.startsWith("@") ? Number(right.slice(1)) : -1;
			if (Number.isFinite(leftIndex) && Number.isFinite(rightIndex) && leftIndex !== rightIndex) {
				return leftIndex - rightIndex;
			}
			return left.localeCompare(right);
		}),
	);
}

function createDescriptionEntries(spotEntries) {
	const descriptions = {};
	for (const entry of spotEntries) {
		if (entry.trustTier !== DESCRIPTION_TRUST_TIER || entry.origin !== DESCRIPTION_ORIGIN) continue;
		const { pair, base, quote } = requireIdentity(entry);
		if (descriptions[pair]) throw new Error(`Duplicate spot description identity: ${pair}`);

		const localizedDescriptions = {};
		for (const [locale, value] of Object.entries(entry.desc ?? {})) {
			if (SUPPORTED_DESCRIPTION_LOCALES.has(locale) && isUsableDescription(value)) {
				localizedDescriptions[locale] = value.trim();
			}
		}
		if (Object.keys(localizedDescriptions).length > 0) {
			descriptions[pair] = { base, quote, descriptions: localizedDescriptions };
		}
	}
	return sortEntries(descriptions);
}

function createSocialEntries(spotEntries) {
	const socials = {};
	for (const entry of spotEntries) {
		const { pair, base, quote } = requireIdentity(entry);
		const links = {};
		let displayName;
		if (entry.socials?.trustTier === SOCIAL_TRUST_TIER && entry.socials?.origin === SOCIAL_ORIGIN) {
			displayName = entry.socials.displayName;
			for (const field of ["x", "telegram", "website"]) {
				const value = entry.socials[field];
				if (isSafeExternalUrl(value)) links[field] = value;
			}
		} else if (entry.unit?.docTrustTier === UNIT_DOC_TRUST_TIER) {
			displayName = entry.unit.displayName;
			Object.assign(links, UNIT_SOCIAL_LINKS);
		}
		if (Object.keys(links).length > 0) {
			if (typeof displayName !== "string" || displayName.trim().length === 0) {
				throw new Error(`Spot social metadata is missing a display name: ${pair}`);
			}
			if (socials[pair]) throw new Error(`Duplicate spot social identity: ${pair}`);
			socials[pair] = { base, quote, displayName: displayName.trim(), ...links };
		}
	}
	return sortEntries(socials);
}

function createGeneratedModule(typeName, exportName, entries, generatedAt) {
	return `import type { ${typeName} } from "./spot-asset-info";

export const SPOT_ASSET_INFO_GENERATED_AT = ${JSON.stringify(generatedAt)};

export const ${exportName}: Readonly<Record<string, ${typeName}>> = ${JSON.stringify(entries, null, "\t")};
`;
}

const inputArgument = process.argv[2];
if (!inputArgument) {
	throw new Error("Usage: node scripts/generate-spot-asset-info.mjs <snapshot.json>");
}

const snapshot = readSnapshot(resolve(inputArgument));
const descriptions = createDescriptionEntries(snapshot.spot);
const socials = createSocialEntries(snapshot.spot);
const descriptionOutputPath = resolve(OUTPUT_DIRECTORY, "spot-asset-descriptions.generated.ts");
const socialOutputPath = resolve(OUTPUT_DIRECTORY, "spot-asset-socials.generated.ts");

writeFileSync(
	descriptionOutputPath,
	createGeneratedModule(
		"SpotAssetDescriptionEntry",
		"SPOT_ASSET_DESCRIPTIONS",
		descriptions,
		snapshot.generatedAt,
	),
);
writeFileSync(
	socialOutputPath,
	createGeneratedModule("SpotAssetSocialEntry", "SPOT_ASSET_SOCIALS", socials, snapshot.generatedAt),
);
execFileSync(resolve("node_modules/.bin/biome"), ["format", "--write", descriptionOutputPath, socialOutputPath], {
	stdio: "inherit",
});

console.log(
	`Generated ${Object.keys(descriptions).length} spot descriptions and ${Object.keys(socials).length} spot social entries.`,
);
