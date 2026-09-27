// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { i18n, type Messages } from "@lingui/core";
import { act, type ComponentProps } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeveragePositionLimitRow } from "@/components/trade/tradebox/leverage-position-limit-row";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({ formatLocale: "en-US" }));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => mocks.formatLocale,
}));

const BTC_TIERS = [
	{ lowerBound: "0.0", maxLeverage: 40 },
	{ lowerBound: "150000000.0", maxLeverage: 20 },
] as const;

const NEW_MESSAGES = ["Max position size", "No tier limit"] as const;

function readCatalogTranslation(locale: string, message: string): string {
	const catalog = readFileSync(resolve(process.cwd(), `src/locales/${locale}/messages.po`), "utf8");
	const match = catalog.match(new RegExp(`msgid ${JSON.stringify(message)}\\nmsgstr (".*")\\n`));
	return match ? (JSON.parse(match[1]) as string) : "";
}

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

describe("LeveragePositionLimitRow", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.formatLocale = "en-US";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		act(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
	});

	function renderRow(leverage: number, overrides: Partial<ComponentProps<typeof LeveragePositionLimitRow>> = {}) {
		const props = { marginTiers: BTC_TIERS, quoteSymbol: "USDC", leverage, ...overrides };
		act(() => root.render(<LeveragePositionLimitRow {...props} />));
	}

	function getRow(): HTMLElement {
		const row = container.querySelector('[data-slot="info-row"]');
		if (!(row instanceof HTMLElement)) throw new Error("Position limit row not found");
		return row;
	}

	function getValue(): string | null | undefined {
		return container.querySelector('[data-slot="info-row-value"]')?.textContent;
	}

	it("shows the capped notional and the uncapped label on the same row node", () => {
		renderRow(25);
		const row = getRow();

		expect(container.querySelector('[data-slot="info-row-label"]')?.textContent).toBe("Max position size");
		expect(getValue()).toBe("$150,000,000");

		renderRow(20);

		expect(getRow()).toBe(row);
		expect(getValue()).toBe("No tier limit");

		renderRow(40);

		expect(getRow()).toBe(row);
		expect(getValue()).toBe("$150,000,000");
	});

	it.each([
		["a single-tier table", [{ lowerBound: "0.0", maxLeverage: 50 }]],
		["missing tiers", undefined],
		["null tiers", null],
		[
			"an invalid table",
			[
				{ lowerBound: "0", maxLeverage: 10 },
				{ lowerBound: "100", maxLeverage: 20 },
			],
		],
	] as const)("renders nothing for %s", (_name, tiers) => {
		renderRow(5, { marginTiers: tiers });

		expect(container.innerHTML).toBe("");
	});

	it("uses the stable placeholder for a leverage outside the tiers", () => {
		renderRow(41);

		expect(getValue()).toBe(FALLBACK_VALUE_PLACEHOLDER);
	});

	it("formats non-USDC collateral with its quote symbol and never guesses a missing one", () => {
		renderRow(25, { quoteSymbol: "USDH" });
		expect(getValue()).toBe("150,000,000 USDH");

		renderRow(25, { quoteSymbol: null });
		expect(getValue()).toBe(FALLBACK_VALUE_PLACEHOLDER);

		renderRow(20, { quoteSymbol: null });
		expect(getValue()).toBe("No tier limit");
	});

	it("follows a number-format change without remounting the row", () => {
		renderRow(25);
		const row = getRow();

		mocks.formatLocale = "de-DE";
		act(() => notifyNumberFormatChange());

		expect(getRow()).toBe(row);
		expect(getValue()).toBe("$150.000.000");
	});

	it("translates the label and the uncapped value in place when the language changes", () => {
		const zhMessages: Messages = {};
		for (const message of NEW_MESSAGES) {
			const translation = readCatalogTranslation("zh", message);
			expect(translation, message).not.toBe("");
			zhMessages[getMessageId(message)] = translation;
		}
		renderRow(20);
		const row = getRow();

		act(() => i18n.loadAndActivate({ locale: "zh", messages: zhMessages }));

		expect(getRow()).toBe(row);
		expect(container.querySelector('[data-slot="info-row-label"]')?.textContent).toBe("最大仓位");
		expect(getValue()).toBe("无档位上限");
	});

	it.each(["zh", "es", "fr", "hi", "ar"])("ships translations for the new copy in %s", (locale) => {
		for (const message of NEW_MESSAGES) {
			expect(readCatalogTranslation(locale, message), message).not.toBe("");
		}
	});

	it("keeps the row on one line so text changes cannot change its height", () => {
		renderRow(25);

		expect(getRow().className).toContain("whitespace-nowrap");
		expect(container.querySelector('[data-slot="info-row-label"]')?.className).toContain("truncate");
		expect(container.querySelector('[data-slot="info-row-value"]')?.className).toContain("shrink-0");
		expect(getRow().getAttribute("aria-live")).toBeNull();
	});
});
