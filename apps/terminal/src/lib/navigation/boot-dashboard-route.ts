/**
 * Dashboard routes mount the desktop navigation statically, so the only lazy piece of their first
 * render is the account menu. Awaiting it from `beforeLoad` reveals the page with the wallet
 * control already resolved instead of an empty slot (ADR 0012 pattern, see the PR 26 review record).
 * The navigation module is imported dynamically so the route tree chunk stays free of the header's
 * wallet dependencies; the route component chunk already contains them.
 */
export function bootDashboardRoute(): Promise<void> {
	if (typeof window === "undefined") return Promise.resolve();
	return import("@/components/trade/header/top-nav").then((module) => module.preloadTopNav()).catch(() => undefined);
}
