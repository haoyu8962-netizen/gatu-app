// Pure functions for the live market numbers, shared by the browser script and node:test. No DOM, no
// timers, no fetch: callers pass the clock (performance.now()), the random source and parsed responses.
import Big from "big.js";

export const INFO_URL = "https://api.hyperliquid.xyz/info";
export const MAIN_DEX = "";

export const META_AND_ASSET_CTXS_WEIGHT = 20;
export const WEIGHT_WINDOW_MS = 60_000;
// 5% of Hyperliquid's 1200-weight-per-minute REST limit per IP: room for the first round of three requests at once.
export const WEIGHT_LIMIT = 60;
export const MIN_REFRESH_INTERVAL_MS = 120_000;
export const REFRESH_MS_PER_REQUEST = 40_000;
export const RETRY_LIMIT = 5;
export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 60_000;
export const STALE_GRACE_MS = 30_000;
export const PRICE_SIGNIFICANT_FIGURES = 5;
export const PERP_PRICE_MAX_DECIMALS = 6;

const DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/;

/**
 * @typedef {object} RequestPlan
 * @property {string[]} dexes Main dex ("") first, then the dexes of the featured coins, each once.
 * @property {number} requestSpacingMs Minimum gap between two sends that keeps every rolling window within WEIGHT_LIMIT.
 * @property {number} refreshIntervalMs Time between two requests for the same dex.
 * @property {number} staleAfterMs Receipt age after which numbers are cleared: two refresh intervals plus STALE_GRACE_MS.
 * @property {number} weightPerRequest
 */

/**
 * @param {readonly string[]} featuredCoins Exchange coin names, e.g. "BTC", "io:OAI".
 * @returns {RequestPlan}
 */
export function createRequestPlan(featuredCoins) {
	const dexes = [MAIN_DEX];
	for (const coin of featuredCoins) {
		const dex = dexOfCoin(coin);
		if (!dexes.includes(dex)) dexes.push(dex);
	}
	const weightPerRequest = META_AND_ASSET_CTXS_WEIGHT;
	const requestsPerWindow = Math.floor(WEIGHT_LIMIT / weightPerRequest);
	if (requestsPerWindow < 1) throw new Error("a single request exceeds the weight budget");
	const requestSpacingMs = Math.ceil(WEIGHT_WINDOW_MS / requestsPerWindow);
	const refreshIntervalMs = Math.max(MIN_REFRESH_INTERVAL_MS, dexes.length * REFRESH_MS_PER_REQUEST, dexes.length * requestSpacingMs);
	return {
		dexes,
		requestSpacingMs,
		refreshIntervalMs,
		staleAfterMs: 2 * refreshIntervalMs + STALE_GRACE_MS,
		weightPerRequest,
	};
}

/**
 * @param {string} dex
 * @returns {{ type: "metaAndAssetCtxs", dex?: string }}
 */
export function requestBody(dex) {
	return dex === MAIN_DEX ? { type: "metaAndAssetCtxs" } : { type: "metaAndAssetCtxs", dex };
}

/**
 * @param {string} coin
 * @returns {string}
 */
export function dexOfCoin(coin) {
	const separator = coin.indexOf(":");
	return separator === -1 ? MAIN_DEX : coin.slice(0, separator);
}

/** @typedef {{ at: number, weight: number }} SendRecord */

/**
 * Weight sent inside the rolling window (at - WEIGHT_WINDOW_MS, at]. Retries count like any other send.
 * @param {readonly SendRecord[]} log
 * @param {number} at
 */
export function windowWeight(log, at) {
	return log.filter((entry) => entry.at > at - WEIGHT_WINDOW_MS && entry.at <= at).reduce((sum, e) => sum + e.weight, 0);
}

/**
 * Earliest time at or after `now`, and never before the last recorded send, at which a request of `weight`
 * keeps the rolling window within WEIGHT_LIMIT.
 * @param {readonly SendRecord[]} log Past sends.
 * @param {number} now
 * @param {number} [weight]
 */
export function nextAllowedSendAt(log, now, weight = META_AND_ASSET_CTXS_WEIGHT) {
	if (weight > WEIGHT_LIMIT) throw new Error("a single request exceeds the weight budget");
	const earliest = log.reduce((latest, entry) => Math.max(latest, entry.at), now);
	const candidates = [earliest, ...log.map((entry) => entry.at + WEIGHT_WINDOW_MS).filter((at) => at > earliest)].sort(
		(a, b) => a - b,
	);
	for (const at of candidates) if (windowWeight(log, at) + weight <= WEIGHT_LIMIT) return at;
	return candidates[candidates.length - 1];
}

/**
 * Records a send and drops entries that can no longer affect any window.
 * @param {readonly SendRecord[]} log
 * @param {number} at
 * @param {number} [weight]
 * @returns {SendRecord[]}
 */
export function recordSend(log, at, weight = META_AND_ASSET_CTXS_WEIGHT) {
	return [...log.filter((entry) => entry.at > at - WEIGHT_WINDOW_MS), { at, weight }];
}

/**
 * Full-jitter exponential backoff: uniform in [0, min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2^attempt)).
 * @param {number} attempt 0 for the first retry.
 * @param {() => number} [random]
 */
export function backoffDelayMs(attempt, random = Math.random) {
	const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt));
	return Math.floor(random() * ceiling);
}

/**
 * At most RETRY_LIMIT retries per visit, across all dexes.
 * @param {number} retriesUsed
 */
export function canRetry(retriesUsed) {
	return retriesUsed < RETRY_LIMIT;
}

/**
 * @typedef {object} LivePrice
 * @property {string} markPx Decimal string > 0.
 * @property {string} prevDayPx Decimal string > 0.
 * @property {number} szDecimals
 */

/**
 * @typedef {{ ok: true, dex: string, prices: Record<string, LivePrice>, delisted: string[], missing: string[] }
 *   | { ok: false, dex: string, reason: "rejected" | "shape" | "dex-mismatch" | "malformed", detail: string }} LiveReading
 */

/**
 * Validates one metaAndAssetCtxs answer and fails closed: any doubt about the response rejects all of it.
 * Coins outside `coins` are ignored; a known coin with `isDelisted: true` is reported in `delisted` so the
 * page removes it, and one absent from the universe in `missing`.
 * @param {{ status: number, body: unknown }} result HTTP status and the parsed JSON body (undefined when unparsable).
 * @param {{ dex: string, coins: Iterable<string> }} expected The requested dex and the snapshot's coins for it.
 * @returns {LiveReading}
 */
export function readMetaAndAssetCtxs(result, expected) {
	const { dex } = expected;
	const reject = (reason, detail) => ({ ok: false, dex, reason, detail });
	if (result.status !== 200) return reject("rejected", `HTTP ${result.status}`);
	const body = result.body;
	if (!Array.isArray(body) || body.length !== 2) return reject("shape", "body is not [meta, ctxs]");
	const [meta, ctxs] = body;
	const universe = meta?.universe;
	if (!Array.isArray(universe) || !Array.isArray(ctxs) || universe.length !== ctxs.length) {
		return reject("shape", "universe and ctxs differ");
	}
	const prefix = dex === MAIN_DEX ? null : `${dex}:`;
	for (const asset of universe) {
		const name = asset?.name;
		if (typeof name !== "string") return reject("shape", "asset without a name");
		if (prefix ? !name.startsWith(prefix) : name.includes(":")) return reject("dex-mismatch", `${name} for dex "${dex}"`);
	}

	/** @type {Record<string, LivePrice>} */
	const prices = {};
	const delisted = [];
	const missing = [];
	for (const coin of expected.coins) {
		if (dexOfCoin(coin) !== dex) return reject("dex-mismatch", `${coin} expected from dex "${dex}"`);
		const index = universe.findIndex((asset) => asset.name === coin);
		if (index === -1) {
			missing.push(coin);
			continue;
		}
		const asset = universe[index];
		if (asset.isDelisted === true) {
			delisted.push(coin);
			continue;
		}
		if (asset.isDelisted !== undefined && asset.isDelisted !== false) {
			return reject("malformed", `${coin} isDelisted ${JSON.stringify(asset.isDelisted)}`);
		}
		const ctx = ctxs[index];
		const szDecimals = asset.szDecimals;
		if (!Number.isInteger(szDecimals) || szDecimals < 0 || szDecimals > PERP_PRICE_MAX_DECIMALS) {
			return reject("malformed", `${coin} szDecimals ${JSON.stringify(szDecimals)}`);
		}
		if (!isPositiveDecimal(ctx?.markPx) || !isPositiveDecimal(ctx?.prevDayPx)) {
			return reject("malformed", `${coin} markPx/prevDayPx ${JSON.stringify([ctx?.markPx, ctx?.prevDayPx])}`);
		}
		prices[coin] = { markPx: ctx.markPx, prevDayPx: ctx.prevDayPx, szDecimals };
	}
	return { ok: true, dex, prices, delisted, missing };
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isPositiveDecimal(value) {
	return typeof value === "string" && DECIMAL.test(value) && new Big(value).gt(0);
}

/**
 * Which dexes may show numbers. `clearAll` is true once any planned dex has gone `staleAfterMs` without a
 * valid answer (counted from `startedAt` until its first one); the page then removes every number.
 * All times come from performance.now(), never from the exchange or the wall clock.
 * @param {{ dexes: readonly string[], receivedAt: Readonly<Record<string, number | undefined>>, startedAt: number, now: number, staleAfterMs: number }} input
 * @returns {{ freshDexes: string[], clearAll: boolean }}
 */
export function evaluateFreshness({ dexes, receivedAt, startedAt, now, staleAfterMs }) {
	const freshDexes = [];
	let clearAll = false;
	for (const dex of dexes) {
		const received = receivedAt[dex];
		const since = received ?? startedAt;
		if (now < since || now - since > staleAfterMs) clearAll = true;
		else if (received !== undefined) freshDexes.push(dex);
	}
	return { freshDexes: clearAll ? [] : freshDexes, clearAll };
}

/**
 * 24h change from prevDayPx to markPx, rounded half-up to two decimals.
 * @param {string} markPx
 * @param {string} prevDayPx
 * @returns {{ direction: "up" | "down" | "flat", percent: string, text: string } | null} `percent` is unsigned, `text` signed ("+1.23%").
 */
export function change24h(markPx, prevDayPx) {
	if (!isPositiveDecimal(markPx) || !isPositiveDecimal(prevDayPx)) return null;
	const change = new Big(markPx).minus(prevDayPx).div(prevDayPx).times(100).round(2, Big.roundHalfUp);
	if (change.eq(0)) return { direction: "flat", percent: "0.00", text: "0.00%" };
	const percent = change.abs().toFixed(2);
	return change.gt(0)
		? { direction: "up", percent, text: `+${percent}%` }
		: { direction: "down", percent, text: `-${percent}%` };
}

/**
 * Hyperliquid's display precision: five significant figures, at most 6 - szDecimals decimals for perps,
 * integers never shortened.
 * @param {string} price
 * @param {number} szDecimals
 */
export function priceDecimals(price, szDecimals) {
	const maxDecimals = Math.max(0, PERP_PRICE_MAX_DECIMALS - szDecimals);
	const significantDecimals = PRICE_SIGNIFICANT_FIGURES - 1 - new Big(price).e;
	return Math.min(maxDecimals, Math.max(0, significantDecimals));
}

/**
 * Rounds half-up to the Hyperliquid precision and drops trailing zeros, as the terminal's formatPrice does.
 * @param {string} price Positive decimal string.
 * @param {number} szDecimals
 * @returns {string | null} e.g. "$1,934.1"; null for invalid input.
 */
export function formatMarkPrice(price, szDecimals) {
	if (!isPositiveDecimal(price) || !Number.isInteger(szDecimals)) return null;
	let decimals = priceDecimals(price, szDecimals);
	let rounded = new Big(price).round(decimals, Big.roundHalfUp);
	if (decimals > 0 && rounded.e > new Big(price).e) {
		decimals -= 1;
		rounded = new Big(price).round(decimals, Big.roundHalfUp);
	}
	const fixed = rounded.toFixed(decimals);
	return `$${groupThousands(fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed)}`;
}

const VALUATION_SCALES = [
	{ suffix: "T", value: new Big("1e12") },
	{ suffix: "B", value: new Big("1e9") },
	{ suffix: "M", value: new Big("1e6") },
];

/**
 * Implied company valuation in USD: markPx × valuationPerPriceUsd (the deployer's unit).
 * @param {string} markPx
 * @param {string | null | undefined} valuationPerPriceUsd
 * @returns {string | null} Decimal string, or null when the unit is missing or an input is invalid.
 */
export function impliedValuationUsd(markPx, valuationPerPriceUsd) {
	if (!isPositiveDecimal(markPx) || !isPositiveDecimal(valuationPerPriceUsd)) return null;
	return new Big(markPx).times(valuationPerPriceUsd).toFixed();
}

/**
 * @param {string} markPx
 * @param {string | null | undefined} valuationPerPriceUsd
 * @returns {string | null} e.g. "US$1.93T implied valuation"; null hides the number.
 */
export function formatImpliedValuation(markPx, valuationPerPriceUsd) {
	const valuation = impliedValuationUsd(markPx, valuationPerPriceUsd);
	if (valuation === null) return null;
	return `US$${formatCompactUsd(valuation)} implied valuation`;
}

/**
 * Two decimals of the largest of T, B, M that fits, half-up; below a million, whole dollars.
 * @param {string} value Positive decimal string.
 */
export function formatCompactUsd(value) {
	const amount = new Big(value);
	for (let index = 0; index < VALUATION_SCALES.length; index += 1) {
		const scale = VALUATION_SCALES[index];
		if (amount.lt(scale.value)) continue;
		const scaled = amount.div(scale.value).round(2, Big.roundHalfUp);
		const larger = VALUATION_SCALES[index - 1];
		if (larger && scaled.gte(1000)) return `${amount.div(larger.value).round(2, Big.roundHalfUp).toFixed(2)}${larger.suffix}`;
		return `${groupThousands(scaled.toFixed(2))}${scale.suffix}`;
	}
	const millions = amount.round(0, Big.roundHalfUp);
	if (millions.gte(1e6)) return "1.00M";
	return groupThousands(millions.toFixed(0));
}

/** @param {string} fixed A non-negative decimal string without exponent. */
function groupThousands(fixed) {
	const [integer, fraction] = fixed.split(".");
	const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/**
 * @typedef {object} DexTotals
 * @property {string} dex
 * @property {string} dayNtlVlm Sum of every listed asset's 24h notional volume in USD, as a decimal string.
 * @property {string} openInterestUsd Sum of openInterest × markPx over every listed asset, as a decimal string.
 * @property {number} markets Listed assets summed.
 */

/**
 * Totals for the stats band over every listed asset of one metaAndAssetCtxs answer. Fails closed: the
 * answer must pass readMetaAndAssetCtxs's shape and dex checks, and any listed asset with a missing or
 * non-decimal dayNtlVlm, openInterest or markPx rejects the whole dex (null), so a partial sum is never shown.
 * Delisted assets (isDelisted: true) are left out; any other isDelisted value rejects the answer.
 * @param {{ status: number, body: unknown }} result
 * @param {string} dex
 * @returns {DexTotals | null}
 */
export function readDexTotals(result, dex) {
	const shape = readMetaAndAssetCtxs(result, { dex, coins: [] });
	if (!shape.ok) return null;
	const [meta, ctxs] = /** @type {[{ universe: { name: string, isDelisted?: unknown }[] }, any[]]} */ (result.body);
	let volume = new Big(0);
	let openInterest = new Big(0);
	let markets = 0;
	for (let index = 0; index < meta.universe.length; index += 1) {
		const asset = meta.universe[index];
		if (asset.isDelisted === true) continue;
		if (asset.isDelisted !== undefined && asset.isDelisted !== false) return null;
		const ctx = ctxs[index];
		if (!isDecimal(ctx?.dayNtlVlm) || !isDecimal(ctx?.openInterest) || !isPositiveDecimal(ctx?.markPx)) return null;
		volume = volume.plus(ctx.dayNtlVlm);
		openInterest = openInterest.plus(new Big(ctx.openInterest).times(ctx.markPx));
		markets += 1;
	}
	if (markets === 0) return null;
	return { dex, dayNtlVlm: volume.toFixed(), openInterestUsd: openInterest.toFixed(), markets };
}

/**
 * Sums the totals of exactly the dexes in `dexes`; null unless every one of them has totals, so the label
 * that names the dexes is always true of the number shown.
 * @param {readonly string[]} dexes
 * @param {Readonly<Record<string, DexTotals | undefined>>} totals
 * @returns {{ dayNtlVlm: string, openInterestUsd: string, markets: number } | null}
 */
export function combineDexTotals(dexes, totals) {
	if (dexes.length === 0) return null;
	let volume = new Big(0);
	let openInterest = new Big(0);
	let markets = 0;
	for (const dex of dexes) {
		const entry = totals[dex];
		if (!entry || entry.dex !== dex) return null;
		volume = volume.plus(entry.dayNtlVlm);
		openInterest = openInterest.plus(entry.openInterestUsd);
		markets += entry.markets;
	}
	return { dayNtlVlm: volume.toFixed(), openInterestUsd: openInterest.toFixed(), markets };
}

/**
 * Stats-band money: "$3.13B"; null for anything that is not a positive decimal, so the band shows nothing
 * rather than "$0".
 * @param {string} value
 */
export function formatStatUsd(value) {
	if (!isPositiveDecimal(value)) return null;
	return `$${formatCompactUsd(value)}`;
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isDecimal(value) {
	return typeof value === "string" && DECIMAL.test(value);
}
