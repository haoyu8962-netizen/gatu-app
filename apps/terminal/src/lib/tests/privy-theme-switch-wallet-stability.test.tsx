// @vitest-environment jsdom

import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type ConnectedWallet, PrivyProvider, useWallets } from "@privy-io/react-auth";
import { createConfig, WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { http } from "viem";
import { arbitrum } from "viem/chains";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRIVY_CONFIG_BY_THEME } from "@/config/privy";

const FAKE_APP_ID = "c".repeat(25);
const OWNER = "0x1111111111111111111111111111111111111111";
const NEXT_OWNER = "0x2222222222222222222222222222222222222222";

// Seed only the SDK's discovery boundary; useWallets, PrivyProvider and wagmi stay real.
// This private test seam must be reviewed when upgrading the pinned SDK.
const sdkDirectory = resolve(dirname(createRequire(import.meta.url).resolve("@privy-io/react-auth")), "../esm");
const storeFile = readdirSync(sdkDirectory).find((name) => /^get-entropy-details-for-user-.*\.mjs$/.test(name));
if (!storeFile) throw new Error("Review the wallet store test seam for the installed Privy SDK");
const { a: walletStore } = (await import(pathToFileURL(resolve(sdkDirectory, storeFile)).href)) as {
	a: {
		getState(): { ethereumEmbedded: ConnectedWallet[]; ethereumExternal: ConnectedWallet[] };
		setState(state: { ethereumEmbedded?: ConnectedWallet[]; ethereumExternal?: ConnectedWallet[] }): void;
	};
};

type Theme = keyof typeof PRIVY_CONFIG_BY_THEME;

describe("Privy theme switch", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;
	let walletArrays: unknown[];
	let walletSelections: number;
	let wagmiStatuses: string[];
	let wagmiConfig: ReturnType<typeof createConfig>;
	let unsubscribe: () => void;

	function WalletArrayProbe() {
		const { wallets } = useWallets();
		useEffect(() => {
			walletArrays.push(wallets);
		}, [wallets]);
		return null;
	}

	function selectWallet({ wallets }: { wallets: ConnectedWallet[] }) {
		walletSelections += 1;
		return wallets[0];
	}

	function Tree({ theme, queryClient }: { theme: Theme; queryClient: QueryClient }) {
		return (
			<PrivyProvider appId={FAKE_APP_ID} config={PRIVY_CONFIG_BY_THEME[theme]}>
				<QueryClientProvider client={queryClient}>
					<WagmiProvider config={wagmiConfig} setActiveWalletForWagmi={selectWallet}>
						<WalletArrayProbe />
					</WagmiProvider>
				</QueryClientProvider>
			</PrivyProvider>
		);
	}

	async function settle() {
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
		});
	}

	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.reject(new Error("network is blocked in this test"))),
		);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		walletArrays = [];
		walletSelections = 0;
		wagmiStatuses = [];
		walletStore.setState({ ethereumEmbedded: [], ethereumExternal: [] });
		window.localStorage.clear();
		wagmiConfig = createConfig({
			chains: [arbitrum],
			transports: { [arbitrum.id]: http("http://127.0.0.1:1") },
		});
		queryClient = new QueryClient();
		unsubscribe = wagmiConfig.subscribe(
			(state) => state.status,
			(status) => wagmiStatuses.push(status),
		);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		unsubscribe();
		queryClient.clear();
		walletStore.setState({ ethereumEmbedded: [], ethereumExternal: [] });
		container.remove();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("keeps the logged-out wallets array and wagmi selection stable across theme changes", async () => {
		await act(async () => root.render(<Tree theme="dark" queryClient={queryClient} />));
		await settle();
		const mounted = { arrays: walletArrays.length, selections: walletSelections, statuses: wagmiStatuses.length };

		for (const theme of ["light", "dark", "light"] as const) {
			await act(async () => root.render(<Tree theme={theme} queryClient={queryClient} />));
			await settle();
		}

		expect(mounted.arrays).toBeGreaterThan(0);
		expect(walletArrays).toHaveLength(mounted.arrays);
		expect(walletSelections).toBe(mounted.selections);
		expect(wagmiStatuses).toHaveLength(mounted.statuses);
	});

	it("keeps a connected external wallet stable on theme changes and still handles wallet changes", async () => {
		await act(async () => root.render(<Tree theme="dark" queryClient={queryClient} />));
		await settle();
		const wallet = createWallet(OWNER);
		await act(async () => walletStore.setState({ ethereumExternal: [wallet] }));
		await settle();
		expect(wagmiConfig.state.status).toBe("connected");
		expect([...wagmiConfig.state.connections.values()][0]?.accounts).toEqual([OWNER]);
		const connected = { arrays: walletArrays.length, selections: walletSelections, statuses: wagmiStatuses.length };

		for (const theme of ["light", "dark", "light"] as const) {
			await act(async () => root.render(<Tree theme={theme} queryClient={queryClient} />));
			await settle();
			expect(wagmiConfig.state.status).toBe("connected");
			expect([...wagmiConfig.state.connections.values()][0]?.accounts).toEqual([OWNER]);
		}
		expect(walletArrays).toHaveLength(connected.arrays);
		expect(walletSelections).toBe(connected.selections);
		expect(wagmiStatuses).toHaveLength(connected.statuses);

		await act(async () => walletStore.setState({ ethereumExternal: [createWallet(NEXT_OWNER, "coinbase_wallet")] }));
		await settle();
		expect([...wagmiConfig.state.connections.values()][0]?.accounts).toEqual([NEXT_OWNER]);
		expect(walletSelections).toBeGreaterThan(connected.selections);

		await act(async () => walletStore.setState({ ethereumExternal: [] }));
		await settle();
		expect(wagmiConfig.state.status).toBe("disconnected");
		expect(wagmiConfig.state.connections.size).toBe(0);
	});

	it("clears a nonempty embedded list when the provider has no embedded owner", async () => {
		await act(async () => root.render(<Tree theme="dark" queryClient={queryClient} />));
		await settle();
		await act(async () => walletStore.setState({ ethereumEmbedded: [createWallet(OWNER)] }));
		await settle();
		expect(walletStore.getState().ethereumEmbedded).toHaveLength(1);
		await act(async () => root.render(<Tree theme="light" queryClient={queryClient} />));
		await settle();
		expect(walletStore.getState().ethereumEmbedded).toEqual([]);
		expect(wagmiConfig.state.status).toBe("disconnected");
	});
});

function createWallet(address: `0x${string}`, walletClientType = "metamask"): ConnectedWallet {
	const provider = {
		on: vi.fn(),
		removeListener: vi.fn(),
		request: vi.fn(async ({ method }: { method: string }) => {
			if (method === "eth_accounts" || method === "eth_requestAccounts") return [address];
			if (method === "eth_chainId") return "0xa4b1";
			throw new Error(`Unexpected wallet request: ${method}`);
		}),
	};
	return {
		address,
		chainId: "eip155:42161",
		chainType: "ethereum",
		connectorType: "injected",
		walletClientType,
		connectedAt: new Date(0),
		meta: { id: walletClientType, name: "Test wallet" },
		getEthereumProvider: async () => provider,
	} as unknown as ConnectedWallet;
}
