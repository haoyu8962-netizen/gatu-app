import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MessageDescriptor } from "@lingui/core";
import { describe, expect, it } from "vitest";
import {
	classifyPrivyFiatFundingError,
	classifyPrivyFiatFundingResult,
	createPrivyFiatFundingRequest,
	getPrivyFiatFundingOwnerKey,
	PRIVY_FIAT_FUNDING_ASSET,
	PRIVY_FIAT_FUNDING_BACK_NAVIGATION_ERROR,
	PRIVY_FIAT_FUNDING_BUSY_MESSAGE,
	PRIVY_FIAT_FUNDING_CHAIN,
	PRIVY_FIAT_FUNDING_USER_EXIT_MESSAGE,
	resolvePrivyFiatFundingDestination,
} from "@/domain/trade/privy-fiat-funding";
import { getPrivyFiatFundingFeedback } from "@/lib/trade/privy-fiat-funding-feedback";

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
	it("asks for Arbitrum USDC at the exact owner in production on Mainnet", () => {
		expect(PRIVY_FIAT_FUNDING_CHAIN).toBe("eip155:42161");
		expect(PRIVY_FIAT_FUNDING_ASSET).toBe("0xaf88d065e77c8cC2239327C5EDb3A432268e5831");
		expect(createPrivyFiatFundingRequest({ address: OWNER, walletKind: "external" }, "mainnet")).toEqual({
			source: {},
			destination: { address: OWNER, chain: "eip155:42161", asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
			environment: "production",
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

	it("separates a user exit, a flow already in progress and other failures", () => {
		const back = new Error("Back navigation");
		back.name = PRIVY_FIAT_FUNDING_BACK_NAVIGATION_ERROR;
		expect(classifyPrivyFiatFundingError(back)).toBe("cancelled");
		expect(classifyPrivyFiatFundingError(new Error(PRIVY_FIAT_FUNDING_USER_EXIT_MESSAGE))).toBe("cancelled");
		expect(classifyPrivyFiatFundingError(new Error(PRIVY_FIAT_FUNDING_BUSY_MESSAGE))).toBe("busy");
		expect(classifyPrivyFiatFundingError(new Error("Card declined"))).toBe("failed");
		expect(classifyPrivyFiatFundingError("Card declined")).toBe("failed");
	});

	it("relies on the error texts the installed Privy SDK actually throws", () => {
		const bundles = readdirSync(PRIVY_DIST)
			.filter((name) => name.endsWith(".mjs"))
			.map((name) => readFileSync(resolve(PRIVY_DIST, name), "utf8"))
			.join("\n");
		expect(bundles).toContain(`Error("${PRIVY_FIAT_FUNDING_USER_EXIT_MESSAGE}")`);
		expect(bundles).toContain(`this.name="${PRIVY_FIAT_FUNDING_BACK_NAVIGATION_ERROR}"`);
		expect(bundles).toContain(`Error("${PRIVY_FIAT_FUNDING_BUSY_MESSAGE}")`);
	});
});

describe("card funding feedback", () => {
	const translate = (descriptor: MessageDescriptor) => descriptor.message ?? descriptor.id;

	it("never claims arrival and adds the gas note only for external wallets", () => {
		const embedded = getPrivyFiatFundingFeedback("confirmed", "embedded", translate);
		const external = getPrivyFiatFundingFeedback("confirmed", "external", translate);
		expect(embedded?.tone).toBe("success");
		expect(embedded?.description).toContain("on its way");
		expect(embedded?.description).not.toContain("ETH");
		expect(external?.description).toContain("ETH on Arbitrum");
	});

	it("reports a submitted purchase as uncertain, a failure as an error and stays silent on cancel", () => {
		expect(getPrivyFiatFundingFeedback("submitted", "embedded", translate)?.tone).toBe("uncertain");
		expect(getPrivyFiatFundingFeedback("busy", "embedded", translate)?.tone).toBe("warning");
		expect(getPrivyFiatFundingFeedback("failed", "external", translate)).toEqual({
			tone: "error",
			title: "Card purchase did not complete",
			description: "If you were charged, check the payment provider's email before trying again.",
		});
		expect(getPrivyFiatFundingFeedback("cancelled", "external", translate)).toBeNull();
	});
});
