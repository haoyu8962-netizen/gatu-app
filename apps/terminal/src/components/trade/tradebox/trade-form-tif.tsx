import { Select } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { DefinitionTooltip } from "@/components/ui/definition-tooltip";
import { type LimitTif, TIF_OPTIONS } from "@/config/trade";
import { cn } from "@/lib/cn";
import { useOrderEntryActions, useTif } from "@/stores/use-order-entry-store";

interface Props {
	orderType: string;
	disabled: boolean;
	tradingPanel?: boolean;
}

export function TradeFormTif({ orderType, disabled, tradingPanel }: Props) {
	const tif = useTif();
	const { setTif } = useOrderEntryActions();

	const availableTifOptions = orderType === "limit" ? (["Gtc", "Ioc", "Alo"] as const) : (["Gtc", "Alo"] as const);
	const selectedTifLabel = tif in TIF_OPTIONS ? TIF_OPTIONS[tif as keyof typeof TIF_OPTIONS].label : String(tif);

	return (
		<div className={cn("ml-auto flex items-center gap-1.5", tradingPanel && "gap-0.5")}>
			<DefinitionTooltip topic="tif" only={availableTifOptions}>
				<span
					className={cn(
						"cursor-default text-3xs font-medium tracking-wide uppercase select-none",
						tradingPanel ? "text-trading-panel-muted max-[339px]:hidden" : "text-fg-muted/60",
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
					label: TIF_OPTIONS[opt].label,
				}))}
			/>
		</div>
	);
}
