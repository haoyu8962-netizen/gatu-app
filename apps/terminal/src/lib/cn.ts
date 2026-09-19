import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

export const RADIUS_SCALE = ["4", "8", "12", "16", "20", "24", "32"];

const twMerge = extendTailwindMerge({ extend: { theme: { radius: RADIUS_SCALE } } });

export function cn(...classes: ClassValue[]) {
	return twMerge(clsx(...classes));
}
