import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MESSAGE = "{requestedPercent}% requested; {effectivePercent}% after size precision";
const EXPECTED_TRANSLATIONS = {
	ja: "指定 {requestedPercent}%、数量精度の適用後 {effectivePercent}%",
	ar: "طُلب {requestedPercent}٪؛ {effectivePercent}٪ بعد تطبيق دقة الحجم",
	es: "Se solicitó el {requestedPercent} %; queda en el {effectivePercent} % tras aplicar la precisión del tamaño",
	fr: "{requestedPercent} % demandé ; {effectivePercent} % après application de la précision de taille",
	hi: "{requestedPercent}% अनुरोध किया गया; साइज़ की सटीकता लागू करने के बाद {effectivePercent}%",
} as const;

const LEVERAGE_SUCCESS_MESSAGE = "Leverage updated to {leverage}x";
const EXPECTED_LEVERAGE_SUCCESS_TRANSLATIONS = {
	ja: "レバレッジを {leverage}x に更新しました",
	ar: "تم تحديث الرافعة المالية إلى {leverage}x",
	es: "Apalancamiento actualizado a {leverage}x",
	fr: "Effet de levier mis à jour à {leverage}x",
	hi: "लीवरेज {leverage}x पर अपडेट किया गया",
	zh: "杠杆已更新为 {leverage}x",
} as const;

describe("position-close effective-percent catalogs", () => {
	it.each(Object.entries(EXPECTED_TRANSLATIONS))(
		"keeps the %s translation and both placeholders",
		(locale, expected) => {
			const catalog = readFileSync(new URL(`../../locales/${locale}/messages.po`, import.meta.url), "utf8");
			expect(catalog).toContain(`msgid "${MESSAGE}"\nmsgstr "${expected}"`);
			expect(expected).toContain("{requestedPercent}");
			expect(expected).toContain("{effectivePercent}");
		},
	);
});

describe("leverage-success catalogs", () => {
	it.each(Object.entries(EXPECTED_LEVERAGE_SUCCESS_TRANSLATIONS))(
		"keeps the %s translation and leverage placeholder",
		(locale, expected) => {
			const catalog = readFileSync(new URL(`../../locales/${locale}/messages.po`, import.meta.url), "utf8");
			expect(catalog).toContain(`msgid "${LEVERAGE_SUCCESS_MESSAGE}"\nmsgstr "${expected}"`);
			expect(expected).toContain("{leverage}");
		},
	);
});
