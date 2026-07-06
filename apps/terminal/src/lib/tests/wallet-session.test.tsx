// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDisconnectWallet } from "@/hooks/wallet/use-wallet-session";

const USER_ADDRESS = "0x1111111111111111111111111111111111111111";
const AGENT_STORAGE_KEY = `hyperliquid_agent_Mainnet_${USER_ADDRESS}`;
const AGENT_STORAGE_VALUE = JSON.stringify({
	privateKey: `0x${"ab".repeat(32)}`,
	publicKey: "0x2222222222222222222222222222222222222222",
});

const testState = vi.hoisted(() => ({
	disconnect: vi.fn(),
	logout: vi.fn(),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@privy-io/react-auth", () => ({
	usePrivy: () => ({
		authenticated: true,
		ready: true,
		logout: testState.logout,
		user: { wallet: { address: USER_ADDRESS } },
	}),
}));

vi.mock("wagmi", () => ({
	useConnection: () => ({
		address: USER_ADDRESS,
		isConnected: true,
		isConnecting: false,
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
		sessionMode: "wallet",
	}),
	useHyperliquidOptional: () => ({
		clientKey: USER_ADDRESS,
		sessionMode: "wallet",
	}),
}));

vi.mock("@/lib/wallet/privy-wagmi", () => ({
	getPrivyEmbeddedWalletAddress: () => undefined,
	shouldUsePrivyEmbeddedWallet: () => false,
}));

function DisconnectButton() {
	const { disconnectWallet } = useDisconnectWallet();

	return createElement("button", { onClick: () => void disconnectWallet(), type: "button" }, "Disconnect");
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
		testState.disconnect.mockReset();
		testState.disconnect.mockResolvedValue(undefined);
		testState.logout.mockReset();
		testState.logout.mockResolvedValue(undefined);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		window.localStorage.clear();
		vi.clearAllMocks();
	});

	it("keeps the local trading agent when disconnecting the wallet", async () => {
		act(() => {
			root.render(createElement(DisconnectButton));
		});

		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.disconnect).toHaveBeenCalledTimes(1);
		expect(testState.logout).toHaveBeenCalledTimes(1);
		expect(window.localStorage.getItem("hyperliquid_active_agent_owner")).toBeNull();
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBe(AGENT_STORAGE_VALUE);
	});
});
