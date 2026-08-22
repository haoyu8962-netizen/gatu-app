import { Button } from "@gatu/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	ALL_POSITION_MARKETS,
	CURRENT_POSITION_MARKET,
	type PositionMarketFilter,
} from "@/domain/trade/position-toolbar";
import { cn } from "@/lib/cn";

export interface PositionMarketOption {
	coin: string;
	dex: string;
	label: string;
}

interface Props {
	value: PositionMarketFilter;
	options: readonly PositionMarketOption[];
	onChange: (value: PositionMarketFilter) => void;
	mobile?: boolean;
}

const allMessage = msg`All`;
const currentMessage = msg`Current`;
const marketMessage = msg`Market`;
const assetMessage = msg`Asset`;

function isSelectedMarket(value: PositionMarketFilter, option: PositionMarketOption): boolean {
	return value.type === "market" && value.market.coin === option.coin && value.market.dex === option.dex;
}

function getMarketFilterFallbackLabel(value: PositionMarketFilter): string | undefined {
	if (value.type !== "market") return undefined;
	const marketName = value.market.coin.split(":").pop() ?? value.market.coin;
	return value.market.dex ? `${marketName} (${value.market.dex})` : marketName;
}

export function PositionMarketFilterControl({ value, options, onChange, mobile = false }: Props) {
	const { _ } = useLingui();
	const [open, setOpen] = useState(false);
	const selectedOption =
		value.type === "market" ? options.find((option) => isSelectedMarket(value, option)) : undefined;
	let triggerLabel = _(marketMessage);
	if (value.type === "current") triggerLabel = _(currentMessage);
	if (value.type === "market")
		triggerLabel = selectedOption?.label ?? getMarketFilterFallbackLabel(value) ?? _(marketMessage);
	const desktopTriggerLabel = `${_(assetMessage)}: ${value.type === "all" ? _(allMessage) : triggerLabel}`;
	const ariaValue = mobile ? triggerLabel : desktopTriggerLabel;

	function handleChange(nextValue: PositionMarketFilter) {
		onChange(nextValue);
		setOpen(false);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					intent="neutral"
					size="xxs"
					aria-label={_(msg`Filter positions by market: ${ariaValue}`)}
					className={cn(
						"min-h-0 gap-1 font-normal focus-visible:border-market-close-control focus-visible:outline-none active:not-data-disabled:scale-100",
						mobile
							? "relative max-w-24 rounded-[7px] border border-market-close-stroke-card bg-modal px-[9px] py-1 text-xs leading-4 text-market-close-muted transition-colors duration-[120ms] after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] hover:border-market-close-control hover:bg-modal hover:text-market-close-fg data-popup-open:border-market-close-control data-popup-open:text-market-close-fg"
							: "h-[27px] max-w-40 rounded-[7px] border border-market-close-stroke-card bg-modal px-2.5 py-1 text-xs text-market-close-muted transition-colors duration-[120ms] hover:border-market-close-control hover:bg-modal hover:text-market-close-fg data-popup-open:border-market-close-control data-popup-open:text-market-close-fg",
					)}
				>
					<span className="truncate">{mobile ? triggerLabel : desktopTriggerLabel}</span>
					<CaretDownIcon
						className={cn("size-3 shrink-0 transition-transform duration-[120ms]", open && "rotate-180")}
					/>
				</Button>
			</PopoverTrigger>
			<PopoverContent align={mobile ? "start" : "end"} className="w-[min(14rem,calc(100vw-1rem))] rounded-8 p-1">
				<Command className="rounded-8">
					<CommandInput
						aria-label={_(msg`Search markets`)}
						placeholder={_(msg`Search markets...`)}
						className="text-xs"
					/>
					<CommandList className="max-h-56 py-1">
						<CommandEmpty className="py-4 text-xs text-fg-muted">{_(msg`No markets found.`)}</CommandEmpty>
						<CommandItem
							value={_(allMessage)}
							onSelect={() => handleChange(ALL_POSITION_MARKETS)}
							className="text-xs data-[selected=true]:bg-market-close-hover"
						>
							<span>{_(allMessage)}</span>
							{value.type === "all" ? <CheckIcon className="ml-auto size-3 text-brand" weight="bold" /> : null}
						</CommandItem>
						<CommandItem
							value={_(currentMessage)}
							onSelect={() => handleChange(CURRENT_POSITION_MARKET)}
							className="text-xs data-[selected=true]:bg-market-close-hover"
						>
							<span>{_(currentMessage)}</span>
							{value.type === "current" ? <CheckIcon className="ml-auto size-3 text-brand" weight="bold" /> : null}
						</CommandItem>
						{options.map((option) => {
							const selected = isSelectedMarket(value, option);
							return (
								<CommandItem
									key={`${option.dex}:${option.coin}`}
									value={`${option.label} ${option.coin} ${option.dex}`}
									onSelect={() => handleChange({ type: "market", market: { coin: option.coin, dex: option.dex } })}
									className="text-xs data-[selected=true]:bg-market-close-hover"
								>
									<span className="truncate">{option.label}</span>
									{selected ? <CheckIcon className="ml-auto size-3 shrink-0 text-brand" weight="bold" /> : null}
								</CommandItem>
							);
						})}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
