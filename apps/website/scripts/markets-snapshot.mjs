#!/usr/bin/env node
// Writes src/data/market-structure.json from Hyperliquid's public info endpoint, or with --check compares
// the committed snapshot and configs with the exchange without writing. Runs with --experimental-strip-types
// so it can read the TypeScript configs (see package.json).
//
//   pnpm --filter @sairn/website markets:snapshot           # write, report problems (exit 1 if any), else vendor icons
//   pnpm --filter @sairn/website markets:snapshot --check   # exit 1 when the site would publish stale facts

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getHip3DeployerDocumentationUrl } from "../../terminal/src/config/hip3-deployers.ts";
import { PRE_IPO_DOCS, PRE_IPO_TERMS } from "../src/config/deployers.ts";
import { FEATURED_MARKETS } from "../src/config/featured-markets.ts";
import {
	ADDRESS_PATTERN,
	findDeployerDocsProblems,
	findFeaturedProblems,
	findPreIpoDocsProblems,
	findPreIpoReviewProblems,
	findPreIpoTermsProblems,
	findPublishedPreIpoProblems,
	findSnapshotAgeProblems,
	findSnapshotProblems,
	isPerpDelisted,
	MAIN_DEX,
	normalizePerpCategory,
} from "../src/lib/markets/rules.ts";

const INFO_URL = "https://api.hyperliquid.xyz/info";
const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_PATH = resolve(WEBSITE_ROOT, "src/data/market-structure.json");
const REQUEST_SPACING_MS = 250;
const DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/;

async function postInfo(body) {
	const response = await fetch(INFO_URL, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) throw new Error(`${JSON.stringify(body)} returned HTTP ${response.status}`);
	return response.json();
}

function sleep(ms) {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function fail(message) {
	throw new Error(`markets:snapshot: ${message}`);
}

/** Listed markets of one metaAndAssetCtxs answer, in the snapshot shape; throws on anything not understood. */
export function readListedMarkets(dex, response, annotations) {
	if (!Array.isArray(response) || response.length !== 2) fail(`metaAndAssetCtxs for dex "${dex}" is not [meta, ctxs]`);
	const [meta, ctxs] = response;
	if (!Array.isArray(meta?.universe) || !Array.isArray(ctxs) || ctxs.length !== meta.universe.length) {
		fail(`metaAndAssetCtxs for dex "${dex}" has a universe and ctxs of different lengths`);
	}
	const markets = [];
	meta.universe.forEach((asset, index) => {
		const coin = asset?.name;
		if (typeof coin !== "string") fail(`dex "${dex}" asset ${index} has no name`);
		const expectedPrefix = dex === MAIN_DEX ? null : `${dex}:`;
		if (expectedPrefix ? !coin.startsWith(expectedPrefix) : coin.includes(":")) {
			fail(`dex "${dex}" returned ${coin}, which belongs to another dex`);
		}
		if (asset.isDelisted !== undefined && asset.isDelisted !== true) {
			fail(`${coin} has isDelisted ${JSON.stringify(asset.isDelisted)}; only absent or true is understood`);
		}
		if (isPerpDelisted(asset)) return;
		if (asset.growthMode !== undefined && asset.growthMode !== "enabled") {
			fail(`${coin} has growthMode ${JSON.stringify(asset.growthMode)}; only absent or "enabled" is understood`);
		}
		if (asset.onlyIsolated !== undefined && typeof asset.onlyIsolated !== "boolean") {
			fail(`${coin} has onlyIsolated ${JSON.stringify(asset.onlyIsolated)}`);
		}
		if (asset.deployerFeeScale !== undefined && !DECIMAL.test(asset.deployerFeeScale)) {
			fail(`${coin} has deployerFeeScale ${JSON.stringify(asset.deployerFeeScale)}`);
		}
		if (!Number.isInteger(asset.szDecimals) || asset.szDecimals < 0 || asset.szDecimals > 6) {
			fail(`${coin} has szDecimals ${JSON.stringify(asset.szDecimals)}`);
		}
		const volume = ctxs[index]?.dayNtlVlm;
		if (typeof volume !== "string" || !DECIMAL.test(volume)) fail(`${coin} has dayNtlVlm ${JSON.stringify(volume)}`);
		const annotation = dex === MAIN_DEX ? undefined : annotations.get(coin);
		markets.push({
			coin,
			category: dex === MAIN_DEX ? "crypto" : (normalizePerpCategory(annotation?.category) ?? null),
			displayName: typeof annotation?.displayName === "string" ? annotation.displayName : null,
			szDecimals: asset.szDecimals,
			onlyIsolated: asset.onlyIsolated === true,
			growthMode: asset.growthMode === "enabled",
			deployerFeeScale: asset.deployerFeeScale ?? null,
			dayNtlVlm: volume.split(".")[0],
		});
	});
	return markets;
}

async function fetchSnapshot() {
	const perpDexs = await postInfo({ type: "perpDexs" });
	if (!Array.isArray(perpDexs) || perpDexs[0] !== null) fail("perpDexs no longer starts with the main dex (null)");
	const builderDexes = perpDexs.slice(1).map((entry, index) => {
		if (typeof entry?.name !== "string" || !/^[a-z0-9]+$/.test(entry.name)) fail(`perpDexs[${index + 1}] has no name`);
		if (typeof entry.fullName !== "string" || entry.fullName.trim() === "") fail(`dex ${entry.name} has no fullName`);
		return { dex: entry.name, fullName: entry.fullName.trim() };
	});

	const annotationList = await postInfo({ type: "perpConciseAnnotations" });
	if (!Array.isArray(annotationList)) fail("perpConciseAnnotations is not a list");
	const annotations = new Map(annotationList);

	const dexes = [];
	for (const { dex, fullName } of [{ dex: MAIN_DEX, fullName: null }, ...builderDexes]) {
		await sleep(REQUEST_SPACING_MS);
		const response = await postInfo(dex === MAIN_DEX ? { type: "metaAndAssetCtxs" } : { type: "metaAndAssetCtxs", dex });
		const markets = readListedMarkets(dex, response, annotations);
		if (markets.length > 0) dexes.push({ dex, fullName, markets });
	}

	const snapshot = {
		schemaVersion: 1,
		fetchedAt: new Date().toISOString(),
		source: `POST ${INFO_URL}: perpDexs, perpConciseAnnotations, metaAndAssetCtxs per dex`,
		dexes,
	};
	if (ADDRESS_PATTERN.test(JSON.stringify(snapshot))) fail("the snapshot would contain an address");
	return snapshot;
}

function readCommittedSnapshot() {
	try {
		return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
	} catch (error) {
		if (error.code === "ENOENT") return undefined;
		throw error;
	}
}

function describeChanges(previous, next) {
	const counts = next.dexes.map((dex) => `${dex.dex || "main"} ${dex.markets.length}`).join(", ");
	if (!previous) return ["no previous snapshot", `listed markets: ${counts}`];
	const index = (snapshot) =>
		new Map(snapshot.dexes.flatMap((dex) => dex.markets.map((market) => [market.coin, market])));
	const before = index(previous);
	const after = index(next);
	const lines = [];
	for (const coin of after.keys()) if (!before.has(coin)) lines.push(`+ ${coin} (${after.get(coin).category})`);
	for (const coin of before.keys()) if (!after.has(coin)) lines.push(`- ${coin} (${before.get(coin).category})`);
	for (const [coin, market] of after) {
		const old = before.get(coin);
		if (!old) continue;
		for (const field of ["category", "displayName", "onlyIsolated", "growthMode", "deployerFeeScale", "szDecimals"]) {
			if (old[field] !== market[field]) lines.push(`~ ${coin} ${field}: ${old[field]} -> ${market[field]}`);
		}
	}
	lines.push(`listed markets: ${counts}`);
	return lines;
}

function currentConfigProblems(snapshot, now) {
	return [
		...findFeaturedProblems(snapshot, FEATURED_MARKETS),
		...findDeployerDocsProblems(snapshot, getHip3DeployerDocumentationUrl),
		...findPreIpoTermsProblems(snapshot, PRE_IPO_TERMS),
		...findPreIpoDocsProblems(snapshot, PRE_IPO_DOCS),
		...findPreIpoReviewProblems(PRE_IPO_TERMS, PRE_IPO_DOCS, now),
	];
}

async function main() {
	const check = process.argv.includes("--check");
	const committed = readCommittedSnapshot();
	const fresh = await fetchSnapshot();
	const now = Date.now();

	const problems = currentConfigProblems(fresh, now);
	if (check) {
		if (!committed) problems.push("src/data/market-structure.json is missing");
		else {
			problems.push(...findPublishedPreIpoProblems(committed, fresh));
			const committedProblems = [...findSnapshotProblems(committed), ...findSnapshotAgeProblems(committed, now)];
			problems.push(...committedProblems.map((problem) => `committed ${problem}`));
		}
	} else {
		writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(fresh, null, "\t")}\n`);
		console.log(`wrote ${SNAPSHOT_PATH} (fetchedAt ${fresh.fetchedAt})`);
		for (const line of describeChanges(committed, fresh)) console.log(`  ${line}`);
	}

	if (problems.length > 0) {
		console.error(`markets:snapshot${check ? " --check" : ""} found ${problems.length} problem(s):`);
		for (const problem of problems) console.error(`  - ${problem}`);
		process.exitCode = 1;
		return;
	}
	console.log(check ? "markets:snapshot --check passed" : "snapshot and configs are consistent");
	if (!check) {
		// Imported only now, so structure.ts reads the snapshot written above.
		const { vendorMarketIcons } = await import("./market-icons.mjs");
		await vendorMarketIcons();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
