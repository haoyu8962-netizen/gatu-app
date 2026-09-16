import { BookBookmarkIcon, ListDashesIcon } from "@phosphor-icons/react";

interface Props {
	labels: { orderBook: string; trades: string };
	active: "book" | "trades";
}

export const ORDERBOOK_TAB_INDICATOR_CLASS =
	"absolute -bottom-px h-0.5 bg-action transition-[left,width] duration-200 ease-in-out motion-reduce:transition-none";
const TRIGGER_CLASS =
	"inline-flex items-center justify-center font-normal text-fg-muted cursor-pointer select-none whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none data-active:text-fg hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus data-disabled:text-fg-disabled data-disabled:cursor-not-allowed bg-transparent py-2 px-3 text-xs gap-1.5 flex-1 min-w-0";

export function OrderbookTabsView({ labels, active }: Props) {
	return (
		<div className="flex items-center justify-between">
			<div className="relative flex items-center border-b border-stroke-weak w-full min-w-0">
				<span
					role="presentation"
					className={ORDERBOOK_TAB_INDICATOR_CLASS}
					style={{ left: active === "book" ? "0%" : "50%", width: "50%" }}
				/>
				<button type="button" data-active={active === "book" ? "" : undefined} className={TRIGGER_CLASS}>
					<BookBookmarkIcon className="size-3.5 shrink-0" />
					<span className="orderbook-tab-label min-w-0 truncate">{labels.orderBook}</span>
				</button>
				<button type="button" data-active={active === "trades" ? "" : undefined} className={TRIGGER_CLASS}>
					<ListDashesIcon className="size-3.5 shrink-0" />
					<span className="orderbook-tab-label min-w-0 truncate">{labels.trades}</span>
				</button>
			</div>
		</div>
	);
}
