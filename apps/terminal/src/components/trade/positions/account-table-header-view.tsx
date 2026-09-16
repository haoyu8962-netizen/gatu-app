import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";

interface Props {
	tabs: ReactNode;
	actions?: ReactNode;
	scrollRef?: Ref<HTMLDivElement>;
	actionsRef?: Ref<HTMLDivElement>;
	hasActions?: boolean;
}

export const ACCOUNT_TABLE_PANEL_CLASS = "flex flex-col bg-surface";
export const ACCOUNT_TABLE_FIXED_CLASS = "h-full overflow-hidden";
export const ACCOUNT_TABLE_AUTO_HEIGHT_CLASS = "min-h-64";
export const ACCOUNT_TABLE_TABS_CLASS = "flex-1 min-h-0 flex flex-col";
export const ACCOUNT_TAB_LIST_CLASS = "h-full min-w-max gap-0.5 border-b-0";
export const ACCOUNT_TAB_INDICATOR_CLASS = "bg-market-close-fg transition-[left] duration-[120ms] ease-linear";
export const ACCOUNT_TAB_TRIGGER_CLASS =
	"inline-flex h-full items-center gap-1 px-3 py-0 text-[13px] leading-[18px] font-medium whitespace-nowrap text-market-close-subtle transition-colors duration-[120ms] hover:text-market-close-fg focus-visible:outline-market-close-focus data-active:text-market-close-fg";
export const ACCOUNT_TAB_COUNT_CLASS = "inline-flex min-w-[3ch] shrink-0 justify-center tabular-nums";

export function AccountTableHeaderView({ tabs, actions, scrollRef, actionsRef, hasActions = !!actions }: Props) {
	return (
		<div
			data-testid="positions-toolbar-header"
			className="font-market-close flex h-[45px] shrink-0 items-stretch overflow-hidden border-b border-market-close-stroke-card px-5"
		>
			<div
				ref={scrollRef}
				data-testid="positions-tabs-scroll"
				className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				{tabs}
			</div>
			<div
				ref={actionsRef}
				data-testid="positions-header-actions"
				className={cn("flex shrink-0 items-center gap-2", hasActions && "pl-3")}
			>
				{actions}
			</div>
		</div>
	);
}
