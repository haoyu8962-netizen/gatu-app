import { invalidateAllExchangeRequestIdentities } from "@gatu/hl-react/internal/exchange/request-scheduler";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { reportClientError } from "./lib/error-reporting/client";
import { armMobileSyncDraftExpiryCleanup } from "./lib/mobile-sync/draft-storage";

armMobileSyncDraftExpiryCleanup();
startTransition(() => {
	hydrateRoot(
		document,
		<StrictMode>
			<StartClient />
		</StrictMode>,
		{
			onRecoverableError: (error, info) => {
				reportClientError(error, {
					kind: "react_recoverable",
					componentStack: info.componentStack,
				});
			},
			onUncaughtError: (error, info) => {
				invalidateAllExchangeRequestIdentities();
				reportClientError(error, {
					kind: "react_uncaught",
					componentStack: info.componentStack,
				});
			},
		},
	);
});
