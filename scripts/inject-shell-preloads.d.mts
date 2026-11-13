export const SHELL_PRELOAD_START: string;
export const SHELL_PRELOAD_END: string;
export const DESKTOP_MIN_WIDTH_PX: number;
export const DESKTOP_MEDIA_QUERY: string;
export const SURFACE_PRELOAD_META: { desktop: string; mobile: string; chart: string; catalogs: string };
export function collectShellPreloadFiles(analysis: {
	tradeStartupFiles: Iterable<string>;
	runtimeProfileSizes: ReadonlyArray<{ name: string; files: Iterable<string> }>;
}): { common: string[]; desktopOnly: string[]; mobileOnly: string[] };
export function renderSurfacePreloadMeta(input: {
	desktopOnly: readonly string[];
	mobileOnly: readonly string[];
	chartPrefetches: readonly string[];
	localeCatalogs?: readonly string[];
}): string[];
export function collectLocaleCatalogFiles(input: {
	graph: { chunks: Record<string, { modules: string[]; imports: string[]; dynamicImports: string[] }> };
	assetFiles: readonly string[];
	startupFiles: Iterable<string>;
	locales?: readonly string[];
}): string[];
export function listSourceLocales(localesDirectory: string): string[];
export function renderShellHeadLinks(input: {
	html: string;
	surfaces: { common: string[]; desktopOnly: string[]; mobileOnly: string[] };
	chartLibraryScript: string | undefined;
	chartBundles: { runtime: string; library: string };
	localeCatalogs: readonly string[];
}): string[];
export function collectChartPrefetches(bundles: { runtime: string; library: string }): string[];
export function readShellAssetHrefs(html: string): Set<string>;
export function renderShellPreloadLinks(input: { files: readonly string[]; existingHrefs: Set<string> }): string[];
export function findChartBundles(bundlesDirectory: string): { runtime: string; library: string };
export function renderChartPreloadLink(input: { chartLibraryScript: string | undefined; mediaQuery?: string }): string;
export function injectShellPreloads(html: string, links: readonly string[]): string;
export function injectShellPreloadsIntoBuild(
	publicDirectory?: string,
): Promise<{
	files: string[];
	links: string[];
	surfaces: { common: string[]; desktopOnly: string[]; mobileOnly: string[] };
	localeCatalogs: string[];
}>;
