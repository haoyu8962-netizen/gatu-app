// Links into the terminal with the website UTM set. Kept apart from src/lib/markets/structure.ts, whose
// build-time checks must not run for pages that only need a link (header, Fees, FAQ, legal pages).

import { APP_URL } from "../config/brand.ts";

const UTM = { utm_source: "website", utm_medium: "site", utm_campaign: "en_home" } as const;

/** Path segment as the terminal writes it (`getTradePathForMarketName`): `:` and `@` stay literal. */
function encodeTradeSegment(segment: string): string {
	return encodeURIComponent(segment).replace(/%3A/gi, ":").replace(/%40/gi, "@");
}

/** `${APP_URL}<path>` with the website UTM set; `slot` names the link's place on the page. */
export function terminalUrl(path: string, slot: string): string {
	if (!path.startsWith("/")) throw new Error(`terminal path "${path}" must start with /`);
	if (!/^[a-z0-9_]+$/.test(slot)) throw new Error(`UTM slot "${slot}" must be lowercase letters, digits or _`);
	const query = new URLSearchParams({ ...UTM, utm_content: slot });
	return `${APP_URL}${path}?${query.toString()}`;
}

/** `${APP_URL}/trade/<coin>` with the website UTM set. */
export function terminalTradeUrl(coin: string, slot: string): string {
	return terminalUrl(`/trade/${encodeTradeSegment(coin)}`, slot);
}

/** A UTM slot fragment for a coin: `io:OAI` → `io_oai`. */
export function coinSlot(coin: string): string {
	return coin.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}
