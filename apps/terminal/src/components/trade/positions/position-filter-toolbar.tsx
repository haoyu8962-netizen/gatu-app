import { Dropdown } from "@gatu/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { PositionDirectionFilter, PositionMarketFilter } from "@/domain/trade/position-toolbar";
import { cn } from "@/lib/cn";
import { PositionMarketFilterControl, type PositionMarketOption } from "./position-market-filter";

interface Props {
	direction: PositionDirectionFilter;
	market: PositionMarketFilter;
	marketOptions: readonly PositionMarketOption[];
	onDirectionChange: (value: PositionDirectionFilter) => void;
	onMarketChange: (value: PositionMarketFilter) => void;
	mobile?: boolean;
}

const directionMessage = msg`Direction`;
const allMessage = msg`All`;
const longMessage = msg`Long`;
const shortMessage = msg`Short`;

export function PositionFilterToolbar({
	direction,
	market,
	marketOptions,
	onDirectionChange,
	onMarketChange,
	mobile = false,
}: Props) {
	const { _ } = useLingui();
	const directionLabels: Record<PositionDirectionFilter, string> = {
		all: _(allMessage),
		long: _(longMessage),
		short: _(shortMessage),
	};
	const directionLabel = directionLabels[direction];
	const directionTrigger = `${_(directionMessage)}: ${directionLabel}`;
	const mobileDirectionTrigger = direction === "all" ? _(directionMessage) : directionLabel;

	return (
		<div
			data-testid="position-filter-toolbar"
			className={cn("flex shrink-0", mobile ? "min-w-0 flex-1 items-center gap-1.5" : "h-full items-center gap-2 py-2")}
		>
			<Dropdown
				className={cn("flex items-center", mobile && "min-w-0")}
				triggerVariant="minimal"
				size="xxs"
				trigger={mobile ? mobileDirectionTrigger : directionTrigger}
				triggerAriaLabel={_(msg`Filter positions by direction: ${directionLabel}`)}
				triggerClassName={cn(
					"min-h-0 text-fg-muted focus-visible:border-market-close-control focus-visible:outline-none active:not-data-disabled:scale-100",
					mobile
						? "relative rounded-[7px] border border-market-close-stroke-card bg-modal px-[9px] py-1 text-xs leading-4 text-market-close-muted transition-colors duration-[120ms] after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] hover:border-market-close-control hover:bg-modal hover:text-market-close-fg data-popup-open:border-market-close-control data-popup-open:text-market-close-fg"
						: "h-[27px] rounded-[7px] border border-market-close-stroke-card bg-modal px-2.5 py-1 text-xs font-normal text-market-close-muted transition-colors duration-[120ms] hover:border-market-close-control hover:bg-modal hover:text-market-close-fg data-popup-open:border-market-close-control data-popup-open:text-market-close-fg",
				)}
				popupClassName="min-w-32"
				align={mobile ? "start" : "end"}
				items={[
					{ label: _(allMessage), active: direction === "all", onSelect: () => onDirectionChange("all") },
					{ label: _(longMessage), active: direction === "long", onSelect: () => onDirectionChange("long") },
					{ label: _(shortMessage), active: direction === "short", onSelect: () => onDirectionChange("short") },
				]}
			/>
			<PositionMarketFilterControl value={market} options={marketOptions} onChange={onMarketChange} mobile={mobile} />
		</div>
	);
}
