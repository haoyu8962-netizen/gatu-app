export const locales = {
	en: "English",
	zh: "中文",
	hi: "हिन्दी",
	es: "Español",
	fr: "Français",
	ar: "العربية",
} as const;

export type LocaleCode = keyof typeof locales;

export const localeList = Object.entries(locales).map(([code, name]) => ({
	code: code as LocaleCode,
	name,
}));

export const numberFormatLocales = {
	auto: "Auto (Follow Language)",
	"en-US": "English (US) - 1,234.56",
	"en-GB": "English (UK) - 1,234.56",
	"de-DE": "German - 1.234,56",
	"fr-FR": "French - 1 234,56",
	"es-ES": "Spanish - 1.234,56",
	"zh-CN": "Chinese - 1,234.56",
	"ja-JP": "Japanese - 1,234.56",
	"ar-SA": "Arabic - ١٬٢٣٤٫٥٦",
	"hi-IN": "Hindi - 1,234.56",
	"pt-BR": "Portuguese (Brazil) - 1.234,56",
	"ru-RU": "Russian - 1 234,56",
} as const;

export type NumberFormatLocale = keyof typeof numberFormatLocales;

export const numberFormatLocaleList = Object.entries(numberFormatLocales).map(([code, name]) => ({
	code: code as NumberFormatLocale,
	name,
}));

export const languageToIntlLocale: Record<LocaleCode, string> = {
	en: "en-US",
	zh: "zh-CN",
	hi: "hi-IN",
	es: "es-ES",
	fr: "fr-FR",
	ar: "ar-SA",
};

export const defaultLocale: LocaleCode = "en";

export function resolveNumberFormatLocale(
	formatLocale: NumberFormatLocale,
	activeLocale: LocaleCode = defaultLocale,
): string {
	if (formatLocale === "auto") {
		return languageToIntlLocale[activeLocale] ?? "en-US";
	}
	return formatLocale;
}
