import { i18n, type Messages } from "@lingui/core";
import { STORAGE_KEYS } from "@/config/app";
import { defaultLocale, isRtlLocale, isValidLocale, type LocaleCode } from "@/config/i18n";

export { resolveNumberFormatLocale } from "@/config/i18n";

import { messages as enMessages } from "@/locales/en/messages.po";

const catalogImports = import.meta.glob<{ messages: Messages }>([
	"../locales/*/messages.po",
	"!../locales/en/messages.po",
]);

function getPersistedLocale(): LocaleCode {
	if (typeof window === "undefined") return defaultLocale;
	try {
		const stored = window.localStorage.getItem(STORAGE_KEYS.LOCALE);
		return stored && isValidLocale(stored) ? stored : defaultLocale;
	} catch {
		return defaultLocale;
	}
}

function persistLocale(locale: string) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(STORAGE_KEYS.LOCALE, locale);
	} catch {}
}

// Keeps <html lang/dir> in sync with the active locale. The document shell (routes/__root.tsx)
// renders a static lang="en" for SSR and can reset it whenever React reconciles it during a
// language switch, so a MutationObserver re-asserts the active locale's lang/dir as the last
// writer. The `!==` guards make every write idempotent, so the observer settles after one pass.
function syncDocumentLocale() {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	const dir = isRtlLocale(i18n.locale) ? "rtl" : "ltr";
	if (root.lang !== i18n.locale) root.lang = i18n.locale;
	if (root.dir !== dir) root.dir = dir;
}

if (typeof document !== "undefined") {
	i18n.on("change", syncDocumentLocale);
	new MutationObserver(syncDocumentLocale).observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["lang", "dir"],
	});
}

/**
 * Dynamically import + activate a locale's catalog and persist the choice. Only English is bundled
 * eagerly; every other locale is a lazy chunk loaded here on demand.
 */
export async function dynamicActivate(locale: string) {
	if (i18n.locale !== locale) {
		if (locale === defaultLocale) {
			i18n.loadAndActivate({ locale, messages: enMessages });
		} else {
			const loader = catalogImports[`../locales/${locale}/messages.po`];
			if (!loader) {
				throw new Error(`No locale data found for "${locale}"`);
			}
			const { messages } = await loader();
			i18n.loadAndActivate({ locale, messages });
		}
	}
	persistLocale(locale);
}

// Boot: activate English synchronously (the only eagerly-bundled catalog) so the app always has an
// active catalog, then restore the persisted language as a lazy chunk. RootDocument lang/dir and
// LocaleKeyBoundary (route remount) react to the resulting i18n change.
i18n.loadAndActivate({ locale: defaultLocale, messages: enMessages });
syncDocumentLocale();

const initialLocale = getPersistedLocale();
if (initialLocale !== defaultLocale) {
	void dynamicActivate(initialLocale).catch(() => {});
}
