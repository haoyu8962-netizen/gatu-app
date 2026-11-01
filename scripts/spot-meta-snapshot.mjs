// Writes the spotMeta snapshot that the spot display-name contract test reads
// (docs/spot-market-names.md, "Re-sync"). Inputs are saved `info` responses, so a refresh is reproducible:
//   node scripts/spot-meta-snapshot.mjs <mainnet spotMeta.json> <testnet spotMeta.json> <mainnet meta.json> <YYYY-MM-DD> [testnet indexes]
// The testnet part keeps the tokens the testnet table names or displays, the extra indexes given (the official
// entries left out of the table), their pairs and the pairs' quote tokens; mainnet keeps every token and pair.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TABLE_PATH = resolve("apps/terminal/src/config/spot-token-display-names.ts");
const OUTPUT_PATH = resolve("apps/terminal/src/lib/tests/fixtures/spot-meta-snapshot.ts");

const [mainnetSpotMetaPath, testnetSpotMetaPath, mainnetMetaPath, capturedAt, extraIndexes = ""] =
	process.argv.slice(2);
if (!mainnetSpotMetaPath || !testnetSpotMetaPath || !mainnetMetaPath || !/^\d{4}-\d{2}-\d{2}$/.test(capturedAt ?? "")) {
	throw new Error(
		"usage: node scripts/spot-meta-snapshot.mjs <mainnet spotMeta.json> <testnet spotMeta.json> <mainnet meta.json> <YYYY-MM-DD> [testnet indexes]",
	);
}

function readJson(path) {
	return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function readTestnetTable() {
	const source = readFileSync(TABLE_PATH, "utf8");
	const testnet = source.slice(source.indexOf("Testnet: ["));
	return [...testnet.matchAll(/\[(\d+), "([^"]+)", "([^"]+)"\]/g)].map(([, index, , displayName]) => ({
		index: Number(index),
		displayName,
	}));
}

function assertPlainNames(tokens, network) {
	for (const token of tokens) {
		if (/[\s:]/.test(token.name)) throw new Error(`${network} token ${token.index} has a name the snapshot cannot hold`);
	}
}

function wrap(text, width = 110) {
	const lines = [];
	let line = "";
	for (const word of text.split(" ")) {
		if (line && line.length + 1 + word.length > width) {
			lines.push(line);
			line = word;
		} else {
			line = line ? `${line} ${word}` : word;
		}
	}
	if (line) lines.push(line);
	return lines.map((value) => `\t\t"${value}",`).join("\n");
}

const tokenList = (tokens) => tokens.map((token) => `${token.index}:${token.name}`).join(" ");
const pairList = (pairs) => pairs.map((pair) => `${pair.index}:${pair.tokens[0]}:${pair.tokens[1]}`).join(" ");

const mainnet = readJson(mainnetSpotMetaPath);
const testnet = readJson(testnetSpotMetaPath);
const mainnetPerps = readJson(mainnetMetaPath)
	.universe.filter((asset) => !asset.isDelisted)
	.map((asset) => asset.name);

const testnetTable = readTestnetTable();
const displayNames = new Set(testnetTable.map((entry) => entry.displayName));
const keep = new Set([0, ...testnetTable.map((entry) => entry.index), ...extraIndexes.split(",").filter(Boolean).map(Number)]);
for (const token of testnet.tokens) if (displayNames.has(token.name)) keep.add(token.index);
const testnetPairs = testnet.universe.filter((pair) => keep.has(pair.tokens[0]));
for (const pair of testnetPairs) keep.add(pair.tokens[1]);
const testnetTokens = testnet.tokens.filter((token) => keep.has(token.index));

assertPlainNames(mainnet.tokens, "mainnet");
assertPlainNames(testnetTokens, "testnet");

writeFileSync(
	OUTPUT_PATH,
	`/**
 * Hyperliquid \`spotMeta\` captured on ${capturedAt} for the spot display-name contract
 * (docs/spot-market-names.md): every mainnet token and pair, the testnet tokens the testnet table and
 * its collisions involve with their pairs, and the listed mainnet perps. Tokens are \`index:name\`,
 * pairs \`pairIndex:baseIndex:quoteIndex\`; pair 0 is \`PURR/USDC\`, every other pair is \`@pairIndex\`.
 * Written by scripts/spot-meta-snapshot.mjs.
 */
export const SPOT_META_SNAPSHOT = {
	capturedAt: "${capturedAt}",
	mainnetTokens: [
${wrap(tokenList(mainnet.tokens))}
	].join(" "),
	mainnetPairs: [
${wrap(pairList(mainnet.universe))}
	].join(" "),
	mainnetPerps: [
${wrap(mainnetPerps.join(" "))}
	].join(" "),
	testnetTokens: [
${wrap(tokenList(testnetTokens))}
	].join(" "),
	testnetPairs: [
${wrap(pairList(testnetPairs))}
	].join(" "),
} as const;
`,
);
console.log(
	`spot-meta-snapshot: ${mainnet.tokens.length} mainnet tokens, ${mainnet.universe.length} pairs, ${mainnetPerps.length} perps; ${testnetTokens.length} testnet tokens, ${testnetPairs.length} pairs`,
);
