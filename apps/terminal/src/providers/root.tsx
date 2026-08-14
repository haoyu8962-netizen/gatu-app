import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useHydrated, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import "@/lib/i18n";
import { getQueryRetryDelayMs, shouldRetryQuery } from "@/lib/query-retry";
import { BaseUiDirectionProvider } from "@/providers/base-ui-direction";
import { ClientRuntimeProvider, isDocumentRoutePath } from "@/providers/client-runtime";

const isServer = typeof document === "undefined";
// Start fetching the client-only wallet runtime as soon as the root module evaluates. The
// Suspense boundary can hydrate the stable shell without waiting for it, while this eager promise
// avoids introducing a second network waterfall after hydration. Document-only entries keep the
// wallet code deferred, but a later client navigation into the app can still load it on demand.
let clientRootProviderModule: Promise<typeof import("@/providers/client-root")> | undefined;
function loadClientRootProvider() {
	clientRootProviderModule ??= import("@/providers/client-root");
	return clientRootProviderModule;
}
if (!isServer && !isDocumentRoutePath(window.location.pathname)) {
	void loadClientRootProvider();
}
const LazyClientRootProvider = isServer
	? null
	: lazy(() =>
			loadClientRootProvider().then((module) => ({
				default: module.ClientRootProvider,
			})),
		);

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

function ServerProviders({ children, queryClient }: { children: React.ReactNode; queryClient: QueryClient }) {
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

export function RootProvider({ children, queryClient }: { children: React.ReactNode; queryClient: QueryClient }) {
	const hydrated = useHydrated();
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	if (isServer || !hydrated || !LazyClientRootProvider || isDocumentRoutePath(pathname)) {
		return <ServerProviders queryClient={queryClient}>{children}</ServerProviders>;
	}

	return (
		<Suspense fallback={<ServerProviders queryClient={queryClient}>{children}</ServerProviders>}>
			<LazyClientRootProvider queryClient={queryClient}>{children}</LazyClientRootProvider>
		</Suspense>
	);
}
