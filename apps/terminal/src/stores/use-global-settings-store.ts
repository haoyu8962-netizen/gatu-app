import Big from "big.js";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
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
import { applyThemeColor } from "@/lib/theme-color";
import type { MarginMode } from "@/lib/trade/margin-mode";
import { z } from "@/lib/zod";

type Theme = "dark" | "light";

const THEME_TRANSITION_GUARD_ATTRIBUTE = "data-theme-transition";
let themeTransitionReleaseFrame: number | undefined;

const globalSettingsSchema = z.object({
	state: z.object({
		hideSmallBalances: z.boolean().optional(),
		animateOrderbook: z.boolean().optional(),
		showChartScanlines: z.boolean().optional(),
		skipOrderConfirmation: z.boolean().optional(),
		transactionDelayProtection: z.boolean().optional(),
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
	animateOrderbook: true,
	showChartScanlines: false,
	skipOrderConfirmation: false,
	transactionDelayProtection: true,
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
	animateOrderbook: boolean;
	showChartScanlines: boolean;
	skipOrderConfirmation: boolean;
	transactionDelayProtection: boolean;
	numberFormatLocale: NumberFormatLocale;
	marketOrderSlippagePercent: number;
	marginMode: MarginMode;
	positionsActiveTab: string;
	mobileActiveTab: string;
	theme: Theme;
	network: Network;
	actions: {
		setHideSmallBalances: (next: boolean) => void;
		setAnimateOrderbook: (next: boolean) => void;
		setShowChartScanlines: (next: boolean) => void;
		setSkipOrderConfirmation: (next: boolean) => void;
		setTransactionDelayProtection: (next: boolean) => void;
		setNumberFormatLocale: (next: NumberFormatLocale) => void;
		setMarketOrderSlippagePercent: (percent: number) => number;
		setMarginMode: (mode: MarginMode) => void;
		setPositionsActiveTab: (tab: string) => void;
		setMobileActiveTab: (tab: string) => void;
		setTheme: (theme: Theme) => void;
		setNetwork: (network: Network) => void;
	};
}

const GLOBAL_SETTINGS_VERSION = 4;

type PersistedGlobalSettings = Partial<Omit<GlobalSettingsStore, "actions" | "network">>;

// Settings every window shares live. The two active-tab fields stay per window: another window's
// tab choice is kept in storage but never moves the tab this window is showing.
const SHARED_SETTING_KEYS = [
	"hideSmallBalances",
	"animateOrderbook",
	"showChartScanlines",
	"skipOrderConfirmation",
	"transactionDelayProtection",
	"numberFormatLocale",
	"marketOrderSlippagePercent",
	"marginMode",
	"theme",
] as const satisfies readonly (keyof PersistedGlobalSettings)[];

function partializeGlobalSettings(state: GlobalSettingsStore): PersistedGlobalSettings {
	return {
		hideSmallBalances: state.hideSmallBalances,
		animateOrderbook: state.animateOrderbook,
		showChartScanlines: state.showChartScanlines,
		skipOrderConfirmation: state.skipOrderConfirmation,
		transactionDelayProtection: state.transactionDelayProtection,
		...(state.numberFormatLocale === defaultNumberFormatLocale ? {} : { numberFormatLocale: state.numberFormatLocale }),
		marketOrderSlippagePercent: state.marketOrderSlippagePercent,
		marginMode: state.marginMode,
		positionsActiveTab: state.positionsActiveTab,
		mobileActiveTab: state.mobileActiveTab,
		theme: state.theme,
	};
}

function migrateGlobalSettings(persisted: unknown): PersistedGlobalSettings {
	const state = persisted as Partial<GlobalSettingsStore>;
	return {
		...state,
		numberFormatLocale: normalizeNumberFormatLocale(state.numberFormatLocale),
	};
}

function mergeGlobalSettings(persisted: unknown, current: GlobalSettingsStore): GlobalSettingsStore {
	const p = (persisted ?? {}) as Partial<GlobalSettingsStore>;
	const skipOrderConfirmation =
		typeof p.skipOrderConfirmation === "boolean"
			? p.skipOrderConfirmation
			: DEFAULT_GLOBAL_SETTINGS.skipOrderConfirmation;
	const slippagePercent = Math.min(
		Math.max(p.marketOrderSlippagePercent ?? DEFAULT_MARKET_ORDER_SLIPPAGE_PERCENT, MARKET_ORDER_SLIPPAGE_MIN_PERCENT),
		MARKET_ORDER_SLIPPAGE_MAX_PERCENT,
	);
	return {
		...current,
		...DEFAULT_GLOBAL_SETTINGS,
		...p,
		numberFormatLocale: normalizeNumberFormatLocale(p.numberFormatLocale),
		animateOrderbook:
			typeof p.animateOrderbook === "boolean" ? p.animateOrderbook : DEFAULT_GLOBAL_SETTINGS.animateOrderbook,
		skipOrderConfirmation,
		transactionDelayProtection:
			typeof p.transactionDelayProtection === "boolean"
				? p.transactionDelayProtection
				: DEFAULT_GLOBAL_SETTINGS.transactionDelayProtection,
		marketOrderSlippagePercent: slippagePercent,
		marginMode: p.marginMode === "isolated" ? "isolated" : "cross",
		theme: p.theme === "light" ? "light" : "dark",
		network: getNetwork(),
	};
}

// What this window last agreed with storage, as persisted fields of its own memory. A write sends
// only the fields that differ from it, on top of whatever another window stored meanwhile.
let lastSyncedSettings: PersistedGlobalSettings | null = null;
let applyingStoredSettings = false;

function readStoredSettings(): PersistedGlobalSettings | null {
	const raw = validatedStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS);
	if (typeof raw !== "string") return null;
	const stored = JSON.parse(raw) as { state: unknown; version?: unknown };
	if (typeof stored.version !== "number" || stored.version === GLOBAL_SETTINGS_VERSION) {
		return stored.state as PersistedGlobalSettings;
	}
	if (stored.version > GLOBAL_SETTINGS_VERSION) return null;
	return migrateGlobalSettings(stored.state);
}

function applySharedSettings(next: GlobalSettingsStore) {
	const current = useGlobalSettingsStore.getState();
	const update: Partial<Record<(typeof SHARED_SETTING_KEYS)[number], unknown>> = {};
	for (const key of SHARED_SETTING_KEYS) {
		if (!Object.is(current[key], next[key])) update[key] = next[key];
	}
	if (Object.keys(update).length > 0) {
		applyingStoredSettings = true;
		try {
			useGlobalSettingsStore.setState(update as Partial<GlobalSettingsStore>);
		} finally {
			applyingStoredSettings = false;
		}
	}
	lastSyncedSettings = partializeGlobalSettings(useGlobalSettingsStore.getState());
}

function combineWithStoredSettings(outgoing: PersistedGlobalSettings): GlobalSettingsStore | null {
	const previous = lastSyncedSettings as Record<string, unknown> | null;
	if (!previous) return null;
	const stored = readStoredSettings();
	if (!stored) return null;
	const changes = outgoing as Record<string, unknown>;
	const combined: Record<string, unknown> = { ...stored };
	for (const key of new Set([...Object.keys(previous), ...Object.keys(changes)])) {
		if (Object.is(previous[key], changes[key])) continue;
		if (key in changes) combined[key] = changes[key];
		else delete combined[key];
	}
	return mergeGlobalSettings(combined, useGlobalSettingsStore.getState());
}

const crossWindowSettingsStorage: StateStorage = {
	getItem: (name) => validatedStorage.getItem(name),
	setItem: (name, value) => {
		if (applyingStoredSettings) return;
		const outgoing = JSON.parse(value) as { state: PersistedGlobalSettings; version: number };
		const combined = combineWithStoredSettings(outgoing.state);
		if (!combined) {
			validatedStorage.setItem(name, value);
			lastSyncedSettings = outgoing.state;
			return;
		}
		validatedStorage.setItem(
			name,
			JSON.stringify({ state: partializeGlobalSettings(combined), version: outgoing.version }),
		);
		applySharedSettings(combined);
	},
	removeItem: (name) => validatedStorage.removeItem(name),
};

function syncStoredSettings() {
	const stored = readStoredSettings();
	if (!stored) return;
	applySharedSettings(mergeGlobalSettings(stored, useGlobalSettingsStore.getState()));
}

const useGlobalSettingsStore = create<GlobalSettingsStore>()(
	persist(
		(set, get) => ({
			...DEFAULT_GLOBAL_SETTINGS,
			actions: {
				setHideSmallBalances: (next) => set({ hideSmallBalances: next }),
				setAnimateOrderbook: (next) => set({ animateOrderbook: next }),
				setShowChartScanlines: (next) => set({ showChartScanlines: next }),
				setSkipOrderConfirmation: (next) => set({ skipOrderConfirmation: next }),
				setTransactionDelayProtection: (next) => set({ transactionDelayProtection: next }),
				setNumberFormatLocale: (next) => set({ numberFormatLocale: next }),
				setMarketOrderSlippagePercent: (percent) => {
					const current = get().marketOrderSlippagePercent;
					if (!Number.isFinite(percent)) return current;
					const next = Math.min(
						Math.max(percent, MARKET_ORDER_SLIPPAGE_MIN_PERCENT),
						MARKET_ORDER_SLIPPAGE_MAX_PERCENT,
					);
					if (current === next) return next;
					set({ marketOrderSlippagePercent: next });
					return next;
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
			version: GLOBAL_SETTINGS_VERSION,
			storage: createJSONStorage(() => crossWindowSettingsStorage),
			partialize: partializeGlobalSettings,
			migrate: migrateGlobalSettings,
			merge: mergeGlobalSettings,
			onRehydrateStorage: () => (state) => {
				if (state) lastSyncedSettings = partializeGlobalSettings(state);
			},
		},
	),
);

if (typeof window !== "undefined") {
	window.addEventListener("storage", (event) => {
		if (event.key !== STORAGE_KEYS.GLOBAL_SETTINGS || event.newValue === null) return;
		if (event.storageArea && event.storageArea !== window.localStorage) return;
		syncStoredSettings();
	});
	// A page restored from the back/forward cache missed every storage event while it was frozen.
	window.addEventListener("pageshow", (event) => {
		if (event.persisted) syncStoredSettings();
	});
}

function suppressThemeTransitions(root: HTMLElement) {
	root.setAttribute(THEME_TRANSITION_GUARD_ATTRIBUTE, "");
	const view = root.ownerDocument.defaultView;
	if (!view || typeof view.requestAnimationFrame !== "function") {
		root.removeAttribute(THEME_TRANSITION_GUARD_ATTRIBUTE);
		return;
	}

	if (themeTransitionReleaseFrame !== undefined) {
		view.cancelAnimationFrame(themeTransitionReleaseFrame);
	}
	themeTransitionReleaseFrame = view.requestAnimationFrame(() => {
		themeTransitionReleaseFrame = view.requestAnimationFrame(() => {
			root.removeAttribute(THEME_TRANSITION_GUARD_ATTRIBUTE);
			themeTransitionReleaseFrame = undefined;
		});
	});
}

// Keeps <html class> and the theme-color meta in sync with the persisted theme, re-asserting past
// any document-shell re-render (React re-acquiring the <html> singleton writes back the SSR
// default) via a MutationObserver. The idempotent `contains` guard makes it settle in one pass; the
// meta is synced before that guard because a re-rendered head can bring back a stale value.
function applyThemeClass(theme: Theme, suppressTransitions = false) {
	if (typeof document === "undefined") return;
	applyThemeColor(theme);
	const root = document.documentElement;
	const other = theme === "dark" ? "light" : "dark";
	if (root.classList.contains(theme) && !root.classList.contains(other)) return;
	if (suppressTransitions) suppressThemeTransitions(root);
	root.classList.remove("light", "dark");
	root.classList.add(theme);
}

function syncDocumentTheme() {
	applyThemeClass(useGlobalSettingsStore.getState().theme);
}

const globalScope = globalThis as { __sairnThemeDocSync?: boolean };
if (typeof document !== "undefined" && !globalScope.__sairnThemeDocSync) {
	globalScope.__sairnThemeDocSync = true;
	syncDocumentTheme();
	new MutationObserver(() => applyThemeClass(useGlobalSettingsStore.getState().theme, true)).observe(
		document.documentElement,
		{
			attributes: true,
			attributeFilter: ["class"],
		},
	);
}

useGlobalSettingsStore.subscribe((state, prev) => {
	if (state.theme !== prev.theme) applyThemeClass(state.theme, true);
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

export function useNumberFormatLocale() {
	return useGlobalSettingsStore((state) => state.numberFormatLocale);
}

export function useSetTheme() {
	return useGlobalSettingsStore((state) => state.actions.setTheme);
}

export function useGlobalSettings() {
	return useGlobalSettingsStore(
		useShallow((state) => ({
			hideSmallBalances: state.hideSmallBalances,
			showChartScanlines: state.showChartScanlines,
			numberFormatLocale: state.numberFormatLocale,
		})),
	);
}

export function useGlobalSettingsActions() {
	return useGlobalSettingsStore((state) => state.actions);
}

export function useAnimateOrderbook() {
	return useGlobalSettingsStore((state) => state.animateOrderbook);
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

export function useTransactionDelayProtection() {
	return useGlobalSettingsStore((state) => state.transactionDelayProtection);
}

export function getTransactionDelayProtection(): boolean {
	return useGlobalSettingsStore.getState().transactionDelayProtection;
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

export function getPositionsActiveTab(): string {
	return useGlobalSettingsStore.getState().positionsActiveTab;
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
