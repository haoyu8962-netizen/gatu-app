import { i18n } from "@lingui/core";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppRuntimeOverlays } from "@/components/app-runtime-overlays";
import { ApplicationErrorBoundary } from "@/components/application-error-boundary";
import { NotFoundPage } from "@/components/pages/not-found-page";
import { RouterErrorPage } from "@/components/pages/router-error-page";
import { StartupFallback } from "@/components/startup-fallback";
import { isRtlLocale } from "@/config/i18n";
import { areFontsReady, STARTUP_FONT_SPECS, waitForFonts } from "@/lib/fonts/font-readiness";
import { MarketsInfoProvider } from "@/lib/hyperliquid/hooks/MarketsInfoProvider";
import { getPersistedLocale, i18nReady } from "@/lib/i18n";
import { buildRootHead } from "@/lib/seo";
import { useClientRuntimeReady } from "@/providers/client-runtime";
import { ExchangeScopeProvider } from "@/providers/exchange-scope";
import { ClientRuntimeGate } from "@/providers/root";
import "@/bones/registry";
import ibmPlexSansLatinWoff2 from "@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2?url";
import interLatinWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import appCss from "../styles.css?url";

const FONT_PRELOAD_URLS = [interLatinWoff2, ibmPlexSansLatinWoff2];

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
	pendingComponent: StartupFallback,
	errorComponent: RouterErrorPage,
	notFoundComponent: NotFoundPage,
});

function RootComponent() {
	useEffect(() => {
		registerServiceWorker();
	}, []);

	const fallback = <StartupFallback />;

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
		<StartupReadyGate fallback={fallback}>
			<ExchangeScopeProvider>
				<MarketsInfoProvider>
					<Outlet />
					<AppRuntimeOverlays />
				</MarketsInfoProvider>
			</ExchangeScopeProvider>
		</StartupReadyGate>
	);
}

// Gates first render until the persisted language's catalog is active and the preloaded startup
// fonts are usable, so the page renders ONCE in the persisted locale with final text metrics — no
// flash of English / LTR→RTL jump while the lazy catalog loads, and no fallback-font reflow when the
// webfonts arrive. The font wait is capped at FONT_READY_TIMEOUT_MS, matching font-display: block.
function StartupReadyGate({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
	const [ready, setReady] = useState(() => i18n.locale === getPersistedLocale() && areFontsReady(STARTUP_FONT_SPECS));
	useEffect(() => {
		if (ready) return;
		let active = true;
		let localeReady = i18n.locale === getPersistedLocale();
		let fontsReady = areFontsReady(STARTUP_FONT_SPECS);
		const reveal = () => {
			if (active && localeReady && fontsReady) setReady(true);
		};
		if (!localeReady) {
			i18nReady.finally(() => {
				localeReady = true;
				reveal();
			});
		}
		if (!fontsReady) {
			waitForFonts(STARTUP_FONT_SPECS).then(() => {
				fontsReady = true;
				reveal();
			});
		}
		reveal();
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
