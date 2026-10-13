import { create } from "zustand";
import type { AccountModeSetupKind } from "@/domain/trade/account-mode-setup";

interface AccountModeSetupState {
	owner: string | null;
	kind: AccountModeSetupKind;
}

const useAccountModeSetupStore = create<AccountModeSetupState>(() => ({ owner: null, kind: "not-applicable" }));

export function publishAccountModeSetup(owner: string, kind: AccountModeSetupKind): void {
	const normalizedOwner = owner.toLowerCase();
	const current = useAccountModeSetupStore.getState();
	if (current.owner === normalizedOwner && current.kind === kind) return;
	useAccountModeSetupStore.setState({ owner: normalizedOwner, kind });
}

export function clearAccountModeSetup(owner: string): void {
	if (useAccountModeSetupStore.getState().owner !== owner.toLowerCase()) return;
	useAccountModeSetupStore.setState({ owner: null, kind: "not-applicable" });
}

export const usePublishedAccountModeSetupOwner = () => useAccountModeSetupStore((state) => state.owner);
export const usePublishedAccountModeSetupKind = () => useAccountModeSetupStore((state) => state.kind);
