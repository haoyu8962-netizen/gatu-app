import { STORAGE_KEYS } from "@/config/app";
import { PWA_LIGHT_THEME_COLOR, PWA_THEME_COLOR } from "@/config/brand";

export type DocumentTheme = "dark" | "light";

/** `<meta name="theme-color">` per applied theme: each value is that theme's `--bg-base`. */
export const THEME_COLORS: Readonly<Record<DocumentTheme, string>> = {
	dark: PWA_THEME_COLOR,
	light: PWA_LIGHT_THEME_COLOR,
};

const THEME_COLOR_SELECTOR = 'meta[name="theme-color"]';

/**
 * The theme color for the theme class currently on `<html>`; the prerender has no document and
 * gets the dark default. The root route's `head()` runs again in the browser before hydration,
 * and React claims an existing `<meta>` only when its `content` matches, so this has to return
 * what the bootstrap script already wrote or React appends a second, stale theme-color tag.
 */
export function getDocumentThemeColor(): string {
	if (typeof document === "undefined") return THEME_COLORS.dark;
	return THEME_COLORS[document.documentElement.classList.contains("light") ? "light" : "dark"];
}

/** Points every theme-color tag at the theme, including one a re-rendered head inserted with an older value. */
export function applyThemeColor(theme: DocumentTheme) {
	if (typeof document === "undefined") return;
	const color = THEME_COLORS[theme];
	for (const meta of document.querySelectorAll(THEME_COLOR_SELECTOR)) {
		if (meta.getAttribute("content") !== color) meta.setAttribute("content", color);
	}
}

/**
 * Runs in `<head>` before the stylesheet and first paint: applies the persisted theme class and
 * the matching theme color from the same read. Its CSP hash is collected from the built HTML.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(()=>{let theme="dark";try{const value=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEYS.GLOBAL_SETTINGS)})||"null");if(value?.state?.theme==="light")theme="light"}catch{}const root=document.documentElement;root.classList.remove("light","dark");root.classList.add(theme);const color=theme==="light"?${JSON.stringify(THEME_COLORS.light)}:${JSON.stringify(THEME_COLORS.dark)};for(const meta of document.querySelectorAll(${JSON.stringify(THEME_COLOR_SELECTOR)}))meta.setAttribute("content",color)})();`;
