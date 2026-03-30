import type {
	AllMidsParameters,
	AllMidsResponse,
	CancelParameters,
	CancelSuccessResponse,
	ExchangeClient,
	InfoClient,
	L2BookWsEvent,
	L2BookWsParameters,
	OrderParameters,
	OrderSuccessResponse,
	SubscriptionClient,
	TradesWsEvent,
	TradesWsParameters,
	UserFillsWsEvent,
	UserFillsWsParameters,
} from "@nktkas/hyperliquid";
import { describe, expectTypeOf, it } from "vitest";
import type {
	ExchangeMethod,
	ExchangeParams,
	ExchangeResponse,
	InfoMethod,
	InfoParams,
	InfoResponse,
	SubEvent,
	SubMethod,
	SubParams,
} from "@/lib/hyperliquid/types/clients";

describe("InfoClient mapped types", () => {
	it("resolves params for required-params method", () => {
		expectTypeOf<InfoParams<"clearinghouseState">>().not.toBeNever();
		expectTypeOf<InfoParams<"clearinghouseState">>().toHaveProperty("user");
	});

	it("resolves params as optional for overloaded method", () => {
		type Params = InfoParams<"allMids">;
		expectTypeOf<Params>().toMatchTypeOf<AllMidsParameters | undefined>();
	});

	it("resolves params as undefined for no-params method", () => {
		expectTypeOf<undefined>().toMatchTypeOf<InfoParams<"spotMeta">>();
		expectTypeOf<undefined>().toMatchTypeOf<InfoParams<"exchangeStatus">>();
	});

	it("resolves response type correctly", () => {
		expectTypeOf<InfoResponse<"allMids">>().toEqualTypeOf<AllMidsResponse>();
	});

	it("does not include non-method properties", () => {
		type Methods = InfoMethod;
		expectTypeOf<"config_">().not.toMatchTypeOf<Methods>();
	});

	it("covers all InfoClient methods", () => {
		type SDKMethods = Exclude<keyof InfoClient, "config_">;
		expectTypeOf<InfoMethod>().toMatchTypeOf<SDKMethods>();
	});
});

describe("ExchangeClient mapped types", () => {
	it("resolves params for required-params method", () => {
		expectTypeOf<OrderParameters>().toMatchTypeOf<ExchangeParams<"order">>();
		expectTypeOf<CancelParameters>().toMatchTypeOf<ExchangeParams<"cancel">>();
	});

	it("resolves params as undefined for no-params method", () => {
		type NoopParams = ExchangeParams<"noop">;
		expectTypeOf<undefined>().toMatchTypeOf<NoopParams>();
	});

	it("resolves response type correctly", () => {
		expectTypeOf<ExchangeResponse<"order">>().toEqualTypeOf<OrderSuccessResponse>();
		expectTypeOf<ExchangeResponse<"cancel">>().toEqualTypeOf<CancelSuccessResponse>();
	});

	it("covers all ExchangeClient methods", () => {
		type SDKMethods = Exclude<keyof ExchangeClient, "config_">;
		expectTypeOf<ExchangeMethod>().toMatchTypeOf<SDKMethods>();
	});
});

describe("SubscriptionClient mapped types", () => {
	it("resolves params for required-params method", () => {
		expectTypeOf<SubParams<"l2Book">>().toEqualTypeOf<L2BookWsParameters>();
		expectTypeOf<SubParams<"trades">>().toEqualTypeOf<TradesWsParameters>();
		expectTypeOf<SubParams<"userFills">>().toEqualTypeOf<UserFillsWsParameters>();
	});

	it("resolves params as undefined for no-params method", () => {
		expectTypeOf<SubParams<"explorerBlock">>().toEqualTypeOf<undefined>();
		expectTypeOf<SubParams<"spotAssetCtxs">>().toEqualTypeOf<undefined>();
	});

	it("resolves params as optional for overloaded method", () => {
		type Params = SubParams<"allMids">;
		expectTypeOf<undefined>().toMatchTypeOf<Params>();
	});

	it("resolves event type correctly", () => {
		expectTypeOf<SubEvent<"l2Book">>().toEqualTypeOf<L2BookWsEvent>();
		expectTypeOf<SubEvent<"trades">>().toEqualTypeOf<TradesWsEvent>();
		expectTypeOf<SubEvent<"userFills">>().toEqualTypeOf<UserFillsWsEvent>();
	});

	it("resolves event type for no-params method", () => {
		expectTypeOf<SubEvent<"explorerBlock">>().not.toBeNever();
		expectTypeOf<SubEvent<"spotAssetCtxs">>().not.toBeNever();
	});

	it("never resolves to never for any method", () => {
		expectTypeOf<SubEvent<"l2Book">>().not.toBeNever();
		expectTypeOf<SubEvent<"openOrders">>().not.toBeNever();
		expectTypeOf<SubEvent<"allMids">>().not.toBeNever();
		expectTypeOf<SubEvent<"userFundings">>().not.toBeNever();
		expectTypeOf<SubEvent<"userHistoricalOrders">>().not.toBeNever();
	});

	it("covers all SubscriptionClient methods", () => {
		type SDKMethods = Exclude<keyof SubscriptionClient, "config_">;
		expectTypeOf<SubMethod>().toMatchTypeOf<SDKMethods>();
	});
});
