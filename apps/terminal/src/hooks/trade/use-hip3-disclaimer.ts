import { getHip3DeployerDocumentationUrl } from "@/config/hip3-deployers";
import { type UnifiedMarketInfo, useMarketsInfo, useSelectedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import { useHasAcceptedHip3Disclaimer } from "@/stores/use-hip3-disclaimer-store";

export interface Hip3DisclaimerRequirement {
	isRequired: boolean;
	dex: string | undefined;
	documentationUrl: string | undefined;
}

/** `undefined` targets the selected market, `null` targets nothing, a list resolves to its first builder-deployed market. */
export type Hip3DisclaimerTarget = string | readonly string[] | null | undefined;

export function getHip3DisclaimerRequirement(
	market: UnifiedMarketInfo | undefined,
	hasAccepted: boolean,
): Hip3DisclaimerRequirement {
	const dex = market?.kind === "builderPerp" ? market.dex : undefined;
	return {
		isRequired: !!dex && !hasAccepted,
		dex,
		documentationUrl: dex ? getHip3DeployerDocumentationUrl(dex) : undefined,
	};
}

export function useHip3DisclaimerRequirement(target?: Hip3DisclaimerTarget): Hip3DisclaimerRequirement {
	const { data: selectedMarket } = useSelectedMarketInfo();
	const { getMarketInfo } = useMarketsInfo();
	const hasAccepted = useHasAcceptedHip3Disclaimer();
	return getHip3DisclaimerRequirement(resolveTargetMarket(target, selectedMarket, getMarketInfo), hasAccepted);
}

function resolveTargetMarket(
	target: Hip3DisclaimerTarget,
	selectedMarket: UnifiedMarketInfo | undefined,
	getMarketInfo: (name: string) => UnifiedMarketInfo | undefined,
): UnifiedMarketInfo | undefined {
	if (target === null) return undefined;
	if (target === undefined) return selectedMarket;
	const markets = (typeof target === "string" ? [target] : target).map((name) => getMarketInfo(name));
	return markets.find((market) => market?.kind === "builderPerp") ?? markets[0];
}
