import { infoKey } from "@hypeterminal/hl-react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { DEFAULT_BUILDER_CONFIG, PROJECT_NAME } from "@/config/hyperliquid";
import { config } from "@/config/wagmi";
import { HyperliquidProvider } from "@/lib/hyperliquid";
import { MarketsProvider } from "@/lib/hyperliquid/markets";
import { getNetwork } from "@/lib/network";
import "@/lib/i18n";

const network = getNetwork();
const env = network === "testnet" ? "Testnet" : "Mainnet";

const isServer = typeof document === "undefined";

const MARKETS_META_CACHE_KEY = "hl-markets-meta-v1";
const MARKETS_META_CACHE_TTL = 24 * 60 * 60 * 1000;

interface MarketsMetaCache {
	perpMeta: unknown;
	spotMeta: unknown;
	perpDexs: unknown;
	allPerpMetas: unknown;
	savedAt: number;
}

function loadMarketsMetaCache(): MarketsMetaCache | null {
	if (isServer) return null;
	try {
		const json = localStorage.getItem(MARKETS_META_CACHE_KEY);
		if (!json) return null;
		const data = JSON.parse(json) as MarketsMetaCache;
		if (Date.now() - data.savedAt > MARKETS_META_CACHE_TTL) {
			localStorage.removeItem(MARKETS_META_CACHE_KEY);
			return null;
		}
		return data;
	} catch {
		return null;
	}
}

export function saveMarketsMetaCache(cache: Omit<MarketsMetaCache, "savedAt">) {
	if (isServer) return;
	try {
		const data: MarketsMetaCache = { ...cache, savedAt: Date.now() };
		localStorage.setItem(MARKETS_META_CACHE_KEY, JSON.stringify(data));
	} catch {}
}

export function getRootProviderContext() {
	const queryClient = new QueryClient();

	const cached = loadMarketsMetaCache();
	if (cached) {
		const opts = { updatedAt: cached.savedAt };
		queryClient.setQueryData(infoKey("meta", {}), cached.perpMeta, opts);
		queryClient.setQueryData(infoKey("spotMeta", undefined), cached.spotMeta, opts);
		queryClient.setQueryData(infoKey("perpDexs", undefined), cached.perpDexs, opts);
		queryClient.setQueryData(infoKey("allPerpMetas", undefined), cached.allPerpMetas, opts);
	}

	return {
		queryClient,
	};
}

export function RootProvider({ children, queryClient }: { children: React.ReactNode; queryClient: QueryClient }) {
	if (isServer) {
		return (
			<QueryClientProvider client={queryClient}>
				<I18nProvider i18n={i18n}>{children}</I18nProvider>
			</QueryClientProvider>
		);
	}

	return (
		<WagmiProvider config={config}>
			<QueryClientProvider client={queryClient}>
				<I18nProvider i18n={i18n}>
					<HyperliquidProvider env={env} builderConfig={DEFAULT_BUILDER_CONFIG} agentName={PROJECT_NAME}>
						<MarketsProvider>{children}</MarketsProvider>
					</HyperliquidProvider>
				</I18nProvider>
			</QueryClientProvider>
		</WagmiProvider>
	);
}
