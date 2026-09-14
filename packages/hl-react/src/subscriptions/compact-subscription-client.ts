import { type ISubscription, SubscriptionClient } from "@nktkas/hyperliquid";
import {
	type CompactAssetCtxsSubscribeOptions,
	type CompactPerpAssetCtxsEvent,
	type CompactSpotAssetCtxsEvent,
	subscribeCompactAssetCtxs,
} from "./compact-asset-ctxs";

/**
 * The SDK subscription client plus the compact all-market context channels the public WebSocket
 * serves but the pinned SDK does not model. The generic hooks derive their method union from this
 * class, so `useSubscription("pac" | "sac")` shares the store, throttling, staleness and payload
 * guards of every other channel.
 */
export class CompactSubscriptionClient extends SubscriptionClient {
	pac(
		listener: (data: CompactPerpAssetCtxsEvent) => void,
		options?: CompactAssetCtxsSubscribeOptions,
	): Promise<ISubscription> {
		return subscribeCompactAssetCtxs(this.config_.transport, "pac", listener, options);
	}

	sac(
		listener: (data: CompactSpotAssetCtxsEvent) => void,
		options?: CompactAssetCtxsSubscribeOptions,
	): Promise<ISubscription> {
		return subscribeCompactAssetCtxs(this.config_.transport, "sac", listener, options);
	}
}
