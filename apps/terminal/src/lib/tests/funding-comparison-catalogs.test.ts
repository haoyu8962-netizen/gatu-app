import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TRANSLATED_LOCALES = ["ar", "es", "fr", "hi", "zh"] as const;
const MESSAGES = [
	"{venueName} rate higher",
	"8 Hours",
	"Binance-HL Arb",
	"Bybit-HL Arb",
	"Day",
	"Funding comparison",
	"Funding Comparison",
	"Funding period",
	"Funding rate differences across exchanges.",
	"Hourly",
	"Hyperliquid OI",
	"Hyperliquid rate higher",
	"Loading funding rates",
	"No funding comparison data",
	"No markets match your search",
	"Predicted funding rates by market and exchange",
	"Predicted rates for the next funding, converted to the selected period. Only Hyperliquid main perp markets are included. Differences do not include trading fees or payment timing.",
	"Rates equal",
	"Search by market",
	"Sort by",
	"Sort markets",
	"Week",
	"Year",
] as const;

function readCatalog(locale: string): string {
	return readFileSync(new URL(`../../locales/${locale}/messages.po`, import.meta.url), "utf8");
}

function translationOf(catalog: string, message: string): string | undefined {
	const entry = new RegExp(
		`(?:^|\\n)msgid ${JSON.stringify(message).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\nmsgstr (".*")`,
	);
	const match = entry.exec(catalog);
	return match ? JSON.parse(match[1]) : undefined;
}

describe("funding comparison catalogs", () => {
	const english = readCatalog("en");

	it.each(MESSAGES)("keeps the English source for %s", (message) => {
		expect(translationOf(english, message)).toBe(message);
	});

	for (const locale of TRANSLATED_LOCALES) {
		const catalog = readCatalog(locale);

		it.each(MESSAGES)(`translates %s in ${locale}`, (message) => {
			const translation = translationOf(catalog, message);
			expect(translation).toBeTruthy();
			expect(translation).not.toBe(message);
			if (message.includes("{venueName}")) expect(translation).toContain("{venueName}");
		});
	}
});
