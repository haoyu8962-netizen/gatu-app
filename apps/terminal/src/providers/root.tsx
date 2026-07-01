import { HyperliquidProvider, PERSISTED_QUERY_PREFIX } from "@gatu/hl-react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { WagmiProvider } from "@privy-io/wagmi";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { EmbeddedDepositAutoBridge } from "@/components/trade/tradebox/embedded-deposit-auto-bridge";
import { APP_NAME, RQ_CACHE_BUSTER, STORAGE_KEYS } from "@/config/app";
import { DEFAULT_BUILDER_CONFIG } from "@/config/hyperliquid";
import { PRIVY_APP_ID, privyConfig } from "@/config/privy";
import { RQ_CACHE_MAX_AGE_MS } from "@/config/time";
import { config } from "@/config/wagmi";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { MarketsProvider } from "@/lib/hyperliquid/markets";
import { getNetwork } from "@/lib/network";
import { selectPrivyWagmiWallet } from "@/lib/wallet/privy-wagmi";
import "@/lib/i18n";

const network = getNetwork();
const env = network === "testnet" ? "Testnet" : "Mainnet";

const isServer = typeof document === "undefined";

if (!isServer) {
	try {
		localStorage.removeItem(STORAGE_KEYS.LEGACY_METADATA);
	} catch {}
}

const persister = isServer
	? null
	: createSyncStoragePersister({
			storage: window.localStorage,
			key: STORAGE_KEYS.RQ_CACHE,
			throttleTime: 1000,
		});

export function getRootProviderContext() {
	const queryClient = new QueryClient();
	return { queryClient };
}

function HyperliquidBridge({ children }: { children: React.ReactNode }) {
	const { address } = useWalletSession();

	return (
		<HyperliquidProvider env={env} userAddress={address} builderConfig={DEFAULT_BUILDER_CONFIG} agentName={APP_NAME}>
			<MarketsProvider>{children}</MarketsProvider>
		</HyperliquidProvider>
	);
}

// The app is gated behind <ClientOnly> in routes/__root.tsx, so the server only ever
// renders the static AppShellSkeleton. PrivyProvider is client-only (it mounts a dialog
// and an iframe), so the server path deliberately omits Privy + wagmi and renders the
// Hyperliquid context with no connected user.
function ServerProviders({ children, queryClient }: { children: React.ReactNode; queryClient: QueryClient }) {
	return (
		<QueryClientProvider client={queryClient}>
			<I18nProvider i18n={i18n}>
				<HyperliquidProvider
					env={env}
					userAddress={undefined}
					builderConfig={DEFAULT_BUILDER_CONFIG}
					agentName={APP_NAME}
				>
					<MarketsProvider>{children}</MarketsProvider>
				</HyperliquidProvider>
			</I18nProvider>
		</QueryClientProvider>
	);
}

// Privy requires the order PrivyProvider > QueryClientProvider > WagmiProvider, and the
// WagmiProvider must come from @privy-io/wagmi so Privy drives the connector state.
function ClientProviders({ children, queryClient }: { children: React.ReactNode; queryClient: QueryClient }) {
	if (!persister) return null;

	return (
		<PrivyProvider appId={PRIVY_APP_ID ?? ""} config={privyConfig}>
			<SmartWalletsProvider>
				<PersistQueryClientProvider
					client={queryClient}
					persistOptions={{
						persister,
						maxAge: RQ_CACHE_MAX_AGE_MS,
						buster: RQ_CACHE_BUSTER,
						dehydrateOptions: {
							shouldDehydrateQuery: (query) => query.queryKey[0] === PERSISTED_QUERY_PREFIX,
						},
					}}
				>
					<WagmiProvider config={config} setActiveWalletForWagmi={selectPrivyWagmiWallet}>
						<I18nProvider i18n={i18n}>
							<HyperliquidBridge>
								<EmbeddedDepositAutoBridge />
								{children}
							</HyperliquidBridge>
						</I18nProvider>
					</WagmiProvider>
				</PersistQueryClientProvider>
			</SmartWalletsProvider>
		</PrivyProvider>
	);
}

export function RootProvider({ children, queryClient }: { children: React.ReactNode; queryClient: QueryClient }) {
	if (isServer) {
		return <ServerProviders queryClient={queryClient}>{children}</ServerProviders>;
	}

	return <ClientProviders queryClient={queryClient}>{children}</ClientProviders>;
}
