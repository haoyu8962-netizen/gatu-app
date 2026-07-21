import { t } from "@lingui/core/macro";
import { useState } from "react";
import { toast } from "sonner";
import { isAmbiguousOrderRequestError } from "@/domain/trade/order-tracking";
import { useExchange, useMarkets } from "@/lib/hyperliquid";

export interface TwapCancelFeedback {
	tone: "error" | "warning";
	message: string;
}

export function useTwapCancel() {
	const markets = useMarkets();
	const { mutateAsync: cancel, reset } = useExchange("twapCancel");
	const [cancellingTwapId, setCancellingTwapId] = useState<number | null>(null);
	const [feedback, setFeedback] = useState<TwapCancelFeedback | null>(null);

	async function cancelTwap(coin: string, twapId: number): Promise<void> {
		if (cancellingTwapId !== null) return;

		const assetId = markets.getAssetId(coin);
		if (typeof assetId !== "number") {
			const message = t`Unable to identify this TWAP market. Refresh market data before retrying.`;
			setFeedback({ tone: "error", message });
			toast.error(message);
			return;
		}

		reset();
		setFeedback(null);
		setCancellingTwapId(twapId);
		try {
			await cancel({ a: assetId, t: twapId });
			toast.success(t`TWAP cancellation confirmed.`);
		} catch (error) {
			if (isAmbiguousOrderRequestError(error)) {
				const message = t`TWAP cancellation was submitted, but its status could not be confirmed. Check the active TWAP list before retrying.`;
				setFeedback({ tone: "warning", message });
				toast.warning(message);
				return;
			}

			const message = error instanceof Error ? error.message : t`Failed to cancel TWAP order.`;
			setFeedback({ tone: "error", message });
			toast.error(message);
		} finally {
			setCancellingTwapId(null);
		}
	}

	return { cancelTwap, cancellingTwapId, feedback };
}
