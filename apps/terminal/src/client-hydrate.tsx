import { invalidateAllExchangeRequestIdentities } from "@sairn/hl-react/internal/exchange/request-scheduler";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderBootstrapErrorPage } from "./lib/bootstrap-error-page";
import { reportClientError } from "./lib/error-reporting/client";

let root: Root | undefined;
let rootFatalFallbackScheduled = false;

startTransition(() => {
	root = hydrateRoot(
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
				handleRootFatalError(error, info.componentStack);
			},
		},
	);
});

function handleRootFatalError(error: unknown, componentStack: string | undefined): void {
	if (rootFatalFallbackScheduled) return;
	rootFatalFallbackScheduled = true;

	try {
		invalidateAllExchangeRequestIdentities();
	} catch {}
	try {
		reportClientError(error, {
			kind: "react_uncaught",
			componentStack,
		});
	} catch {}

	queueMicrotask(() => {
		try {
			root?.unmount();
		} catch {}
		renderBootstrapErrorPage();
	});
}
