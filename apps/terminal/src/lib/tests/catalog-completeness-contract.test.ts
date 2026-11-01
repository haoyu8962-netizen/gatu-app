import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TRANSLATED_LOCALES = ["zh", "ja", "hi", "es", "fr", "ar"] as const;

interface CatalogEntry {
	id: string;
	translation: string;
}

function readCatalog(locale: string): string {
	return readFileSync(resolve(__dirname, `../../locales/${locale}/messages.po`), "utf8");
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

describe("translation catalog completeness", () => {
	it("reads active entries and skips obsolete ones", () => {
		const catalog = [
			'#: src/a.tsx\nmsgid "Kept"\nmsgstr ""',
			'#~ msgid "Obsolete"\n#~ msgstr ""',
			'#: src/b.tsx\nmsgid "Wrapped"\nmsgstr ""\n"Over two "\n"lines"',
		].join("\n\n");

		expect(parseActiveEntries(catalog)).toEqual([
			{ id: "Kept", translation: "" },
			{ id: "Wrapped", translation: "Over two lines" },
		]);
	});

	it.each(TRANSLATED_LOCALES)("translates every active message in %s", (locale) => {
		const untranslated = parseActiveEntries(readCatalog(locale))
			.filter((entry) => entry.translation.trim() === "")
			.map((entry) => entry.id);

		expect(untranslated).toEqual([]);
	});
});
