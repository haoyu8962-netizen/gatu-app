// The Fees block's HIP-3 example (plan §4 07, R8) is computed at build time from the snapshot. These tests run the
// terminal's own fee rule (apps/terminal/src/domain/trade/fees.ts) next to the website's copy of it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	builderFeeRate,
	findGrowthModeFeeExample,
	formatFeePercent,
	HYPERLIQUID_BASE_PERP_RATE,
	hip3ProtocolFeeRate,
} from "../src/lib/markets/fees.ts";
import { MARKET_STRUCTURE } from "../src/lib/markets/structure.ts";
import { FEATURED_MARKETS } from "../src/config/featured-markets.ts";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TERMINAL_SRC = `${pathToFileURL(resolve(WEBSITE_ROOT, "../terminal/src")).href}/`;

// The terminal resolves `@/` to apps/terminal/src; teach node the same alias for this test only.
register(
	`data:text/javascript,${encodeURIComponent(`
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const SOURCE = ${JSON.stringify(TERMINAL_SRC)};
export async function resolve(specifier, context, next) {
	if (specifier.startsWith("@/")) {
		for (const suffix of [".ts", ".tsx", "/index.ts"]) {
			const url = new URL(specifier.slice(2) + suffix, SOURCE);
			if (existsSync(fileURLToPath(url))) return next(url.href, context);
		}
	}
	return next(specifier, context);
}`)}`,
);
const terminalFees = await import("../../terminal/src/domain/trade/fees.ts");

const SCALES = [null, "", "-1", "0", "0.25", "0.5", "0.999", "1", "1.0", "1.5", "2", "not a number"];

test("the website's HIP-3 protocol fee equals the terminal's applyMarketFeeScale at the base tier", () => {
	let cases = 0;
	for (const [side, baseRate] of Object.entries(HYPERLIQUID_BASE_PERP_RATE)) {
		for (const growthMode of [true, false]) {
			for (const deployerFeeScale of SCALES) {
				const expected = terminalFees.applyMarketFeeScale(Number(baseRate), {
					kind: "builderPerp",
					growthMode: growthMode ? "enabled" : undefined,
					deployerFeeScale,
				});
				const actual = hip3ProtocolFeeRate(baseRate, { growthMode, deployerFeeScale });
				assert.equal(Number(actual.toString()), expected, `${side}, growth ${growthMode}, scale ${deployerFeeScale}`);
				cases += 1;
			}
		}
	}
	assert.equal(cases, 2 * 2 * SCALES.length);
});

test("the builder fee comes from the terminal's builder config in tenths of a basis point", () => {
	const config = readFileSync(resolve(WEBSITE_ROOT, "../terminal/src/config/hyperliquid.ts"), "utf8");
	const tenths = Number(/\bf:\s*(\d+)\s*,/.exec(config)?.[1]);
	assert.ok(tenths > 0);
	assert.equal(Number(builderFeeRate().toString()), tenths / 100_000);
	assert.equal(formatFeePercent(builderFeeRate()), `${tenths / 1_000}%`);
});

test("the growth-mode example is the first featured HIP-3 market in growth mode, priced from the snapshot", () => {
	const example = findGrowthModeFeeExample(
		MARKET_STRUCTURE,
		FEATURED_MARKETS.map((market) => market.coin),
	);
	assert.ok(example, "the snapshot has a featured HIP-3 market in growth mode; otherwise 07 shows no example");
	const coin = FEATURED_MARKETS.map((market) => market.coin).find((candidate) => {
		const [dex] = candidate.includes(":") ? candidate.split(":") : [""];
		const market = MARKET_STRUCTURE.dexes.find((entry) => entry.dex === dex)?.markets.find((entry) => entry.coin === candidate);
		return dex !== "" && market?.growthMode === true;
	});
	assert.equal(example.coin, coin);
	const [dex] = coin.split(":");
	const market = MARKET_STRUCTURE.dexes.find((entry) => entry.dex === dex).markets.find((entry) => entry.coin === coin);
	for (const [field, side] of [
		["takerPercent", "taker"],
		["makerPercent", "maker"],
	]) {
		const terminalRate = terminalFees.applyMarketFeeScale(Number(HYPERLIQUID_BASE_PERP_RATE[side]), {
			kind: "builderPerp",
			growthMode: "enabled",
			deployerFeeScale: market.deployerFeeScale,
		});
		assert.equal(example[field], `${Number((terminalRate * 100).toPrecision(12))}%`, `${coin} ${side}`);
	}
	assert.equal(example.builderPercent, formatFeePercent(builderFeeRate()));
	assert.equal(example.builderFeeIsLargerPart, builderFeeRate().gt(hip3ProtocolFeeRate(HYPERLIQUID_BASE_PERP_RATE.taker, market)));
});

test("a main-dex market or a market outside growth mode never serves as the example", () => {
	const snapshot = structuredClone(MARKET_STRUCTURE);
	for (const dex of snapshot.dexes) for (const market of dex.markets) if (dex.dex !== "") market.growthMode = false;
	assert.equal(findGrowthModeFeeExample(snapshot, FEATURED_MARKETS.map((market) => market.coin)), null);
});

test("the Fees block renders the computed example, not hand-written HIP-3 rates", () => {
	const fees = readFileSync(resolve(WEBSITE_ROOT, "src/components/Fees.astro"), "utf8");
	assert.match(fees, /findGrowthModeFeeExample\(/);
	assert.match(fees, /\{growthExample\.takerPercent\}/);
	assert.match(fees, /\{growthExample\.builderPercent\}/);
	assert.match(fees, /HIP-3 deployers can set different Hyperliquid fees for their markets\./);
	assert.doesNotMatch(fees, /0\.009%|0\.003%/, "the example's rates come from the snapshot");
});
