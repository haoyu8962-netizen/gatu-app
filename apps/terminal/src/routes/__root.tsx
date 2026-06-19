import { i18n } from "@lingui/core";
import type { QueryClient } from "@tanstack/react-query";
import { ClientOnly, createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import { NotFoundPage } from "@/components/pages/not-found-page";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { MarketsInfoProvider } from "@/lib/hyperliquid/hooks/MarketsInfoProvider";
import { getPersistedLocale, i18nReady } from "@/lib/i18n";
import { createLazyComponent } from "@/lib/lazy";
import { buildPageHead } from "@/lib/seo";
import { ExchangeScopeProvider } from "@/providers/exchange-scope";
import "@/bones/registry";
import appCss from "../styles.css?url";

const Toaster = createLazyComponent(() => import("@/components/ui/sonner"), "Toaster");

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => buildPageHead(),
	shellComponent: RootDocument,
	component: RootComponent,
	notFoundComponent: NotFoundPage,
});

function RootComponent() {
	useEffect(() => {
		if ("serviceWorker" in navigator) {
			navigator.serviceWorker.register("/sw.js", { scope: "/" });
		}
	}, []);

	return (
		<ClientOnly fallback={<AppShellSkeleton />}>
			<I18nReadyGate fallback={<AppShellSkeleton />}>
				<ExchangeScopeProvider>
					<MarketsInfoProvider>
						<Outlet />
						<Suspense fallback={null}>
							<Toaster />
						</Suspense>
					</MarketsInfoProvider>
				</ExchangeScopeProvider>
			</I18nReadyGate>
		</ClientOnly>
	);
}

// Gates first render until the persisted language's catalog is active, so the page renders ONCE in
// the persisted locale — no flash of English / LTR→RTL jump while the lazy catalog loads. Language
// changes apply via a full reload (see the switchers), so the app is never remounted mid-session.
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
		<html lang="en" dir="ltr" suppressHydrationWarning>
			<head>
				<HeadContent />
				<link rel="stylesheet" href={appCss} />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
