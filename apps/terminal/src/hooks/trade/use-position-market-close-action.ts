import type { PositionMarketCloseRef } from "@/components/trade/positions/position-dialog-types";
import { getPositionDex } from "@/domain/market";
import { useLegalGate } from "@/hooks/trade/use-legal-gate";
import { usePositionMarketCloseSubmit } from "@/hooks/trade/use-position-market-close-submit";
import { useIsMobile } from "@/hooks/use-mobile";
import { type UnifiedMarket, useAgentStatus, useHyperliquid, useMarkets } from "@/lib/hyperliquid";
import { readPositionMarketCloseConfirmationPreference } from "@/lib/trade/position-market-close-confirmation-preference";
import { usePositionMarketCloseActions, usePositionMarketCloseSession } from "@/stores/use-global-modal-store";
import { useHasAcceptedHip3Disclaimer } from "@/stores/use-hip3-disclaimer-store";

const EVM_ADDRESS_PATTERN = /^0x[a-f0-9]{40}$/;

/**
 * The single entry point for position Market actions. A saved preference may skip
 * presentation only; it never skips legal, trading authorization, market, or HIP-3 gates.
 */
export function usePositionMarketCloseAction() {
	const actions = usePositionMarketCloseActions();
	const session = usePositionMarketCloseSession();
	const { submit } = usePositionMarketCloseSubmit();
	const isMobile = useIsMobile();
	const { clientKey, env } = useHyperliquid();
	const markets = useMarkets();
	const legalGate = useLegalGate();
	const agentStatus = useAgentStatus();
	const hasAcceptedHip3 = useHasAcceptedHip3Disclaimer();

	function open(position: PositionMarketCloseRef): string | null {
		const owner = clientKey.trim().toLowerCase();
		const market = markets.getMarket(position.coin);
		const preference = readPositionMarketCloseConfirmationPreference({ owner, env });
		const direct =
			!isMobile &&
			EVM_ADDRESS_PATTERN.test(owner) &&
			preference === "dismissed" &&
			legalGate.state === "accepted" &&
			agentStatus.isReady &&
			!agentStatus.isLoading &&
			!markets.isLoading &&
			!markets.error &&
			isSameTradableMarket(position, market) &&
			(market?.kind !== "builderPerp" || hasAcceptedHip3);

		const sessionId = actions.open(position, direct ? "direct" : "confirmation");
		if (sessionId && direct) void submit({ sessionId });
		return sessionId;
	}

	return { open, session };
}

function isSameTradableMarket(position: PositionMarketCloseRef, market: UnifiedMarket | undefined): boolean {
	return (
		!!market &&
		market.kind !== "spot" &&
		market.assetId === position.assetId &&
		market.szDecimals === position.szDecimals &&
		getPositionDex(market) === position.dex
	);
}
