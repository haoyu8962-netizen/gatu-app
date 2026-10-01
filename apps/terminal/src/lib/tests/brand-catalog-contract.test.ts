import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const LOCALES = ["en", "zh", "hi", "es", "fr", "ar"] as const;
const LITERAL_BRAND_NAMES = /\b(?:gatu|sairn|hyperterminal)\b/i;
const PLACEHOLDER = "{BRAND_NAME}";

interface CatalogEntry {
	id: string;
	translation: string;
}

function readActiveEntries(locale: string): CatalogEntry[] {
	const catalog = readFileSync(resolve(__dirname, `../../locales/${locale}/messages.po`), "utf8");
	return catalog
		.split("\n\n")
		.filter((block) => !/^#~ /m.test(block))
		.flatMap((block) => {
			const id = /^msgid "(.*)"$/m.exec(block)?.[1];
			const translation = /^msgstr "(.*)"$/m.exec(block)?.[1];
			return id && translation !== undefined ? [{ id, translation }] : [];
		});
}

function count(text: string, needle: string): number {
	return text.split(needle).length - 1;
}

describe("brand names in translation catalogs", () => {
	it.each(LOCALES)("%s names the product only through the {BRAND_NAME} placeholder", (locale) => {
		const entries = readActiveEntries(locale);

		expect(entries.length).toBeGreaterThan(1_000);
		expect(entries.filter((entry) => LITERAL_BRAND_NAMES.test(entry.id)).map((entry) => entry.id)).toEqual([]);
		expect(
			entries.filter((entry) => LITERAL_BRAND_NAMES.test(entry.translation)).map((entry) => entry.translation),
		).toEqual([]);
	});

	it.each(LOCALES)("%s keeps every brand placeholder of the source message", (locale) => {
		const branded = readActiveEntries(locale).filter((entry) => entry.id.includes(PLACEHOLDER));

		expect(branded.length).toBeGreaterThanOrEqual(10);
		for (const entry of branded) {
			if (entry.translation === "") continue;
			expect(count(entry.translation, PLACEHOLDER), entry.id).toBe(count(entry.id, PLACEHOLDER));
		}
	});
});
