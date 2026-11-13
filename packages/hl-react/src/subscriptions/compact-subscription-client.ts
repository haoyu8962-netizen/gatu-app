import {
	type FastAssetCtxsWsEvent,
	type ISubscription,
	SubscriptionClient,
	type SubscriptionConfig,
} from "@nktkas/hyperliquid";
import {
	type CompactAssetCtxsDisconnectSubscriber,
	type CompactAssetCtxsSubscribeOptions,
	type CompactPerpAssetCtxsEvent,
	type CompactSpotAssetCtxsEvent,
	subscribeCompactAssetCtxs,
	subscribeFastAssetCtxs,
} from "./compact-asset-ctxs";

export interface CompactSubscriptionConfig extends SubscriptionConfig {
	/** Fires when the underlying socket drops, so accumulated compact state restarts from a snapshot. */
	subscribeDisconnect?: CompactAssetCtxsDisconnectSubscriber;
}

/**
 * The SDK subscription client plus the compact all-market context channels the public WebSocket
 * serves but the pinned SDK does not model. The generic hooks derive their method union from this
 * class, so `useSubscription("pac" | "sac")` shares the store, throttling, staleness and payload
 * guards of every other channel.
 */
export class CompactSubscriptionClient extends SubscriptionClient<CompactSubscriptionConfig> {
	pac(
		listener: (data: CompactPerpAssetCtxsEvent) => void,
		options?: CompactAssetCtxsSubscribeOptions,
	): Promise<ISubscription> {
		return subscribeCompactAssetCtxs(
			this.config_.transport,
			"pac",
			listener,
			options,
			this.config_.subscribeDisconnect,
		);
	}

	sac(
		listener: (data: CompactSpotAssetCtxsEvent) => void,
		options?: CompactAssetCtxsSubscribeOptions,
	): Promise<ISubscription> {
		return subscribeCompactAssetCtxs(
			this.config_.transport,
			"sac",
			listener,
			options,
			this.config_.subscribeDisconnect,
		);
	}

	override fastAssetCtxs(
		listener: (data: FastAssetCtxsWsEvent) => void,
		options?: CompactAssetCtxsSubscribeOptions,
	): Promise<ISubscription> {
		return subscribeFastAssetCtxs(this.config_.transport, listener, options, this.config_.subscribeDisconnect);
	}
}
