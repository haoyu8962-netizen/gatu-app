import { createRetryableLazyComponent } from "@/lib/lazy";

export const FundingHistoryPanel = createRetryableLazyComponent(
	() => import("./funding-history-panel"),
	"FundingHistoryPanel",
);

let warmed = false;

/**
 * The funding history view renders only after its tab is first selected, so its chart, query and
 * formatting code stay out of the trade startup chunks. It is warmed on intent, when the pointer or
 * focus first reaches the Funding tab, and never reloads the page on a failed import because the
 * same page holds the unsent order form.
 */
export function warmFundingHistoryPanel(): void {
	if (warmed) return;
	warmed = true;
	void FundingHistoryPanel.preload();
}
