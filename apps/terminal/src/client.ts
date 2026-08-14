import { renderBootstrapErrorPage } from "./lib/bootstrap-error-page";
import { canHydrateAfterMobileAgentSyncScrub } from "./lib/mobile-sync/bootstrap-fragment";

if (canHydrateAfterMobileAgentSyncScrub) {
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
