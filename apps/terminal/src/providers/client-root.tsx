import {
	HyperliquidAgentApprovalProvider,
	HyperliquidExchangePolicyProvider,
	HyperliquidProvider,
	useLegalStatusLifecycle,
} from "@gatu/hl-react";
import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { I18nProvider } from "@lingui/react";
import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { WagmiProvider } from "@privy-io/wagmi";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { OrderReconciliation } from "@/components/trade/order-reconciliation";
import { CctpDepositTrackingNotifier } from "@/components/trade/tradebox/cctp-deposit-tracking-notifier";
import { EmbeddedDepositAutoBridge } from "@/components/trade/tradebox/embedded-deposit-auto-bridge";
import { TwapReconciliation } from "@/components/trade/twap-reconciliation";
import { STORAGE_KEYS } from "@/config/app";
import { DEFAULT_BUILDER_CONFIG } from "@/config/hyperliquid";
import { PORTFOLIO_MARGIN_FEATURES } from "@/config/portfolio-margin";
import { PRIVY_APP_ID, PRIVY_CONFIG_BY_THEME } from "@/config/privy";
import { TRADING_AGENT_NAME } from "@/config/trading-agent";
import { config } from "@/config/wagmi";
import { useExplicitAgentApproval } from "@/hooks/wallet/use-explicit-agent-approval";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { MarketsProvider } from "@/lib/hyperliquid/markets";
import { getNetwork } from "@/lib/network";
import { createQueryPersistenceCallbacks, createQueryPersistenceOptions } from "@/lib/query-persistence";
import { selectPrivyWagmiWallet } from "@/lib/wallet/privy-wagmi";
import { BaseUiDirectionProvider } from "@/providers/base-ui-direction";
import { ClientRuntimeProvider } from "@/providers/client-runtime";
import { HyperliquidOwnerSignerBridge } from "@/providers/hyperliquid-owner-signer-bridge";
import { PrivyLoginMethodObserver } from "@/providers/privy-login-method-observer";
import { PwaInstallProvider } from "@/providers/pwa-install";
import { QueryPersistenceFlush } from "@/providers/query-persistence-flush";

const network = getNetwork();
const env = network === "testnet" ? "Testnet" : "Mainnet";
// Privy 3.30.0 rebuilds its connected-wallet wrappers whenever its config is
// recalculated. Freeze the appearance selected at client-runtime startup so a
// terminal theme toggle cannot cascade into a Wagmi reconnect. The next page
// load picks up the newly persisted theme.
const sessionPrivyConfig =
	PRIVY_CONFIG_BY_THEME[document.documentElement.classList.contains("light") ? "light" : "dark"];
const persister = createSyncStoragePersister({
	storage: window.localStorage,
	key: STORAGE_KEYS.RQ_CACHE,
	throttleTime: 1000,
});

try {
	localStorage.removeItem(STORAGE_KEYS.LEGACY_METADATA);
	localStorage.removeItem(STORAGE_KEYS.LEGACY_RECENT_WALLETS);
} catch {}

interface Props {
	children: ReactNode;
	queryClient: QueryClient;
}

function HyperliquidBridge({ children }: { children: ReactNode }) {
	const { address, authenticated, ready } = useWalletSession();

	return (
		<HyperliquidExchangePolicyProvider portfolioMarginActivationEnabled={PORTFOLIO_MARGIN_FEATURES.activationEnabled}>
			<HyperliquidProvider
				env={env}
				userAddress={address}
				allowAgentOnlySession={ready && !authenticated}
				enforceLegalActions
				builderConfig={DEFAULT_BUILDER_CONFIG}
				agentName={TRADING_AGENT_NAME}
				onAgentCleanupFailure={() => {
					toast.error(
						t`The previous wallet disconnected, but its local trading key could not be removed. Clear this site's data before reconnecting it.`,
					);
				}}
			>
				<HyperliquidOwnerSignerBridge>
					<HyperliquidAgentApprovalBridge>
						<HyperliquidLegalLifecycle />
						<MarketsProvider>{children}</MarketsProvider>
					</HyperliquidAgentApprovalBridge>
				</HyperliquidOwnerSignerBridge>
			</HyperliquidProvider>
		</HyperliquidExchangePolicyProvider>
	);
}

function HyperliquidAgentApprovalBridge({ children }: { children: ReactNode }) {
	const approval = useExplicitAgentApproval();
	return (
		<HyperliquidAgentApprovalProvider mutateAsync={approval.mutateAsync}>{children}</HyperliquidAgentApprovalProvider>
	);
}

function HyperliquidLegalLifecycle() {
	useLegalStatusLifecycle();
	return null;
}

export function ClientRootProvider({ children, queryClient }: Props) {
	const persistenceCallbacks = createQueryPersistenceCallbacks(queryClient, persister);

	return (
		<PwaInstallProvider>
			<PrivyProvider appId={PRIVY_APP_ID ?? ""} config={sessionPrivyConfig}>
				<PrivyLoginMethodObserver />
				<SmartWalletsProvider>
					<PersistQueryClientProvider
						client={queryClient}
						persistOptions={createQueryPersistenceOptions(persister)}
						onSuccess={persistenceCallbacks.onSuccess}
						onError={persistenceCallbacks.onError}
					>
						<QueryPersistenceFlush client={queryClient} />
						<WagmiProvider config={config} setActiveWalletForWagmi={selectPrivyWagmiWallet}>
							<I18nProvider i18n={i18n}>
								<BaseUiDirectionProvider>
									<HyperliquidBridge>
										<EmbeddedDepositAutoBridge />
										<CctpDepositTrackingNotifier />
										<OrderReconciliation />
										<TwapReconciliation />
										<ClientRuntimeProvider>{children}</ClientRuntimeProvider>
									</HyperliquidBridge>
								</BaseUiDirectionProvider>
							</I18nProvider>
						</WagmiProvider>
					</PersistQueryClientProvider>
				</SmartWalletsProvider>
			</PrivyProvider>
		</PwaInstallProvider>
	);
}
