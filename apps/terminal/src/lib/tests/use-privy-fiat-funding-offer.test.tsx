// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0xabcdefabcdefabcdefabcdefabcdefabcdef1234";
const OTHER = "0x2222222222222222222222222222222222222222";

const launchPrivyFiatFunding = vi.hoisted(() => vi.fn());
const testState = vi.hoisted(() => ({
	clientKey: "",
	sessionMode: "wallet" as "agent-only" | "disconnected" | "wallet",
	isTestnet: false,
	wallets: [] as { address: string }[],
	walletSession: {
		walletAddress: undefined as string | undefined,
		walletIntent: "embedded" as "ambiguous" | "embedded" | "external" | "unavailable",
		embeddedWalletAddress: undefined as string | undefined,
	},
}));

vi.mock("@privy-io/react-auth", () => ({ useWallets: () => ({ ready: true, wallets: testState.wallets }) }));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({ useWalletSession: () => testState.walletSession }));
vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ clientKey: testState.clientKey, sessionMode: testState.sessionMode }),
}));
vi.mock("@/lib/trade/privy-fiat-funding-launch", () => ({ launchPrivyFiatFunding }));
vi.mock("@/stores/use-global-settings-store", () => ({ useIsTestnet: () => testState.isTestnet }));

import { resolveCctpDepositFeatureFlags } from "@/config/cctp-deposit-flags";
import { getDepositAvailability } from "@/domain/trade/deposit-availability";
import { getPrivyFiatFundingOwnerKey } from "@/domain/trade/privy-fiat-funding-owner-key";
import { type PrivyFiatFundingOffer, usePrivyFiatFundingOffer } from "@/hooks/trade/use-privy-fiat-funding-offer";
import {
	isCurrentPrivyFiatFundingAttempt,
	type PrivyFiatFundingAttempt,
	requestPrivyFiatFunding,
	resetPrivyFiatFundingStore,
} from "@/stores/use-privy-fiat-funding-store";

describe("usePrivyFiatFundingOffer", () => {
	let container: HTMLDivElement;
	let root: Root;
	let offer: PrivyFiatFundingOffer | null;
	const onBeforeStart = vi.fn();

	function Probe(props: { enabled: boolean; available: boolean }) {
		offer = usePrivyFiatFundingOffer({ ...props, onBeforeStart });
		return null;
	}

	function render(props: { enabled?: boolean; available?: boolean } = {}) {
		act(() =>
			root.render(createElement(Probe, { enabled: props.enabled ?? true, available: props.available ?? true })),
		);
	}

	beforeEach(() => {
		testState.clientKey = OWNER.toLowerCase();
		testState.sessionMode = "wallet";
		testState.isTestnet = false;
		testState.wallets = [{ address: OWNER }];
		testState.walletSession = { walletAddress: OWNER, walletIntent: "embedded", embeddedWalletAddress: OWNER };
		resetPrivyFiatFundingStore();
		offer = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("closes the caller first, then launches funding for the exact embedded owner", () => {
		render();
		expect(offer).toMatchObject({ walletKind: "embedded", disabled: false });

		act(() => offer?.start());

		expect(onBeforeStart).toHaveBeenCalledTimes(1);
		expect(launchPrivyFiatFunding).toHaveBeenCalledExactlyOnceWith({
			destination: { address: OWNER, walletKind: "embedded" },
			network: "mainnet",
			ownerKey: getPrivyFiatFundingOwnerKey("mainnet", OWNER),
		});
		expect(onBeforeStart.mock.invocationCallOrder[0]).toBeLessThan(launchPrivyFiatFunding.mock.invocationCallOrder[0]);
	});

	it("offers an external owner and keys a testnet attempt by network", () => {
		testState.walletSession = { walletAddress: OWNER, walletIntent: "external", embeddedWalletAddress: undefined };
		testState.isTestnet = true;
		render();
		expect(offer?.walletKind).toBe("external");

		act(() => offer?.start());

		expect(launchPrivyFiatFunding).toHaveBeenCalledExactlyOnceWith({
			destination: { address: OWNER, walletKind: "external" },
			network: "testnet",
			ownerKey: getPrivyFiatFundingOwnerKey("testnet", OWNER),
		});
	});

	it.each([
		[
			"the build flag is off",
			() => {
				testState.clientKey = OWNER.toLowerCase();
			},
			{ enabled: false },
		],
		[
			"the owner is not the selected Hyperliquid user",
			() => {
				testState.clientKey = OTHER;
			},
			{},
		],
		[
			"the session is agent-only",
			() => {
				testState.sessionMode = "agent-only";
			},
			{},
		],
		[
			"Privy does not list the owner wallet",
			() => {
				testState.wallets = [{ address: OTHER }];
			},
			{},
		],
		[
			"the embedded wallet is not the owner",
			() => {
				testState.walletSession = { ...testState.walletSession, embeddedWalletAddress: OTHER };
			},
			{},
		],
	])("offers nothing when %s", (_label, arrange, props) => {
		arrange();
		render(props);

		expect(offer).toBeNull();
	});

	it("stays disabled and requests nothing while funding actions are unavailable", () => {
		render({ available: false });
		expect(offer?.disabled).toBe(true);

		act(() => offer?.start());

		expect(onBeforeStart).not.toHaveBeenCalled();
		expect(launchPrivyFiatFunding).not.toHaveBeenCalled();
	});

	it("stays disabled while another card purchase is open", () => {
		const open: PrivyFiatFundingAttempt = {
			destination: { address: OWNER, walletKind: "embedded" },
			network: "mainnet",
			ownerKey: getPrivyFiatFundingOwnerKey("mainnet", OWNER),
		};
		act(() => {
			requestPrivyFiatFunding(open);
		});
		render();
		expect(offer?.disabled).toBe(true);

		act(() => offer?.start());

		expect(onBeforeStart).not.toHaveBeenCalled();
		expect(launchPrivyFiatFunding).not.toHaveBeenCalled();
		expect(isCurrentPrivyFiatFundingAttempt(open)).toBe(true);
	});
	it.each([
		["testnet", "embedded", {}, false],
		["testnet", "embedded", { VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED: "true" }, true],
		["testnet", "external", {}, false],
		["testnet", "external", { VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED: "true" }, true],
		["mainnet", "embedded", {}, false],
		["mainnet", "embedded", { VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED: "true" }, true],
		["mainnet", "external", {}, true],
	] as const)(
		"can only start a %s purchase for an %s wallet when that wallet's own deposit path is released: %j",
		(network, walletKind, depositEnv, canStart) => {
			testState.isTestnet = network === "testnet";
			testState.walletSession = {
				walletAddress: OWNER,
				walletIntent: walletKind,
				embeddedWalletAddress: walletKind === "embedded" ? OWNER : undefined,
			};
			const availability = getDepositAvailability({
				featureFlags: resolveCctpDepositFeatureFlags(depositEnv),
				geoStatus: "allowed",
				hasWalletAccess: true,
				isEmbeddedWallet: walletKind === "embedded",
				network,
				sessionMode: "wallet",
			});
			render({ available: availability.available });

			expect(offer?.walletKind).toBe(walletKind);
			expect(offer?.disabled).toBe(!canStart);
			act(() => offer?.start());
			expect(launchPrivyFiatFunding).toHaveBeenCalledTimes(canStart ? 1 : 0);
		},
	);
});
