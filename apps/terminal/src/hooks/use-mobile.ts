import { useCallback, useSyncExternalStore } from "react";
import { MOBILE_BREAKPOINT_PX } from "@/config/layout";

export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;

function subscribeToMediaQuery(callback: () => void): () => void {
	const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
	mql.addEventListener("change", callback);
	return () => mql.removeEventListener("change", callback);
}

function getIsMobile(): boolean {
	if (typeof window === "undefined") return false;
	return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function getServerSnapshot(): boolean {
	return false;
}

export function useIsMobile(): boolean {
	return useSyncExternalStore(subscribeToMediaQuery, getIsMobile, getServerSnapshot);
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
