import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MessageDescriptor } from "@lingui/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePrivyFiatFundingFeatureFlags } from "@/config/privy-fiat-funding-flags";
import {
	classifyPrivyFiatFundingError,
	classifyPrivyFiatFundingResult,
	createPrivyFiatFundingRequest,
	isSamePrivyFiatFundingDestination,
	PRIVY_FIAT_FUNDING_ASSET,
	PRIVY_FIAT_FUNDING_BACK_NAVIGATION_ERROR,
	PRIVY_FIAT_FUNDING_BUSY_MESSAGE,
	PRIVY_FIAT_FUNDING_CARD_DECLINE_REASONS,
	PRIVY_FIAT_FUNDING_CHAIN,
	PRIVY_FIAT_FUNDING_FAILURE_MESSAGES,
	PRIVY_FIAT_FUNDING_PAYMENT_METHOD_ERROR,
	PRIVY_FIAT_FUNDING_UNCONFIRMED_MESSAGES,
	PRIVY_FIAT_FUNDING_UNPROVEN_DECLINE_REASONS,
	PRIVY_FIAT_FUNDING_USER_EXIT_MESSAGE,
	resolvePrivyFiatFundingDestination,
} from "@/domain/trade/privy-fiat-funding";
import { getPrivyFiatFundingOwnerKey } from "@/domain/trade/privy-fiat-funding-owner-key";
import {
	STATUS_GLYPH_ERROR,
	STATUS_GLYPH_SUCCESS,
	STATUS_GLYPH_UNKNOWN,
	STATUS_GLYPH_WARNING,
} from "@/lib/brand/status-glyph.gen";
import {
	getPrivyFiatFundingFeedback,
	getPrivyFiatFundingNoticeGlyph,
	isPersistentPrivyFiatFundingNotice,
	type PrivyFiatFundingNotice,
	type PrivyFiatFundingNoticeKind,
} from "@/lib/trade/privy-fiat-funding-feedback";
import {
	finishPrivyFiatFunding,
	followPrivyFiatFundingWindow,
	isCurrentPrivyFiatFundingAttempt,
	type PrivyFiatFundingAttempt,
	requestPrivyFiatFunding,
	resetPrivyFiatFundingStore,
} from "@/stores/use-privy-fiat-funding-store";

const OWNER = "0xabcdefabcdefabcdefabcdefabcdefabcdef1234";
const OWNER_CHECKSUM_CASE = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdef1234";
const OTHER = "0x2222222222222222222222222222222222222222";
const PRIVY_DIST = resolve(__dirname, "../../../node_modules/@privy-io/react-auth/dist/esm");
const PRIVY_CJS_DIST = resolve(__dirname, "../../../node_modules/@privy-io/react-auth/dist/cjs");
const SONNER_DIST = resolve(__dirname, "../../../node_modules/sonner/dist");
const PRIVY_ONRAMP_HOOK_FILE = "use-headless-crypto-deposit-";

function readPrivyBundle(directory: string, prefix: string, extension: string): string {
	return readdirSync(directory)
		.filter((name) => name.startsWith(prefix) && name.endsWith(extension))
		.map((name) => readFileSync(resolve(directory, name), "utf8"))
		.join("\n");
}

function readPrivyFiatOnrampScreen(): string {
	return readPrivyBundle(PRIVY_DIST, "FiatOnrampScreen-", ".mjs");
}

/** The arrow function that begins at `start` in minified source, up to the brace that closes its body. */
function sliceArrowFunction(source: string, start: number): string {
	let depth = 0;
	let quote = "";
	for (let index = source.indexOf("{", start); index < source.length; index++) {
		const character = source[index];
		if (quote) {
			if (character === "\\") index++;
			else if (character === quote) quote = "";
		} else if (character === '"' || character === "'" || character === "`") quote = character;
		else if (character === "{") depth++;
		else if (character === "}" && --depth === 0) return source.slice(start, index + 1);
	}
	throw new Error("A function of the installed Privy SDK does not end");
}

/** The source of the hook behind `useFiatOnramp` in the installed SDK, as one arrow function. */
function readPrivyFiatOnrampHook(): string {
	const bundle = readPrivyBundle(PRIVY_DIST, PRIVY_ONRAMP_HOOK_FILE, ".mjs");
	const start =
		/\(\)=>\{let\{openModal:\w+,closePrivyModal:\w+,privy:\w+\}=\w+\(\),\{navigate:\w+\}=\w+\(\),\{user:\w+\}=/.exec(
			bundle,
		);
	if (!start) throw new Error("The installed Privy SDK no longer contains the expected fiat onramp hook");
	return sliceArrowFunction(bundle, start.index);
}

interface PrivyFiatOnrampFlow {
	onFailure: (error: unknown) => Promise<void>;
	onSuccess: (value: unknown) => Promise<void>;
}

interface Deferred {
	promise: Promise<unknown>;
	resolve: (value: unknown) => void;
	reject: (error: unknown) => void;
}

function createDeferred(): Deferred {
	let resolve: Deferred["resolve"] = () => undefined;
	let reject: Deferred["reject"] = () => undefined;
	const promise = new Promise<unknown>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}

/**
 * Runs the hook of the installed SDK with its surroundings replaced: Privy's window, its quote
 * request, its flow store and its deferred timer are recorded instead of performed. What `fund()`
 * does with them is the SDK's own code, so the order in which it opens the window, waits for
 * quotes, closes and settles is observed, not assumed. Every name the hook reads outside itself is
 * identified by its role in the source; a name without a stand-in throws, so a dependency that a
 * later SDK adds cannot be swallowed. `rejectionHandlers` counts the `catch` calls on a result
 * promise, which is what the patch adds; the stand-in handles the rejection itself, so a run
 * without the patch stays quiet too.
 */
function runPrivyFiatOnrampHook(source: string) {
	function role(pattern: RegExp): string {
		const name = pattern.exec(source)?.[1];
		if (!name) throw new Error(`The fiat onramp hook of the installed Privy SDK no longer matches ${pattern}`);
		return name;
	}
	let flow: PrivyFiatOnrampFlow | null = null;
	const events: unknown[] = [];
	const quoteRequests: Deferred[] = [];
	const timers: (() => void)[] = [];
	const results: { rejectionHandlers: number }[] = [];
	const appliedQuotes: unknown[] = [];

	function createResult(): Deferred {
		const result = createDeferred();
		const handle = result.promise.catch.bind(result.promise);
		const record = { rejectionHandlers: 0 };
		handle(() => undefined);
		result.promise.catch = ((onRejected: never) => {
			record.rejectionHandlers += 1;
			return handle(onRejected);
		}) as typeof result.promise.catch;
		results.push(record);
		return result;
	}

	const surroundings: Record<string, unknown> = {
		[role(/\{openModal:\w+,closePrivyModal:\w+,privy:\w+\}=(\w+)\(\)/)]: () => ({
			openModal: (screen: unknown) => events.push(screen === null ? "screen cleared" : `opened ${screen}`),
			closePrivyModal: async () => {
				await nextTask();
				events.push("window closed");
			},
			privy: {
				fetchPrivyRoute() {
					const request = createDeferred();
					quoteRequests.push(request);
					return request.promise;
				},
			},
		}),
		[role(/\{navigate:\w+\}=(\w+)\(\)/)]: () => ({}),
		[role(/\{user:\w+\}=(\w+)\(\)/)]: () => ({}),
		[role(/\{wallets:\w+\}=(\w+)\(\),\{wallets:\w+\}=\w+\(\)/)]: () => ({}),
		[role(/\{wallets:\w+\}=\w+\(\),\{wallets:\w+\}=(\w+)\(\)/)]: () => ({}),
		[role(/,\w+=(\w+)\(null\)/)]: (current: unknown) => ({ current }),
		[role(/\},(\w+)\(\(\(\)=>\(\{fund:/)]: (create: () => unknown) => create(),
		[role(/promise:\w+\}=(\w+)\(\)/)]: createResult,
		[role(/Object\.keys\((\w+)\)/)]: { usd: true },
		[role(/(\w+)\.setState\(\{onSuccess:/)]: {
			getState: () => flow,
			setState(next: PrivyFiatOnrampFlow | null) {
				flow = next;
			},
		},
		[role(/fetchPrivyRoute\((\w+),\{body:\w+\}\),\w+=async\(\)=>/)]: "quotes route",
		[role(/return (\w+)\(\{initialQuotes:/)]: (quotes: { initialQuotes: unknown }) =>
			appliedQuotes.push(quotes.initialQuotes),
		[role(/initialSelectedQuote:(\w+)\(/)]: () => null,
		[role(/quotesWarning:(\w+)\(/)]: () => null,
		setTimeout: (callback: () => void) => timers.push(callback),
	};
	const scope = new Proxy(surroundings, {
		has: (target, name) => typeof name === "string" && (name in target || !(name in globalThis)),
		get(target, name) {
			if (typeof name !== "string" || name in target) return Reflect.get(target, name);
			throw new Error(`The fiat onramp hook of the installed Privy SDK reads ${name}, which has no stand-in here`);
		},
	});
	const useFiatOnramp = new Function("scope", `with (scope) { return ${source}; }`)(scope) as () => {
		fund: (request: unknown) => Promise<unknown>;
	};
	const { fund } = useFiatOnramp();

	return {
		appliedQuotes,
		events,
		quoteRequests,
		results,
		flow: () => flow,
		fund(label: string) {
			fund({
				source: { defaultAsset: "usd" },
				destination: { address: OWNER, chain: "eip155:42161", asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
				environment: "production",
				defaultAmount: "100",
			}).then(
				(value) => events.push(`${label} resolved ${JSON.stringify(value)}`),
				(error: unknown) => events.push(`${label} rejected ${error instanceof Error ? error.message : error}`),
			);
		},
		runTimers() {
			for (const callback of timers.splice(0)) callback();
		},
	};
}

/**
 * What the app relies on from `fund()` of the installed SDK, observed on the SDK's own code: a
 * closed flow closes Privy's window before it settles; `fund()` itself still waits for its first
 * quotes; a later purchase is untouched by the quotes of a closed one; a flow that was never ended
 * refuses the next purchase; and (the patch) the result has a rejection handler from the start.
 */
async function observePrivyFiatOnrampFund(source: string) {
	const closedEarly = runPrivyFiatOnrampHook(source);
	closedEarly.fund("first");
	const handledFromTheStart = closedEarly.results.map((result) => result.rejectionHandlers);
	await closedEarly.flow()?.onFailure(new Error(PRIVY_FIAT_FUNDING_USER_EXIT_MESSAGE));
	await nextTask();
	const beforeQuotes = [...closedEarly.events];
	const registeredUntilTimer = closedEarly.flow() !== null;
	closedEarly.runTimers();
	const clearedByTimer = closedEarly.flow() === null;
	closedEarly.fund("second");
	const secondFlow = closedEarly.flow();
	closedEarly.quoteRequests[0].resolve({ quotes: ["stale"] });
	await nextTask();
	const afterStaleQuotes = {
		events: closedEarly.events.slice(beforeQuotes.length),
		appliedQuotes: [...closedEarly.appliedQuotes],
		secondFlowKept: closedEarly.flow() === secondFlow,
	};
	closedEarly.quoteRequests[1]?.resolve({ quotes: ["fresh"] });
	await nextTask();

	const finished = runPrivyFiatOnrampHook(source);
	finished.fund("purchase");
	finished.quoteRequests[0].resolve({ quotes: ["shown"] });
	await nextTask();
	await finished.flow()?.onSuccess({ status: "submitted" });
	await nextTask();

	const failed = runPrivyFiatOnrampHook(source);
	failed.fund("purchase");
	failed.quoteRequests[0].resolve({ quotes: ["shown"] });
	await nextTask();
	await failed.flow()?.onFailure(new Error("Transaction failed"));
	await nextTask();

	const unended = runPrivyFiatOnrampHook(source);
	unended.fund("first");
	unended.fund("second");
	await nextTask();

	return {
		handledFromTheStart,
		beforeQuotes,
		registeredUntilTimer,
		clearedByTimer,
		afterStaleQuotes,
		quoteRequests: closedEarly.quoteRequests.length,
		appliedQuotes: closedEarly.appliedQuotes,
		finished: finished.events,
		failed: failed.events,
		unended: unended.events,
	};
}

function nextTask(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

const PRIVY_ONRAMP_CLOSE_HANDLER_START =
	/async\(\)=>\{let\{error:\w+,state:\w+,isLoading:\w+,onFailure:\w+,onSuccess:\w+\}=(\w+)\(\);(\w+)\(\),(\w+)\(\);/;

const PRIVY_ONRAMP_CLOSE_CASES = {
	"an error is on screen": { state: { status: "provider-success" }, error: "shown error", isLoading: false },
	"the provider reported success": { state: { status: "provider-success" }, error: null, isLoading: false },
	"the provider is confirming": { state: { status: "provider-confirming" }, error: null, isLoading: false },
	"the Stripe checkout is being confirmed": {
		state: { status: "stripe-flow", step: "confirm-checkout" },
		error: null,
		isLoading: true,
	},
	"the Stripe checkout is waiting for the user": {
		state: { status: "stripe-flow", step: "confirm-checkout" },
		error: null,
		isLoading: false,
	},
	"the Stripe payment step is loading": {
		state: { status: "stripe-flow", step: "payment" },
		error: null,
		isLoading: true,
	},
	"the amount is being chosen": { state: { status: "select-amount" }, error: null, isLoading: false },
};

/**
 * Runs the handler the installed SDK calls when its purchase window closes, with the SDK's own
 * store getter replaced, and records how `fund()` would settle. Matching the source as text cannot
 * notice a changed operand, and evaluating only the decision cannot notice what the handler passes
 * to it or which callback it calls; running the whole handler can.
 */
async function settlePrivyFiatOnrampClose(screen: string): Promise<Record<string, unknown>> {
	const match = PRIVY_ONRAMP_CLOSE_HANDLER_START.exec(screen);
	if (!match) throw new Error("The installed Privy SDK no longer contains the expected close handler");
	const [, readFlow, ...cleanups] = match;
	const source = sliceArrowFunction(screen, match.index);
	const settled: Record<string, unknown> = {};
	for (const [label, flow] of Object.entries(PRIVY_ONRAMP_CLOSE_CASES)) {
		const scope: Record<string, unknown> = Object.fromEntries(cleanups.map((name) => [name, () => undefined]));
		scope[readFlow] = () => ({
			...flow,
			onSuccess: async (value: unknown) => {
				settled[label] = { resolved: value };
			},
			onFailure: (error: unknown) => {
				settled[label] = { rejected: error instanceof Error ? error.message : error };
			},
		});
		const close = new Function(...Object.keys(scope), `return ${source}`)(
			...Object.values(scope),
		) as () => Promise<void>;
		await close();
	}
	return settled;
}

const embeddedSession = {
	clientKey: OWNER,
	sessionMode: "wallet" as const,
	walletIntent: "embedded" as const,
	sessionWalletAddress: OWNER,
	embeddedWalletAddress: OWNER,
	privyWalletAddresses: [OWNER, OTHER],
};

describe("card funding destination", () => {
	it("pays out to the exact embedded owner of an email session", () => {
		expect(resolvePrivyFiatFundingDestination(embeddedSession)).toEqual({ address: OWNER, walletKind: "embedded" });
	});

	it("pays out to the exact external owner and matches addresses case-insensitively", () => {
		expect(
			resolvePrivyFiatFundingDestination({
				...embeddedSession,
				clientKey: OWNER.toLowerCase(),
				walletIntent: "external",
				sessionWalletAddress: OWNER_CHECKSUM_CASE,
				embeddedWalletAddress: undefined,
			}),
		).toEqual({ address: OWNER_CHECKSUM_CASE, walletKind: "external" });
	});

	it.each([
		["the session owner differs from the selected Hyperliquid user", { clientKey: OTHER }],
		["the session is agent-only", { sessionMode: "agent-only" as const }],
		["the session is disconnected", { sessionMode: "disconnected" as const }],
		["the session wallet is missing", { sessionWalletAddress: undefined }],
		["Privy does not list the wallet", { privyWalletAddresses: [OTHER] }],
		["the embedded wallet is not the owner", { embeddedWalletAddress: OTHER }],
		["the embedded wallet is unknown", { embeddedWalletAddress: undefined }],
		["the wallet intent is ambiguous", { walletIntent: "ambiguous" as const }],
		["the wallet intent is unavailable", { walletIntent: "unavailable" as const }],
	])("offers nothing when %s", (_label, override) => {
		expect(resolvePrivyFiatFundingDestination({ ...embeddedSession, ...override })).toBeNull();
	});

	it("never falls back to another connected wallet", () => {
		expect(
			resolvePrivyFiatFundingDestination({
				...embeddedSession,
				walletIntent: "external",
				sessionWalletAddress: OTHER,
				privyWalletAddresses: [OWNER, OTHER],
			}),
		).toBeNull();
	});
});

describe("card funding destination recheck", () => {
	const requested = { address: OWNER, walletKind: "embedded" } as const;

	it("accepts only the same wallet, comparing the address without regard to case", () => {
		expect(isSamePrivyFiatFundingDestination({ address: OWNER_CHECKSUM_CASE, walletKind: "embedded" }, requested)).toBe(
			true,
		);
		expect(isSamePrivyFiatFundingDestination({ address: OTHER, walletKind: "embedded" }, requested)).toBe(false);
		expect(isSamePrivyFiatFundingDestination({ address: OWNER, walletKind: "external" }, requested)).toBe(false);
		expect(isSamePrivyFiatFundingDestination(null, requested)).toBe(false);
	});
});

describe("card funding request", () => {
	it("asks for Arbitrum USDC at the exact owner in production on Mainnet, opening at 100 US dollars", () => {
		expect(PRIVY_FIAT_FUNDING_CHAIN).toBe("eip155:42161");
		expect(PRIVY_FIAT_FUNDING_ASSET).toBe("0xaf88d065e77c8cC2239327C5EDb3A432268e5831");
		expect(createPrivyFiatFundingRequest({ address: OWNER, walletKind: "external" }, "mainnet")).toEqual({
			source: { defaultAsset: "usd" },
			destination: { address: OWNER, chain: "eip155:42161", asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
			environment: "production",
			defaultAmount: "100",
		});
	});

	it("runs the provider sandbox on testnet against the same Mainnet destination", () => {
		const request = createPrivyFiatFundingRequest({ address: OWNER, walletKind: "embedded" }, "testnet");
		expect(request.environment).toBe("sandbox");
		expect(request.destination.chain).toBe("eip155:42161");
	});

	it("keys an attempt by network and lower-cased owner", () => {
		expect(getPrivyFiatFundingOwnerKey("mainnet", OWNER_CHECKSUM_CASE)).toBe(`mainnet:${OWNER.toLowerCase()}`);
		expect(getPrivyFiatFundingOwnerKey("testnet", OWNER)).not.toBe(getPrivyFiatFundingOwnerKey("mainnet", OWNER));
	});
});

describe("card funding outcomes", () => {
	it("takes the two statuses Privy resolves with and treats any other resolved value as an unknown status", () => {
		expect(classifyPrivyFiatFundingResult({ status: "confirmed" })).toBe("confirmed");
		expect(classifyPrivyFiatFundingResult({ status: "submitted" })).toBe("submitted");
		expect(classifyPrivyFiatFundingResult({ status: "unexpected" })).toBe("unknown");
		expect(classifyPrivyFiatFundingResult({})).toBe("unknown");
		expect(classifyPrivyFiatFundingResult(undefined)).toBe("unknown");
		expect(classifyPrivyFiatFundingResult("confirmed")).toBe("unknown");
	});

	it("separates a user exit, a flow already in progress, a definite failure and an unknown status", () => {
		const back = new Error("Back navigation");
		back.name = PRIVY_FIAT_FUNDING_BACK_NAVIGATION_ERROR;
		expect(classifyPrivyFiatFundingError(back)).toBe("cancelled");
		expect(classifyPrivyFiatFundingError(new Error(PRIVY_FIAT_FUNDING_USER_EXIT_MESSAGE))).toBe("cancelled");
		expect(classifyPrivyFiatFundingError(new Error(PRIVY_FIAT_FUNDING_BUSY_MESSAGE))).toBe("busy");
		for (const message of PRIVY_FIAT_FUNDING_FAILURE_MESSAGES) {
			expect(classifyPrivyFiatFundingError(new Error(message))).toBe("failed");
		}
		for (const message of PRIVY_FIAT_FUNDING_UNCONFIRMED_MESSAGES) {
			expect(classifyPrivyFiatFundingError(new Error(message))).toBe("unknown");
		}
		expect(classifyPrivyFiatFundingError(new Error("Transaction pending"))).toBe("unknown");
		expect(classifyPrivyFiatFundingError(new Error("stripe: network error after confirm"))).toBe("unknown");
		expect(classifyPrivyFiatFundingError("Card declined")).toBe("unknown");
	});

	function createPaymentMethodError(declineReason?: unknown) {
		return Object.assign(new Error("The card was declined. Try another Visa or Mastercard."), {
			name: PRIVY_FIAT_FUNDING_PAYMENT_METHOD_ERROR,
			declineReason,
		});
	}

	it("treats a payment method error as a definite failure only for a reason that proves the card was refused", () => {
		for (const reason of PRIVY_FIAT_FUNDING_CARD_DECLINE_REASONS) {
			expect(classifyPrivyFiatFundingError(createPaymentMethodError(reason))).toBe("failed");
		}
		for (const reason of [
			...PRIVY_FIAT_FUNDING_UNPROVEN_DECLINE_REASONS,
			"declined_after_capture",
			"insufficient_liquidity",
			"",
			undefined,
			null,
			7,
		]) {
			expect(classifyPrivyFiatFundingError(createPaymentMethodError(reason))).toBe("unknown");
		}
	});

	it("keeps a refund notice as an unknown status", () => {
		expect(
			classifyPrivyFiatFundingError(
				new Error(
					"We could not complete your purchase. Any charge will be refunded — contact support if it does not appear within a few days.",
				),
			),
		).toBe("unknown");
	});

	it("relies on the error texts the installed Privy SDK actually throws", () => {
		const bundles = readdirSync(PRIVY_DIST)
			.filter((name) => name.endsWith(".mjs"))
			.map((name) => readFileSync(resolve(PRIVY_DIST, name), "utf8"))
			.join("\n");
		expect(bundles).toContain(`Error("${PRIVY_FIAT_FUNDING_USER_EXIT_MESSAGE}")`);
		expect(bundles).toContain(`this.name="${PRIVY_FIAT_FUNDING_BACK_NAVIGATION_ERROR}"`);
		expect(bundles).toContain(`Error("${PRIVY_FIAT_FUNDING_BUSY_MESSAGE}")`);
		for (const message of [...PRIVY_FIAT_FUNDING_FAILURE_MESSAGES, ...PRIVY_FIAT_FUNDING_UNCONFIRMED_MESSAGES]) {
			if (message.startsWith("Transaction ")) {
				expect(bundles).toMatch(/Error\(`Transaction \$\{[^}]*\?\?"failed"\}`\)/);
				expect(bundles).toContain(`"${message.slice("Transaction ".length)}"===e.status`);
			} else {
				expect(bundles).toContain(`Error("${message}")`);
			}
		}
		expect(bundles).toContain(`this.declineReason=e,this.name="${PRIVY_FIAT_FUNDING_PAYMENT_METHOD_ERROR}"`);
	});

	it("classifies every decline reason the installed Privy SDK has a message for", () => {
		const screen = readPrivyFiatOnrampScreen();
		const messages = /\{card_declined:[^{}]*\}/.exec(screen)?.[0] ?? "";
		const reasons = [...messages.matchAll(/(?:^\{|,)([a-z_]+):/g)].map((match) => match[1]);
		expect(reasons.length).toBeGreaterThan(0);
		expect([...reasons].sort()).toEqual(
			[...PRIVY_FIAT_FUNDING_CARD_DECLINE_REASONS, ...PRIVY_FIAT_FUNDING_UNPROVEN_DECLINE_REASONS].sort(),
		);
	});

	it("relies on how the installed Privy SDK ends a flow that the user closes", async () => {
		expect(await settlePrivyFiatOnrampClose(readPrivyFiatOnrampScreen())).toEqual({
			"an error is on screen": { rejected: "shown error" },
			"the provider reported success": { resolved: { status: "confirmed" } },
			"the provider is confirming": { resolved: { status: "submitted" } },
			"the Stripe checkout is being confirmed": { resolved: { status: "submitted" } },
			"the Stripe checkout is waiting for the user": { rejected: "User exited flow" },
			"the Stripe payment step is loading": { rejected: "User exited flow" },
			"the amount is being chosen": { rejected: "User exited flow" },
		});
	});

	it("relies on the installed Privy SDK running that handler when its window closes", () => {
		const screen = readPrivyFiatOnrampScreen();
		const handler =
			/const (\w+)=async\(\)=>\{let\{error:\w+,state:\w+,isLoading:\w+,onFailure:\w+,onSuccess:\w+\}/.exec(screen)?.[1];
		expect(handler).toBeDefined();
		expect(screen).toContain(`onClose:${handler},`);
		expect(screen).toMatch(new RegExp(`\\w+\\.current=${handler};`));
	});

	it("relies on how fund() of the installed Privy SDK opens, waits, closes and settles", async () => {
		expect(await observePrivyFiatOnrampFund(readPrivyFiatOnrampHook())).toEqual({
			handledFromTheStart: [1],
			beforeQuotes: ["opened FiatOnrampScreen", "screen cleared", "window closed"],
			registeredUntilTimer: true,
			clearedByTimer: true,
			afterStaleQuotes: {
				events: ["opened FiatOnrampScreen", `first rejected ${PRIVY_FIAT_FUNDING_USER_EXIT_MESSAGE}`],
				appliedQuotes: [],
				secondFlowKept: true,
			},
			quoteRequests: 2,
			appliedQuotes: [["fresh"]],
			finished: [
				"opened FiatOnrampScreen",
				"screen cleared",
				"window closed",
				'purchase resolved {"status":"submitted"}',
			],
			failed: ["opened FiatOnrampScreen", "screen cleared", "window closed", "purchase rejected Transaction failed"],
			unended: ["opened FiatOnrampScreen", `second rejected ${PRIVY_FIAT_FUNDING_BUSY_MESSAGE}`],
		});
	});

	it.each([
		["fund()'s result has no rejection handler until its first quotes return", /;\w+\.catch\(\(\(\)=>\{\}\)\);/, ";"],
		[
			"a closed flow settles before Privy's window is closed",
			/onFailure:async (\w+)=>\{await (\w+)\(\),(\w+)\(\1\)\}/,
			"onFailure:async $1=>{$3($1),await $2()}",
		],
		[
			"a finished flow settles before Privy's window is closed",
			/onSuccess:async (\w+)=>\{await (\w+)\(\),(\w+)\(\1\)\}/,
			"onSuccess:async $1=>{$3($1),await $2()}",
		],
		["fund() no longer waits for its first quotes", /let (\w+)=await (\w+\(\{source:)/, "let $1={quotes:[]};$2"],
		[
			"the quotes of a closed flow reach a later purchase",
			/if\(\w+\.getState\(\)\?\.flowId!==\w+\)return await \w+;/,
			"",
		],
		["a closed flow stays registered", /setTimeout\(\(\(\)=>\{\w+\.setState\(null\)\}\),0\)/, "0"],
		[
			"a registered flow no longer refuses the next purchase",
			/if\(\w+\.getState\(\)\)return \w+\(Error\("Existing fiat onramp flow in progress"\)\),await \w+;/,
			"",
		],
	])("would notice if %s in the installed Privy SDK", async (_label, change, replacement) => {
		const source = readPrivyFiatOnrampHook();
		const changed = source.replace(change, replacement);
		expect(changed).not.toBe(source);
		expect(await observePrivyFiatOnrampFund(changed)).not.toEqual(await observePrivyFiatOnrampFund(source));
	});

	it("does not stand in for a name the hook of the installed Privy SDK did not read before", async () => {
		const sdk = runPrivyFiatOnrampHook(
			readPrivyFiatOnrampHook().replace(/let\{reject:/, "unknownHelper();let{reject:"),
		);
		sdk.fund("purchase");
		await nextTask();

		expect(sdk.events).toEqual([
			"purchase rejected The fiat onramp hook of the installed Privy SDK reads unknownHelper, which has no stand-in here",
		]);
	});

	it("relies on the same patch in the CommonJS build of the installed Privy SDK", () => {
		expect(readPrivyBundle(PRIVY_CJS_DIST, PRIVY_ONRAMP_HOOK_FILE, ".js")).toMatch(
			/fund:async \w+=>\{let\{reject:\w+,resolve:\w+,promise:(\w+)\}=\w+\(\),\w+=[^;]+;\1\.catch\(\(\(\)=>\{\}\)\);/,
		);
	});

	it("relies on the Sonner patch that starts a new period when a toast's duration changes", () => {
		for (const file of ["index.mjs", "index.js"]) {
			expect(readFileSync(resolve(SONNER_DIST, file), "utf8")).toMatch(
				/remainingTime\.current = duration;\s+(?:\/\/[^\n]*\s+)*lastCloseTimerStartTimeRef\.current = closeTimerStartTimeRef\.current;/,
			);
		}
	});

	it.each([
		[
			"the Stripe checkout no longer counts as submitted",
			/"stripe-flow"===\w+\.status&&"confirm-checkout"===\w+\.step&&\w+/,
			"!1",
		],
		["a confirming provider no longer counts as submitted", /"provider-confirming"===\w+\.status/, "!1"],
		["a shown error no longer wins", /\w+\?\{type:"failure",error:\w+\}:/, ""],
		[
			"the handler stops passing the shown error to the decision",
			/\}\)\(\{state:(\w+),error:\w+,isLoading:(\w+)\}\);"success"/,
			'})({state:$1,error:null,isLoading:$2});"success"',
		],
		[
			"the handler stops passing the loading state to the decision",
			/\}\)\(\{state:(\w+),error:(\w+),isLoading:\w+\}\);"success"/,
			'})({state:$1,error:$2,isLoading:!1});"success"',
		],
		["the handler calls the wrong callback", /;"success"===(\w+)\.type\?await/, ';"failure"===$1.type?await'],
	])("would notice if %s in the installed Privy SDK", async (_label, operand, replacement) => {
		const screen = readPrivyFiatOnrampScreen();
		const changed = screen.replace(operand, replacement);
		expect(changed).not.toBe(screen);
		expect(await settlePrivyFiatOnrampClose(changed)).not.toEqual(await settlePrivyFiatOnrampClose(screen));
	});
});

describe("card funding flags", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it.each([
		[undefined, false],
		["", false],
		["false", false],
		["TRUE", false],
		["True", false],
		[" true", false],
		["1", false],
		["yes", false],
		["true", true],
	])("turns a network on only for the exact string true: %j", (value, enabled) => {
		expect(resolvePrivyFiatFundingFeatureFlags({ VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED: value })).toEqual({
			mainnet: enabled,
			testnet: false,
		});
		expect(resolvePrivyFiatFundingFeatureFlags({ VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED: value })).toEqual({
			mainnet: false,
			testnet: enabled,
		});
	});

	it.each([
		["true", "false", true, false],
		["false", "true", false, true],
		["true", "true", true, true],
		["false", "false", false, false],
	])(
		"reads each network from its own flag at runtime: mainnet %s, testnet %s",
		async (mainnet, testnet, onMainnet, onTestnet) => {
			vi.stubEnv("VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED", mainnet);
			vi.stubEnv("VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED", testnet);
			vi.resetModules();
			const { isPrivyFiatFundingEnabled, PRIVY_FIAT_FUNDING_FEATURES } = await import("@/config/privy-fiat-funding");

			expect(PRIVY_FIAT_FUNDING_FEATURES).toEqual({ mainnet: onMainnet, testnet: onTestnet });
			expect(isPrivyFiatFundingEnabled(false)).toBe(onMainnet);
			expect(isPrivyFiatFundingEnabled(true)).toBe(onTestnet);
		},
	);
});

describe("card funding attempt store", () => {
	function createAttempt(): PrivyFiatFundingAttempt {
		return {
			destination: { address: OWNER, walletKind: "embedded" },
			network: "mainnet",
			ownerKey: getPrivyFiatFundingOwnerKey("mainnet", OWNER),
		};
	}

	afterEach(() => {
		resetPrivyFiatFundingStore();
	});

	it("holds one attempt at a time and lets only that attempt end itself", () => {
		const first = createAttempt();
		const second = createAttempt();
		expect(requestPrivyFiatFunding(first)).toBe(true);
		expect(requestPrivyFiatFunding(second)).toBe(false);

		finishPrivyFiatFunding(second);
		expect(isCurrentPrivyFiatFundingAttempt(first)).toBe(true);

		finishPrivyFiatFunding(first);
		expect(requestPrivyFiatFunding(second)).toBe(true);
		finishPrivyFiatFunding(first);
		expect(isCurrentPrivyFiatFundingAttempt(second)).toBe(true);
	});

	it("releases an attempt when Privy's window, once open for it, has closed", () => {
		const earlier = createAttempt();
		requestPrivyFiatFunding(earlier);
		followPrivyFiatFundingWindow(earlier, false);
		expect(isCurrentPrivyFiatFundingAttempt(earlier)).toBe(true);

		followPrivyFiatFundingWindow(earlier, true);
		expect(isCurrentPrivyFiatFundingAttempt(earlier)).toBe(true);
		followPrivyFiatFundingWindow(earlier, false);
		expect(isCurrentPrivyFiatFundingAttempt(earlier)).toBe(false);

		const later = createAttempt();
		requestPrivyFiatFunding(later);
		followPrivyFiatFundingWindow(later, false);
		followPrivyFiatFundingWindow(earlier, true);
		followPrivyFiatFundingWindow(later, false);
		expect(isCurrentPrivyFiatFundingAttempt(later)).toBe(true);

		followPrivyFiatFundingWindow(later, true);
		followPrivyFiatFundingWindow(earlier, true);
		followPrivyFiatFundingWindow(later, false);
		expect(isCurrentPrivyFiatFundingAttempt(later)).toBe(false);
	});
});

describe("card funding feedback", () => {
	const translate = (descriptor: MessageDescriptor) => descriptor.message ?? descriptor.id;
	const KINDS: PrivyFiatFundingNoticeKind[] = [
		"busy",
		"confirmed",
		"failed",
		"submitted",
		"unavailable",
		"unknown",
		"wallet-changed",
	];
	const SANDBOX_NOTE = "This was a sandbox test: no card was charged and no USDC will arrive.";

	function createNotice(kind: PrivyFiatFundingNoticeKind, overrides: Partial<PrivyFiatFundingNotice> = {}) {
		return {
			kind,
			network: "mainnet",
			ownerKey: getPrivyFiatFundingOwnerKey("mainnet", OWNER),
			walletKind: "embedded",
			...overrides,
		} satisfies PrivyFiatFundingNotice;
	}

	it("never claims arrival and adds the gas note as its own line only for external wallets", () => {
		const embedded = getPrivyFiatFundingFeedback(createNotice("confirmed"), translate);
		const external = getPrivyFiatFundingFeedback(createNotice("confirmed", { walletKind: "external" }), translate);
		expect(embedded.tone).toBe("success");
		expect(embedded.descriptionLines).toEqual([
			"USDC is on its way to your wallet on Arbitrum. Open Deposit once it arrives.",
		]);
		expect(external.descriptionLines).toEqual([
			"USDC is on its way to your wallet on Arbitrum. Open Deposit once it arrives.",
			"Depositing it needs a little ETH on Arbitrum for network fees.",
		]);
	});

	it("keeps results that may follow a charge on screen as an unknown status, never as an error", () => {
		for (const kind of KINDS) {
			const notice = createNotice(kind);
			const uncertain = kind === "submitted" || kind === "unknown";
			expect(isPersistentPrivyFiatFundingNotice(notice)).toBe(uncertain);
			expect(getPrivyFiatFundingFeedback(notice, translate).tone === "uncertain").toBe(uncertain);
			expect(getPrivyFiatFundingNoticeGlyph(notice) === STATUS_GLYPH_UNKNOWN).toBe(uncertain);
		}
		expect(getPrivyFiatFundingFeedback(createNotice("unknown"), translate).title).toBe("Card purchase status unknown");
	});

	it("reports a definite failure as an error and a busy flow as a warning", () => {
		expect(getPrivyFiatFundingFeedback(createNotice("busy"), translate)).toEqual({
			tone: "warning",
			title: "An earlier card purchase is still open on this page. Reload the page, then try again.",
			descriptionLines: [],
		});
		expect(getPrivyFiatFundingNoticeGlyph(createNotice("busy"))).toBe(STATUS_GLYPH_WARNING);
		expect(getPrivyFiatFundingFeedback(createNotice("failed", { walletKind: "external" }), translate)).toEqual({
			tone: "error",
			title: "Card purchase did not complete",
			descriptionLines: ["If you were charged, check the payment provider's email before trying again."],
		});
		expect(getPrivyFiatFundingNoticeGlyph(createNotice("failed"))).toBe(STATUS_GLYPH_ERROR);
		expect(getPrivyFiatFundingNoticeGlyph(createNotice("confirmed"))).toBe(STATUS_GLYPH_SUCCESS);
	});

	it("tells a purchase window that could not load apart from a wallet session that changed", () => {
		for (const network of ["mainnet", "testnet"] as const) {
			expect(getPrivyFiatFundingFeedback(createNotice("unavailable", { network }), translate)).toEqual({
				tone: "error",
				title: "Card purchase could not open. Check your connection and try again.",
				descriptionLines: [],
			});
			expect(getPrivyFiatFundingFeedback(createNotice("wallet-changed", { network }), translate)).toEqual({
				tone: "error",
				title: "Your wallet session changed, so the card purchase did not open. Reconnect your wallet and try again.",
				descriptionLines: [],
			});
		}
	});

	it("tells a sandbox purchase apart: nothing was charged, nothing arrives and nothing stays on screen", () => {
		for (const kind of ["confirmed", "submitted", "unknown", "failed"] as const) {
			for (const walletKind of ["embedded", "external"] as const) {
				const notice = createNotice(kind, { network: "testnet", walletKind });
				const feedback = getPrivyFiatFundingFeedback(notice, translate);
				expect(feedback.descriptionLines).toEqual([SANDBOX_NOTE]);
				expect(feedback.title).toBe(getPrivyFiatFundingFeedback(createNotice(kind), translate).title);
				expect(isPersistentPrivyFiatFundingNotice(notice)).toBe(false);
			}
		}
		for (const kind of KINDS) {
			const lines = getPrivyFiatFundingFeedback(createNotice(kind), translate).descriptionLines;
			expect(lines).not.toContain(SANDBOX_NOTE);
		}
	});
});
