import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useExchange, useHyperliquid, useHyperliquidClients } from "@/lib/hyperliquid";
import { readAccountModePreference } from "./use-account-abstraction-control";
import { useUserAbstraction } from "./use-account-balances";

const TARGET_ABSTRACTION = "unifiedAccount";
const AUTO_SET_STORAGE_PREFIX = "gatu:auto-unified-account";
const FAILED_ATTEMPT_COOLDOWN_MS = 2 * 60 * 1000;

function getStorageKey(isTestnet: boolean, address: string): string {
	return `${AUTO_SET_STORAGE_PREFIX}:${isTestnet ? "testnet" : "mainnet"}:${address.toLowerCase()}`;
}

function readStorage(key: string): string | null {
	if (typeof window === "undefined") return null;
	try {
		return window.sessionStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStorage(key: string, value: string): void {
	if (typeof window === "undefined") return;
	try {
		window.sessionStorage.setItem(key, value);
	} catch {
		// A blocked storage write should not prevent the user from signing the action.
	}
}

function shouldSkipAfterFailure(value: string | null): boolean {
	if (!value?.startsWith("failed:")) return false;

	const timestamp = Number(value.slice("failed:".length));
	return Number.isFinite(timestamp) && Date.now() - timestamp < FAILED_ATTEMPT_COOLDOWN_MS;
}

export function useDefaultUnifiedAccount() {
	const queryClient = useQueryClient();
	const { isTestnet } = useHyperliquid();
	const { user: userExchangeClient } = useHyperliquidClients();
	const { address, hasWalletAccess } = useWalletSession();
	const { data: accountAbstraction, status } = useUserAbstraction(address, hasWalletAccess, undefined);
	const setAbstraction = useExchange("userSetAbstraction");
	const inFlightRef = useRef(false);

	useEffect(() => {
		if (!hasWalletAccess || !address || !userExchangeClient) return;
		if (status !== "success") return;
		if (accountAbstraction === TARGET_ABSTRACTION || accountAbstraction === "portfolioMargin") return;
		if (setAbstraction.isPending || inFlightRef.current) return;
		const userPreference = readAccountModePreference(isTestnet, address);
		if (userPreference && userPreference !== TARGET_ABSTRACTION) return;

		const storageKey = getStorageKey(isTestnet, address);
		if (shouldSkipAfterFailure(readStorage(storageKey))) return;

		inFlightRef.current = true;
		void setAbstraction
			.mutateAsync({
				user: address,
				abstraction: TARGET_ABSTRACTION,
			})
			.then(() => {
				void queryClient.invalidateQueries({ queryKey: ["hl", "userAbstraction"] });
				void queryClient.invalidateQueries({ queryKey: ["hl", "info", "clearinghouseState"] });
			})
			.catch(() => {
				writeStorage(storageKey, `failed:${Date.now()}`);
			})
			.finally(() => {
				inFlightRef.current = false;
			});
	}, [
		accountAbstraction,
		address,
		hasWalletAccess,
		isTestnet,
		queryClient,
		setAbstraction,
		status,
		userExchangeClient,
	]);
}
