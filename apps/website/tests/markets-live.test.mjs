import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { FEATURED_MARKETS } from "../src/config/featured-markets.ts";
import {
	backoffDelayMs,
	BACKOFF_MAX_MS,
	canRetry,
	change24h,
	createRequestPlan,
	evaluateFreshness,
	formatCompactUsd,
	formatImpliedValuation,
	formatMarkPrice,
	impliedValuationUsd,
	nextAllowedSendAt,
	priceDecimals,
	readMetaAndAssetCtxs,
	recordSend,
	requestBody,
	RETRY_LIMIT,
	WEIGHT_LIMIT,
	WEIGHT_WINDOW_MS,
	windowWeight,
} from "../src/lib/markets/live.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");
const FEATURED_COINS = FEATURED_MARKETS.map((market) => market.coin);

function fixture(dex) {
	return JSON.parse(readFileSync(resolve(FIXTURES, `meta-and-asset-ctxs-${dex}.json`), "utf8"));
}

function coinsFor(dex) {
	return FEATURED_COINS.filter((coin) => (dex === "" ? !coin.includes(":") : coin.startsWith(`${dex}:`)));
}

function read(dex, mutate = (body) => body, status = 200) {
	const recorded = fixture(dex === "" ? "main" : dex);
	const body = mutate(structuredClone(recorded.body));
	return readMetaAndAssetCtxs({ status, body }, { dex, coins: coinsFor(dex) });
}

function setCtx(body, coin, fields) {
	const index = body[0].universe.findIndex((asset) => asset.name === coin);
	Object.assign(body[1][index], fields);
	return body;
}

function setAsset(body, coin, fields) {
	const index = body[0].universe.findIndex((asset) => asset.name === coin);
	Object.assign(body[0].universe[index], fields);
	return body;
}

test("the request plan polls the main dex and the featured dexes within 60 weight per rolling minute", () => {
	const plan = createRequestPlan(FEATURED_COINS);
	assert.deepEqual(plan.dexes, ["", "io", "xyz"]);
	assert.equal(plan.weightPerRequest, 20);
	assert.equal(plan.requestSpacingMs, 20_000, "three 20-weight requests fit one 60 s window");
	assert.equal(plan.refreshIntervalMs, 120_000);
	assert.equal(plan.staleAfterMs, 2 * plan.refreshIntervalMs + 30_000);
	assert.deepEqual(createRequestPlan(["BTC"]).dexes, [""]);
	assert.equal(createRequestPlan(["BTC"]).refreshIntervalMs, 120_000);
	assert.deepEqual(requestBody(""), { type: "metaAndAssetCtxs" });
	assert.deepEqual(requestBody("io"), { type: "metaAndAssetCtxs", dex: "io" });
});

test("the rolling window delays a send until it fits and counts retries like any other send", () => {
	assert.equal(nextAllowedSendAt([], 5_000), 5_000);
	let log = recordSend(recordSend(recordSend([], 0), 0), 0);
	assert.equal(windowWeight(log, 59_999), 60);
	assert.equal(windowWeight(log, 60_000), 0, "the window is (now - 60 s, now]");
	assert.equal(nextAllowedSendAt(recordSend([], 0), 1_000), 1_000, "the first round goes out at once");
	assert.equal(nextAllowedSendAt(log, 1_000), 60_000);
	log = recordSend(log, 60_000);
	assert.equal(nextAllowedSendAt(log, 61_000), 61_000);
	assert.equal(nextAllowedSendAt(recordSend([], 90_000), 30_000), 90_000, "never before the last send");
	assert.throws(() => nextAllowedSendAt([], 0, WEIGHT_LIMIT + 1));
});

test("a simulated hour of polling with failures and jittered retries never exceeds the budget", () => {
	const plan = createRequestPlan(FEATURED_COINS);
	let seed = 7;
	const random = () => {
		seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
		return seed / 2 ** 31;
	};
	let log = [];
	let retriesUsed = 0;
	const due = plan.dexes.map((dex) => ({ dex, at: 0, retry: 0 }));
	const sends = [];
	while (sends.length < 200) {
		due.sort((a, b) => a.at - b.at);
		const next = due[0];
		if (next.at > 3_600_000) break;
		const at = nextAllowedSendAt(log, next.at, plan.weightPerRequest);
		log = recordSend(log, at, plan.weightPerRequest);
		sends.push(at);
		const failed = random() < 0.3;
		if (failed && canRetry(retriesUsed)) {
			retriesUsed += 1;
			next.at = at + backoffDelayMs(next.retry, random);
			next.retry += 1;
		} else {
			next.at = at + plan.refreshIntervalMs;
			next.retry = 0;
		}
	}
	assert.ok(sends.length > 20);
	assert.ok(retriesUsed <= RETRY_LIMIT);
	for (const at of sends) {
		const weight = sends.filter((sent) => sent > at - WEIGHT_WINDOW_MS && sent <= at).length * plan.weightPerRequest;
		assert.ok(weight <= WEIGHT_LIMIT, `window ending ${at} carries ${weight}`);
	}
});

test("retries use full-jitter exponential backoff and stop after five per visit", () => {
	assert.equal(backoffDelayMs(0, () => 0), 0);
	assert.equal(backoffDelayMs(0, () => 0.5), 1_000);
	assert.equal(backoffDelayMs(3, () => 0.5), 8_000);
	assert.ok(backoffDelayMs(20, () => 0.999_999) < BACKOFF_MAX_MS);
	assert.equal(RETRY_LIMIT, 5);
	assert.equal(canRetry(4), true);
	assert.equal(canRetry(5), false);
});

test("recorded responses validate and yield prices for the featured coins only", () => {
	for (const dex of ["", "xyz", "io"]) {
		const reading = read(dex);
		assert.equal(reading.ok, true, `${dex || "main"}: ${reading.detail}`);
		assert.deepEqual(Object.keys(reading.prices).sort(), coinsFor(dex).sort());
		assert.deepEqual(reading.delisted, []);
		assert.deepEqual(reading.missing, []);
		for (const price of Object.values(reading.prices)) {
			assert.match(price.markPx, /^\d+(\.\d+)?$/);
			assert.match(price.prevDayPx, /^\d+(\.\d+)?$/);
		}
	}
	const io = fixture("io");
	assert.ok(io.body[0].universe.some((asset) => asset.name === "io:SBE" && asset.isDelisted === true));
	const withDelisted = readMetaAndAssetCtxs({ status: 200, body: io.body }, { dex: "io", coins: ["io:OAI", "io:SBE"] });
	assert.equal(withDelisted.ok, true);
	assert.deepEqual(withDelisted.delisted, ["io:SBE"]);
	assert.deepEqual(Object.keys(withDelisted.prices), ["io:OAI"]);
});

test("validation fails closed on rejected, malformed and mismatched responses", () => {
	const cases = [
		["rejected", read("io", (body) => body, 429)],
		["rejected", read("io", (body) => body, 500)],
		["shape", read("io", () => null)],
		["shape", read("io", () => ({ error: "x" }))],
		["shape", read("io", (body) => [body[0], body[1].slice(1)])],
		["malformed", read("io", (body) => setCtx(body, "io:OAI", { markPx: "abc" }))],
		["malformed", read("io", (body) => setCtx(body, "io:OAI", { markPx: "0" }))],
		["malformed", read("io", (body) => setCtx(body, "io:OAI", { markPx: "0.0" }))],
		["malformed", read("io", (body) => setCtx(body, "io:OAI", { markPx: 1424.4 }))],
		["malformed", read("io", (body) => setCtx(body, "io:OAI", { markPx: "1.4e3" }))],
		["malformed", read("io", (body) => setCtx(body, "io:ANTH", { prevDayPx: "-1" }))],
		["malformed", read("io", (body) => setCtx(body, "io:ANTH", { prevDayPx: null }))],
		["malformed", read("io", (body) => setAsset(body, "io:OAI", { isDelisted: "yes" }))],
		["malformed", read("io", (body) => setAsset(body, "io:OAI", { szDecimals: 7 }))],
		["dex-mismatch", read("io", (body) => setAsset(body, "io:SBE", { name: "xyz:SBE" }))],
		["dex-mismatch", read("", (body) => setAsset(body, "ETH", { name: "io:ETH" }))],
		["dex-mismatch", readMetaAndAssetCtxs({ status: 200, body: fixture("io").body }, { dex: "xyz", coins: [] })],
		["dex-mismatch", readMetaAndAssetCtxs({ status: 200, body: fixture("io").body }, { dex: "io", coins: ["BTC"] })],
	];
	for (const [reason, reading] of cases) {
		assert.equal(reading.ok, false, `expected ${reason}`);
		assert.equal(reading.reason, reason, reading.detail);
		assert.equal("prices" in reading, false, "a rejected reading carries no numbers");
	}
});

test("a featured market delisted after the snapshot is reported for removal, not priced", () => {
	const reading = read("io", (body) => setAsset(body, "io:ANTH", { isDelisted: true }));
	assert.equal(reading.ok, true);
	assert.deepEqual(reading.delisted, ["io:ANTH"]);
	assert.equal(reading.prices["io:ANTH"], undefined);
	const removed = read("io", (body) => [
		{ ...body[0], universe: body[0].universe.filter((asset) => asset.name !== "io:OAI") },
		body[1].filter((_, index) => body[0].universe[index].name !== "io:OAI"),
	]);
	assert.equal(removed.ok, true);
	assert.deepEqual(removed.missing, ["io:OAI"]);
});

test("freshness follows performance.now() receipts and clears every number once a dex goes stale", () => {
	const plan = createRequestPlan(FEATURED_COINS);
	const base = { dexes: plan.dexes, startedAt: 1_000, staleAfterMs: plan.staleAfterMs };
	assert.deepEqual(evaluateFreshness({ ...base, receivedAt: {}, now: 2_000 }), { freshDexes: [], clearAll: false });
	assert.deepEqual(evaluateFreshness({ ...base, receivedAt: { "": 1_500 }, now: 2_000 }), {
		freshDexes: [""],
		clearAll: false,
	});
	const all = { "": 10_000, io: 70_000, xyz: 130_000 };
	assert.deepEqual(evaluateFreshness({ ...base, receivedAt: all, now: 10_000 + plan.staleAfterMs }).clearAll, false);
	assert.deepEqual(evaluateFreshness({ ...base, receivedAt: all, now: 10_001 + plan.staleAfterMs }), {
		freshDexes: [],
		clearAll: true,
	});
	assert.equal(evaluateFreshness({ ...base, receivedAt: { "": 2_000 }, now: 1_001 + plan.staleAfterMs }).clearAll, true);
	assert.equal(evaluateFreshness({ ...base, receivedAt: all, now: 5_000 }).clearAll, true, "a receipt after now");
});

test("24h change keeps its sign and rounds half-up to two decimals", () => {
	const io = read("io");
	const anth = io.prices["io:ANTH"];
	const recorded = change24h(anth.markPx, anth.prevDayPx);
	assert.equal(recorded.direction, Number(anth.markPx) >= Number(anth.prevDayPx) ? "up" : "down");
	assert.deepEqual(change24h("1936.4", "1912.8"), { direction: "up", percent: "1.23", text: "+1.23%" });
	assert.deepEqual(change24h("1912.8", "1936.4"), { direction: "down", percent: "1.22", text: "-1.22%" });
	assert.deepEqual(change24h("100.005", "100"), { direction: "up", percent: "0.01", text: "+0.01%" });
	assert.deepEqual(change24h("99.995", "100"), { direction: "down", percent: "0.01", text: "-0.01%" });
	assert.deepEqual(change24h("100.004", "100"), { direction: "flat", percent: "0.00", text: "0.00%" });
	assert.deepEqual(change24h("99.996", "100"), { direction: "flat", percent: "0.00", text: "0.00%" });
	assert.equal(change24h("1", "0"), null);
	assert.equal(change24h("x", "1"), null);
});

test("Pre-IPO implied valuation is mark price times the deployer unit and hides without a unit", () => {
	assert.equal(impliedValuationUsd("1936.4", "1000000000"), "1936400000000");
	assert.equal(formatImpliedValuation("1936.4", "1000000000"), "US$1.94T implied valuation");
	assert.equal(formatImpliedValuation("1900", "1000000000"), "US$1.90T implied valuation");
	assert.equal(formatImpliedValuation("1424.4", "1000000000"), "US$1.42T implied valuation");
	assert.equal(formatImpliedValuation("999.995", "1000000000"), "US$1.00T implied valuation");
	assert.equal(formatImpliedValuation("61.5", "1000000000"), "US$61.50B implied valuation");
	assert.equal(formatImpliedValuation("1936.4", null), null);
	assert.equal(formatImpliedValuation("1936.4", undefined), null);
	assert.equal(formatImpliedValuation("0", "1000000000"), null);
	assert.equal(formatCompactUsd("2500000"), "2.50M");
	assert.equal(formatCompactUsd("999999.6"), "1.00M");
	assert.equal(formatCompactUsd("12345"), "12,345");
});

test("mark prices follow Hyperliquid's five significant figures and 6 - szDecimals cap", () => {
	assert.equal(priceDecimals("1934.1", 3), 1);
	assert.equal(priceDecimals("111234", 5), 0);
	assert.equal(priceDecimals("0.0012345", 0), 6);
	assert.equal(formatMarkPrice("1934.1", 3), "$1,934.1");
	assert.equal(formatMarkPrice("111234", 5), "$111,234");
	assert.equal(formatMarkPrice("111234.5", 5), "$111,235");
	assert.equal(formatMarkPrice("0.0012345", 0), "$0.001235");
	assert.equal(formatMarkPrice("9.99996", 0), "$10");
	assert.equal(formatMarkPrice("152.345", 2), "$152.35");
	assert.equal(formatMarkPrice("1.50", 2), "$1.5");
	assert.equal(formatMarkPrice("0", 2), null);
	for (const dex of ["", "xyz", "io"]) {
		for (const price of Object.values(read(dex).prices)) {
			const shown = formatMarkPrice(price.markPx, price.szDecimals);
			const digits = shown.replace(/[$,.]/g, "").replace(/^0+/, "");
			assert.ok(digits.length <= 5 || !shown.includes("."), `${shown} exceeds five significant figures`);
		}
	}
});
