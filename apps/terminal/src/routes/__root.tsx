import { i18n } from "@lingui/core";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import { ApplicationErrorBoundary } from "@/components/application-error-boundary";
import { DashboardShellSkeleton } from "@/components/dashboard/dashboard-shell-skeleton";
import { NotFoundPage } from "@/components/pages/not-found-page";
import { RouterErrorPage } from "@/components/pages/router-error-page";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { isRtlLocale } from "@/config/i18n";
import { MarketsInfoProvider } from "@/lib/hyperliquid/hooks/MarketsInfoProvider";
import { getPersistedLocale, i18nReady } from "@/lib/i18n";
import { createLazyComponent } from "@/lib/lazy";
import { buildRootHead } from "@/lib/seo";
import { getAppRouteSurface, useClientRuntimeReady } from "@/providers/client-runtime";
import { ExchangeScopeProvider } from "@/providers/exchange-scope";
import { ClientRuntimeGate } from "@/providers/root";
import "@/bones/registry";
import ibmPlexSansLatinWoff2 from "@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2?url";
import interLatinWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import appCss from "../styles.css?url";

const FONT_PRELOAD_URLS = [interLatinWoff2, ibmPlexSansLatinWoff2];

const Toaster = createLazyComponent(() => import("@/components/ui/sonner"), "Toaster");
const FundsActionRecoveryHost = createLazyComponent(
	() => import("@/components/funds-action/funds-action-recovery-host"),
	"FundsActionRecoveryHost",
);
const THEME_BOOTSTRAP_SCRIPT = `(()=>{let theme="dark";try{const value=JSON.parse(localStorage.getItem("global-settings-v2")||"null");if(value?.state?.theme==="light")theme="light"}catch{}document.documentElement.classList.remove("light","dark");document.documentElement.classList.add(theme)})();`;
let serviceWorkerRegistration: Promise<ServiceWorkerRegistration | undefined> | undefined;

function registerServiceWorker() {
	if (serviceWorkerRegistration || !("serviceWorker" in navigator)) return;
	serviceWorkerRegistration = navigator.serviceWorker
		.register("/sw.js", { scope: "/", updateViaCache: "none" })
		.catch(() => undefined);
}

interface MyRouterContext {
	queryClient: QueryClient;
}

interface RootSearch {
	scope?: "all";
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	validateSearch: (search: Record<string, unknown>): RootSearch => (search.scope === "all" ? { scope: "all" } : {}),
	head: () => buildRootHead(FONT_PRELOAD_URLS),
	shellComponent: RootDocument,
	component: RootComponent,
	errorComponent: RouterErrorPage,
	notFoundComponent: NotFoundPage,
});

function RootComponent() {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const routeSurface = getAppRouteSurface(pathname);

	useEffect(() => {
		registerServiceWorker();
	}, []);

	if (routeSurface === "document") {
		return (
			<ApplicationErrorBoundary>
				<Outlet />
				<Suspense fallback={null}>
					<Toaster />
				</Suspense>
			</ApplicationErrorBoundary>
		);
	}

	const fallback = routeSurface === "terminal" ? <AppShellSkeleton /> : <DashboardShellSkeleton />;

	return (
		<ApplicationErrorBoundary>
			<ClientRuntimeGate fallback={fallback}>
				<AppRuntime fallback={fallback} />
			</ClientRuntimeGate>
		</ApplicationErrorBoundary>
	);
}

function AppRuntime({ fallback }: { fallback: React.ReactNode }) {
	const clientRuntimeReady = useClientRuntimeReady();

	if (!clientRuntimeReady) return <>{fallback}</>;

	return (
		<I18nReadyGate fallback={fallback}>
			<ExchangeScopeProvider>
				<MarketsInfoProvider>
					<Outlet />
					<Suspense fallback={null}>
						<FundsActionRecoveryHost />
					</Suspense>
					<Suspense fallback={null}>
						<Toaster />
					</Suspense>
				</MarketsInfoProvider>
			</ExchangeScopeProvider>
		</I18nReadyGate>
	);
}

// Gates first render until the persisted language's catalog is active, so the page renders ONCE in
// the persisted locale — no flash of English / LTR→RTL jump while the lazy catalog loads.
function I18nReadyGate({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
	const [ready, setReady] = useState(() => i18n.locale === getPersistedLocale());
	useEffect(() => {
		if (ready) return;
		let active = true;
		i18nReady.finally(() => {
			if (active) setReady(true);
		});
		return () => {
			active = false;
		};
	}, [ready]);
	return <>{ready ? children : fallback}</>;
}

function RootDocument({ children }: { children: React.ReactNode }) {
	// SSR starts with the eagerly loaded English catalog. During hydration, render the active catalog
	// locale so localized content never shares a frame with stale page-language metadata. The i18n
	// module continues to own subsequent live updates.
	const documentLocale = i18n.locale;
	const documentDirection = isRtlLocale(documentLocale) ? "rtl" : "ltr";
	return (
		<html lang={documentLocale} dir={documentDirection} className="dark" suppressHydrationWarning>
			<head>
				<HeadContent />
				<script suppressHydrationWarning>{THEME_BOOTSTRAP_SCRIPT}</script>
				<link rel="stylesheet" href={appCss} precedence="default" />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
