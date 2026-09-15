import { getAppRouteSurface } from "@/config/app-route-surface";
import { shouldPrefetchGeo, startGeoPrefetch } from "@/lib/geo/geo-prefetch";
import { startSurfacePreloads } from "@/lib/preload/surface-preloads";

/**
 * Runs from the bootstrap entry right after the mobile credential scrub, in parallel with the
 * telemetry and hydration imports: the jurisdiction lookup and the surface-specific preload links
 * start before the wallet runtime chunks execute. Kept behind a dynamic import so the entry itself
 * stays dependency-free until the scrub has run. Trade panels and chart bundles are only worth
 * fetching on the terminal surface; dashboards and document pages keep to the shared startup closure.
 */
export function startEarlyPrefetches(pathname: string = window.location.pathname): void {
	if (shouldPrefetchGeo(pathname)) startGeoPrefetch();
	if (getAppRouteSurface(pathname) === "terminal") startSurfacePreloads();
}
