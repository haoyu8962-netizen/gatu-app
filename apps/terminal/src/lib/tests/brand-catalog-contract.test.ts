import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const LOCALES = ["en", "zh", "ja", "hi", "es", "fr", "ar"] as const;
const LITERAL_BRAND_NAMES = /\b(?:gatu|sairn|hyperterminal)\b/i;
const PLACEHOLDER = "{BRAND_NAME}";

interface CatalogEntry {
	id: string;
	translation: string;
}

function readActiveEntries(locale: string): CatalogEntry[] {
	return parseActiveEntries(readFileSync(resolve(__dirname, `../../locales/${locale}/messages.po`), "utf8"));
}

function parseActiveEntries(catalog: string): CatalogEntry[] {
	return catalog
		.split(/\n{2,}/)
		.filter((block) => !/^#~ /m.test(block))
		.flatMap((block) => {
			const id = readField(block, "msgid");
			const translation = readField(block, "msgstr");
			return id && translation !== undefined ? [{ id, translation }] : [];
		});
}

function readField(block: string, name: "msgid" | "msgstr"): string | undefined {
	const lines = block.split("\n");
	const start = lines.findIndex((line) => line.startsWith(`${name} "`));
	if (start === -1) return undefined;
	let value = lines[start].slice(name.length + 2, -1);
	for (let index = start + 1; index < lines.length && lines[index].startsWith('"'); index += 1) {
		value += lines[index].slice(1, -1);
	}
	return value;
}

function count(text: string, needle: string): number {
	return text.split(needle).length - 1;
}

describe("brand names in translation catalogs", () => {
	it("reads continued lines and skips the header and obsolete entries", () => {
		const catalog = [
			'msgid ""\nmsgstr ""\n"Language: zh\\n"',
			'msgid "Install {BRAND_NAME}"\nmsgstr ""\n"安装 "\n"Sairn"',
			'msgid ""\n"Open {BRAND_NAME}"\nmsgstr "打开 {BRAND_NAME}"',
			'#~ msgid "Old"\n#~ msgstr "旧"',
		].join("\n\n");

		expect(parseActiveEntries(catalog)).toEqual([
			{ id: "Install {BRAND_NAME}", translation: "安装 Sairn" },
			{ id: "Open {BRAND_NAME}", translation: "打开 {BRAND_NAME}" },
		]);
	});

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
