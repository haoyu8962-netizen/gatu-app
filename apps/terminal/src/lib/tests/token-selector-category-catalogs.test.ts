import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const locales = ["ar", "en", "es", "fr", "hi", "zh", "ja"] as const;
const messages = ["AI", "Defi", "Gaming", "Layer 1", "Layer 2", "Meme"] as const;

describe("token selector category catalogs", () => {
	for (const locale of locales) {
		const catalog = readFileSync(new URL(`../../locales/${locale}/messages.po`, import.meta.url), "utf8");

		for (const message of messages) {
			it(`${locale} defines ${message}`, () => {
				expect(catalog).toContain(`msgid "${message}"\nmsgstr "${message}"`);
			});
		}
	}
});
