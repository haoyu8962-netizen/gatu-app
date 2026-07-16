import { useQueryClient } from "@tanstack/react-query";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useExchange, useHyperliquid, useHyperliquidClients } from "@/lib/hyperliquid";
import { type AccountAbstraction, useUserAbstraction } from "./use-account-balances";

export type SelectableAccountAbstraction = "disabled" | "unifiedAccount" | "portfolioMargin";

const USER_PREFERENCE_STORAGE_PREFIX = "gatu:account-mode:user-preference";

function getPreferenceStorageKey(isTestnet: boolean, address: string): string {
	return `${USER_PREFERENCE_STORAGE_PREFIX}:${isTestnet ? "testnet" : "mainnet"}:${address.toLowerCase()}`;
}

export function readAccountModePreference(
	isTestnet: boolean,
	address: string | null | undefined,
): SelectableAccountAbstraction | null {
	if (typeof window === "undefined" || !address) return null;
	try {
		const value = window.localStorage.getItem(getPreferenceStorageKey(isTestnet, address));
		return isSelectableAccountAbstraction(value) ? value : null;
	} catch {
		return null;
	}
}

function writeAccountModePreference(isTestnet: boolean, address: string, value: SelectableAccountAbstraction): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(getPreferenceStorageKey(isTestnet, address), value);
	} catch {
		// A blocked preference write should not block the account mode action.
	}
}

function isSelectableAccountAbstraction(value: unknown): value is SelectableAccountAbstraction {
	return value === "disabled" || value === "unifiedAccount" || value === "portfolioMargin";
}

export function toSelectableAccountAbstraction(value: AccountAbstraction): SelectableAccountAbstraction | null {
	return isSelectableAccountAbstraction(value) ? value : null;
}

export function useAccountAbstractionControl() {
	const queryClient = useQueryClient();
	const { isTestnet } = useHyperliquid();
	const { user: userExchangeClient } = useHyperliquidClients();
	const { address, hasWalletAccess } = useWalletSession();
	const { data: accountAbstraction, fetchStatus } = useUserAbstraction(address, hasWalletAccess, undefined);
	const setAbstraction = useExchange("userSetAbstraction");

	const canSet = hasWalletAccess && !!address && !!userExchangeClient;
	const selectedAccountAbstraction = toSelectableAccountAbstraction(accountAbstraction ?? null);

	async function setAccountAbstraction(nextAccountAbstraction: SelectableAccountAbstraction) {
		if (!address || !canSet) {
			throw new Error("Wallet is not ready to update account mode");
		}

		await setAbstraction.mutateAsync({
			user: address,
			abstraction: nextAccountAbstraction,
		});

		writeAccountModePreference(isTestnet, address, nextAccountAbstraction);
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ["hl", "userAbstraction"] }),
			queryClient.invalidateQueries({ queryKey: ["hl", "info", "clearinghouseState"] }),
			queryClient.invalidateQueries({ queryKey: ["hl", "info", "spotClearinghouseState"] }),
		]);
	}

	return {
		accountAbstraction: selectedAccountAbstraction,
		isLoading: fetchStatus === "fetching",
		isUpdating: setAbstraction.isPending,
		canSet,
		setAccountAbstraction,
	};
}
