// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CctpDepositFeatureFlags } from "@/config/cctp-deposit";
import { getDepositAvailability } from "@/domain/trade/deposit-availability";
import { type DepositAvailabilityPresentation, useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { createI18nRoot } from "./harness/react";

const ENABLED_FEATURES: CctpDepositFeatureFlags = {
	mainnetSponsoredWallet: true,
	testnetExternalWallet: true,
	testnetSponsoredWallet: true,
};

const GEO_LOADING_MESSAGE = "Checking regional availability. Deposits are temporarily unavailable.";
const GEO_ERROR_MESSAGE = "Unable to verify regional availability. Deposits are temporarily unavailable.";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const hookState = vi.hoisted(() => ({
	authenticated: true,
	embedded: false,
	geoError: false,
	geoResolved: true,
	geoResolving: false,
	hasWalletAccess: true,
	isTestnet: false,
	ready: true,
	sessionMode: "wallet" as "wallet" | "agent-only" | "disconnected",
	tradeRestricted: false,
	walletIntentOverride: undefined as "ambiguous" | "embedded" | "external" | "unavailable" | undefined,
}));

vi.mock("@/config/cctp-deposit", () => ({
	CCTP_DEPOSIT_FEATURES: {
		mainnetSponsoredWallet: true,
		testnetExternalWallet: false,
		testnetSponsoredWallet: false,
	},
}));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({
		isError: hookState.geoError,
		isResolved: hookState.geoResolved,
		isResolving: hookState.geoResolving,
		tradeRestricted: hookState.tradeRestricted,
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		authenticated: hookState.authenticated,
		hasWalletAccess: hookState.hasWalletAccess,
		ready: hookState.ready,
		sessionMode: hookState.sessionMode,
		user: hookState.embedded ? { id: "email-user" } : { id: "wallet-user" },
		walletIntent: hookState.walletIntentOverride ?? (hookState.embedded ? "embedded" : "external"),
	}),
}));

vi.mock("@/lib/wallet/privy-wagmi", () => ({
	getPrivyEmailAddress: () => (hookState.embedded ? "user@example.com" : undefined),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useIsTestnet: () => hookState.isTestnet,
}));

describe("getDepositAvailability", () => {
	it("keeps Mainnet external available while honoring the Testnet release gate", () => {
		expect(
			getDepositAvailability({
				featureFlags: { ...ENABLED_FEATURES, testnetExternalWallet: false },
				geoStatus: "allowed",
				hasWalletAccess: true,
				isEmbeddedWallet: false,
				network: "testnet",
				sessionMode: "wallet",
			}),
		).toEqual({
			available: false,
			path: "external",
			reason: "external-deposit-disabled",
			releasePathEnabled: false,
			signerReady: true,
		});

		expect(
			getDepositAvailability({
				featureFlags: ENABLED_FEATURES,
				geoStatus: "allowed",
				hasWalletAccess: true,
				isEmbeddedWallet: false,
				network: "mainnet",
				sessionMode: "wallet",
			}),
		).toMatchObject({ available: true, path: "external", releasePathEnabled: true });

		expect(
			getDepositAvailability({
				featureFlags: ENABLED_FEATURES,
				geoStatus: "allowed",
				hasWalletAccess: true,
				isEmbeddedWallet: false,
				network: "testnet",
				sessionMode: "wallet",
			}),
		).toMatchObject({ available: true, path: "external", releasePathEnabled: true });
	});

	it("allows an enabled email-wallet path before its embedded signer is active", () => {
		expect(
			getDepositAvailability({
				featureFlags: ENABLED_FEATURES,
				geoStatus: "allowed",
				hasWalletAccess: false,
				isEmbeddedWallet: true,
				network: "mainnet",
				sessionMode: "disconnected",
			}),
		).toEqual({
			available: true,
			path: "sponsored",
			reason: null,
			releasePathEnabled: true,
			signerReady: false,
		});
	});

	it.each([false, true])(
		"reports agent-only sessions as a desktop-required restriction (embedded=%s)",
		(isEmbeddedWallet) => {
			expect(
				getDepositAvailability({
					featureFlags: ENABLED_FEATURES,
					geoStatus: "allowed",
					hasWalletAccess: false,
					isEmbeddedWallet,
					network: "mainnet",
					sessionMode: "agent-only",
				}),
			).toMatchObject({ available: false, reason: "agent-only-session", signerReady: false });
		},
	);

	it("keeps geo verdicts ahead of the agent-only restriction", () => {
		expect(
			getDepositAvailability({
				featureFlags: ENABLED_FEATURES,
				geoStatus: "unresolved",
				hasWalletAccess: false,
				isEmbeddedWallet: false,
				network: "mainnet",
				sessionMode: "agent-only",
			}),
		).toMatchObject({ available: false, reason: "geo-unresolved" });
	});

	it("keeps a disconnected external session behind the owner-wallet gate", () => {
		expect(
			getDepositAvailability({
				featureFlags: ENABLED_FEATURES,
				geoStatus: "allowed",
				hasWalletAccess: false,
				isEmbeddedWallet: false,
				network: "mainnet",
				sessionMode: "disconnected",
			}),
		).toMatchObject({ available: false, reason: "wallet-session-required", signerReady: false });
	});

	it.each([
		["restricted", "geo-restricted"],
		["unresolved", "geo-unresolved"],
	] as const)("fails closed when geo is %s", (geoStatus, reason) => {
		expect(
			getDepositAvailability({
				featureFlags: ENABLED_FEATURES,
				geoStatus,
				hasWalletAccess: true,
				isEmbeddedWallet: false,
				network: "mainnet",
				sessionMode: "wallet",
			}),
		).toMatchObject({ available: false, reason });
	});
});

describe("useDepositAvailability", () => {
	let container: HTMLDivElement;
	let observed: DepositAvailabilityPresentation | null;
	let root: Root;

	beforeEach(() => {
		hookState.authenticated = true;
		hookState.embedded = false;
		hookState.geoError = false;
		hookState.geoResolved = true;
		hookState.geoResolving = false;
		hookState.hasWalletAccess = true;
		hookState.isTestnet = false;
		hookState.ready = true;
		hookState.sessionMode = "wallet";
		hookState.tradeRestricted = false;
		hookState.walletIntentOverride = undefined;
		i18n.loadAndActivate({
			locale: "en",
			messages: {
				[getMessageId("Deposit unavailable")]: "Deposit unavailable",
				[getMessageId(GEO_ERROR_MESSAGE)]: GEO_ERROR_MESSAGE,
				[getMessageId(GEO_LOADING_MESSAGE)]: GEO_LOADING_MESSAGE,
			},
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		observed = null;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function Probe() {
		observed = useDepositAvailability();
		return null;
	}

	function renderHook(): DepositAvailabilityPresentation {
		act(() => root.render(<Probe />));
		if (!observed) throw new Error("Deposit availability was not observed");
		return observed;
	}

	it("reports geo loading as unresolved even when the geo hook fails closed", () => {
		hookState.geoResolved = false;
		hookState.geoResolving = true;
		hookState.tradeRestricted = true;

		expect(renderHook()).toMatchObject({
			available: false,
			geoResolutionStatus: "loading",
			reason: "geo-unresolved",
			unavailableReason: GEO_LOADING_MESSAGE,
		});
	});

	it("uses the same unresolved reason for a geo request error", () => {
		hookState.geoError = true;
		hookState.geoResolved = false;
		hookState.tradeRestricted = true;

		const availability = renderHook();
		expect(availability.reason).toBe("geo-unresolved");
		expect(availability.geoResolutionStatus).toBe("error");
		expect(availability.unavailableReason).toBe(GEO_ERROR_MESSAGE);
	});

	it("keeps sponsored email onboarding available before signer activation", () => {
		hookState.embedded = true;
		hookState.hasWalletAccess = false;
		hookState.sessionMode = "disconnected";

		expect(renderHook()).toMatchObject({
			available: true,
			geoResolutionStatus: "resolved",
			path: "sponsored",
			releasePathEnabled: true,
			signerReady: false,
		});
	});

	it.each([
		[false, true],
		[true, false],
	] as const)("does not expose a sponsored path while ready=%s and authenticated=%s", (ready, authenticated) => {
		hookState.authenticated = authenticated;
		hookState.embedded = true;
		hookState.hasWalletAccess = false;
		hookState.ready = ready;
		hookState.sessionMode = "disconnected";

		expect(renderHook()).toMatchObject({
			available: false,
			path: "external",
			reason: "wallet-session-required",
		});
	});

	it("explains an agent-only session with the desktop-required reason", () => {
		hookState.hasWalletAccess = false;
		hookState.sessionMode = "agent-only";

		expect(renderHook()).toMatchObject({
			available: false,
			reason: "agent-only-session",
			signerReady: false,
			unavailableReason:
				"This phone uses a desktop-approved trading key. Deposits, withdrawals and transfers need the master wallet on desktop.",
		});
	});

	it("prevents an ambiguous Privy wallet identity from enabling an external deposit", () => {
		hookState.hasWalletAccess = true;
		hookState.walletIntentOverride = "ambiguous";

		expect(renderHook()).toMatchObject({
			available: false,
			reason: "wallet-session-required",
			signerReady: false,
		});
	});
});
