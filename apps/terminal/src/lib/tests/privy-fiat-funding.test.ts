import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MessageDescriptor } from "@lingui/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePrivyFiatFundingFeatureFlags } from "@/config/privy-fiat-funding-flags";
import {
	classifyPrivyFiatFundingError,
	classifyPrivyFiatFundingResult,
	createPrivyFiatFundingRequest,
	PRIVY_FIAT_FUNDING_ASSET,
	PRIVY_FIAT_FUNDING_BACK_NAVIGATION_ERROR,
	PRIVY_FIAT_FUNDING_BUSY_MESSAGE,
	PRIVY_FIAT_FUNDING_CHAIN,
	PRIVY_FIAT_FUNDING_FAILURE_MESSAGES,
	PRIVY_FIAT_FUNDING_PAYMENT_METHOD_ERROR,
	PRIVY_FIAT_FUNDING_UNCONFIRMED_MESSAGES,
	PRIVY_FIAT_FUNDING_USER_EXIT_MESSAGE,
	resolvePrivyFiatFundingDestination,
} from "@/domain/trade/privy-fiat-funding";
import { getPrivyFiatFundingOwnerKey } from "@/domain/trade/privy-fiat-funding-owner-key";
import { getPrivyFiatFundingFeedback } from "@/lib/trade/privy-fiat-funding-feedback";
import {
	finishPrivyFiatFunding,
	isCurrentPrivyFiatFundingAttempt,
	type PrivyFiatFundingAttempt,
	requestPrivyFiatFunding,
	resetPrivyFiatFundingStore,
} from "@/stores/use-privy-fiat-funding-store";

const OWNER = "0xabcdefabcdefabcdefabcdefabcdefabcdef1234";
const OWNER_CHECKSUM_CASE = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdef1234";
const OTHER = "0x2222222222222222222222222222222222222222";
const PRIVY_DIST = resolve(__dirname, "../../../node_modules/@privy-io/react-auth/dist/esm");

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
	it("treats only a confirmed status as confirmed and anything else that resolved as submitted", () => {
		expect(classifyPrivyFiatFundingResult({ status: "confirmed" })).toBe("confirmed");
		expect(classifyPrivyFiatFundingResult({ status: "submitted" })).toBe("submitted");
		expect(classifyPrivyFiatFundingResult({ status: "unexpected" })).toBe("submitted");
		expect(classifyPrivyFiatFundingResult(undefined)).toBe("submitted");
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

	it("treats a declined payment method as a definite failure and a refund notice as an unknown status", () => {
		const declined = new Error("The card was declined. Try another Visa or Mastercard.");
		declined.name = PRIVY_FIAT_FUNDING_PAYMENT_METHOD_ERROR;
		expect(classifyPrivyFiatFundingError(declined)).toBe("failed");
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
		expect(bundles).toContain(`this.name="${PRIVY_FIAT_FUNDING_PAYMENT_METHOD_ERROR}"`);
	});

	it("relies on how the installed Privy SDK ends a flow that the user closes", () => {
		const screen = readdirSync(PRIVY_DIST)
			.filter((name) => name.startsWith("FiatOnrampScreen-") && name.endsWith(".mjs"))
			.map((name) => readFileSync(resolve(PRIVY_DIST, name), "utf8"))
			.join("\n");
		expect(screen).toMatch(
			/\?\{type:"failure",error:\w+\}:"provider-success"===\w+\.status\?\{type:"success",value:\{status:"confirmed"\}\}/,
		);
		expect(screen).toMatch(/"provider-confirming"===\w+\.status\|\|/);
		expect(screen).toMatch(
			/\?\{type:"success",value:\{status:"submitted"\}\}:\{type:"failure",error:Error\("User exited flow"\)\}/,
		);
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
});

describe("card funding feedback", () => {
	const translate = (descriptor: MessageDescriptor) => descriptor.message ?? descriptor.id;

	it("never claims arrival and adds the gas note as its own line only for external wallets", () => {
		const embedded = getPrivyFiatFundingFeedback("confirmed", "embedded", translate);
		const external = getPrivyFiatFundingFeedback("confirmed", "external", translate);
		expect(embedded).toMatchObject({ tone: "success", persistent: false });
		expect(embedded?.descriptionLines).toEqual([
			"USDC is on its way to your wallet on Arbitrum. Open Deposit once it arrives.",
		]);
		expect(external?.descriptionLines).toEqual([
			"USDC is on its way to your wallet on Arbitrum. Open Deposit once it arrives.",
			"Depositing it needs a little ETH on Arbitrum for network fees.",
		]);
	});

	it("keeps results that may follow a charge on screen as an unknown status, never as an error", () => {
		for (const outcome of ["submitted", "unknown"] as const) {
			expect(getPrivyFiatFundingFeedback(outcome, "embedded", translate)).toMatchObject({
				tone: "uncertain",
				persistent: true,
			});
		}
		expect(getPrivyFiatFundingFeedback("unknown", "embedded", translate)?.title).toBe("Card purchase status unknown");
	});

	it("reports a definite failure as an error, a busy flow as a warning and stays silent on cancel", () => {
		expect(getPrivyFiatFundingFeedback("busy", "embedded", translate)?.tone).toBe("warning");
		expect(getPrivyFiatFundingFeedback("failed", "external", translate)).toEqual({
			tone: "error",
			title: "Card purchase did not complete",
			descriptionLines: ["If you were charged, check the payment provider's email before trying again."],
			persistent: false,
		});
		expect(getPrivyFiatFundingFeedback("cancelled", "external", translate)).toBeNull();
	});
});
