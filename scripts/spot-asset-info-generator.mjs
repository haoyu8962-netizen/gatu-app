export const EXPECTED_SCHEMA = "hyperliquid-asset-info-snapshot/v1";
export const SUPPORTED_DESCRIPTION_LOCALES = new Set(["en", "es", "fr", "zh-CN"]);

const DESCRIPTION_TRUST_TIER = 1;
const DESCRIPTION_ORIGIN = "hyperliquid-official-i18n";
const SOCIAL_TRUST_TIER = 3;
const SOCIAL_ORIGIN = "hyperliquid-frontend-curated-whitelist";
const UNIT_DOC_TRUST_TIER = 2;
const TOKEN_ID_PATTERN = /^0x[0-9a-f]{32}$/i;
const SHORTENER_HOSTS = new Set(["bit.ly", "goo.gl", "shorturl.at", "t.co", "tinyurl.com"]);
const UNIT_SOCIAL_LINKS = {
	x: "https://x.com/unitxyz",
	website: "https://hyperunit.xyz/",
};

export function validateAssetInfoSnapshot(snapshot) {
	if (snapshot?.schema !== EXPECTED_SCHEMA) {
		throw new Error(`Unsupported asset info schema: ${String(snapshot?.schema)}`);
	}
	if (!Array.isArray(snapshot.spot)) {
		throw new Error("Asset info snapshot must contain a spot array.");
	}
	if (typeof snapshot.generatedAt !== "string" || snapshot.generatedAt.length === 0) {
		throw new Error("Asset info snapshot must contain generatedAt.");
	}
	return snapshot;
}

function requireTokenId(value, context) {
	if (typeof value !== "string" || !TOKEN_ID_PATTERN.test(value)) {
		throw new Error(`Invalid spot token ID for ${context}.`);
	}
	return value.toLowerCase();
}

export function createSpotIdentityEntries(spotMeta) {
	if (!Array.isArray(spotMeta?.tokens) || !Array.isArray(spotMeta?.universe)) {
		throw new Error("Spot metadata must contain tokens and universe arrays.");
	}

	const tokensByIndex = new Map();
	for (const token of spotMeta.tokens) {
		if (!Number.isInteger(token?.index) || typeof token?.name !== "string") {
			throw new Error("Spot metadata contains an invalid token.");
		}
		tokensByIndex.set(token.index, token);
	}

	const identities = {};
	for (const pair of spotMeta.universe) {
		if (typeof pair?.name !== "string" || !Array.isArray(pair.tokens) || pair.tokens.length !== 2) {
			throw new Error("Spot metadata contains an invalid pair.");
		}
		const baseToken = tokensByIndex.get(pair.tokens[0]);
		const quoteToken = tokensByIndex.get(pair.tokens[1]);
		if (!baseToken || !quoteToken) {
			throw new Error(`Spot metadata references a missing token for ${pair.name}.`);
		}
		identities[pair.name] = {
			base: baseToken.name,
			quote: quoteToken.name,
			baseTokenId: requireTokenId(baseToken.tokenId, `${pair.name} base`),
			quoteTokenId: requireTokenId(quoteToken.tokenId, `${pair.name} quote`),
		};
	}
	return identities;
}

function requireIdentity(entry, spotIdentities) {
	if (
		typeof entry?.pair !== "string" ||
		entry.pair.length === 0 ||
		typeof entry.base !== "string" ||
		entry.base.length === 0 ||
		typeof entry.quote !== "string" ||
		entry.quote.length === 0
	) {
		throw new Error("Every spot asset info entry must contain pair, base, and quote.");
	}

	const identity = spotIdentities[entry.pair];
	if (!identity) {
		throw new Error(`Spot metadata does not contain ${entry.pair}.`);
	}
	if (identity.base !== entry.base || identity.quote !== entry.quote) {
		throw new Error(
			`Spot identity mismatch for ${entry.pair}: expected ${entry.base}/${entry.quote}, received ${identity.base}/${identity.quote}.`,
		);
	}
	return { pair: entry.pair, ...identity };
}

export function isUsableDescription(value) {
	if (typeof value !== "string") return false;
	const normalized = value.trim();
	return normalized.length > 0 && !normalized.endsWith("\\") && !normalized.includes("\uFFFD");
}

function normalizeDescription(value) {
	return value.trim().replaceAll("HyperLiquid", "Hyperliquid");
}

function getNormalizedHostname(url) {
	return url.hostname.toLowerCase().replace(/^www\./, "");
}

export function classifySocialUrl(value) {
	if (typeof value !== "string") return null;
	let url;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	if (url.protocol !== "https:") return null;

	const hostname = getNormalizedHostname(url);
	if (SHORTENER_HOSTS.has(hostname)) return null;
	if (hostname === "x.com" || hostname === "twitter.com") return { field: "x", url: url.href };
	if (hostname === "t.me" || hostname === "telegram.me") return { field: "telegram", url: url.href };
	return { field: "website", url: url.href };
}

function collectSocialLinks(values, pair) {
	const links = {};
	for (const value of values) {
		const classified = classifySocialUrl(value);
		if (!classified) continue;
		const existing = links[classified.field];
		if (existing && existing !== classified.url) {
			throw new Error(`Conflicting ${classified.field} links for ${pair}.`);
		}
		links[classified.field] = classified.url;
	}
	return links;
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

export function createDescriptionEntries(spotEntries, spotIdentities) {
	const descriptions = {};
	for (const entry of spotEntries) {
		if (entry.trustTier !== DESCRIPTION_TRUST_TIER || entry.origin !== DESCRIPTION_ORIGIN) continue;
		const identity = requireIdentity(entry, spotIdentities);
		const { pair, ...generatedIdentity } = identity;
		if (descriptions[pair]) throw new Error(`Duplicate spot description identity: ${pair}`);

		const localizedDescriptions = {};
		for (const [locale, value] of Object.entries(entry.desc ?? {})) {
			if (SUPPORTED_DESCRIPTION_LOCALES.has(locale) && isUsableDescription(value)) {
				localizedDescriptions[locale] = normalizeDescription(value);
			}
		}
		if (Object.keys(localizedDescriptions).length > 0) {
			descriptions[pair] = {
				...generatedIdentity,
				descriptionKind: entry.unit ? "provider" : "asset",
				descriptions: localizedDescriptions,
			};
		}
	}
	return sortEntries(descriptions);
}

export function createSocialEntries(spotEntries, spotIdentities) {
	const socials = {};
	for (const entry of spotEntries) {
		const identity = requireIdentity(entry, spotIdentities);
		const { pair, ...generatedIdentity } = identity;
		let displayName;
		let links = {};
		if (entry.socials?.trustTier === SOCIAL_TRUST_TIER && entry.socials?.origin === SOCIAL_ORIGIN) {
			displayName = entry.socials.displayName;
			links = collectSocialLinks([entry.socials.x, entry.socials.telegram, entry.socials.website], pair);
		} else if (entry.unit?.docTrustTier === UNIT_DOC_TRUST_TIER) {
			displayName = entry.unit.displayName;
			links = collectSocialLinks(Object.values(UNIT_SOCIAL_LINKS), pair);
		}
		if (Object.keys(links).length > 0) {
			if (typeof displayName !== "string" || displayName.trim().length === 0) {
				throw new Error(`Spot social metadata is missing a display name: ${pair}`);
			}
			if (socials[pair]) throw new Error(`Duplicate spot social identity: ${pair}`);
			socials[pair] = { ...generatedIdentity, displayName: displayName.trim(), ...links };
		}
	}
	return sortEntries(socials);
}

export function createGeneratedModule(typeName, exportName, entries, generatedAt, sourceSha256) {
	return `import type { ${typeName} } from "./spot-asset-info";

export const SPOT_ASSET_INFO_GENERATED_AT = ${JSON.stringify(generatedAt)};
export const SPOT_ASSET_INFO_SOURCE_SHA256 = ${JSON.stringify(sourceSha256)};

export const ${exportName}: Readonly<Record<string, ${typeName}>> = ${JSON.stringify(entries, null, "\t")};
`;
}
