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
}

const allMessage = msg`All`;
const currentMessage = msg`Current`;
const marketMessage = msg`Market`;

function isSelectedMarket(value: PositionMarketFilter, option: PositionMarketOption): boolean {
	return value.type === "market" && value.market.coin === option.coin && value.market.dex === option.dex;
}

function getMarketFilterFallbackLabel(value: PositionMarketFilter): string | undefined {
	if (value.type !== "market") return undefined;
	const marketName = value.market.coin.split(":").pop() ?? value.market.coin;
	return value.market.dex ? `${marketName} (${value.market.dex})` : marketName;
}

export function PositionMarketFilterControl({ value, options, onChange }: Props) {
	const { _ } = useLingui();
	const [open, setOpen] = useState(false);
	const selectedOption =
		value.type === "market" ? options.find((option) => isSelectedMarket(value, option)) : undefined;
	let triggerLabel = _(marketMessage);
	if (value.type === "current") triggerLabel = _(currentMessage);
	if (value.type === "market")
		triggerLabel = selectedOption?.label ?? getMarketFilterFallbackLabel(value) ?? _(marketMessage);

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
					aria-label={_(msg`Filter positions by market`)}
					className="h-full min-h-0 max-w-32 gap-1 rounded-xs px-2 py-0 font-normal text-fg-muted hover:bg-fill-hover hover:text-fg"
				>
					<span className="truncate">{triggerLabel}</span>
					<CaretDownIcon className={cn("size-3 shrink-0 transition-transform duration-150", open && "rotate-180")} />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-56 rounded-8 p-1">
				<Command className="rounded-8">
					<CommandInput placeholder={_(msg`Search markets...`)} className="text-xs" />
					<CommandList className="max-h-56 py-1">
						<CommandEmpty className="py-4 text-xs text-fg-muted">{_(msg`No markets found.`)}</CommandEmpty>
						<CommandItem value={_(allMessage)} onSelect={() => handleChange(ALL_POSITION_MARKETS)} className="text-xs">
							<span>{_(allMessage)}</span>
							{value.type === "all" ? <CheckIcon className="ml-auto size-3 text-brand" weight="bold" /> : null}
						</CommandItem>
						<CommandItem
							value={_(currentMessage)}
							onSelect={() => handleChange(CURRENT_POSITION_MARKET)}
							className="text-xs"
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
									className="text-xs"
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
