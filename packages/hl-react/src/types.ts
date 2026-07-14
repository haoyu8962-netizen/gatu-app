import type { HyperliquidError, IRequestTransport, ISubscriptionTransport } from "@nktkas/hyperliquid";
import type { AbstractWallet } from "@nktkas/hyperliquid/signing";
import type { QueryKey, UseMutationOptions, UseQueryOptions } from "@tanstack/react-query";

export type HyperliquidQueryError = HyperliquidError;

export type QueryParameter<TQueryFnData, TData = TQueryFnData> = Omit<
	UseQueryOptions<TQueryFnData, HyperliquidQueryError, TData, QueryKey>,
	"queryKey" | "queryFn"
>;

export type MutationParameter<TData, TVariables> = Omit<
	UseMutationOptions<TData, HyperliquidQueryError, TVariables>,
	"mutationKey" | "mutationFn"
>;

type AnyMethod = (...args: unknown[]) => unknown;

export type InferData<TMethod extends AnyMethod> = Awaited<ReturnType<TMethod>>;
export type InferParams<TMethod extends AnyMethod> = Exclude<Parameters<TMethod>[0], AbortSignal>;
export type InferSubListener<TMethod extends AnyMethod> = Extract<
	Parameters<TMethod>[0] | Parameters<TMethod>[1],
	// biome-ignore lint/suspicious/noExplicitAny: listener parameter types vary per subscription; `any` keeps the Extract bivariant.
	(data: any) => void
>;
export type InferSubEvent<TMethod extends AnyMethod> = InferSubListener<TMethod> extends (data: infer D) => void
	? D
	: never;
export type InferSubParams<TMethod extends AnyMethod> = Exclude<Parameters<TMethod>[0], InferSubListener<TMethod>>;

/** Failure hooks forwarded to the SDK's subscribe options (v0.33+ replaces `failureSignal`). */
export type SubscribeFailureOptions = {
	onError?: (error: unknown) => void;
};

export type SubscriptionStatus = "idle" | "subscribing" | "active" | "error";
export type WebSocketStatus = "idle" | "connecting" | "open" | "error";

export interface SubscriptionOptions {
	enabled?: boolean;
	throttleMs?: number;
	maxStaleMs?: number;
	maxPayloadBytes?: number;
	dropOversizedPayload?: boolean;
	pauseWhenHidden?: boolean;
	refreshKey?: string | number | null;
}

export type SubscriptionResult<TData> = {
	data: TData | undefined;
	status: SubscriptionStatus;
	error: unknown;
	isStale: boolean;
	unsubscribe: (() => Promise<void>) | undefined;
};

export type HyperliquidConfig = {
	httpTransport?: IRequestTransport;
	wsTransport?: ISubscriptionTransport;
	wallet?: AbstractWallet;
	ssr?: boolean;
	triggerReconnect?: () => void;
};
