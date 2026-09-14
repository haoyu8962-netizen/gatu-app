/**
 * Location of the TradingView package inside the public output. Kept free of environment access
 * so the Vite config and the build metadata can import it while writing `build-meta.json`.
 */
export const CHART_LIBRARY_PATH = "/charting_library/";
export const CHART_LIBRARY_ENTRY_FILE = "charting_library.js";
const CONTENT_HASH_PATTERN = /^[0-9a-f]{16}$/;

export function isChartLibraryContentHash(value: string): boolean {
	return CONTENT_HASH_PATTERN.test(value);
}

/** The build copies the loader under this name, so a library upgrade is a new URL for browsers and the edge alike. */
export function createHashedChartLibraryEntryPath(hash: string): string {
	return `charting_library/charting_library.${hash}.js`;
}

/**
 * The loader script URL. A content hash names the immutable copy the build emits; anything else
 * (the dev server has no hash) requests the plain file with a cache-busting query instead. A query
 * alone is not enough in production: CloudFront caches that path without its query string, so a
 * browser could pin an old library body under a new version for a year.
 */
export function createChartLibraryScriptUrl(version: string): string {
	if (isChartLibraryContentHash(version)) return `/${createHashedChartLibraryEntryPath(version)}`;
	return `${CHART_LIBRARY_PATH}${CHART_LIBRARY_ENTRY_FILE}?v=${encodeURIComponent(version)}`;
}
