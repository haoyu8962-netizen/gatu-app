import { i18n } from "@lingui/core";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import { NotFoundPage } from "@/components/pages/not-found-page";
import { RouterErrorPage } from "@/components/pages/router-error-page";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { MarketsInfoProvider } from "@/lib/hyperliquid/hooks/MarketsInfoProvider";
import { getPersistedLocale, i18nReady } from "@/lib/i18n";
import { createLazyComponent } from "@/lib/lazy";
import { buildRootHead } from "@/lib/seo";
import { isDocumentRoutePath, useClientRuntimeReady } from "@/providers/client-runtime";
import { ExchangeScopeProvider } from "@/providers/exchange-scope";
import "@/bones/registry";
import appCss from "../styles.css?url";

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
	head: () => buildRootHead(),
	shellComponent: RootDocument,
	component: RootComponent,
	errorComponent: RouterErrorPage,
	notFoundComponent: NotFoundPage,
});

function RootComponent() {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const isDocumentRoute = isDocumentRoutePath(pathname);
	const clientRuntimeReady = useClientRuntimeReady();

	useEffect(() => {
		registerServiceWorker();
	}, []);

	if (isDocumentRoute) return <Outlet />;
	if (!clientRuntimeReady) return <AppShellSkeleton />;

	return (
		<I18nReadyGate fallback={<AppShellSkeleton />}>
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
	// lang/dir default to English here for SSR; on the client they are owned and kept in sync with
	// the active language by the i18n module (see lib/i18n.ts), which re-asserts them past any
	// shell re-render.
	return (
		<html lang="en" dir="ltr" className="dark" suppressHydrationWarning>
			<head>
				<HeadContent />
				<script suppressHydrationWarning>{THEME_BOOTSTRAP_SCRIPT}</script>
				<link rel="stylesheet" href={appCss} />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
