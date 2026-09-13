export const SHELL_PRELOAD_START: string;
export const SHELL_PRELOAD_END: string;
export const DESKTOP_MIN_WIDTH_PX: number;
export const DESKTOP_MEDIA_QUERY: string;
export function collectShellPreloadFiles(analysis: {
	tradeStartupFiles: Iterable<string>;
	runtimeProfileSizes: ReadonlyArray<{ files: Iterable<string> }>;
}): string[];
export function readShellAssetHrefs(html: string): Set<string>;
export function renderShellPreloadLinks(input: { files: readonly string[]; existingHrefs: Set<string> }): string[];
export function findChartBundles(bundlesDirectory: string): { runtime: string; library: string };
export function renderChartPreloadLinks(input: {
	chartLibraryScript: string | undefined;
	bundles: { runtime: string; library: string };
	mediaQuery?: string;
}): string[];
export function injectShellPreloads(html: string, links: readonly string[]): string;
export function injectShellPreloadsIntoBuild(publicDirectory?: string): Promise<{ files: string[]; links: string[] }>;
