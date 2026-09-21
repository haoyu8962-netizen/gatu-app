import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

export const RADIUS_SCALE = ["4", "8", "12", "16", "20", "24", "32"];
export const SHADOW_SCALE = ["raised", "overlay"];

const twMerge = extendTailwindMerge({ extend: { theme: { radius: RADIUS_SCALE, shadow: SHADOW_SCALE } } });

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
