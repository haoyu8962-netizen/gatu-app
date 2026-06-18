import { i18n } from "@lingui/core";
import { useLingui } from "@lingui/react";
import type { QueryClient } from "@tanstack/react-query";
import { ClientOnly, createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Fragment, Suspense, useEffect, useState } from "react";
import { NotFoundPage } from "@/components/pages/not-found-page";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { MarketsInfoProvider } from "@/lib/hyperliquid/hooks/MarketsInfoProvider";
import { getPersistedLocale, i18nReady } from "@/lib/i18n";
import { createLazyComponent } from "@/lib/lazy";
import { buildPageHead, mergeHead } from "@/lib/seo";
import { ExchangeScopeProvider } from "@/providers/exchange-scope";
import "@/bones/registry";
import appCss from "../styles.css?url";

const Toaster = createLazyComponent(() => import("@/components/ui/sonner"), "Toaster");
const GlobalModals = createLazyComponent(() => import("@/components/trade/components/global-modals"), "GlobalModals");

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => {
		const seoHead = buildPageHead();
		return mergeHead(seoHead, {
			links: [{ rel: "stylesheet", href: appCss }],
		});
	},
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
						<LocaleKeyBoundary>
							<Outlet />
						</LocaleKeyBoundary>
						<Suspense fallback={null}>
							<GlobalModals />
						</Suspense>
						<Suspense fallback={null}>
							<Toaster />
						</Suspense>
					</MarketsInfoProvider>
				</ExchangeScopeProvider>
			</I18nReadyGate>
		</ClientOnly>
	);
}

// Gates first render until the persisted language's catalog is active, so a non-English user never
// flashes English (or jumps LTR→RTL) before the lazy catalog finishes loading.
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

// Remounts ONLY the route content on a language change so all `t``` strings re-render in the new
// locale (Lingui's I18nProvider re-renders just context subscribers, and the React Compiler breaks
// the parent→child cascade). Global modals and the toaster are siblings OUTSIDE this boundary, so
// in-flight deposit/withdraw/bridge state and active toasts survive a switch.
function LocaleKeyBoundary({ children }: { children: React.ReactNode }) {
	const { i18n: activeI18n } = useLingui();
	return <Fragment key={activeI18n.locale}>{children}</Fragment>;
}

function RootDocument({ children }: { children: React.ReactNode }) {
	// lang/dir default to English here for SSR; on the client they are owned and kept in sync with
	// the active language by the i18n module (see lib/i18n.ts), which re-asserts them past any
	// shell re-render.
	return (
		<html lang="en" dir="ltr" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
