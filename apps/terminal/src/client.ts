import { renderBootstrapErrorPage } from "./lib/bootstrap-error-page";
import {
	canHydrateAfterMobileAgentSyncScrub,
	leaveBlockedMobileAgentSyncLink,
} from "./lib/mobile-sync/bootstrap-fragment";

if (canHydrateAfterMobileAgentSyncScrub) {
	void import("./lib/bootstrap/early-prefetch")
		.then(({ startEarlyPrefetches }) => startEarlyPrefetches())
		.catch(() => {});
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
} else {
	renderBootstrapErrorPage({ onReload: () => leaveBlockedMobileAgentSyncLink(), variant: "pairing-blocked" });
	leaveBlockedMobileAgentSyncLink();
}
