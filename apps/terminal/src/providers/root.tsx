import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import "@/lib/i18n";
import { getQueryRetryDelayMs, shouldRetryQuery } from "@/lib/query-retry";
import { BaseUiDirectionProvider } from "@/providers/base-ui-direction";
import { clientRootLoader } from "@/providers/client-root-loader";
import { ClientRuntimeProvider } from "@/providers/client-runtime";

const isServer = typeof document === "undefined";
// Start fetching the client-only wallet runtime as soon as the root module evaluates. The document
// shell hydrates without waiting for it, while this eager promise avoids introducing a second network
// waterfall after hydration. The loaded component is published through a plain store instead of
// React.lazy: a Suspense boundary that showed its fallback during hydration makes React throttle
// the reveal of resolved content by 300ms, which cost the first real render that much on every
// cold load.
if (!isServer) {
	clientRootLoader.load().catch(() => {});
}

export function getRootProviderContext() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: shouldRetryQuery,
				retryDelay: getQueryRetryDelayMs,
			},
		},
	});
	return { queryClient };
}

// Wraps the document shell (<html>/<head>/<body>). Its element structure never changes across SSR,
// hydration and client runtime activation, so the shell — and the stylesheet links inside <head> —
// stay mounted for the lifetime of the page.
export function RootProvider({ children, queryClient }: { children: React.ReactNode; queryClient: QueryClient }) {
	return (
		<QueryClientProvider client={queryClient}>
			<I18nProvider i18n={i18n}>
				<BaseUiDirectionProvider>
					<ClientRuntimeProvider ready={false}>{children}</ClientRuntimeProvider>
				</BaseUiDirectionProvider>
			</I18nProvider>
		</QueryClientProvider>
	);
}

export function ClientRuntimeGate({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
	const hydrated = useHydrated();
	const queryClient = useQueryClient();
	const { Provider: ClientRootProvider, error } = useSyncExternalStore(
		clientRootLoader.subscribe,
		clientRootLoader.getState,
		clientRootLoader.getServerState,
	);

	if (isServer || !hydrated) return <>{fallback}</>;
	if (error) throw error;
	if (!ClientRootProvider) {
		clientRootLoader.load().catch(() => {});
		return <>{fallback}</>;
	}

	return <ClientRootProvider queryClient={queryClient}>{children}</ClientRootProvider>;
}
