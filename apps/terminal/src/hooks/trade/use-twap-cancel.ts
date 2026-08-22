import { t } from "@lingui/core/macro";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { isAmbiguousOrderRequestError } from "@/domain/trade/order-tracking";
import { useExchange, useHyperliquid, useMarkets } from "@/lib/hyperliquid";
import { clearOrderAssetReservations, runWithAvailableOrderAssetLocks } from "@/lib/trade/order-asset-lock";
import { getActiveTwapReservationId } from "@/lib/trade/twap-order-asset-reservation";

export interface TwapCancelFeedback {
	tone: "error" | "warning";
	message: string;
}

export function useTwapCancel() {
	const markets = useMarkets();
	const { clientKey, env } = useHyperliquid();
	const { mutateAsync: cancel, reset } = useExchange("twapCancel");
	const cancellingRef = useRef(false);
	const [cancellingTwapId, setCancellingTwapId] = useState<number | null>(null);
	const [feedback, setFeedback] = useState<TwapCancelFeedback | null>(null);

	async function cancelTwap(coin: string, twapId: number): Promise<void> {
		if (cancellingRef.current) return;

		const assetId = markets.getAssetId(coin);
		if (typeof assetId !== "number") {
			const message = t`Unable to identify this TWAP market. Refresh market data before retrying.`;
			setFeedback({ tone: "error", message });
			toast.error(message);
			return;
		}

		reset();
		setFeedback(null);
		if (clientKey === "disconnected") {
			const message = t`Safe order coordination across tabs is unavailable in this browser.`;
			setFeedback({ tone: "error", message });
			toast.error(message);
			return;
		}

		cancellingRef.current = true;
		setCancellingTwapId(twapId);
		try {
			const lockResult = await runWithAvailableOrderAssetLocks(
				{ env, owner: clientKey, assetIds: [assetId] },
				async (lease) => {
					await cancel({ a: assetId, t: twapId });
					clearOrderAssetReservations(lease, getActiveTwapReservationId(twapId));
				},
			);
			if (!lockResult.supported || !lockResult.acquired) {
				const message = t`Safe order coordination across tabs is unavailable in this browser.`;
				setFeedback({ tone: "error", message });
				toast.error(message);
				return;
			}
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
			cancellingRef.current = false;
			setCancellingTwapId(null);
		}
	}

	return { cancelTwap, cancellingTwapId, feedback };
}
