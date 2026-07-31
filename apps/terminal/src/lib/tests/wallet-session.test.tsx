// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDisconnectWallet, useReconnectWallet, useWalletSession } from "@/hooks/wallet/use-wallet-session";

const USER_ADDRESS = "0x1111111111111111111111111111111111111111";
const AGENT_STORAGE_KEY = `hyperliquid_agent_Mainnet_${USER_ADDRESS}`;
const AGENT_STORAGE_VALUE = JSON.stringify({
	privateKey: `0x${"ab".repeat(32)}`,
	publicKey: "0x2222222222222222222222222222222222222222",
});

const testState = vi.hoisted(() => ({
	disconnect: vi.fn(),
	logout: vi.fn(),
	login: vi.fn(),
	connectWallet: vi.fn(),
	setActiveWallet: vi.fn(),
	wallets: [] as Array<{ address: string }>,
	walletsReady: true,
	selectedWallet: undefined as { address: string } | undefined,
	embeddedWalletAddress: undefined as string | undefined,
	shouldUseEmbeddedWallet: false,
	walletAddress: undefined as string | undefined,
	walletConnected: false,
	walletConnecting: false,
	authenticated: true,
	ready: true,
	userWalletAddress: undefined as string | undefined,
	sessionMode: "wallet" as "wallet" | "agent-only" | "disconnected",
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@privy-io/react-auth", () => ({
	usePrivy: () => ({
		authenticated: testState.authenticated,
		ready: testState.ready,
		login: testState.login,
		logout: testState.logout,
		user: { wallet: { address: testState.userWalletAddress } },
	}),
	useConnectWallet: () => ({ connectWallet: testState.connectWallet }),
	useWallets: () => ({ ready: testState.walletsReady, wallets: testState.wallets }),
}));

vi.mock("@privy-io/wagmi", () => ({
	useSetActiveWallet: () => ({ setActiveWallet: testState.setActiveWallet }),
}));

vi.mock("wagmi", () => ({
	useConnection: () => ({
		address: testState.walletAddress,
		isConnected: testState.walletConnected,
		isConnecting: testState.walletConnecting,
	}),
	useDisconnect: () => ({
		isPending: false,
		mutateAsync: testState.disconnect,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	clearActiveAgentOwner: () => {
		window.localStorage.removeItem("hyperliquid_active_agent_owner");
	},
	useHyperliquid: () => ({
		clientKey: USER_ADDRESS,
		sessionMode: testState.sessionMode,
	}),
	useHyperliquidOptional: () => ({
		clientKey: USER_ADDRESS,
		sessionMode: testState.sessionMode,
	}),
}));

vi.mock("@/lib/wallet/privy-wagmi", () => ({
	getPrivyEmbeddedWalletAddress: () => testState.embeddedWalletAddress,
	hasSameWalletAddress: (a: string | undefined, b: string | undefined) =>
		!!a && !!b && a.toLowerCase() === b.toLowerCase(),
	selectPrivyWagmiWallet: () => testState.selectedWallet,
	shouldUsePrivyEmbeddedWallet: () => testState.shouldUseEmbeddedWallet,
}));

function DisconnectButton() {
	const { disconnectWallet } = useDisconnectWallet();

	return createElement("button", { onClick: () => void disconnectWallet(), type: "button" }, "Disconnect");
}

function SessionProbe() {
	const { displayAddress, hasWalletAccess, isConnected } = useWalletSession();

	return createElement("output", {
		"data-display-address": displayAddress ?? "",
		"data-has-wallet-access": String(hasWalletAccess),
		"data-is-connected": String(isConnected),
	});
}

function ReconnectButton() {
	const { reconnectWallet } = useReconnectWallet();

	return createElement("button", { onClick: () => void reconnectWallet(), type: "button" }, "Reconnect");
}

async function flushAsyncWork() {
	await act(async () => {
		await new Promise((resolve) => window.setTimeout(resolve, 0));
	});
}

describe("useDisconnectWallet", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		window.localStorage.clear();
		window.localStorage.setItem(AGENT_STORAGE_KEY, AGENT_STORAGE_VALUE);
		window.localStorage.setItem(
			"hyperliquid_active_agent_owner",
			JSON.stringify({ env: "Mainnet", address: USER_ADDRESS }),
		);
		testState.walletAddress = USER_ADDRESS;
		testState.walletConnected = true;
		testState.walletConnecting = false;
		testState.authenticated = true;
		testState.ready = true;
		testState.userWalletAddress = USER_ADDRESS;
		testState.embeddedWalletAddress = undefined;
		testState.shouldUseEmbeddedWallet = false;
		testState.sessionMode = "wallet";
		testState.wallets = [];
		testState.walletsReady = true;
		testState.selectedWallet = undefined;
		testState.disconnect.mockReset();
		testState.disconnect.mockResolvedValue(undefined);
		testState.logout.mockReset();
		testState.logout.mockResolvedValue(undefined);
		testState.login.mockReset();
		testState.connectWallet.mockReset();
		testState.setActiveWallet.mockReset();
		testState.setActiveWallet.mockResolvedValue(undefined);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		window.localStorage.clear();
		vi.clearAllMocks();
	});

	it("logs out through Privy without creating a disconnected wagmi shim", async () => {
		act(() => {
			root.render(createElement(DisconnectButton));
		});

		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.disconnect).not.toHaveBeenCalled();
		expect(testState.logout).toHaveBeenCalledTimes(1);
		expect(window.localStorage.getItem("hyperliquid_active_agent_owner")).toBeNull();
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBe(AGENT_STORAGE_VALUE);
	});

	it("does not expose a linked wallet as connected when wagmi has no signer", () => {
		testState.walletAddress = undefined;
		testState.walletConnected = false;

		act(() => {
			root.render(createElement(SessionProbe));
		});

		const probe = container.querySelector("output");
		expect(probe?.getAttribute("data-display-address")).toBe("");
		expect(probe?.getAttribute("data-has-wallet-access")).toBe("false");
		expect(probe?.getAttribute("data-is-connected")).toBe("false");
	});

	it("does not expose an email wallet until wagmi activates its exact signer", () => {
		testState.embeddedWalletAddress = USER_ADDRESS;
		testState.shouldUseEmbeddedWallet = true;
		testState.walletAddress = "0x3333333333333333333333333333333333333333";

		act(() => {
			root.render(createElement(SessionProbe));
		});

		const probe = container.querySelector("output");
		expect(probe?.getAttribute("data-display-address")).toBe("");
		expect(probe?.getAttribute("data-has-wallet-access")).toBe("false");
		expect(probe?.getAttribute("data-is-connected")).toBe("false");
	});

	it("does not fall back to a connected external wallet when an email embedded signer is unavailable", () => {
		testState.embeddedWalletAddress = undefined;
		testState.shouldUseEmbeddedWallet = true;
		testState.walletAddress = "0x3333333333333333333333333333333333333333";

		act(() => {
			root.render(createElement(SessionProbe));
		});

		const probe = container.querySelector("output");
		expect(probe?.getAttribute("data-display-address")).toBe("");
		expect(probe?.getAttribute("data-has-wallet-access")).toBe("false");
		expect(probe?.getAttribute("data-is-connected")).toBe("false");
	});

	it("exposes the email wallet after wagmi activates the matching signer", () => {
		testState.embeddedWalletAddress = USER_ADDRESS;
		testState.shouldUseEmbeddedWallet = true;

		act(() => {
			root.render(createElement(SessionProbe));
		});

		const probe = container.querySelector("output");
		expect(probe?.getAttribute("data-display-address")).toBe(USER_ADDRESS);
		expect(probe?.getAttribute("data-has-wallet-access")).toBe("true");
		expect(probe?.getAttribute("data-is-connected")).toBe("true");
	});

	it("restores an existing Privy wallet as the active wagmi wallet", async () => {
		const connectedWallet = { address: USER_ADDRESS };
		testState.wallets = [connectedWallet];
		testState.selectedWallet = connectedWallet;

		act(() => {
			root.render(createElement(ReconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.setActiveWallet).toHaveBeenCalledWith(connectedWallet);
		expect(testState.connectWallet).not.toHaveBeenCalled();
	});

	it("opens Privy's EVM wallet connector when no connected wallet can be restored", async () => {
		act(() => {
			root.render(createElement(ReconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.setActiveWallet).not.toHaveBeenCalled();
		expect(testState.connectWallet).toHaveBeenCalledWith({
			walletChainType: "ethereum-only",
			suggestedAddress: USER_ADDRESS,
		});
	});

	it("does not open an external connector for an email session with no exact embedded wallet", async () => {
		testState.shouldUseEmbeddedWallet = true;

		act(() => {
			root.render(createElement(ReconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.setActiveWallet).not.toHaveBeenCalled();
		expect(testState.connectWallet).not.toHaveBeenCalled();
	});
});
