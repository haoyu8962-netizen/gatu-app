// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearVerifiedExternalWalletOwner,
	useDisconnectWallet,
	useReconnectWallet,
	useWalletSession,
} from "@/hooks/wallet/use-wallet-session";
import { getPrivyLoginIntentStorageKey, recordPrivyLoginMethod } from "@/lib/wallet/privy-login-method";

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
	hasEmbeddedWallet: true,
	needsEmbeddedWallet: false,
	ensureEmailEmbeddedWallet: vi.fn(),
	privyModalOpen: undefined as boolean | undefined,
	shouldUseEmbeddedWallet: false,
	walletIntentOverride: undefined as "ambiguous" | "embedded" | "external" | "unavailable" | undefined,
	emailAddress: undefined as string | undefined,
	walletAddress: undefined as string | undefined,
	walletConnected: false,
	walletConnecting: false,
	walletReconnecting: false,
	authenticated: true,
	ready: true,
	userId: "did:privy:test-user",
	userWalletAddress: undefined as string | undefined,
	sessionMode: "wallet" as "wallet" | "agent-only" | "disconnected",
	env: "Mainnet" as "Mainnet" | "Testnet",
	clientKey: "0x1111111111111111111111111111111111111111",
	closeRegistration: vi.fn(),
	removeAgent: vi.fn(),
	toastError: vi.fn(),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@privy-io/react-auth", () => ({
	usePrivy: () => ({
		authenticated: testState.authenticated,
		isModalOpen: testState.privyModalOpen,
		ready: testState.ready,
		login: testState.login,
		logout: testState.logout,
		user: { id: testState.userId, wallet: { address: testState.userWalletAddress } },
	}),
	useConnectWallet: () => ({ connectWallet: testState.connectWallet }),
	useWallets: () => ({ ready: testState.walletsReady, wallets: testState.wallets }),
}));

vi.mock("@/hooks/wallet/use-email-embedded-wallet", () => ({
	useEmailEmbeddedWallet: () => ({
		needsEmbeddedWallet: testState.needsEmbeddedWallet,
		ensureEmailEmbeddedWallet: testState.ensureEmailEmbeddedWallet,
	}),
}));

vi.mock("@privy-io/wagmi", () => ({
	useSetActiveWallet: () => ({ setActiveWallet: testState.setActiveWallet }),
}));

vi.mock("wagmi", () => ({
	useConnection: () => ({
		address: testState.walletAddress,
		isConnected: testState.walletConnected,
		isConnecting: testState.walletConnecting,
		isReconnecting: testState.walletReconnecting,
	}),
	useDisconnect: () => ({
		isPending: false,
		mutateAsync: testState.disconnect,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	closeAgentRegistrationSessionAndRemove: testState.closeRegistration,
	getActiveAgentOwner: () => {
		const raw = window.localStorage.getItem("hyperliquid_active_agent_owner");
		return raw ? (JSON.parse(raw) as { env: string; address: string }) : null;
	},
	useHyperliquid: () => ({
		clientKey: testState.clientKey,
		env: testState.env,
		sessionMode: testState.sessionMode,
	}),
	useHyperliquidOptional: () => ({
		clientKey: testState.clientKey,
		env: testState.env,
		sessionMode: testState.sessionMode,
	}),
}));

vi.mock("sonner", () => ({
	toast: {
		error: testState.toastError,
	},
}));

vi.mock("@/lib/wallet/privy-wagmi", () => ({
	getPrivyEmailAddress: () => testState.emailAddress,
	getPrivyEmbeddedWalletAddress: () => testState.embeddedWalletAddress,
	hasPrivyEmbeddedWallet: () => testState.hasEmbeddedWallet,
	hasSameWalletAddress: (a: string | undefined, b: string | undefined) =>
		!!a && !!b && a.toLowerCase() === b.toLowerCase(),
	selectPrivyWagmiWallet: () => testState.selectedWallet,
	resolvePrivyWalletIntent: (_user: unknown, loginIntent?: { method?: string }) =>
		testState.walletIntentOverride ??
		(loginIntent?.method === "email" || testState.shouldUseEmbeddedWallet ? "embedded" : "external"),
	shouldUsePrivyEmbeddedWallet: () => testState.shouldUseEmbeddedWallet,
}));

function DisconnectButton() {
	const { disconnectWallet } = useDisconnectWallet();

	return createElement("button", { onClick: () => void disconnectWallet(), type: "button" }, "Disconnect");
}

function SessionProbe() {
	const {
		authenticationModalOpen,
		authenticationReady,
		displayAddress,
		hasWalletAccess,
		isConnected,
		ready,
		walletDirectoryReady,
	} = useWalletSession();

	return createElement("output", {
		"data-authentication-modal-open": String(authenticationModalOpen),
		"data-authentication-ready": String(authenticationReady),
		"data-display-address": displayAddress ?? "",
		"data-has-wallet-access": String(hasWalletAccess),
		"data-is-connected": String(isConnected),
		"data-ready": String(ready),
		"data-wallet-directory-ready": String(walletDirectoryReady),
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
		window.sessionStorage.clear();
		window.localStorage.setItem(AGENT_STORAGE_KEY, AGENT_STORAGE_VALUE);
		window.localStorage.setItem(
			"hyperliquid_active_agent_owner",
			JSON.stringify({ env: "Mainnet", address: USER_ADDRESS }),
		);
		testState.walletAddress = USER_ADDRESS;
		testState.walletConnected = true;
		testState.walletConnecting = false;
		testState.walletReconnecting = false;
		testState.authenticated = true;
		testState.ready = true;
		testState.userId = "did:privy:test-user";
		testState.userWalletAddress = USER_ADDRESS;
		testState.embeddedWalletAddress = undefined;
		testState.hasEmbeddedWallet = true;
		testState.needsEmbeddedWallet = false;
		testState.ensureEmailEmbeddedWallet.mockReset();
		testState.ensureEmailEmbeddedWallet.mockResolvedValue(USER_ADDRESS);
		testState.privyModalOpen = undefined;
		testState.shouldUseEmbeddedWallet = false;
		testState.walletIntentOverride = undefined;
		testState.emailAddress = undefined;
		testState.sessionMode = "wallet";
		testState.env = "Mainnet";
		testState.clientKey = USER_ADDRESS;
		const exactPrivyWallet = { address: USER_ADDRESS };
		testState.wallets = [exactPrivyWallet];
		testState.walletsReady = true;
		testState.selectedWallet = exactPrivyWallet;
		testState.disconnect.mockReset();
		testState.disconnect.mockResolvedValue(undefined);
		testState.logout.mockReset();
		testState.logout.mockResolvedValue(undefined);
		testState.login.mockReset();
		testState.connectWallet.mockReset();
		testState.setActiveWallet.mockReset();
		testState.setActiveWallet.mockResolvedValue(undefined);
		testState.closeRegistration.mockReset();
		testState.closeRegistration.mockImplementation(async (env: string, ownerAddress: string) => {
			const removal = testState.removeAgent(env, ownerAddress);
			if (removal.status !== "removed") return removal;
			const rawOwner = window.localStorage.getItem("hyperliquid_active_agent_owner");
			const activeOwner = rawOwner ? JSON.parse(rawOwner) : null;
			if (activeOwner?.env === env && activeOwner.address.toLowerCase() === ownerAddress.toLowerCase()) {
				window.localStorage.removeItem("hyperliquid_active_agent_owner");
			}
			return { status: "closed", epoch: { env, owner: ownerAddress, epoch: "logout-epoch" } };
		});
		testState.removeAgent.mockReset();
		testState.removeAgent.mockImplementation((env: string, ownerAddress: string) => {
			window.localStorage.removeItem(`hyperliquid_agent_${env}_${ownerAddress.toLowerCase()}`);
			return { status: "removed" };
		});
		testState.toastError.mockReset();
		clearVerifiedExternalWalletOwner();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		window.localStorage.clear();
		window.sessionStorage.clear();
		clearVerifiedExternalWalletOwner();
		vi.clearAllMocks();
	});

	it("removes the exact current Agent before clearing its owner and logging out through Privy", async () => {
		act(() => {
			root.render(createElement(DisconnectButton));
		});

		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.disconnect).not.toHaveBeenCalled();
		expect(testState.removeAgent).toHaveBeenCalledWith("Mainnet", USER_ADDRESS);
		expect(testState.closeRegistration.mock.invocationCallOrder[0]).toBeLessThan(
			testState.logout.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
		);
		expect(testState.logout).toHaveBeenCalledTimes(1);
		expect(window.localStorage.getItem("hyperliquid_active_agent_owner")).toBeNull();
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
	});

	it("fails closed and warns when the exact Agent key cannot be verified as removed", async () => {
		testState.removeAgent.mockReturnValue({ status: "failed", reason: "remove_failed" });

		act(() => {
			root.render(createElement(DisconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.removeAgent).toHaveBeenCalledWith("Mainnet", USER_ADDRESS);
		expect(testState.logout).not.toHaveBeenCalled();
		expect(testState.toastError).toHaveBeenCalledWith(
			"Disconnect failed: the local trading key could not be removed. Please retry.",
		);
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBe(AGENT_STORAGE_VALUE);
	});

	it("fails closed with an actionable warning when Web Locks are unavailable", async () => {
		testState.closeRegistration.mockResolvedValue({ status: "failed", reason: "lock_unavailable" });

		act(() => {
			root.render(createElement(DisconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.removeAgent).not.toHaveBeenCalled();
		expect(testState.logout).not.toHaveBeenCalled();
		expect(testState.toastError).toHaveBeenCalledWith(
			"Disconnecting requires Web Locks support. Update your browser and try again.",
		);
	});

	it("fails closed and warns if Agent key removal unexpectedly throws", async () => {
		testState.removeAgent.mockImplementation(() => {
			throw new Error("storage blocked");
		});

		act(() => {
			root.render(createElement(DisconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.logout).not.toHaveBeenCalled();
		expect(testState.toastError).toHaveBeenCalledWith(
			"Disconnect failed: the local trading key could not be removed. Please retry.",
		);
	});

	it("fails closed before key removal when the active wallet and trading account do not match", async () => {
		testState.clientKey = "0x4444444444444444444444444444444444444444";

		act(() => {
			root.render(createElement(DisconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.removeAgent).not.toHaveBeenCalled();
		expect(testState.logout).not.toHaveBeenCalled();
		expect(testState.toastError).toHaveBeenCalledWith(
			"Disconnect failed: the active trading account could not be verified. Please retry.",
		);
	});

	it("does not treat Privy's first verified wallet as the owner of a disconnected trading session", async () => {
		testState.sessionMode = "disconnected";
		testState.walletAddress = undefined;
		testState.walletConnected = false;
		testState.clientKey = "disconnected";

		act(() => {
			root.render(createElement(DisconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.removeAgent).not.toHaveBeenCalled();
		expect(testState.logout).not.toHaveBeenCalled();
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBe(AGENT_STORAGE_VALUE);
	});

	it("uses the connected wagmi owner even when it differs from Privy's first verified wallet", async () => {
		const connectedOwner = "0x3333333333333333333333333333333333333333";
		testState.walletAddress = connectedOwner;
		testState.clientKey = connectedOwner;
		testState.selectedWallet = { address: connectedOwner };
		testState.wallets = [testState.selectedWallet];

		act(() => {
			root.render(createElement(DisconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.removeAgent).toHaveBeenCalledWith("Mainnet", connectedOwner);
		expect(testState.logout).toHaveBeenCalledTimes(1);
	});

	it("remembers only a previously verified wagmi owner across a transient external disconnect", async () => {
		const connectedOwner = "0x3333333333333333333333333333333333333333";
		testState.walletAddress = connectedOwner;
		testState.clientKey = connectedOwner;
		testState.selectedWallet = { address: connectedOwner };
		testState.wallets = [testState.selectedWallet];

		act(() => {
			root.render(createElement(DisconnectButton));
		});
		await flushAsyncWork();

		testState.walletAddress = undefined;
		testState.walletConnected = false;
		testState.clientKey = "disconnected";
		testState.sessionMode = "disconnected";
		act(() => {
			root.render(createElement(DisconnectButton));
		});
		await flushAsyncWork();
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.removeAgent).toHaveBeenCalledWith("Mainnet", connectedOwner);
		expect(testState.logout).toHaveBeenCalledTimes(1);
	});

	it("invalidates the remembered owner when the authenticated Privy identity changes", async () => {
		const connectedOwner = "0x3333333333333333333333333333333333333333";
		testState.walletAddress = connectedOwner;
		testState.clientKey = connectedOwner;
		testState.selectedWallet = { address: connectedOwner };
		testState.wallets = [testState.selectedWallet];

		act(() => {
			root.render(createElement(DisconnectButton));
		});
		await flushAsyncWork();

		testState.userId = "did:privy:another-user";
		testState.walletAddress = undefined;
		testState.walletConnected = false;
		testState.clientKey = "disconnected";
		testState.sessionMode = "disconnected";
		act(() => {
			root.render(createElement(DisconnectButton));
		});
		await flushAsyncWork();
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.removeAgent).not.toHaveBeenCalled();
		expect(testState.logout).not.toHaveBeenCalled();
	});

	it("uses only the exact embedded owner for a disconnected authenticated email session", async () => {
		testState.sessionMode = "disconnected";
		testState.walletAddress = undefined;
		testState.walletConnected = false;
		testState.clientKey = "disconnected";
		testState.userWalletAddress = undefined;
		testState.embeddedWalletAddress = USER_ADDRESS;
		testState.shouldUseEmbeddedWallet = true;

		act(() => {
			root.render(createElement(DisconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.removeAgent).toHaveBeenCalledWith("Mainnet", USER_ADDRESS);
		expect(testState.logout).toHaveBeenCalledTimes(1);
	});

	it("fails closed without deleting any key when a disconnected Privy owner is ambiguous", async () => {
		const otherOwner = "0x3333333333333333333333333333333333333333";
		const otherStorageKey = `hyperliquid_agent_Mainnet_${otherOwner}`;
		window.localStorage.setItem(otherStorageKey, AGENT_STORAGE_VALUE);
		testState.sessionMode = "disconnected";
		testState.walletAddress = undefined;
		testState.walletConnected = false;
		testState.clientKey = "disconnected";
		testState.userWalletAddress = undefined;
		testState.embeddedWalletAddress = undefined;
		testState.shouldUseEmbeddedWallet = true;

		act(() => {
			root.render(createElement(DisconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.removeAgent).not.toHaveBeenCalled();
		expect(testState.logout).not.toHaveBeenCalled();
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBe(AGENT_STORAGE_VALUE);
		expect(window.localStorage.getItem(otherStorageKey)).toBe(AGENT_STORAGE_VALUE);
	});

	function setEmailSessionWithoutWallet() {
		testState.sessionMode = "disconnected";
		testState.walletAddress = undefined;
		testState.walletConnected = false;
		testState.clientKey = "disconnected";
		testState.userWalletAddress = undefined;
		testState.embeddedWalletAddress = undefined;
		testState.hasEmbeddedWallet = false;
		testState.shouldUseEmbeddedWallet = true;
	}

	async function clickDisconnect() {
		act(() => {
			root.render(createElement(DisconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();
	}

	it("logs out an email session that has no wallet when no agent-only owner is stored", async () => {
		setEmailSessionWithoutWallet();
		window.localStorage.removeItem("hyperliquid_active_agent_owner");

		await clickDisconnect();

		expect(testState.closeRegistration).not.toHaveBeenCalled();
		expect(testState.toastError).not.toHaveBeenCalled();
		expect(testState.logout).toHaveBeenCalledTimes(1);
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBe(AGENT_STORAGE_VALUE);
	});

	it("closes the agent-only owner an email login was hiding, so logging out cannot hand the device back to it", async () => {
		setEmailSessionWithoutWallet();

		await clickDisconnect();

		expect(testState.removeAgent).toHaveBeenCalledWith("Mainnet", USER_ADDRESS);
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
		expect(window.localStorage.getItem("hyperliquid_active_agent_owner")).toBeNull();
		expect(testState.logout).toHaveBeenCalledTimes(1);
	});

	it("stays logged in when the hidden agent-only owner cannot be closed", async () => {
		setEmailSessionWithoutWallet();
		testState.removeAgent.mockReturnValue({ status: "failed", reason: "storage_unavailable" });

		await clickDisconnect();

		expect(testState.logout).not.toHaveBeenCalled();
		expect(window.localStorage.getItem("hyperliquid_active_agent_owner")).not.toBeNull();
		expect(testState.toastError).toHaveBeenCalledWith(
			"Disconnect failed: the local trading key could not be removed. Please retry.",
		);
	});

	it("stays logged in when another agent-only owner took the place of the one that was closed", async () => {
		const replacement = "0x4444444444444444444444444444444444444444";
		setEmailSessionWithoutWallet();
		testState.removeAgent.mockImplementation((env: string, ownerAddress: string) => {
			window.localStorage.removeItem(`hyperliquid_agent_${env}_${ownerAddress.toLowerCase()}`);
			window.localStorage.setItem("hyperliquid_active_agent_owner", JSON.stringify({ env, address: replacement }));
			return { status: "removed" };
		});

		await clickDisconnect();

		expect(testState.removeAgent).toHaveBeenCalledWith("Mainnet", USER_ADDRESS);
		expect(testState.logout).not.toHaveBeenCalled();
		expect(testState.toastError).toHaveBeenCalledWith(
			"Disconnect failed: the active trading account could not be verified. Please retry.",
		);
	});

	it("leaves an agent-only owner of the other environment alone", async () => {
		setEmailSessionWithoutWallet();
		window.localStorage.setItem(
			"hyperliquid_active_agent_owner",
			JSON.stringify({ env: "Testnet", address: USER_ADDRESS }),
		);

		await clickDisconnect();

		expect(testState.closeRegistration).not.toHaveBeenCalled();
		expect(testState.logout).toHaveBeenCalledTimes(1);
	});

	it("keeps failing closed for a walletless identity that is not an unambiguous email session", async () => {
		testState.sessionMode = "disconnected";
		testState.walletAddress = undefined;
		testState.walletConnected = false;
		testState.clientKey = "disconnected";
		testState.userWalletAddress = undefined;
		testState.embeddedWalletAddress = undefined;
		testState.hasEmbeddedWallet = false;
		testState.walletIntentOverride = "ambiguous";

		act(() => {
			root.render(createElement(DisconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.logout).not.toHaveBeenCalled();
		expect(testState.toastError).toHaveBeenCalledWith(
			"Disconnect failed: the active trading account could not be verified. Please retry.",
		);
	});

	it("keeps the local trading key removed when Privy logout fails", async () => {
		testState.logout.mockRejectedValue(new Error("Privy unavailable"));

		act(() => {
			root.render(createElement(DisconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
		expect(window.localStorage.getItem("hyperliquid_active_agent_owner")).toBeNull();
		expect(testState.toastError).toHaveBeenCalledWith(
			"The wallet session could not be closed, but the local trading key was removed. Retry disconnecting the wallet.",
		);
	});

	it("fails closed when the exact active agent-only owner cannot be cleared", async () => {
		testState.closeRegistration.mockResolvedValue({ status: "failed", reason: "owner_cleanup_failed" });

		act(() => {
			root.render(createElement(DisconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.logout).not.toHaveBeenCalled();
		expect(testState.toastError).toHaveBeenCalledWith(
			"Disconnect failed: the local trading session could not be cleared. Please retry.",
		);
	});

	it("removes only the active agent-only owner and does not delete another owner's key", async () => {
		const otherOwner = "0x3333333333333333333333333333333333333333";
		const otherStorageKey = `hyperliquid_agent_Mainnet_${otherOwner}`;
		window.localStorage.setItem(otherStorageKey, AGENT_STORAGE_VALUE);
		testState.sessionMode = "agent-only";
		testState.walletAddress = undefined;
		testState.userWalletAddress = undefined;
		testState.authenticated = false;

		act(() => {
			root.render(createElement(DisconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.removeAgent).toHaveBeenCalledWith("Mainnet", USER_ADDRESS);
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
		expect(window.localStorage.getItem(otherStorageKey)).toBe(AGENT_STORAGE_VALUE);
		expect(window.localStorage.getItem("hyperliquid_active_agent_owner")).toBeNull();
		expect(testState.logout).not.toHaveBeenCalled();
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

	it("does not expose the wrong active external wallet for the recorded Privy login", () => {
		testState.walletAddress = "0x3333333333333333333333333333333333333333";

		act(() => {
			root.render(createElement(SessionProbe));
		});

		const probe = container.querySelector("output");
		expect(probe?.getAttribute("data-display-address")).toBe("");
		expect(probe?.getAttribute("data-has-wallet-access")).toBe("false");
		expect(probe?.getAttribute("data-is-connected")).toBe("false");
	});

	it("does not let another tab's legacy localStorage intent switch the active wallet", () => {
		testState.embeddedWalletAddress = "0x2222222222222222222222222222222222222222";
		act(() => {
			root.render(createElement(SessionProbe));
		});
		expect(container.querySelector("output")?.getAttribute("data-has-wallet-access")).toBe("true");

		const key = getPrivyLoginIntentStorageKey(testState.userId);
		const value = JSON.stringify({
			method: "email",
			userId: testState.userId,
		});
		window.localStorage.setItem(key, value);
		act(() => {
			window.dispatchEvent(new StorageEvent("storage", { key, newValue: value, storageArea: window.localStorage }));
		});

		const probe = container.querySelector("output");
		expect(probe?.getAttribute("data-display-address")).toBe(USER_ADDRESS);
		expect(probe?.getAttribute("data-has-wallet-access")).toBe("true");
		expect(probe?.getAttribute("data-is-connected")).toBe("true");
	});

	it("fails closed immediately when this tab's login intent targets a different wallet kind", () => {
		testState.embeddedWalletAddress = "0x2222222222222222222222222222222222222222";
		act(() => {
			root.render(createElement(SessionProbe));
		});
		expect(container.querySelector("output")?.getAttribute("data-has-wallet-access")).toBe("true");

		act(() => {
			recordPrivyLoginMethod(testState.userId, "email");
		});

		const probe = container.querySelector("output");
		expect(probe?.getAttribute("data-display-address")).toBe("");
		expect(probe?.getAttribute("data-has-wallet-access")).toBe("false");
		expect(probe?.getAttribute("data-is-connected")).toBe("false");
	});

	it("fails closed when restored Privy identity does not reveal whether email or wallet login was used", async () => {
		testState.walletIntentOverride = "ambiguous";
		testState.emailAddress = "trader@example.com";

		act(() => {
			root.render(createElement(SessionProbe));
		});

		const probe = container.querySelector("output");
		expect(probe?.getAttribute("data-display-address")).toBe("");
		expect(probe?.getAttribute("data-has-wallet-access")).toBe("false");

		act(() => {
			root.render(createElement(ReconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.setActiveWallet).not.toHaveBeenCalled();
		expect(testState.connectWallet).not.toHaveBeenCalled();
		expect(testState.toastError).toHaveBeenCalledWith(
			"Your email wallet is unavailable. Disconnect, then log in again with the same email.",
		);
	});

	it("does not trust a lingering wagmi address after its connection is no longer active", () => {
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

	it("does not expose a signer until Privy has finished resolving connected wallets", () => {
		testState.embeddedWalletAddress = USER_ADDRESS;
		testState.shouldUseEmbeddedWallet = true;
		testState.walletsReady = false;

		act(() => {
			root.render(createElement(SessionProbe));
		});

		const probe = container.querySelector("output");
		expect(probe?.getAttribute("data-authentication-ready")).toBe("true");
		expect(probe?.getAttribute("data-ready")).toBe("false");
		expect(probe?.getAttribute("data-wallet-directory-ready")).toBe("false");
		expect(probe?.getAttribute("data-display-address")).toBe("");
		expect(probe?.getAttribute("data-has-wallet-access")).toBe("false");
		expect(probe?.getAttribute("data-is-connected")).toBe("false");
	});

	it("does not expose a signer before Privy authentication initialization is ready", () => {
		testState.embeddedWalletAddress = USER_ADDRESS;
		testState.shouldUseEmbeddedWallet = true;
		testState.selectedWallet = { address: USER_ADDRESS };
		testState.wallets = [testState.selectedWallet];
		testState.ready = false;

		act(() => {
			root.render(createElement(SessionProbe));
		});

		const probe = container.querySelector("output");
		expect(probe?.getAttribute("data-authentication-ready")).toBe("false");
		expect(probe?.getAttribute("data-ready")).toBe("false");
		expect(probe?.getAttribute("data-wallet-directory-ready")).toBe("true");
		expect(probe?.getAttribute("data-display-address")).toBe("");
		expect(probe?.getAttribute("data-has-wallet-access")).toBe("false");
		expect(probe?.getAttribute("data-is-connected")).toBe("false");
	});

	it("does not expose a linked email wallet that is absent from Privy's connected-wallet directory", () => {
		testState.embeddedWalletAddress = USER_ADDRESS;
		testState.shouldUseEmbeddedWallet = true;
		testState.selectedWallet = undefined;
		testState.wallets = [];

		act(() => {
			root.render(createElement(SessionProbe));
		});

		const probe = container.querySelector("output");
		expect(probe?.getAttribute("data-display-address")).toBe("");
		expect(probe?.getAttribute("data-has-wallet-access")).toBe("false");
		expect(probe?.getAttribute("data-is-connected")).toBe("false");
	});

	it("fails closed while wagmi is still activating the exact signer", () => {
		testState.embeddedWalletAddress = USER_ADDRESS;
		testState.shouldUseEmbeddedWallet = true;
		testState.selectedWallet = { address: USER_ADDRESS };
		testState.wallets = [testState.selectedWallet];
		testState.walletConnecting = true;

		act(() => {
			root.render(createElement(SessionProbe));
		});

		const probe = container.querySelector("output");
		expect(probe?.getAttribute("data-display-address")).toBe("");
		expect(probe?.getAttribute("data-has-wallet-access")).toBe("false");
		expect(probe?.getAttribute("data-is-connected")).toBe("false");
	});

	it("fails closed while wagmi is reconnecting the exact signer", () => {
		testState.embeddedWalletAddress = USER_ADDRESS;
		testState.shouldUseEmbeddedWallet = true;
		testState.selectedWallet = { address: USER_ADDRESS };
		testState.wallets = [testState.selectedWallet];
		testState.walletReconnecting = true;

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
		testState.selectedWallet = { address: USER_ADDRESS };
		testState.wallets = [testState.selectedWallet];

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
		testState.selectedWallet = undefined;
		testState.wallets = [];
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
		testState.selectedWallet = undefined;
		testState.wallets = [];

		act(() => {
			root.render(createElement(ReconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.setActiveWallet).not.toHaveBeenCalled();
		expect(testState.connectWallet).not.toHaveBeenCalled();
		expect(testState.toastError).toHaveBeenCalledWith(
			"Your email wallet is unavailable. Disconnect, then log in again with the same email.",
		);
	});

	it("reports an exact wallet activation failure without falling back to another connector", async () => {
		const connectedWallet = { address: USER_ADDRESS };
		testState.wallets = [connectedWallet];
		testState.selectedWallet = connectedWallet;
		testState.setActiveWallet.mockRejectedValue(new Error("connector rejected activation"));

		act(() => {
			root.render(createElement(ReconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.setActiveWallet).toHaveBeenCalledWith(connectedWallet);
		expect(testState.connectWallet).not.toHaveBeenCalled();
		expect(testState.toastError).toHaveBeenCalledWith(
			"Wallet connection failed. Unlock your wallet, approve the connection, then retry.",
		);
	});

	it("reports embedded wallet activation failure without asking an email user to unlock an external wallet", async () => {
		const embeddedWallet = { address: USER_ADDRESS };
		testState.wallets = [embeddedWallet];
		testState.selectedWallet = embeddedWallet;
		testState.shouldUseEmbeddedWallet = true;
		testState.setActiveWallet.mockRejectedValue(new Error("embedded connector unavailable"));

		act(() => {
			root.render(createElement(ReconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.setActiveWallet).toHaveBeenCalledWith(embeddedWallet);
		expect(testState.connectWallet).not.toHaveBeenCalled();
		expect(testState.toastError).toHaveBeenCalledWith(
			"Your email wallet is unavailable. Disconnect, then log in again with the same email.",
		);
	});

	it("retries the silent wallet creation when an email session has no wallet yet", async () => {
		testState.shouldUseEmbeddedWallet = true;
		testState.needsEmbeddedWallet = true;
		testState.selectedWallet = undefined;
		testState.wallets = [];

		act(() => {
			root.render(createElement(ReconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.ensureEmailEmbeddedWallet).toHaveBeenCalledOnce();
		expect(testState.connectWallet).not.toHaveBeenCalled();
		expect(testState.toastError).not.toHaveBeenCalled();
	});

	it("tells an email user to log in again when the retried wallet creation fails", async () => {
		testState.shouldUseEmbeddedWallet = true;
		testState.needsEmbeddedWallet = true;
		testState.selectedWallet = undefined;
		testState.wallets = [];
		testState.ensureEmailEmbeddedWallet.mockRejectedValue(new Error("Embedded wallet creation timed out"));

		act(() => {
			root.render(createElement(ReconnectButton));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushAsyncWork();

		expect(testState.ensureEmailEmbeddedWallet).toHaveBeenCalledOnce();
		expect(testState.connectWallet).not.toHaveBeenCalled();
		expect(testState.toastError).toHaveBeenCalledWith(
			"Your email wallet is unavailable. Disconnect, then log in again with the same email.",
		);
	});

	it("reports whether Privy's own window is visible", () => {
		act(() => {
			root.render(createElement(SessionProbe));
		});
		expect(container.querySelector("output")?.getAttribute("data-authentication-modal-open")).toBe("false");

		testState.privyModalOpen = true;
		act(() => {
			root.render(createElement(SessionProbe));
		});
		expect(container.querySelector("output")?.getAttribute("data-authentication-modal-open")).toBe("true");
	});
});
