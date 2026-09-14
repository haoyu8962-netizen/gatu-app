import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useHydrated, useRouterState } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import "@/lib/i18n";
import { getQueryRetryDelayMs, shouldRetryQuery } from "@/lib/query-retry";
import { BaseUiDirectionProvider } from "@/providers/base-ui-direction";
import { ClientRuntimeProvider, getPresentedRoutePathname, isDocumentRoutePath } from "@/providers/client-runtime";

const isServer = typeof document === "undefined";
type ClientRootProviderComponent = typeof import("@/providers/client-root").ClientRootProvider;
// Start fetching the client-only wallet runtime as soon as the root module evaluates. The document
// shell hydrates without waiting for it, while this eager promise avoids introducing a second network
// waterfall after hydration. Document-only entries keep the wallet code deferred, but a later client
// navigation into the app can still load it on demand. The loaded component is published through a
// plain store instead of React.lazy: a Suspense boundary that showed its fallback during hydration
// makes React throttle the reveal of resolved content by 300ms, which cost the first real render
// that much on every cold load.
let clientRootProviderModule: Promise<typeof import("@/providers/client-root")> | undefined;
let clientRootProvider: ClientRootProviderComponent | null = null;
let clientRootProviderError: unknown;
const clientRootProviderListeners = new Set<() => void>();
function loadClientRootProvider() {
	clientRootProviderModule ??= import("@/providers/client-root").then(
		(module) => {
			clientRootProvider = module.ClientRootProvider;
			for (const listener of clientRootProviderListeners) listener();
			return module;
		},
		(error: unknown) => {
			clientRootProviderError = error;
			for (const listener of clientRootProviderListeners) listener();
			throw error;
		},
	);
	return clientRootProviderModule;
}
function subscribeClientRootProvider(listener: () => void) {
	clientRootProviderListeners.add(listener);
	return () => {
		clientRootProviderListeners.delete(listener);
	};
}
function getClientRootProvider() {
	return clientRootProvider;
}
function getServerClientRootProvider() {
	return null;
}
if (!isServer && !isDocumentRoutePath(window.location.pathname)) {
	loadClientRootProvider().catch(() => {});
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
	const pathname = useRouterState({ select: getPresentedRoutePathname });
	const queryClient = useQueryClient();
	const ClientRootProvider = useSyncExternalStore(
		subscribeClientRootProvider,
		getClientRootProvider,
		getServerClientRootProvider,
	);

	if (isDocumentRoutePath(pathname)) {
		return <>{children}</>;
	}
	if (isServer || !hydrated) return <>{fallback}</>;
	if (clientRootProviderError) throw clientRootProviderError;
	if (!ClientRootProvider) {
		loadClientRootProvider().catch(() => {});
		return <>{fallback}</>;
	}

	return <ClientRootProvider queryClient={queryClient}>{children}</ClientRootProvider>;
}
