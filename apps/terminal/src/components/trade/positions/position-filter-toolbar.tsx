import { Dropdown } from "@gatu/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type {
	PositionDirectionFilter,
	PositionMarginFilter,
	PositionMarketFilter,
} from "@/domain/trade/position-toolbar";
import { PositionMarketFilterControl, type PositionMarketOption } from "./position-market-filter";

interface Props {
	direction: PositionDirectionFilter;
	margin?: PositionMarginFilter;
	market: PositionMarketFilter;
	marketOptions: readonly PositionMarketOption[];
	onDirectionChange: (value: PositionDirectionFilter) => void;
	onMarginChange?: (value: PositionMarginFilter) => void;
	onMarketChange: (value: PositionMarketFilter) => void;
	mobile?: boolean;
}

const directionMessage = msg`Direction`;
const marginMessage = msg`Margin`;
const allMessage = msg`All`;
const longMessage = msg`Long`;
const shortMessage = msg`Short`;
const crossMessage = msg`Cross`;
const isolatedMessage = msg`Isolated`;

export function PositionFilterToolbar({
	direction,
	margin = "all",
	market,
	marketOptions,
	onDirectionChange,
	onMarginChange,
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
	const mobileDirectionTrigger = direction === "all" ? _(directionMessage) : directionLabel;
	const marginLabels: Record<PositionMarginFilter, string> = {
		all: _(allMessage),
		cross: _(crossMessage),
		isolated: _(isolatedMessage),
	};
	const marginLabel = marginLabels[margin];
	const mobileMarginTrigger = margin === "all" ? _(marginMessage) : marginLabel;

	if (!mobile) {
		return (
			<div data-testid="position-filter-toolbar" className="flex h-full shrink-0 items-center gap-2 py-2">
				<PositionMarketFilterControl value={market} options={marketOptions} onChange={onMarketChange} />
			</div>
		);
	}

	return (
		<div data-testid="position-filter-toolbar" className="flex min-w-0 flex-1 shrink-0 items-center gap-1.5">
			<Dropdown
				className="flex min-w-0 items-center"
				triggerVariant="minimal"
				size="xxs"
				trigger={mobileDirectionTrigger}
				triggerAriaLabel={_(msg`Filter positions by direction: ${directionLabel}`)}
				triggerClassName="relative min-h-0 rounded-[7px] border border-market-close-stroke-card bg-modal px-[9px] py-1 text-xs leading-4 text-market-close-muted transition-colors duration-[120ms] after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] focus-visible:border-market-close-focus focus-visible:outline-none hover:border-market-close-control hover:bg-modal hover:text-market-close-fg active:not-data-disabled:scale-100 data-popup-open:border-market-close-control data-popup-open:text-market-close-fg"
				popupClassName="min-w-32"
				align="start"
				items={[
					{ label: _(allMessage), active: direction === "all", onSelect: () => onDirectionChange("all") },
					{ label: _(longMessage), active: direction === "long", onSelect: () => onDirectionChange("long") },
					{ label: _(shortMessage), active: direction === "short", onSelect: () => onDirectionChange("short") },
				]}
			/>
			<Dropdown
				className="flex min-w-0 items-center"
				triggerVariant="minimal"
				size="xxs"
				trigger={mobileMarginTrigger}
				triggerAriaLabel={_(msg`Filter positions by margin mode: ${marginLabel}`)}
				triggerClassName="relative min-h-0 rounded-[7px] border border-market-close-stroke-card bg-modal px-[9px] py-1 text-xs leading-4 text-market-close-muted transition-colors duration-[120ms] after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] focus-visible:border-market-close-focus focus-visible:outline-none hover:border-market-close-control hover:bg-modal hover:text-market-close-fg active:not-data-disabled:scale-100 data-popup-open:border-market-close-control data-popup-open:text-market-close-fg"
				popupClassName="min-w-32"
				align="start"
				items={[
					{ label: _(allMessage), active: margin === "all", onSelect: () => onMarginChange?.("all") },
					{ label: _(crossMessage), active: margin === "cross", onSelect: () => onMarginChange?.("cross") },
					{ label: _(isolatedMessage), active: margin === "isolated", onSelect: () => onMarginChange?.("isolated") },
				]}
			/>
		</div>
	);
}
