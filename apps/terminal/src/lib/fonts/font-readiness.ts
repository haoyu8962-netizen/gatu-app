export const STARTUP_FONT_SPECS = ['400 14px "Inter Variable"', '400 13px "IBM Plex Sans Variable"'];
export const MARKET_CLOSE_FONT_SPECS = ['400 10px "IBM Plex Sans Variable"', '600 13px "IBM Plex Sans Variable"'];
export const FONT_READY_TIMEOUT_MS = 3000;

function getFontFaceSet(): FontFaceSet | undefined {
	if (typeof document === "undefined") return undefined;
	return document.fonts ?? undefined;
}

export function areFontsReady(specs: readonly string[]): boolean {
	const fonts = getFontFaceSet();
	if (typeof fonts?.check !== "function") return true;
	return specs.every((spec) => fonts.check(spec));
}

export function waitForFonts(specs: readonly string[], timeoutMs = FONT_READY_TIMEOUT_MS): Promise<void> {
	const fonts = getFontFaceSet();
	if (typeof fonts?.load !== "function" || areFontsReady(specs)) return Promise.resolve();
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, timeoutMs);
		const settle = () => {
			clearTimeout(timer);
			resolve();
		};
		Promise.all(specs.map((spec) => fonts.load(spec))).then(settle, settle);
	});
}
