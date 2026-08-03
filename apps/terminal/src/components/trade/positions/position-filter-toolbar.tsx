import { Dropdown } from "@gatu/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { PositionDirectionFilter, PositionMarketFilter } from "@/domain/trade/position-toolbar";
import { PositionMarketFilterControl, type PositionMarketOption } from "./position-market-filter";

interface Props {
	direction: PositionDirectionFilter;
	market: PositionMarketFilter;
	marketOptions: readonly PositionMarketOption[];
	onDirectionChange: (value: PositionDirectionFilter) => void;
	onMarketChange: (value: PositionMarketFilter) => void;
}

const directionMessage = msg`Direction`;
const allMessage = msg`All`;
const longMessage = msg`Long`;
const shortMessage = msg`Short`;

export function PositionFilterToolbar({ direction, market, marketOptions, onDirectionChange, onMarketChange }: Props) {
	const { _ } = useLingui();
	const directionLabels: Record<PositionDirectionFilter, string> = {
		all: _(directionMessage),
		long: _(longMessage),
		short: _(shortMessage),
	};
	const directionLabel = directionLabels[direction];

	return (
		<div className="flex h-full shrink-0 items-stretch border-l border-stroke-weak pl-1">
			<Dropdown
				className="flex h-full items-center"
				triggerVariant="minimal"
				size="xxs"
				trigger={directionLabel}
				triggerAriaLabel={_(msg`Filter positions by direction`)}
				triggerClassName="h-full min-h-0 rounded-xs px-2 py-0 text-fg-muted hover:bg-fill-hover"
				popupClassName="min-w-32"
				align="end"
				items={[
					{ label: _(allMessage), active: direction === "all", onSelect: () => onDirectionChange("all") },
					{ label: _(longMessage), active: direction === "long", onSelect: () => onDirectionChange("long") },
					{ label: _(shortMessage), active: direction === "short", onSelect: () => onDirectionChange("short") },
				]}
			/>
			<PositionMarketFilterControl value={market} options={marketOptions} onChange={onMarketChange} />
		</div>
	);
}
