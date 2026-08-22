import { getHip3DeployerDocumentationUrl } from "@/config/hip3-deployers";
import { type UnifiedMarketInfo, useMarketsInfo, useSelectedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import { useHasAcceptedHip3Disclaimer } from "@/stores/use-hip3-disclaimer-store";

export interface Hip3DisclaimerRequirement {
	isRequired: boolean;
	dex: string | undefined;
	documentationUrl: string | undefined;
}

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

export function useHip3DisclaimerRequirement(targetMarketName?: string | null): Hip3DisclaimerRequirement {
	const { data: selectedMarket } = useSelectedMarketInfo();
	const { getMarketInfo } = useMarketsInfo();
	const hasAccepted = useHasAcceptedHip3Disclaimer();
	const market =
		targetMarketName === null ? undefined : targetMarketName ? getMarketInfo(targetMarketName) : selectedMarket;
	return getHip3DisclaimerRequirement(market, hasAccepted);
}
