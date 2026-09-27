import { bootDashboardRoute } from "@/lib/navigation/boot-dashboard-route";
import { settleWithinBudget, TRADE_ROUTE_REVEAL_BUDGET_MS } from "@/lib/trade/trade-route-boot";

/**
 * Docs, Support and the legal pages render the footer and the global modals lazily next to the
 * dashboard navigation. Awaiting those exact lazy instances, within the trade reveal budget, lets
 * the first render commit without suspending again, so the footer and the modal host arrive with
 * the page instead of after React's 300ms fallback throttle (ADR 0012, ADR 0020).
 */
export function bootLegalRoute(): Promise<void> {
	if (typeof window === "undefined") return Promise.resolve();
	const page = import("@/components/legal/legal-doc-page").then((module) => module.preloadLegalDocPage());
	const preloads = Promise.all([bootDashboardRoute(), page]).then(
		() => undefined,
		() => undefined,
	);
	return settleWithinBudget(preloads, TRADE_ROUTE_REVEAL_BUDGET_MS);
}
