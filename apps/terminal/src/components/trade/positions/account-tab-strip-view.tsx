import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
	ACCOUNT_TAB_COUNT_CLASS,
	ACCOUNT_TAB_LIST_CLASS,
	ACCOUNT_TAB_TRIGGER_CLASS,
} from "./account-table-header-view";

interface Props {
	tabs: readonly { value: string; label: ReactNode; count?: ReactNode }[];
	active: string;
}

export function AccountTabStripView({ tabs, active }: Props) {
	return (
		<div className={cn("relative flex items-center border-b border-stroke-weak", ACCOUNT_TAB_LIST_CLASS)}>
			{tabs.map((tab) => (
				<button
					type="button"
					key={tab.value}
					data-positions-tab={tab.value}
					data-active={tab.value === active ? "" : undefined}
					className={cn(
						"inline-flex items-center justify-center font-normal text-fg-muted cursor-pointer select-none whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none data-active:text-fg hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus data-disabled:text-fg-disabled data-disabled:cursor-not-allowed bg-transparent py-1.5 px-2 text-xs gap-1",
						ACCOUNT_TAB_TRIGGER_CLASS,
						"relative",
					)}
				>
					<span>{tab.label}</span>
					{tab.count !== undefined ? (
						<span data-position-tab-count={tab.value} className={ACCOUNT_TAB_COUNT_CLASS}>
							{tab.count}
						</span>
					) : null}
					{tab.value === active ? (
						<span role="presentation" className="absolute inset-x-0 -bottom-px h-0.5 bg-market-close-fg" />
					) : null}
				</button>
			))}
		</div>
	);
}
