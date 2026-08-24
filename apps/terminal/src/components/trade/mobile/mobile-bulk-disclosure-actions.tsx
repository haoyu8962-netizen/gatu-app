import { useLingui } from "@lingui/react/macro";
import { cn } from "@/lib/cn";
import type { MobileDisclosureSetController } from "./use-mobile-disclosure-set";

interface Props {
	keys: readonly string[];
	controller: Pick<MobileDisclosureSetController, "expandedKeys" | "expandAll" | "collapseAll">;
	className?: string;
}

const actionClassName =
	"relative inline-flex h-[27px] min-h-0 items-center whitespace-nowrap p-0 text-xs font-normal leading-4 text-market-close-fg transition-colors duration-[120ms] after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:text-fg-disabled";

export function MobileBulkDisclosureActions({ keys, controller, className }: Props) {
	const { t } = useLingui();
	const canExpand = keys.some((key) => !controller.expandedKeys.has(key));
	const canCollapse = keys.some((key) => controller.expandedKeys.has(key));

	return (
		<div data-testid="mobile-bulk-disclosure-actions" className={cn("flex shrink-0 items-center gap-3", className)}>
			<button
				type="button"
				data-testid="expand-all-details"
				onClick={() => controller.expandAll(keys)}
				disabled={!canExpand}
				className={actionClassName}
			>
				{t`Expand all`}
			</button>
			<button
				type="button"
				data-testid="collapse-all-details"
				onClick={() => controller.collapseAll(keys)}
				disabled={!canCollapse}
				className={actionClassName}
			>
				{t`Collapse all`}
			</button>
		</div>
	);
}
