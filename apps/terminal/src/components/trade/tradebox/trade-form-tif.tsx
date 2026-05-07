import { Select } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { DefinitionTooltip } from "@/components/ui/definition-tooltip";
import { type LimitTif, TIF_OPTIONS } from "@/config/trade";
import { useOrderEntryActions, useTif } from "@/stores/use-order-entry-store";

interface Props {
	orderType: string;
	disabled: boolean;
}

export function TradeFormTif({ orderType, disabled }: Props) {
	const tif = useTif();
	const { setTif } = useOrderEntryActions();

	const availableTifOptions = orderType === "limit" ? (["Gtc", "Ioc", "Alo"] as const) : (["Gtc", "Alo"] as const);

	return (
		<div className="ml-auto flex items-center gap-1.5">
			<DefinitionTooltip topic="tif" only={availableTifOptions}>
				<span className="text-3xs font-medium text-fg-muted/60 uppercase tracking-wide select-none cursor-default">{t`TIF`}</span>
			</DefinitionTooltip>
			<Select
				size="xs"
				value={tif}
				onValueChange={(value) => value && setTif(value as LimitTif)}
				disabled={disabled}
				triggerClassName="border-transparent bg-transparent hover:bg-fill-hover/40 px-1.5 gap-1"
				options={availableTifOptions.map((opt) => ({
					value: opt,
					label: TIF_OPTIONS[opt].label,
				}))}
			/>
		</div>
	);
}
