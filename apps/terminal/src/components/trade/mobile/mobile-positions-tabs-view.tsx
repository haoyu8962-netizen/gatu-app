import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";

export const positionsWrapper = "w-full min-w-0 min-h-0 flex flex-col border-t border-stroke-weak/60";
export const positionsScroll =
	"min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
export const positionsTabs = "h-[47px] min-w-max gap-0 border-b border-market-close-stroke-card px-3.5 pr-7";
export const positionsTab =
	"min-h-11 shrink-0 px-2.5 text-[13px] font-medium leading-none text-market-close-subtle transition-colors duration-[120ms] hover:text-market-close-fg focus-visible:outline-market-close-focus data-active:text-market-close-fg";
export const positionsFade =
	"pointer-events-none absolute inset-y-0 right-0 w-7 bg-linear-to-r from-transparent to-modal";

interface Props {
	tabs: ReactNode;
	scrollRef?: Ref<HTMLDivElement>;
}
export function MobilePositionsTabsView({ tabs, scrollRef }: Props) {
	return (
		<div className="relative min-w-0 shrink-0">
			<div ref={scrollRef} data-testid="mobile-account-tabs-scroll" className={positionsScroll}>
				{tabs}
			</div>
			<div data-testid="mobile-account-tabs-fade" aria-hidden="true" className={positionsFade} />
		</div>
	);
}
export function MobilePositionsFrameView({ children }: { children: ReactNode }) {
	return <div className={positionsWrapper}>{children}</div>;
}
export function MobilePositionsTabStripView({
	tabs,
	active,
}: {
	tabs: readonly { value: string; label: ReactNode }[];
	active: string;
}) {
	return (
		<div
			data-slot="mobile-positions-tabs"
			className={cn("relative flex items-center border-b border-stroke-weak", positionsTabs)}
		>
			{tabs.map((tab) => (
				<button
					type="button"
					key={tab.value}
					data-mobile-account-tab={tab.value}
					data-active={active === tab.value ? "" : undefined}
					className={cn(
						"inline-flex items-center justify-center font-normal text-fg-muted cursor-pointer select-none whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none data-active:text-fg hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus data-disabled:text-fg-disabled data-disabled:cursor-not-allowed bg-transparent py-1 px-1.5 text-2xs gap-1",
						positionsTab,
						"relative",
					)}
				>
					<span>{tab.label}</span>
					{active === tab.value ? (
						<span role="presentation" className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-market-close-fg" />
					) : null}
				</button>
			))}
		</div>
	);
}

interface PanelProps {
	children: ReactNode;
	isPageScroll: boolean;
	className?: string;
	renderTabs?: (props: { className: string; children: ReactNode }) => ReactNode;
}
export function MobilePositionsPanelView({ children, isPageScroll, className, renderTabs }: PanelProps) {
	const tabsProps = {
		className: cn(
			isPageScroll
				? "min-h-0 flex flex-col"
				: "flex-1 min-h-0 flex flex-col overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
		),
		children,
	};
	return (
		<div
			className={cn(
				"font-market-close",
				isPageScroll ? "min-h-0 flex flex-col" : "flex-1 min-h-0 flex flex-col",
				className,
			)}
		>
			{renderTabs ? renderTabs(tabsProps) : <div {...tabsProps} />}
		</div>
	);
}
