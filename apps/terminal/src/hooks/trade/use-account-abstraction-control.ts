import { msg } from "@lingui/core/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { PORTFOLIO_MARGIN_FEATURES } from "@/config/portfolio-margin";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";
import { infoKey, useExchange, useHyperliquid, useHyperliquidClients } from "@/lib/hyperliquid";
import {
	type AccountAbstraction,
	isSupportedAccountAbstraction,
	type SupportedAccountAbstraction,
	useUserAbstraction,
} from "./use-account-balances";
import { useAccountModeSetupKind } from "./use-account-mode-setup";

export type SelectableAccountAbstraction = SupportedAccountAbstraction;

export function toSelectableAccountAbstraction(value: AccountAbstraction): SelectableAccountAbstraction | null {
	return isSupportedAccountAbstraction(value) ? value : null;
}

export function assertPortfolioMarginActivationAllowed(
	_currentAccountAbstraction: SelectableAccountAbstraction | null,
	nextAccountAbstraction: SelectableAccountAbstraction,
	activationEnabled = PORTFOLIO_MARGIN_FEATURES.activationEnabled,
): void {
	if (nextAccountAbstraction === "portfolioMargin" && !activationEnabled) {
		throw new LocalizedActionError(msg`Portfolio margin activation is temporarily unavailable`);
	}
}

export function useAccountAbstractionControl(resolvedAccountAbstraction: AccountAbstraction) {
	const queryClient = useQueryClient();
	const { env } = useHyperliquid();
	const { user: userExchangeClient } = useHyperliquidClients();
	const { address, hasWalletAccess } = useWalletSession();
	const { isLoading: isAccountAbstractionLoading } = useUserAbstraction(address, hasWalletAccess);
	const { mutateAsync: setAbstraction, isPending } = useExchange("userSetAbstraction");
	const accountModeSetup = useAccountModeSetupKind(resolvedAccountAbstraction, address);

	const canSet = hasWalletAccess && !!address && !!userExchangeClient;
	const currentAccountAbstraction = resolvedAccountAbstraction;
	const selectableAccountAbstraction = toSelectableAccountAbstraction(currentAccountAbstraction);

	const setAccountAbstraction = useCallback(
		async (nextAccountAbstraction: SelectableAccountAbstraction) => {
			if (!address || !canSet) {
				throw new LocalizedActionError(msg`Wallet is not ready to update account mode`);
			}
			if (currentAccountAbstraction === nextAccountAbstraction) return false;
			assertPortfolioMarginActivationAllowed(selectableAccountAbstraction, nextAccountAbstraction);

			await setAbstraction({
				user: address,
				abstraction: nextAccountAbstraction,
			});

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: infoKey("userAbstraction", { user: address }, env),
					exact: true,
				}),
				queryClient.invalidateQueries({ queryKey: ["hl", "info", "clearinghouseState"] }),
				queryClient.invalidateQueries({ queryKey: ["hl", "info", "spotClearinghouseState"] }),
			]);
			return true;
		},
		[address, canSet, currentAccountAbstraction, env, queryClient, selectableAccountAbstraction, setAbstraction],
	);

	return {
		accountAbstraction: currentAccountAbstraction,
		isLoading: isAccountAbstractionLoading,
		isUpdating: isPending,
		isAutomaticSetup: accountModeSetup === "awaiting-funds" || accountModeSetup === "pending",
		canSet,
		portfolioMarginActivationEnabled: PORTFOLIO_MARGIN_FEATURES.activationEnabled,
		setAccountAbstraction,
	};
}
