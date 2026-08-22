import { useCallback, useSyncExternalStore } from "react";
import { MOBILE_BREAKPOINT_PX } from "@/config/layout";

export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;
export const MOBILE_QR_SURFACE_MEDIA_QUERY = `${MOBILE_MEDIA_QUERY}, (pointer: coarse), (display-mode: standalone)`;

function subscribeToMediaQuery(query: string, callback: () => void): () => void {
	const mql = window.matchMedia(query);
	mql.addEventListener("change", callback);
	return () => mql.removeEventListener("change", callback);
}

function getMediaQueryMatch(query: string): boolean {
	if (typeof window === "undefined") return false;
	return window.matchMedia(query).matches;
}

function getServerSnapshot(): boolean {
	return false;
}

export function useIsMobile(): boolean {
	return useSyncExternalStore(
		(callback) => subscribeToMediaQuery(MOBILE_MEDIA_QUERY, callback),
		() => getMediaQueryMatch(MOBILE_MEDIA_QUERY),
		getServerSnapshot,
	);
}

/**
 * Keeps the in-app QR scanner reachable on tablets and installed PWAs without
 * changing the terminal's inclusive 1000px mobile-layout breakpoint.
 */
export function useIsMobileQrSurface(): boolean {
	return useSyncExternalStore(
		(callback) => subscribeToMediaQuery(MOBILE_QR_SURFACE_MEDIA_QUERY, callback),
		() => getMediaQueryMatch(MOBILE_QR_SURFACE_MEDIA_QUERY),
		getServerSnapshot,
	);
}

export function useOnlineStatus(): boolean {
	const getOnline = useCallback(() => navigator.onLine, []);

	return useSyncExternalStore(
		(callback) => {
			window.addEventListener("online", callback);
			window.addEventListener("offline", callback);
			return () => {
				window.removeEventListener("online", callback);
				window.removeEventListener("offline", callback);
			};
		},
		getOnline,
		() => true,
	);
}
