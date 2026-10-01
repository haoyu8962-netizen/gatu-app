import { ExchangeClient, SubscriptionClient } from "@nktkas/hyperliquid";
import { getExchangeMethodConfig } from "@sairn/hl-react/registries/exchange";
import {
	getAccumulateConfig,
	getDefaultThrottle,
	shouldAcceptSubscriptionEvent,
} from "@sairn/hl-react/registries/subscription";
import { describe, expect, it } from "vitest";
import type { ExchangeMethod, SubMethod } from "@/lib/hyperliquid";

const EXCHANGE_METHODS: ExchangeMethod[] = Object.getOwnPropertyNames(ExchangeClient.prototype).filter(
	(name) => name !== "constructor" && name !== "config_",
) as ExchangeMethod[];

const SUB_METHODS: SubMethod[] = Object.getOwnPropertyNames(SubscriptionClient.prototype).filter(
	(name) => name !== "constructor" && name !== "config_",
) as SubMethod[];

describe("exchange registry", () => {
	it("returns a config for every ExchangeClient method", () => {
		for (const method of EXCHANGE_METHODS) {
			const config = getExchangeMethodConfig(method);
			expect(config).toBeDefined();
			expect(config.client).toMatch(/^(trading|user)$/);
			expect(typeof config.injectBuilder).toBe("boolean");
			expect(typeof config.useClientKey).toBe("boolean");
		}
	});

	// Exact methods marked "Signing: User-Signed EIP-712" by
	// @nktkas/hyperliquid 0.33.3. Update this contract with every SDK upgrade.
	const EXPECTED_USER_SIGNED: ExchangeMethod[] = [
		"approveAgent",
		"approveBuilderFee",
		"cDeposit",
		"cWithdraw",
		"convertToMultiSigUser",
		"linkStakingUser",
		"sendAsset",
		"sendToEvmWithData",
		"spotSend",
		"stakingLinkDisableTradingUser",
		"tokenDelegate",
		"usdClassTransfer",
		"usdSend",
		"userDexAbstraction",
		"userPortfolioMargin",
		"userSetAbstraction",
		"withdraw3",
	];

	it("routes user-signed methods to user client", () => {
		for (const method of EXPECTED_USER_SIGNED) {
			const config = getExchangeMethodConfig(method);
			expect(config.client, `${method} should use user client`).toBe("user");
		}
	});

	it("routes all other methods to trading client", () => {
		const tradingMethods = EXCHANGE_METHODS.filter((m) => !EXPECTED_USER_SIGNED.includes(m));
		for (const method of tradingMethods) {
			const config = getExchangeMethodConfig(method);
			expect(config.client, `${method} should use trading client`).toBe("trading");
		}
	});

	it("routes activateOutcomeDeployer as an L1 action through the trading client", () => {
		expect(getExchangeMethodConfig("activateOutcomeDeployer").client).toBe("trading");
	});

	it("routes referral actions through the Agent client without a builder payload", () => {
		for (const method of ["claimRewards", "registerReferrer", "setReferrer"] as const) {
			const config = getExchangeMethodConfig(method);
			expect(config.client).toBe("trading");
			expect(config.injectBuilder).toBe(false);
		}
	});

	it("only injects builder config for order", () => {
		for (const method of EXCHANGE_METHODS) {
			const config = getExchangeMethodConfig(method);
			if (method === "order") {
				expect(config.injectBuilder, "order should inject builder").toBe(true);
			} else {
				expect(config.injectBuilder, `${method} should not inject builder`).toBe(false);
			}
		}
	});

	it("uses clientKey for account-scoped trading mutations", () => {
		for (const method of EXCHANGE_METHODS) {
			const config = getExchangeMethodConfig(method);
			if (method === "order" || method === "cancel" || method === "batchModify") {
				expect(config.useClientKey, `${method} should use clientKey`).toBe(true);
			} else {
				expect(config.useClientKey, `${method} should not use clientKey`).toBe(false);
			}
		}
	});
});

describe("subscription registry", () => {
	const EXPECTED_ACCUMULATING: SubMethod[] = [
		"trades",
		"userFills",
		"userFundings",
		"userHistoricalOrders",
		"userNonFundingLedgerUpdates",
		"userTwapHistory",
		"userTwapSliceFills",
	];

	it("has accumulate config for all accumulating subscriptions", () => {
		for (const method of EXPECTED_ACCUMULATING) {
			const config = getAccumulateConfig(method);
			expect(config, `${method} should have accumulate config`).not.toBeNull();
			if (!config) throw new Error(`Missing accumulate config for ${method}`);
			expect(typeof config.getItems).toBe("function");
			expect(typeof config.withItems).toBe("function");
			expect(typeof config.isSnapshot).toBe("function");
			expect(config.buffer.maxSize).toBeGreaterThan(0);
			expect(typeof config.buffer.getKey).toBe("function");
			expect(typeof config.buffer.compare).toBe("function");
		}
	});

	it("returns null for non-accumulating subscriptions", () => {
		const nonAccumulating = SUB_METHODS.filter((m) => !EXPECTED_ACCUMULATING.includes(m));
		for (const method of nonAccumulating) {
			expect(getAccumulateConfig(method), `${method} should not accumulate`).toBeNull();
		}
	});

	it("uses time, coin, and tid to identify public trades", () => {
		const config = getAccumulateConfig("trades");
		expect(config?.buffer.getKey({ time: 123, coin: "HYPE", tid: 456 })).toBe("123:HYPE:456");
	});

	it("preserves distinct ledger deltas that share an L1 hash", () => {
		const config = getAccumulateConfig("userNonFundingLedgerUpdates");
		const hash = `0x${"1".repeat(64)}`;
		const withdrawalKey = config?.buffer.getKey({
			delta: { type: "vaultWithdraw", netWithdrawnUsd: "99" },
			hash,
			time: 123,
		});
		const commissionKey = config?.buffer.getKey({
			delta: { type: "vaultLeaderCommission", usdc: "1" },
			hash,
			time: 123,
		});

		expect(withdrawalKey).not.toBe(commissionKey);
	});

	it("coalesces order-book streams to at most one store update per frame", () => {
		expect(getDefaultThrottle("bbo")).toBe(16);
		expect(getDefaultThrottle("l2Book")).toBe(16);
		const others = SUB_METHODS.filter((m) => m !== "bbo" && m !== "l2Book");
		for (const method of others) {
			expect(getDefaultThrottle(method), `${method} should not have default throttle`).toBeUndefined();
		}
	});

	it("rejects coin or fast-mode l2Book payloads routed to the wrong listener", () => {
		const fastEvent = { coin: "ETH", fast: true, levels: [[], []], time: 1 };
		const fullEvent = { coin: "ETH", levels: [[], []], time: 2 };

		expect(shouldAcceptSubscriptionEvent("l2Book", { coin: "ETH", fast: true }, fastEvent)).toBe(true);
		expect(shouldAcceptSubscriptionEvent("l2Book", { coin: "ETH", fast: true }, fullEvent)).toBe(false);
		expect(shouldAcceptSubscriptionEvent("l2Book", { coin: "ETH" }, fastEvent)).toBe(false);
		expect(shouldAcceptSubscriptionEvent("l2Book", { coin: "BTC" }, fullEvent)).toBe(false);
		expect(shouldAcceptSubscriptionEvent("trades", { coin: "ETH" }, fastEvent)).toBe(true);
	});

	it.each(["activeAssetCtx", "activeSpotAssetCtx"] as const)(
		"rejects %s payloads routed to another market before they enter the shared store",
		(method) => {
			expect(shouldAcceptSubscriptionEvent(method, { coin: "ETH" }, { coin: "ETH", ctx: {} })).toBe(true);
			expect(shouldAcceptSubscriptionEvent(method, { coin: "ETH" }, { coin: "BTC", ctx: {} })).toBe(false);
			expect(shouldAcceptSubscriptionEvent(method, undefined, { coin: "ETH", ctx: {} })).toBe(false);
		},
	);
});
