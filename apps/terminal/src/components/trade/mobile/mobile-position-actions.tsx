import { useLingui } from "@lingui/react/macro";
import { useId } from "react";
import { cn } from "@/lib/cn";
import type { MobileDisclosureSetController } from "./use-mobile-disclosure-set";

interface Props {
	positionKeys: readonly string[];
	disclosure: MobileDisclosureSetController;
	canCloseAll: boolean;
	onCloseAll: () => void;
	unavailableReason: string | null;
}

const actionClassName =
	"relative inline-flex h-[27px] min-h-0 items-center whitespace-nowrap p-0 text-xs font-normal leading-4 transition-colors duration-[120ms] after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus disabled:cursor-not-allowed disabled:text-fg-disabled";

export function MobilePositionActions({ positionKeys, disclosure, canCloseAll, onCloseAll, unavailableReason }: Props) {
	const { t } = useLingui();
	const unavailableId = useId();
	const allExpanded = positionKeys.length > 0 && positionKeys.every((key) => disclosure.expandedKeys.has(key));

	function toggleDetails() {
		if (allExpanded) disclosure.collapseAll(positionKeys);
		else disclosure.expandAll(positionKeys);
	}

	return (
		<div className="flex shrink-0 items-center gap-3" data-testid="mobile-position-actions">
			<button
				type="button"
				data-testid="toggle-position-details"
				disabled={positionKeys.length === 0}
				onClick={toggleDetails}
				className={cn(actionClassName, "text-market-close-fg")}
			>
				{allExpanded ? t`Collapse all` : t`Expand all`}
			</button>
			{unavailableReason ? (
				<span id={unavailableId} className="sr-only">
					{unavailableReason}
				</span>
			) : null}
			<button
				type="button"
				data-testid="mobile-close-all-positions"
				disabled={!canCloseAll}
				onClick={onCloseAll}
				aria-describedby={unavailableReason ? unavailableId : undefined}
				className={cn(actionClassName, "text-market-close-success")}
			>
				{t`Close all`}
			</button>
		</div>
	);
}
