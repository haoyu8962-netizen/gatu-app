// The one risk sentence each [data-cta-group] carries next to its links into the terminal (plan R6).
export const RISK_SENTENCE = "Perpetuals use leverage; you can lose all of your margin.";

export const RISK_PATH = "/risk/";
export const TERMS_RESTRICTED_PATH = "/terms/#22-restricted-persons";

export const HIP3_DOCS_URL =
	"https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-3-builder-deployed-perpetuals";

/** Hyperliquid's order book mechanics (2026-10-26: curl returned 200). */
export const HL_ORDER_BOOK_DOCS_URL = "https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/order-book";

export const RESTRICTED_SHORT = "Not available in the US or other restricted locations";

/** "A", "A and B", "A, B and C". */
export function joinNames(names: readonly string[]): string {
	if (names.length <= 1) return names.join("");
	return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatUtcDate(date: Date): string {
	return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** `2028-09-02` → "2 Sep 2028". */
export function formatIsoDate(isoDate: string): string {
	return formatUtcDate(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));
}

/** ISO timestamp → "25 Oct 2026, 17:55 UTC". */
export function formatUtcTimestamp(iso: string): string {
	const date = new Date(iso);
	const time = `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
	return `${formatUtcDate(date)}, ${time} UTC`;
}

/**
 * The hero headline's reel: it starts and ends on the first entry, so the static headline (no animation,
 * reduced motion, before CSS loads) reads exactly the plan's H1. global.css holds one keyframe stop per
 * entry (motion-contract checks the count).
 */
export const HERO_REEL_WORDS = ["Every market", "Crypto", "US stocks", "Indices", "Commodities", "FX", "Pre-IPO", "Every market"];

/** The plan's H1 (§3), which the hero always carries as its accessible name. */
export const HERO_HEADLINE = "Every market on Hyperliquid. One account, 24/7.";
