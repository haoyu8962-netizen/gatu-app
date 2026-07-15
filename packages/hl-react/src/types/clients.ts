import type { ExchangeClient, InfoClient, ISubscription, SubscriptionClient } from "@nktkas/hyperliquid";

// ── InfoClient mapped types ─────────────────────────────────────────

type InfoClientMethods = {
	[K in keyof InfoClient as InfoClient[K] extends (...args: never[]) => Promise<unknown> ? K : never]: InfoClient[K];
};

export type InfoMethod = keyof InfoClientMethods & string;

export type InfoParams<M extends InfoMethod> = InfoClientMethods[M] extends {
	(params: infer P, signal?: AbortSignal): Promise<unknown>;
	(signal?: AbortSignal): Promise<unknown>;
}
	? P | undefined
	: InfoClientMethods[M] extends (params: infer P, signal?: AbortSignal) => Promise<unknown>
		? P extends AbortSignal | undefined
			? undefined
			: P
		: undefined;

export type InfoResponse<M extends InfoMethod> = InfoClientMethods[M] extends (...args: never[]) => Promise<infer R>
	? R
	: never;

// ── ExchangeClient mapped types ─────────────────────────────────────

type ExchangeClientMethods = {
	[K in keyof ExchangeClient as ExchangeClient[K] extends (...args: never[]) => Promise<unknown>
		? K
		: never]: ExchangeClient[K];
};

export type ExchangeMethod = keyof ExchangeClientMethods & string;

type ExchangeOptionalParamsMethods = "scheduleCancel";

export type ExchangeParams<M extends ExchangeMethod> = M extends ExchangeOptionalParamsMethods
	? ExchangeClientMethods[M] extends {
			(params: infer P, ...args: never[]): Promise<unknown>;
			(...args: never[]): Promise<unknown>;
		}
		? P | undefined
		: never
	: Parameters<ExchangeClientMethods[M]> extends [infer P, ...unknown[]]
		? P
		: undefined;

export type ExchangeResponse<M extends ExchangeMethod> = ExchangeClientMethods[M] extends (
	...args: never[]
) => Promise<infer R>
	? R
	: never;

// ── SubscriptionClient mapped types ─────────────────────────────────

type SubClientMethods = {
	[K in keyof SubscriptionClient as SubscriptionClient[K] extends (...args: never[]) => Promise<ISubscription>
		? K
		: never]: SubscriptionClient[K];
};

export type SubMethod = keyof SubClientMethods & string;

type SubOptionalParamsMethods = "allMids" | "assetCtxs";

export type SubParams<M extends SubMethod> = M extends SubOptionalParamsMethods
	? Parameters<SubClientMethods[M]> extends [infer P, unknown, ...unknown[]]
		? P | undefined
		: undefined
	: Parameters<SubClientMethods[M]> extends [infer P, unknown, ...unknown[]]
		? P
		: undefined;

type SubListener<M extends SubMethod> = Extract<
	Parameters<SubClientMethods[M]>[0] | Parameters<SubClientMethods[M]>[1],
	(data: never) => void
>;

export type SubEvent<M extends SubMethod> = SubListener<M> extends (data: infer E) => void ? E : never;
