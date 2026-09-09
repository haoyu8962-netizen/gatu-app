// @vitest-environment jsdom

import type { ConnectedWallet, User } from "@privy-io/react-auth";
import { act, type ReactNode, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePrivyOwnerSigner } from "@/hooks/wallet/use-privy-owner-signer";
import type { PrivyLoginIntent } from "@/lib/wallet/privy-login-method";
import { HyperliquidOwnerSignerBridge } from "@/providers/hyperliquid-owner-signer-bridge";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OTHER = "0x2222222222222222222222222222222222222222" as const;
const SIGNATURE = `0x${"11".repeat(64)}1b` as const;

const state = vi.hoisted(() => ({
	authenticated: true,
	authenticationReady: true,
	walletsReady: true,
	user: null as User | null,
	wallets: [] as ConnectedWallet[],
	loginIntent: undefined as PrivyLoginIntent | undefined,
	clientKey: "" as string,
	env: "Mainnet" as "Mainnet" | "Testnet",
	connectedWalletAddress: undefined as `0x${string}` | undefined,
	embeddedWalletAddress: undefined as `0x${string}` | undefined,
	hasWalletAccess: true,
	signTypedData: vi.fn(),
	bridgeValue: undefined as ReturnType<typeof usePrivyOwnerSigner> | undefined,
}));

vi.mock("@privy-io/react-auth", () => ({
	usePrivy: () => ({ authenticated: state.authenticated, ready: state.authenticationReady, user: state.user }),
	useWallets: () => ({ ready: state.walletsReady, wallets: state.wallets }),
	useSignTypedData: () => ({ signTypedData: state.signTypedData }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ clientKey: state.clientKey, env: state.env }),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		connectedWalletAddress: state.connectedWalletAddress,
		embeddedWalletAddress: state.embeddedWalletAddress,
		hasWalletAccess: state.hasWalletAccess,
	}),
}));

vi.mock("@/lib/wallet/privy-login-method", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/wallet/privy-login-method")>()),
	usePrivyLoginIntent: () => state.loginIntent,
}));

vi.mock("@gatu/hl-react", () => ({
	HyperliquidOwnerSignerProvider: ({
		value,
		children,
	}: {
		value: ReturnType<typeof usePrivyOwnerSigner>;
		children: ReactNode;
	}) => {
		state.bridgeValue = value;
		return children;
	},
}));

let hookValue: ReturnType<typeof usePrivyOwnerSigner> | undefined;

function Probe() {
	hookValue = usePrivyOwnerSigner();
	return null;
}

function embeddedWallet(address: `0x${string}`): ConnectedWallet {
	return {
		address,
		walletClientType: "privy",
		connectorType: "embedded",
		chainType: "ethereum",
	} as unknown as ConnectedWallet;
}

function emailUser(address: `0x${string}` = OWNER, id = "did:privy:owner"): User {
	return {
		id,
		email: { address: "trader@example.com" },
		wallet: { address, walletClientType: "privy", connectorType: "embedded", chainType: "ethereum" },
		linkedAccounts: [{ type: "email", address: "trader@example.com" }],
	} as User;
}

describe("usePrivyOwnerSigner", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		hookValue = undefined;
		Object.assign(state, {
			authenticated: true,
			authenticationReady: true,
			walletsReady: true,
			user: emailUser(),
			wallets: [embeddedWallet(OWNER)],
			loginIntent: { method: "email", userId: "did:privy:owner" },
			clientKey: OWNER,
			env: "Mainnet",
			connectedWalletAddress: OWNER,
			embeddedWalletAddress: OWNER,
			hasWalletAccess: true,
			signTypedData: vi.fn().mockResolvedValue({ signature: SIGNATURE }),
			bridgeValue: undefined,
		});
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderHook() {
		act(() => root.render(<Probe />));
		if (hookValue === undefined) throw new Error("Owner signer hook did not render");
		return hookValue;
	}

	it("selects the current user's embedded owner even when another wallet is first", async () => {
		state.wallets.unshift(embeddedWallet(OTHER));
		const signer = renderHook();

		expect(signer?.ownerAddress).toBe(OWNER);
		expect(await signer?.wallet?.getAddresses()).toEqual([OWNER]);
		expect(await signer?.wallet?.getChainId()).toBe(42161);
		expect(state.signTypedData).not.toHaveBeenCalled();
	});

	it("keeps the current signer valid after StrictMode effect replay and ordinary rerenders", async () => {
		act(() =>
			root.render(
				<StrictMode>
					<Probe />
				</StrictMode>,
			),
		);
		const signer = hookValue;
		expect(signer?.wallet).not.toBeNull();
		expect(await signer?.wallet?.getAddresses()).toEqual([OWNER]);

		act(() =>
			root.render(
				<StrictMode>
					<Probe />
				</StrictMode>,
			),
		);
		expect(hookValue).toBe(signer);
		expect(await signer?.wallet?.getAddresses()).toEqual([OWNER]);
		expect(state.signTypedData).not.toHaveBeenCalled();
	});

	it("does not revive a captured signer after switching from one user to another and back", async () => {
		const original = renderHook();
		state.user = emailUser(OWNER, "did:privy:other");
		state.loginIntent = { method: "email", userId: "did:privy:other" } as PrivyLoginIntent;
		renderHook();
		state.user = emailUser();
		state.loginIntent = { method: "email", userId: "did:privy:owner" } as PrivyLoginIntent;
		const current = renderHook();

		await expect(original?.wallet?.getAddresses()).rejects.toThrow("no longer available");
		expect(await current?.wallet?.getAddresses()).toEqual([OWNER]);
	});

	it.each(["authenticationReady", "walletsReady", "hasWalletAccess"] as const)(
		"retains owner policy without a signer while %s is false",
		(field) => {
			state[field] = false;
			const signer = renderHook();

			expect(signer).not.toBeNull();
			expect(signer?.wallet).toBeNull();
			expect(() => signer?.assertCurrent()).toThrow("no longer available");
			expect(state.signTypedData).not.toHaveBeenCalled();
		},
	);

	it.each(["clientKey", "connectedWalletAddress", "embeddedWalletAddress"] as const)(
		"fails closed when %s belongs to another wallet",
		(field) => {
			state[field] = OTHER;
			const signer = renderHook();

			expect(signer).not.toBeNull();
			expect(signer?.wallet).toBeNull();
			expect(() => signer?.assertCurrent()).toThrow("no longer available");
		},
	);

	it("does not use linked metadata or another connected wallet while the exact signer is missing", () => {
		state.wallets = [embeddedWallet(OTHER)];
		expect(renderHook()?.wallet).toBeNull();
		state.wallets = [
			{ ...embeddedWallet(OWNER), connectorType: "injected", walletClientType: "metamask" } as ConnectedWallet,
		];
		expect(renderHook()?.wallet).toBeNull();
		state.wallets = [{ ...embeddedWallet(OWNER), chainType: "solana" } as ConnectedWallet];
		expect(renderHook()?.wallet).toBeNull();
		expect(state.signTypedData).not.toHaveBeenCalled();
	});

	it("waits for exact embedded metadata and directory readiness without changing the owner policy", async () => {
		state.user = {
			id: "did:privy:owner",
			email: { address: "trader@example.com" },
			linkedAccounts: [],
		} as unknown as User;
		state.wallets = [];
		const pending = renderHook();
		expect(pending).not.toBeNull();
		expect(pending?.ownerAddress).toBeUndefined();
		expect(pending?.wallet).toBeNull();

		state.user = emailUser();
		state.wallets = [embeddedWallet(OWNER)];
		const ready = renderHook();
		expect(await ready?.wallet?.getAddresses()).toEqual([OWNER]);
		expect(() => pending?.assertCurrent()).toThrow("no longer available");
	});

	it("invalidates a captured signer across a user change even if both users expose the same address", async () => {
		const old = renderHook();
		state.user = emailUser(OWNER, "did:privy:other");
		state.loginIntent = { method: "email", userId: "did:privy:other" } as PrivyLoginIntent;
		const current = renderHook();

		await expect(old?.wallet?.getAddresses()).rejects.toThrow("no longer available");
		expect(await current?.wallet?.getAddresses()).toEqual([OWNER]);
	});

	it("does not revive an old signer after logout and login with the same account", async () => {
		const original = renderHook();
		state.authenticated = false;
		expect(renderHook()).toBeNull();
		state.authenticated = true;
		const current = renderHook();

		await expect(original?.wallet?.getAddresses()).rejects.toThrow("no longer available");
		expect(await current?.wallet?.getAddresses()).toEqual([OWNER]);
	});

	it("invalidates earlier signers after a network change and uses the current user-signing chain", async () => {
		const original = renderHook();
		state.env = "Testnet";
		const current = renderHook();

		await expect(original?.wallet?.getChainId()).rejects.toThrow("no longer available");
		expect(await current?.wallet?.getChainId()).toBe(421614);
	});

	it("invalidates the captured signer when Privy replaces its signing function", async () => {
		const original = renderHook();
		state.signTypedData = vi.fn().mockResolvedValue({ signature: SIGNATURE });
		const current = renderHook();

		await expect(original?.wallet?.getAddresses()).rejects.toThrow("no longer available");
		expect(await current?.wallet?.getAddresses()).toEqual([OWNER]);
	});

	it("blocks a late signature after the owner bridge unmounts", async () => {
		let finish = (_result: { signature: string }) => {};
		state.signTypedData.mockReturnValue(
			new Promise<{ signature: string }>((resolve) => {
				finish = resolve;
			}),
		);
		const signer = renderHook();
		const signing = signer?.wallet?.signTypedData({
			domain: {
				name: "Exchange",
				version: "1",
				chainId: 1337,
				verifyingContract: "0x0000000000000000000000000000000000000000",
			},
			types: { Agent: [{ name: "source", type: "string" }] },
			primaryType: "Agent",
			message: { source: "a" },
		});
		expect(state.signTypedData).toHaveBeenCalledWith(expect.anything(), {
			address: OWNER,
			uiOptions: { showWalletUIs: false },
		});
		act(() => root.render(null));
		finish({ signature: SIGNATURE });

		await expect(signing).rejects.toThrow("no longer available");
	});

	it("preserves the default Agent strategy for verified external-wallet sessions", () => {
		state.user = {
			id: "did:privy:external",
			wallet: { address: OTHER, walletClientType: "metamask" },
			linkedAccounts: [],
		} as unknown as User;
		state.loginIntent = { method: "wallet", userId: "did:privy:external", walletAddress: OTHER } as PrivyLoginIntent;
		expect(renderHook()).toBeNull();
	});

	it("does not return the Agent default for an ambiguous authenticated identity", () => {
		state.loginIntent = { method: "email", userId: "did:privy:other" } as PrivyLoginIntent;
		expect(renderHook()?.wallet).toBeNull();
		expect(hookValue).not.toBeNull();
	});

	it("passes owner policy through the bridge without hiding its children or signing", () => {
		state.walletsReady = false;
		act(() =>
			root.render(
				<HyperliquidOwnerSignerBridge>
					<span>Terminal</span>
				</HyperliquidOwnerSignerBridge>,
			),
		);

		expect(container.textContent).toBe("Terminal");
		expect(state.bridgeValue).toEqual(expect.objectContaining({ ownerAddress: OWNER, wallet: null }));
		expect(state.signTypedData).not.toHaveBeenCalled();
	});
});
