/**
 * Location of the TradingView package inside the public output. Kept free of environment access
 * so the Vite config and the build metadata can import it while writing `build-meta.json`.
 */
export const CHART_LIBRARY_PATH = "/charting_library/";

/** The loader script URL; the commit query makes each release a new browser cache entry. */
export function createChartLibraryScriptUrl(commit: string): string {
	return `${CHART_LIBRARY_PATH}charting_library.js?v=${encodeURIComponent(commit)}`;
}
