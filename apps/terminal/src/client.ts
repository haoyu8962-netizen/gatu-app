import { renderBootstrapErrorPage } from "./lib/bootstrap-error-page";
import { shouldPrefetchGeo, startGeoPrefetch } from "./lib/geo/geo-prefetch";
import { canHydrateAfterMobileAgentSyncScrub } from "./lib/mobile-sync/bootstrap-fragment";
import { startSurfacePreloads } from "./lib/preload/surface-preloads";

if (canHydrateAfterMobileAgentSyncScrub) {
	if (shouldPrefetchGeo(window.location.pathname)) startGeoPrefetch();
	startSurfacePreloads();
	void import("./lib/error-reporting/client")
		.then(({ installGlobalErrorReporting, reportClientError }) => {
			installGlobalErrorReporting();
			return import("./client-hydrate").catch((error: unknown) => {
				reportClientError(error, { kind: "react_uncaught" });
				renderBootstrapErrorPage();
			});
		})
		.catch(() => {
			renderBootstrapErrorPage();
		});
}
