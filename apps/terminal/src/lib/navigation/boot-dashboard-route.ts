import { settleWithinBudget, TRADE_ROUTE_REVEAL_BUDGET_MS } from "@/lib/trade/trade-route-boot";

/**
 * Dashboard routes mount the desktop navigation statically; the lazy pieces of their first render
 * are the account menu, the global modal host (which installs the Ctrl/⌘K listener) and, on
 * desktop, the footer. Awaiting them from `beforeLoad`, within the trade reveal budget, lets the
 * first render commit without suspending again, so they arrive with the page instead of after
 * React's 300ms fallback throttle (ADR 0012). The chrome module is imported dynamically so the
 * route tree chunk stays free of the header's and the modal host's wallet dependencies; the route
 * component chunk already contains them.
 */
export function bootDashboardRoute(): Promise<void> {
	if (typeof window === "undefined") return Promise.resolve();
	const preloads = import("@/components/dashboard/dashboard-chrome")
		.then((module) => module.preloadDashboardChrome())
		.then(
			() => undefined,
			() => undefined,
		);
	return settleWithinBudget(preloads, TRADE_ROUTE_REVEAL_BUDGET_MS);
}
