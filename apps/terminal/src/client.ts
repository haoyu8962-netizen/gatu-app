import { renderBootstrapErrorPage, reportBootstrapEntryStarted } from "./lib/bootstrap-error-page";
import { markStartupMilestone, scheduleStartupDiagnostics } from "./lib/diagnostics/startup-milestones";
import { applyWindowLinkLocale } from "./lib/link-locale";

markStartupMilestone("entry");
reportBootstrapEntryStarted();
applyWindowLinkLocale();
scheduleStartupDiagnostics();

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
