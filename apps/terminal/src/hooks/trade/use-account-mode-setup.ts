import type { AccountModeSetupKind } from "@/domain/trade/account-mode-setup";
import {
	usePublishedAccountModeSetupKind,
	usePublishedAccountModeSetupOwner,
} from "@/stores/use-account-mode-setup-store";

/**
 * What the page-level host decided for an account whose resolved mode is `default` (ADR 0041).
 * Until the host has published its answer for this owner the account reads as pending, so the
 * unsupported-mode notices never flash for an account that is about to be set up.
 */
export function useAccountModeSetupKind(accountAbstraction: unknown, owner: string | undefined): AccountModeSetupKind {
	const publishedOwner = usePublishedAccountModeSetupOwner();
	const publishedKind = usePublishedAccountModeSetupKind();
	if (accountAbstraction !== "default" || !owner) return "not-applicable";
	return publishedOwner === owner.toLowerCase() ? publishedKind : "pending";
}
