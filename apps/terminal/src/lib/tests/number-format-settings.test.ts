// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/config/app";
import { defaultNumberFormatLocale, normalizeNumberFormatLocale, numberFormatLocaleList } from "@/config/i18n";

const LEGACY_FORMATS = [
	["auto", "en-US"],
	["en-US", "en-US"],
	["en-GB", "en-US"],
	["zh-CN", "en-US"],
	["ja-JP", "en-US"],
	["hi-IN", "en-US"],
	["ar-SA", "en-US"],
	["de-DE", "de-DE"],
	["es-ES", "de-DE"],
	["pt-BR", "de-DE"],
	["fr-FR", "fr-FR"],
	["ru-RU", "fr-FR"],
] as const;

describe("number format settings", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.resetModules();
	});

	it("exposes exactly the three formats from the design", () => {
		expect(numberFormatLocaleList).toEqual([
			{ code: "en-US", name: "1,234.56" },
			{ code: "de-DE", name: "1.234,56" },
			{ code: "fr-FR", name: "1 234,56" },
		]);
		expect(defaultNumberFormatLocale).toBe("en-US");
	});

	it.each(LEGACY_FORMATS)("normalizes the legacy %s preference to %s", (legacy, expected) => {
		expect(normalizeNumberFormatLocale(legacy)).toBe(expected);
	});

	it("falls back safely for malformed persisted preferences", () => {
		expect(normalizeNumberFormatLocale("invalid-locale")).toBe(defaultNumberFormatLocale);
		expect(normalizeNumberFormatLocale(null)).toBe(defaultNumberFormatLocale);
	});

	it("migrates persisted legacy preferences before exposing store state", async () => {
		localStorage.setItem(
			STORAGE_KEYS.GLOBAL_SETTINGS,
			JSON.stringify({ state: { numberFormatLocale: "es-ES" }, version: 2 }),
		);

		const { getNumberFormatLocale } = await import("@/stores/use-global-settings-store");

		expect(getNumberFormatLocale()).toBe("de-DE");
		expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS) ?? "{}")).toMatchObject({
			state: { numberFormatLocale: "de-DE" },
			version: 3,
		});
	});

	it("does not persist the canonical default as an override", async () => {
		localStorage.setItem(
			STORAGE_KEYS.GLOBAL_SETTINGS,
			JSON.stringify({ state: { numberFormatLocale: "auto" }, version: 2 }),
		);

		const { getNumberFormatLocale } = await import("@/stores/use-global-settings-store");

		expect(getNumberFormatLocale()).toBe(defaultNumberFormatLocale);
		expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS) ?? "{}")).toMatchObject({
			state: {},
			version: 3,
		});
	});
});
