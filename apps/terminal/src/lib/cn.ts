import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

export const RADIUS_SCALE = ["4", "8", "12", "16", "20", "24", "32"];
export const SHADOW_SCALE = [
	"raised",
	"overlay",
	"api-wallet-page",
	"api-wallet-modal",
	"market-close-inline-edit",
	"legal-acceptance",
	"trading-panel-slider",
];
export const FONT_FAMILY_SCALE = ["market-close"];

const twMerge = extendTailwindMerge({
	extend: { theme: { radius: RADIUS_SCALE, shadow: SHADOW_SCALE, font: FONT_FAMILY_SCALE } },
});

export function cn(...classes: ClassValue[]) {
	return twMerge(clsx(...classes));
}
