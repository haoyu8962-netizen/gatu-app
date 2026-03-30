import { ExchangeClient, InfoClient, SubscriptionClient } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import type { ExchangeMethod, InfoMethod, SubMethod } from "@/lib/hyperliquid/types/clients";

const INFO_METHODS: InfoMethod[] = Object.getOwnPropertyNames(InfoClient.prototype).filter(
	(name) => name !== "constructor" && name !== "config_",
) as InfoMethod[];

const EXCHANGE_METHODS: ExchangeMethod[] = Object.getOwnPropertyNames(ExchangeClient.prototype).filter(
	(name) => name !== "constructor" && name !== "config_",
) as ExchangeMethod[];

const SUB_METHODS: SubMethod[] = Object.getOwnPropertyNames(SubscriptionClient.prototype).filter(
	(name) => name !== "constructor" && name !== "config_",
) as SubMethod[];

describe("dynamic dispatch safety", () => {
	it("every InfoMethod exists on InfoClient.prototype", () => {
		for (const method of INFO_METHODS) {
			expect(typeof InfoClient.prototype[method], `InfoClient.prototype.${method} should be a function`).toBe(
				"function",
			);
		}
	});

	it("every ExchangeMethod exists on ExchangeClient.prototype", () => {
		for (const method of EXCHANGE_METHODS) {
			expect(typeof ExchangeClient.prototype[method], `ExchangeClient.prototype.${method} should be a function`).toBe(
				"function",
			);
		}
	});

	it("every SubMethod exists on SubscriptionClient.prototype", () => {
		for (const method of SUB_METHODS) {
			expect(
				typeof SubscriptionClient.prototype[method],
				`SubscriptionClient.prototype.${method} should be a function`,
			).toBe("function");
		}
	});

	it("InfoMethod union covers all InfoClient methods", () => {
		const prototypeMethods = Object.getOwnPropertyNames(InfoClient.prototype).filter(
			(name) => name !== "constructor" && name !== "config_",
		);
		expect(INFO_METHODS.sort()).toEqual(prototypeMethods.sort());
	});

	it("ExchangeMethod union covers all ExchangeClient methods", () => {
		const prototypeMethods = Object.getOwnPropertyNames(ExchangeClient.prototype).filter(
			(name) => name !== "constructor" && name !== "config_",
		);
		expect(EXCHANGE_METHODS.sort()).toEqual(prototypeMethods.sort());
	});

	it("SubMethod union covers all SubscriptionClient methods", () => {
		const prototypeMethods = Object.getOwnPropertyNames(SubscriptionClient.prototype).filter(
			(name) => name !== "constructor" && name !== "config_",
		);
		expect(SUB_METHODS.sort()).toEqual(prototypeMethods.sort());
	});
});
