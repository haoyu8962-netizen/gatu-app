import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Dropdown } from "@sairn/ui";
import { MOBILE_FILTER_CHIP_CLASS } from "@/components/trade/mobile/mobile-filter-chip";
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
	disabled?: boolean;
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
	disabled = false,
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
				disabled={disabled}
				className="flex min-w-0 items-center"
				triggerVariant="minimal"
				size="xxs"
				trigger={mobileDirectionTrigger}
				triggerAriaLabel={_(msg`Filter positions by direction: ${directionLabel}`)}
				triggerClassName={MOBILE_FILTER_CHIP_CLASS}
				popupClassName="min-w-32"
				align="start"
				items={[
					{ label: _(allMessage), active: direction === "all", onSelect: () => onDirectionChange("all") },
					{ label: _(longMessage), active: direction === "long", onSelect: () => onDirectionChange("long") },
					{ label: _(shortMessage), active: direction === "short", onSelect: () => onDirectionChange("short") },
				]}
			/>
			<Dropdown
				disabled={disabled}
				className="flex min-w-0 items-center"
				triggerVariant="minimal"
				size="xxs"
				trigger={mobileMarginTrigger}
				triggerAriaLabel={_(msg`Filter positions by margin mode: ${marginLabel}`)}
				triggerClassName={MOBILE_FILTER_CHIP_CLASS}
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
