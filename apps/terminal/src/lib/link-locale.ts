import { STORAGE_KEYS } from "@/config/app";
import { defaultLocale, isValidLocale, type LocaleCode } from "@/config/i18n";

/** The query parameter a link uses to open the terminal in a language: `/trade/xyz:ANT?lang=ja`. */
export const LINK_LOCALE_PARAM = "lang";

/**
 * The interface language a link names, or null. Case is ignored and a region tag falls back to its
 * language (`ja-JP` → `ja`); anything that is not a maintained interface language is ignored.
 */
export function parseLinkLocale(search: string): LocaleCode | null {
	const value = new URLSearchParams(search).get(LINK_LOCALE_PARAM)?.trim().toLowerCase();
	if (!value) return null;
	if (isValidLocale(value)) return value;
	const [language] = value.split(/[-_]/);
	if (language && isValidLocale(language)) return language;
	return null;
}

/**
 * The same path, query and hash without the language parameter, or null when the URL has none. The
 * remaining parameters (UTM and others) keep their order.
 */
export function withoutLinkLocale(pathname: string, search: string, hash: string): string | null {
	const params = new URLSearchParams(search);
	if (!params.has(LINK_LOCALE_PARAM)) return null;
	params.delete(LINK_LOCALE_PARAM);
	const query = params.toString();
	return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

/**
 * Applies a link's language before the terminal boots: a link that names a language is the visitor's
 * choice for this load, persisted like a pick from the language menu, so the startup gate, the first
 * render and the bootstrap error copy all read it; then the parameter (valid or not) is removed from the
 * address bar, keeping the history state, so a reload or a later menu choice is not overridden. Returns
 * the language it stored, or null.
 */
export function applyLinkLocale(
	location: Pick<Location, "pathname" | "search" | "hash">,
	history: Pick<History, "state" | "replaceState">,
	persist: (locale: LocaleCode) => boolean,
): LocaleCode | null {
	const { pathname, search, hash } = location;
	const locale = parseLinkLocale(search);
	const stored = locale !== null && persist(locale) ? locale : null;
	const cleaned = withoutLinkLocale(pathname, search, hash);
	if (cleaned !== null) {
		try {
			history.replaceState(history.state, "", cleaned);
		} catch {
			// The address keeps the parameter, which only repeats the same choice on a reload.
		}
	}
	return stored;
}

/** Stores the interface language the way the language menu does: English is the absence of a choice. */
export function storeLocale(locale: string): boolean {
	if (typeof window === "undefined") return false;
	try {
		if (locale === defaultLocale) {
			window.localStorage.removeItem(STORAGE_KEYS.LOCALE);
		} else {
			window.localStorage.setItem(STORAGE_KEYS.LOCALE, locale);
		}
		return true;
	} catch {
		return false;
	}
}

/**
 * Runs first in the client entry (`client.ts`), before any dynamic import, so even the bootstrap error
 * page shown when the runtime fails to load reads the link's language; `lib/i18n.ts` runs it again when
 * it is evaluated, which finds the parameter already removed.
 */
export function applyWindowLinkLocale(): LocaleCode | null {
	if (typeof window === "undefined") return null;
	return applyLinkLocale(window.location, window.history, storeLocale);
}
