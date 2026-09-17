import { Fragment, type ReactNode } from "react";
import { APP_HEADER_HEIGHT_CLASS } from "@/config/layout";
import { cn } from "@/lib/cn";
import { NavMenuTriggerView } from "./nav-menu-trigger-view";

export interface TopNavItem {
	id: string;
	label: string;
	active: boolean;
	soon?: boolean;
	soonLabel?: string;
}

interface Props {
	items: readonly TopNavItem[];
	renderItem?: (item: TopNavItem, className: string) => ReactNode;
	moreLabel: string;
	navigationLabel: string;
	moreTrigger?: ReactNode;
	logo: ReactNode;
	logoClassName?: string;
	pairing?: ReactNode;
	wallet: ReactNode;
	theme: ReactNode;
	language: ReactNode;
	settings: ReactNode;
	compactUtilities?: ReactNode;
	compactHiddenWhenConnected: boolean;
	connected?: boolean;
	bannerOffset?: boolean;
}

export const TOP_NAV_DEPOSIT_CLASS =
	"h-[34px] min-h-[34px] shrink-0 gap-[7px] rounded-[10px] bg-market-close-control px-3.5 font-market-close text-[13px] leading-[18px] font-bold text-market-close-on-control shadow-none hover:bg-market-close-control hover:opacity-90 active:bg-market-close-control nav-compact:size-[34px] nav-compact:px-0";
export const TOP_NAV_DEPOSIT_LABEL_CLASS = "nav-compact:sr-only";

export const TOP_NAV_ITEM_CLASS =
	"rounded-[8px] px-2.5 py-2 font-semibold whitespace-nowrap transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg";
export const TOP_NAV_LOGO_CLASS =
	"flex shrink-0 items-center gap-2 rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus";
export const TOP_NAV_WORDMARK_CLASS = "h-[18px] w-auto shrink-0";
export const TOP_NAV_CONNECTED_WORDMARK_CLASS = "nav-compact:hidden";
export const TOP_NAV_MARK_CLASS = "hidden size-[22px] shrink-0 nav-compact:block";

export function TopNavView({
	items,
	renderItem,
	moreLabel,
	navigationLabel,
	moreTrigger,
	logo,
	logoClassName,
	pairing,
	wallet,
	theme,
	language,
	settings,
	compactUtilities,
	compactHiddenWhenConnected,
	connected = false,
	bannerOffset = false,
}: Props) {
	return (
		<header
			className={cn(
				APP_HEADER_HEIGHT_CLASS,
				"fixed right-0 left-0 z-40 flex items-center justify-between border-b border-market-close-stroke-card bg-surface px-5 font-market-close shadow-[0_1px_0_rgba(20,30,45,0.02)]",
				bannerOffset ? "top-8" : "top-0",
			)}
		>
			<div className="flex min-w-0 items-center">
				<div
					className={cn(
						"me-6 flex shrink-0 items-center",
						connected ? "nav-compact:me-7" : "nav-compact:me-8",
						logoClassName,
					)}
				>
					{logo}
				</div>
				<div className="hidden min-[1001px]:flex min-w-0 items-center">
					<nav className="flex items-center gap-0.5 text-[13px] leading-[18px]" aria-label={navigationLabel}>
						{items.map((item) => {
							const className = cn(
								TOP_NAV_ITEM_CLASS,
								item.active ? "text-market-close-fg" : "text-market-close-muted",
							);
							if (item.soon)
								return (
									<button
										key={item.id}
										type="button"
										disabled
										title={item.soonLabel}
										className="cursor-default rounded-[8px] px-2.5 py-2 font-semibold whitespace-nowrap text-market-close-muted disabled:hover:bg-transparent disabled:hover:text-market-close-muted"
									>
										{item.label}
										<span className="sr-only"> — {item.soonLabel}</span>
									</button>
								);
							return (
								<Fragment key={item.id}>
									{renderItem ? renderItem(item, className) : <span className={className}>{item.label}</span>}
								</Fragment>
							);
						})}
						<div>
							{moreTrigger ?? (
								<div>
									<NavMenuTriggerView label={moreLabel} aria-label={moreLabel} />
								</div>
							)}
						</div>
					</nav>
				</div>
			</div>
			<div className="ms-auto flex min-h-[34px] items-center gap-2">
				{pairing}
				{wallet}
				<div className={cn("contents", compactHiddenWhenConnected && "nav-compact:hidden")}>
					{theme}
					{language}
					{settings}
				</div>
				{compactUtilities && <div className="hidden nav-compact:inline-flex">{compactUtilities}</div>}
			</div>
		</header>
	);
}
