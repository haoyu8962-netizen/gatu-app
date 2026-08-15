import Big from "big.js";
import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { STORAGE_KEYS } from "@/config/app";
import {
	defaultNumberFormatLocale,
	type NumberFormatLocale,
	normalizeNumberFormatLocale,
	resolveNumberFormatLocale,
} from "@/config/i18n";
import {
	DEFAULT_MARKET_ORDER_SLIPPAGE_PERCENT,
	MARKET_ORDER_SLIPPAGE_MAX_PERCENT,
	MARKET_ORDER_SLIPPAGE_MIN_PERCENT,
} from "@/config/trade";
import { getNetwork, type Network, subscribeNetworkStorage, switchNetwork } from "@/lib/network";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import { createValidatedStorage } from "@/lib/storage/validated-storage";
import type { MarginMode } from "@/lib/trade/margin-mode";

type Theme = "dark" | "light";

const globalSettingsSchema = z.object({
	state: z.object({
		hideSmallBalances: z.boolean().optional(),
		showOrderbookInQuote: z.boolean().optional(),
		showChartScanlines: z.boolean().optional(),
		skipOrderConfirmation: z.boolean().optional(),
		numberFormatLocale: z.string().optional(),
		marketOrderSlippagePercent: z.number().optional(),
		marginMode: z.enum(["cross", "isolated"]).optional(),
		positionsActiveTab: z.string().optional(),
		mobileActiveTab: z.string().optional(),
		theme: z.enum(["dark", "light"]).optional(),
		network: z.enum(["mainnet", "testnet"]).optional(),
	}),
});

const validatedStorage = createValidatedStorage(globalSettingsSchema, "global settings");

const DEFAULT_GLOBAL_SETTINGS = {
	hideSmallBalances: true,
	showOrderbookInQuote: false,
	showChartScanlines: false,
	skipOrderConfirmation: false,
	numberFormatLocale: defaultNumberFormatLocale,
	marketOrderSlippagePercent: DEFAULT_MARKET_ORDER_SLIPPAGE_PERCENT,
	marginMode: "cross" as MarginMode,
	positionsActiveTab: "positions",
	mobileActiveTab: "trade",
	theme: "dark" as Theme,
	network: getNetwork(),
} as const;

interface GlobalSettingsStore {
	hideSmallBalances: boolean;
	showOrderbookInQuote: boolean;
	showChartScanlines: boolean;
	skipOrderConfirmation: boolean;
	numberFormatLocale: NumberFormatLocale;
	marketOrderSlippagePercent: number;
	marginMode: MarginMode;
	positionsActiveTab: string;
	mobileActiveTab: string;
	theme: Theme;
	network: Network;
	actions: {
		setHideSmallBalances: (next: boolean) => void;
		setShowOrderbookInQuote: (next: boolean) => void;
		setShowChartScanlines: (next: boolean) => void;
		setSkipOrderConfirmation: (next: boolean) => void;
		setNumberFormatLocale: (next: NumberFormatLocale) => void;
		setMarketOrderSlippagePercent: (percent: number) => void;
		setMarginMode: (mode: MarginMode) => void;
		setPositionsActiveTab: (tab: string) => void;
		setMobileActiveTab: (tab: string) => void;
		setTheme: (theme: Theme) => void;
		setNetwork: (network: Network) => void;
	};
}

const useGlobalSettingsStore = create<GlobalSettingsStore>()(
	persist(
		(set, get) => ({
			...DEFAULT_GLOBAL_SETTINGS,
			actions: {
				setHideSmallBalances: (next) => set({ hideSmallBalances: next }),
				setShowOrderbookInQuote: (next) => set({ showOrderbookInQuote: next }),
				setShowChartScanlines: (next) => set({ showChartScanlines: next }),
				setSkipOrderConfirmation: (next) => set({ skipOrderConfirmation: next }),
				setNumberFormatLocale: (next) => set({ numberFormatLocale: next }),
				setMarketOrderSlippagePercent: (percent) => {
					const next = Math.min(
						Math.max(percent, MARKET_ORDER_SLIPPAGE_MIN_PERCENT),
						MARKET_ORDER_SLIPPAGE_MAX_PERCENT,
					);
					if (get().marketOrderSlippagePercent === next) return;
					set({ marketOrderSlippagePercent: next });
				},
				setMarginMode: (mode) => set({ marginMode: mode }),
				setPositionsActiveTab: (tab) => set({ positionsActiveTab: tab }),
				setMobileActiveTab: (tab) => set({ mobileActiveTab: tab }),
				setTheme: (theme) => set({ theme }),
				setNetwork: (network) => {
					const result = switchNetwork(network);
					if (result !== "persisted") return;
					set({ network });
					if (typeof window !== "undefined") window.location.reload();
				},
			},
		}),
		{
			name: STORAGE_KEYS.GLOBAL_SETTINGS,
			version: 4,
			storage: createJSONStorage(() => validatedStorage),
			partialize: (state) => ({
				hideSmallBalances: state.hideSmallBalances,
				showOrderbookInQuote: state.showOrderbookInQuote,
				showChartScanlines: state.showChartScanlines,
				skipOrderConfirmation: state.skipOrderConfirmation,
				...(state.numberFormatLocale === defaultNumberFormatLocale
					? {}
					: { numberFormatLocale: state.numberFormatLocale }),
				marketOrderSlippagePercent: state.marketOrderSlippagePercent,
				marginMode: state.marginMode,
				positionsActiveTab: state.positionsActiveTab,
				mobileActiveTab: state.mobileActiveTab,
				theme: state.theme,
			}),
			migrate: (persisted) => {
				const state = persisted as Partial<GlobalSettingsStore>;
				return {
					...state,
					numberFormatLocale: normalizeNumberFormatLocale(state.numberFormatLocale),
				};
			},
			merge: (persisted, current) => {
				const p = persisted as Partial<GlobalSettingsStore>;
				const showOrderbookInQuote =
					typeof p.showOrderbookInQuote === "boolean"
						? p.showOrderbookInQuote
						: DEFAULT_GLOBAL_SETTINGS.showOrderbookInQuote;
				const skipOrderConfirmation =
					typeof p.skipOrderConfirmation === "boolean"
						? p.skipOrderConfirmation
						: DEFAULT_GLOBAL_SETTINGS.skipOrderConfirmation;
				const slippagePercent = Math.min(
					Math.max(
						p?.marketOrderSlippagePercent ?? DEFAULT_MARKET_ORDER_SLIPPAGE_PERCENT,
						MARKET_ORDER_SLIPPAGE_MIN_PERCENT,
					),
					MARKET_ORDER_SLIPPAGE_MAX_PERCENT,
				);
				return {
					...current,
					...DEFAULT_GLOBAL_SETTINGS,
					...p,
					numberFormatLocale: normalizeNumberFormatLocale(p.numberFormatLocale),
					showOrderbookInQuote,
					skipOrderConfirmation,
					marketOrderSlippagePercent: slippagePercent,
					marginMode: p?.marginMode === "isolated" ? "isolated" : "cross",
					theme: p?.theme === "light" ? "light" : "dark",
					network: getNetwork(),
				};
			},
		},
	),
);

// Keeps <html class> in sync with the persisted theme, re-asserting past any document-shell
// re-render (React re-acquiring the <html> singleton writes back the SSR default) via a
// MutationObserver. The idempotent `contains` guard makes it settle in one pass.
function applyThemeClass(theme: Theme) {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	const other = theme === "dark" ? "light" : "dark";
	if (root.classList.contains(theme) && !root.classList.contains(other)) return;
	root.classList.remove("light", "dark");
	root.classList.add(theme);
}

function syncDocumentTheme() {
	applyThemeClass(useGlobalSettingsStore.getState().theme);
}

const globalScope = globalThis as { __gatuThemeDocSync?: boolean };
if (typeof document !== "undefined" && !globalScope.__gatuThemeDocSync) {
	globalScope.__gatuThemeDocSync = true;
	syncDocumentTheme();
	new MutationObserver(syncDocumentTheme).observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class"],
	});
}

useGlobalSettingsStore.subscribe((state, prev) => {
	if (state.theme !== prev.theme) applyThemeClass(state.theme);
	if (state.numberFormatLocale !== prev.numberFormatLocale) notifyNumberFormatChange();
});

subscribeNetworkStorage((network) => {
	if (useGlobalSettingsStore.getState().network === network) return;
	useGlobalSettingsStore.setState({ network });
	window.location.reload();
});

export function useTheme() {
	return useGlobalSettingsStore((state) => state.theme);
}

export function useSetTheme() {
	return useGlobalSettingsStore((state) => state.actions.setTheme);
}

export function useGlobalSettings() {
	return useGlobalSettingsStore(
		useShallow((state) => ({
			hideSmallBalances: state.hideSmallBalances,
			showOrderbookInQuote: state.showOrderbookInQuote,
			showChartScanlines: state.showChartScanlines,
			numberFormatLocale: state.numberFormatLocale,
		})),
	);
}

export function useGlobalSettingsActions() {
	return useGlobalSettingsStore((state) => state.actions);
}

export function useMarketOrderSlippagePercent() {
	return useGlobalSettingsStore((state) => state.marketOrderSlippagePercent);
}

export function marketOrderSlippagePercentToBpsString(percent: number): string {
	return Big(String(percent)).times(100).toString();
}

export function useMarketOrderSlippageBpsString(): string {
	return useGlobalSettingsStore((state) => marketOrderSlippagePercentToBpsString(state.marketOrderSlippagePercent));
}

export function useMarketOrderSlippageBps() {
	return Number(useMarketOrderSlippageBpsString());
}

export function useSkipOrderConfirmation() {
	return useGlobalSettingsStore((state) => state.skipOrderConfirmation);
}

export function getSkipOrderConfirmation(): boolean {
	return useGlobalSettingsStore.getState().skipOrderConfirmation;
}

export function useMarginMode() {
	return useGlobalSettingsStore((state) => state.marginMode);
}

export function getResolvedFormatLocale(): string {
	return resolveNumberFormatLocale(useGlobalSettingsStore.getState().numberFormatLocale);
}

export function getNumberFormatLocale(): NumberFormatLocale {
	return useGlobalSettingsStore.getState().numberFormatLocale;
}

export function useHideSmallBalances() {
	return useGlobalSettingsStore((state) => state.hideSmallBalances);
}

export function usePositionsActiveTab() {
	return useGlobalSettingsStore((state) => state.positionsActiveTab);
}

export function useMobileActiveTab() {
	return useGlobalSettingsStore((state) => state.mobileActiveTab);
}

export function useNetwork() {
	return useGlobalSettingsStore((state) => state.network);
}

export function useIsTestnet() {
	return useGlobalSettingsStore((state) => state.network === "testnet");
}
