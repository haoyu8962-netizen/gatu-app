import { i18n } from "@lingui/core";
import { STORAGE_KEYS } from "@/config/app";
import { defaultLocale, isRtlLocale, isValidLocale, type LocaleCode } from "@/config/i18n";
import { expandCatalogMessages, type LoadableCatalogModule } from "@/lib/i18n-catalog";
import { applyWindowLinkLocale, storeLocale } from "@/lib/link-locale";

export { resolveNumberFormatLocale } from "@/config/i18n";

import { messages as enMessages } from "@/locales/en/messages.po";

const catalogImports = import.meta.glob<LoadableCatalogModule>([
	"../locales/*/messages.po",
	"!../locales/en/messages.po",
]);

export function getPersistedLocale(): LocaleCode {
	if (typeof window === "undefined") return defaultLocale;
	try {
		const stored = window.localStorage.getItem(STORAGE_KEYS.LOCALE);
		return stored && isValidLocale(stored) ? stored : defaultLocale;
	} catch {
		return defaultLocale;
	}
}

// A link that names a language (`?lang=ja`) is stored before the boot below reads the stored
// language, while this module is evaluated and before the router reads the location (link-locale.ts;
// the client entry has normally applied it already).
applyWindowLinkLocale();

// Keeps <html lang/dir> in sync with the active locale, re-asserting past any document-shell
// re-render via a MutationObserver. The idempotent `!==` guards make it settle in one pass.
function syncDocumentLocale() {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	const dir = isRtlLocale(i18n.locale) ? "rtl" : "ltr";
	if (root.lang !== i18n.locale) root.lang = i18n.locale;
	if (root.dir !== dir) root.dir = dir;
}

// Install the change listener + observer once per page (the guard avoids duplicates across HMR /
// repeated module evaluation in dev).
const globalScope = globalThis as { __sairnI18nDocSync?: boolean };
if (typeof document !== "undefined" && !globalScope.__sairnI18nDocSync) {
	globalScope.__sairnI18nDocSync = true;
	i18n.on("change", syncDocumentLocale);
	new MutationObserver(syncDocumentLocale).observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["lang", "dir"],
	});
}

// Monotonic guard: with concurrent switches (spam-clicking the language menu), only the latest
// request may activate + persist, so a slower earlier catalog load can't clobber the final choice.
let activationSeq = 0;

/**
 * Dynamically import + activate a locale's catalog and persist the choice. Only English is bundled
 * eagerly; every other locale is a lazy chunk loaded here on demand. Throws if the locale has no
 * catalog — callers must handle it (and keep the previous locale).
 *
 * Returns `true` only when THIS call persisted + activated `locale`; returns `false` if a newer
 * switch superseded it (rapid switching), and throws if persistence fails.
 */
export async function dynamicActivate(locale: string): Promise<boolean> {
	const seq = ++activationSeq;
	if (i18n.locale === locale) {
		if (!storeLocale(locale)) throw new Error(`Unable to persist locale "${locale}"`);
		return true;
	}
	if (locale === defaultLocale) {
		if (!storeLocale(locale)) throw new Error(`Unable to persist locale "${locale}"`);
		i18n.loadAndActivate({ locale, messages: enMessages });
	} else {
		const loader = catalogImports[`../locales/${locale}/messages.po`];
		if (!loader) {
			throw new Error(`No locale data found for "${locale}"`);
		}
		const catalog = await loader();
		if (seq !== activationSeq) return false;
		const messages = expandCatalogMessages(enMessages, catalog);
		if (!storeLocale(locale)) throw new Error(`Unable to persist locale "${locale}"`);
		i18n.loadAndActivate({ locale, messages });
	}
	if (seq !== activationSeq) return false;
	return true;
}

// How long the startup gate waits for the persisted catalog before revealing in English: the same
// cap as the startup fonts (FONT_READY_TIMEOUT_MS), so a stalled catalog request never leaves the page
// blank longer than a stalled font does. A catalog that arrives later still activates and the live
// translations switch in place.
export const LOCALE_CATALOG_READY_TIMEOUT_MS = 3000;

// Boot: activate English synchronously (the only eagerly-bundled catalog) so the app always has an
// active catalog, then restore the persisted language. `i18nReady` resolves once the persisted
// catalog is active so the UI can gate its first render on it — no flash of English / RTL jump for
// non-English users.
i18n.loadAndActivate({ locale: defaultLocale, messages: enMessages });
syncDocumentLocale();

export const i18nReady: Promise<void> = (async () => {
	const initialLocale = getPersistedLocale();
	if (initialLocale !== defaultLocale) {
		await dynamicActivate(initialLocale).catch(() => {});
	}
})();
