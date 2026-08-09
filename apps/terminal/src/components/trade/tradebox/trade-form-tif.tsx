import { Select } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { DefinitionTooltip } from "@/components/ui/definition-tooltip";
import type { LimitTif } from "@/config/trade";
import { cn } from "@/lib/cn";
import { getAvailableTifOptions, getTifOptionLabel } from "@/lib/trade/tif";
import { useOrderEntryActions, useTif } from "@/stores/use-order-entry-store";

interface Props {
	orderType: string;
	disabled: boolean;
	tradingPanel?: boolean;
}

export function TradeFormTif({ orderType, disabled, tradingPanel }: Props) {
	const tif = useTif();
	const { setTif } = useOrderEntryActions();

	const availableTifOptions = getAvailableTifOptions(orderType);
	const selectedTifLabel = getTifOptionLabel(tif);

	return (
		<div className={cn("ml-auto flex items-center gap-1.5", tradingPanel && "gap-0.5")}>
			<DefinitionTooltip topic="tif" only={availableTifOptions}>
				<span
					className={cn(
						"cursor-default font-medium tracking-wide uppercase select-none",
						tradingPanel ? "text-2xs text-trading-panel-muted max-[339px]:hidden" : "text-3xs text-fg-muted/60",
					)}
				>
					{t`TIF`}
				</span>
			</DefinitionTooltip>
			<Select
				size="xs"
				value={tif}
				triggerAriaLabel={`${t`TIF`}: ${selectedTifLabel}`}
				onValueChange={(value) => value && setTif(value as LimitTif)}
				disabled={disabled}
				triggerClassName={cn(
					"gap-1 border-transparent bg-transparent px-1.5",
					tradingPanel
						? "gap-0.5 px-0.5 text-2xs text-trading-panel-fg hover:bg-trading-panel-hover"
						: "hover:bg-fill-hover/40",
				)}
				options={availableTifOptions.map((opt) => ({
					value: opt,
					label: getTifOptionLabel(opt),
				}))}
			/>
		</div>
	);
}
