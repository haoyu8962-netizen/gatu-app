import { Badge } from "@gatu/ui";
import { CaretDownIcon } from "@phosphor-icons/react";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { AssetDisplay } from "../components/asset-display";

export const TOKEN_SELECTOR_TRIGGER_CLASSNAME =
	"inline-flex items-center gap-1 max-w-full min-w-0 px-2 py-1.5 rounded-8 bg-surface/80 hover:bg-fill-hover transition-colors cursor-pointer leading-none";

function getMarketKindBadgeLabel(market: UnifiedMarketInfo | undefined): string {
	if (!market) return "";
	if (market.kind === "spot") return "Spot";
	if (market.kind === "builderPerp") return market.dex;
	return "Perp";
}

function getMarketLeverageLabel(market: UnifiedMarketInfo | undefined): string | null {
	if (!market || !("maxLeverage" in market) || !market.maxLeverage) return null;
	return `${market.maxLeverage}x`;
}

function getPairNameParts(pairName: string): { main: string; suffix: string } {
	const separatorIndex = pairName.indexOf("-");
	if (separatorIndex < 0) return { main: pairName, suffix: "" };
	return {
		main: pairName.slice(0, separatorIndex),
		suffix: pairName.slice(separatorIndex),
	};
}

interface Props {
	selectedMarket: UnifiedMarketInfo | undefined;
	mobile?: boolean;
}

export function TokenSelectorTriggerContent({ selectedMarket, mobile = false }: Props) {
	const kindBadge = getMarketKindBadgeLabel(selectedMarket);
	const leverageLabel = getMarketLeverageLabel(selectedMarket);
	const pairName = selectedMarket?.pairName ?? selectedMarket?.name ?? "";
	const pairNameParts = getPairNameParts(pairName);

	if (mobile) {
		return (
			<>
				{selectedMarket && (
					<>
						<AssetDisplay
							coin={selectedMarket.name}
							iconUrl={selectedMarket.iconUrl}
							hideName
							iconClassName="size-[18px]"
						/>
						<span className="flex min-w-0 flex-col items-start gap-1">
							<span
								className="max-w-[42vw] truncate text-base font-normal tracking-tight leading-none"
								title={pairName}
							>
								<span className="text-fg">{pairNameParts.main}</span>
								{pairNameParts.suffix ? <span className="text-fg-muted">{pairNameParts.suffix}</span> : null}
							</span>
							<span className="flex min-w-0 items-center gap-1.5 text-3xs font-medium leading-none text-brand">
								{kindBadge ? <span className="max-w-[5rem] truncate uppercase">{kindBadge}</span> : null}
								{leverageLabel ? <span className="shrink-0 tabular-nums">{leverageLabel}</span> : null}
							</span>
						</span>
					</>
				)}
				<CaretDownIcon className="size-4 shrink-0 self-start text-fg-muted" />
			</>
		);
	}

	return (
		<>
			{selectedMarket && (
				<>
					<AssetDisplay
						coin={selectedMarket.name}
						iconUrl={selectedMarket.iconUrl}
						hideName
						iconClassName="size-[18px]"
					/>
					<span
						className="min-w-[82px] max-w-[34vw] truncate text-sm font-medium text-fg tracking-tight leading-none"
						title={selectedMarket.pairName ?? selectedMarket.name}
					>
						{selectedMarket.pairName ?? selectedMarket.name}
					</span>
					{kindBadge ? (
						<Badge
							tone="neutral"
							size="xs"
							className="uppercase shrink-0 self-center font-normal leading-none text-fg-muted border-stroke-weak/40 bg-fill-weaker"
						>
							{kindBadge}
						</Badge>
					) : null}
				</>
			)}
			<CaretDownIcon className="size-4 shrink-0 self-center text-fg-muted" />
		</>
	);
}
