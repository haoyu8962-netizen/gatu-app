// @vitest-environment jsdom

import type { PrivyClientConfig } from "@privy-io/react-auth";
import { QueryClient } from "@tanstack/react-query";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRIVY_CONFIG_BY_THEME } from "@/config/privy";
import { ClientRootProvider } from "@/providers/client-root";
import { useSetTheme, useTheme } from "@/stores/use-global-settings-store";

const runtime = vi.hoisted(() => ({
	childMounts: 0,
	childUnmounts: 0,
	privyConfigs: [] as PrivyClientConfig[],
	privyRenders: 0,
}));

vi.mock("@gatu/hl-react", () => ({
	HyperliquidAgentApprovalProvider: ({ children }: { children: React.ReactNode }) => children,
	HyperliquidExchangePolicyProvider: ({ children }: { children: React.ReactNode }) => children,
	HyperliquidOwnerSignerProvider: ({ children }: { children: React.ReactNode }) => children,
	HyperliquidProvider: ({ children }: { children: React.ReactNode }) => children,
	useLegalStatusLifecycle: () => undefined,
}));

vi.mock("@privy-io/react-auth", () => ({
	PrivyProvider: ({ children, config }: { children: React.ReactNode; config: PrivyClientConfig }) => {
		runtime.privyRenders += 1;
		runtime.privyConfigs.push(config);
		return children;
	},
}));

vi.mock("@privy-io/react-auth/smart-wallets", () => ({
	SmartWalletsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@privy-io/wagmi", () => ({
	createConfig: (config: unknown) => config,
	WagmiProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@tanstack/react-query-persist-client", () => ({
	PersistQueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/trade/order-reconciliation", () => ({ OrderReconciliation: () => null }));
vi.mock("@/components/trade/tradebox/embedded-deposit-auto-bridge", () => ({
	EmbeddedDepositAutoBridge: () => null,
}));
vi.mock("@/components/trade/twap-reconciliation", () => ({ TwapReconciliation: () => null }));

vi.mock("@/hooks/wallet/use-explicit-agent-approval", () => ({
	useExplicitAgentApproval: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/wallet/use-privy-owner-signer", () => ({
	usePrivyOwnerSigner: () => null,
}));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: "0x1111111111111111111111111111111111111111",
		authenticated: true,
		ready: true,
	}),
}));

vi.mock("@/lib/hyperliquid/markets", () => ({
	MarketsProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/lib/network", () => ({
	getNetwork: () => "mainnet",
	subscribeNetworkStorage: () => () => undefined,
	switchNetwork: () => "unchanged",
}));
vi.mock("@/lib/query-persistence", () => ({
	createQueryPersistenceCallbacks: () => ({ onError: vi.fn(), onSuccess: vi.fn() }),
	createQueryPersistenceFlush: () => vi.fn(),
	createQueryPersistenceOptions: () => ({}),
}));
vi.mock("@/lib/wallet/privy-wagmi", () => ({
	selectPrivyWagmiWallet: vi.fn(),
}));

vi.mock("@/providers/base-ui-direction", () => ({
	BaseUiDirectionProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/providers/client-runtime", () => ({
	ClientRuntimeProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/providers/privy-login-method-observer", () => ({ PrivyLoginMethodObserver: () => null }));
vi.mock("@/providers/pwa-install", () => ({
	PwaInstallProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let setTheme: ReturnType<typeof useSetTheme> | undefined;

function ThemeProbe() {
	const theme = useTheme();
	setTheme = useSetTheme();

	useEffect(() => {
		runtime.childMounts += 1;
		return () => {
			runtime.childUnmounts += 1;
		};
	}, []);

	return <output data-testid="theme-probe">{theme}</output>;
}

describe("ClientRootProvider theme lifecycle", () => {
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;

	beforeEach(() => {
		runtime.childMounts = 0;
		runtime.childUnmounts = 0;
		runtime.privyConfigs.length = 0;
		runtime.privyRenders = 0;
		setTheme = undefined;
		window.localStorage.clear();
		container = document.createElement("div");
		document.body.appendChild(container);
		queryClient = new QueryClient();
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => setTheme?.("dark"));
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
		window.localStorage.clear();
	});

	it("keeps Privy outside live theme updates", () => {
		act(() => {
			root.render(
				<ClientRootProvider queryClient={queryClient}>
					<ThemeProbe />
				</ClientRootProvider>,
			);
		});

		const initialTheme = container.querySelector('[data-testid="theme-probe"]')?.textContent;
		const initialPrivyConfig = runtime.privyConfigs[0];
		expect(initialTheme === "dark" || initialTheme === "light").toBe(true);
		expect(runtime.privyRenders).toBe(1);
		expect(Object.values(PRIVY_CONFIG_BY_THEME)).toContain(initialPrivyConfig);
		expect(runtime.privyConfigs).toEqual([initialPrivyConfig]);
		expect(runtime.childMounts).toBe(1);
		expect(runtime.childUnmounts).toBe(0);

		act(() => setTheme?.(initialTheme === "dark" ? "light" : "dark"));

		expect(container.querySelector('[data-testid="theme-probe"]')?.textContent).not.toBe(initialTheme);
		expect(runtime.privyRenders).toBe(1);
		expect(runtime.privyConfigs).toEqual([initialPrivyConfig]);
		expect(runtime.childMounts).toBe(1);
		expect(runtime.childUnmounts).toBe(0);
	});
});
