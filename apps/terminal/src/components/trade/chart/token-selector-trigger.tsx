import { Badge } from "@gatu/ui";
import { CaretDownIcon } from "@phosphor-icons/react";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { AssetDisplay } from "../components/asset-display";

export const TOKEN_SELECTOR_TRIGGER_CLASSNAME =
	"inline-flex h-10 shrink-0 select-none items-center gap-1.5 rounded-8 bg-transparent px-2 text-fg transition-[color,background-color] duration-150 ease-out hover:bg-fill-hover active:bg-fill-press aria-expanded:bg-fill-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stroke-focus motion-reduce:transition-none cursor-pointer leading-none";

export const MOBILE_TOKEN_SELECTOR_TRIGGER_CLASSNAME =
	"inline-flex shrink-0 items-center gap-2 rounded-8 bg-surface/80 py-2 pr-3 pl-2.5 hover:bg-fill-hover cursor-pointer leading-none";

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
	open?: boolean;
}

export function TokenSelectorTriggerContent({ selectedMarket, mobile = false, open = false }: Props) {
	const kindBadge = getMarketKindBadgeLabel(selectedMarket);
	const leverageLabel = getMarketLeverageLabel(selectedMarket);
	const pairName = selectedMarket?.pairName ?? selectedMarket?.name ?? "";
	const pairNameParts = getPairNameParts(pairName);
	const desktopMetadataLabel = kindBadge === "Perp" && leverageLabel ? leverageLabel : kindBadge;

	if (mobile) {
		return (
			<>
				{selectedMarket && (
					<>
						<AssetDisplay coin={selectedMarket.name} iconUrl={selectedMarket.iconUrl} hideName iconClassName="size-5" />
						<span className="flex shrink-0 flex-col items-start">
							<span className="whitespace-nowrap text-lg leading-[30px] font-normal tracking-tight" title={pairName}>
								<span className="text-fg">{pairNameParts.main}</span>
								{pairNameParts.suffix ? <span className="text-fg-muted">{pairNameParts.suffix}</span> : null}
							</span>
							<span className="flex min-w-0 items-center text-[10px] leading-[15px] font-medium text-brand">
								{kindBadge === "Perp" && leverageLabel ? (
									<span className="shrink-0 tabular-nums">{leverageLabel}</span>
								) : kindBadge ? (
									<span className="max-w-[5rem] truncate uppercase">{kindBadge}</span>
								) : null}
							</span>
						</span>
					</>
				)}
				<CaretDownIcon className="size-3.5 shrink-0 self-center text-fg-muted" />
			</>
		);
	}

	return (
		<>
			{selectedMarket && (
				<>
					<AssetDisplay coin={selectedMarket.name} iconUrl={selectedMarket.iconUrl} hideName iconClassName="size-5" />
					<span
						className="shrink-0 whitespace-nowrap text-lg font-normal text-fg tracking-tight leading-none"
						title={selectedMarket.pairName ?? selectedMarket.name}
					>
						{selectedMarket.pairName ?? selectedMarket.name}
					</span>
					{desktopMetadataLabel ? (
						<Badge
							tone={desktopMetadataLabel === leverageLabel ? "success" : "neutral"}
							size="xs"
							className="shrink-0 self-center font-normal uppercase tabular-nums"
						>
							{desktopMetadataLabel}
						</Badge>
					) : null}
				</>
			)}
			<CaretDownIcon
				className={`size-4 shrink-0 self-center text-fg-muted transition-transform duration-150 ease-out motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
			/>
		</>
	);
}
