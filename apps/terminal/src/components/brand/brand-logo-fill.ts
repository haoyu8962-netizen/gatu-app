import type { BrandLogoPart } from "./brand-logo-geometry.gen";

export const BRAND_LOGO_FILL: Record<BrandLogoPart, string> = {
	signal: "var(--logo-signal, currentColor)",
	choice: "var(--logo-choice, currentColor)",
	wordmark: "var(--logo-wordmark, currentColor)",
};
