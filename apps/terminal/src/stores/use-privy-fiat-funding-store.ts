import type { ComponentType } from "react";
import { create } from "zustand";
import type { PrivyFiatFundingDestination, PrivyFiatFundingNetwork } from "@/domain/trade/privy-fiat-funding";

export interface PrivyFiatFundingAttempt {
	readonly destination: PrivyFiatFundingDestination;
	readonly network: PrivyFiatFundingNetwork;
	readonly ownerKey: string;
}

interface PrivyFiatFundingStore {
	attempt: PrivyFiatFundingAttempt | null;
	Host: ComponentType | null;
}

const usePrivyFiatFundingStore = create<PrivyFiatFundingStore>(() => ({ attempt: null, Host: null }));

export function usePrivyFiatFundingAttempt(): PrivyFiatFundingAttempt | null {
	return usePrivyFiatFundingStore((state) => state.attempt);
}

/** The purchase host once its chunk has loaded; the page-level gate renders it and keeps it mounted. */
export function usePrivyFiatFundingHost(): ComponentType | null {
	return usePrivyFiatFundingStore((state) => state.Host);
}

export function readPrivyFiatFundingHost(): ComponentType | null {
	return usePrivyFiatFundingStore.getState().Host;
}

export function mountPrivyFiatFundingHost(Host: ComponentType): void {
	usePrivyFiatFundingStore.setState({ Host });
}

export function requestPrivyFiatFunding(attempt: PrivyFiatFundingAttempt): boolean {
	if (readPrivyFiatFundingAttempt()) return false;
	usePrivyFiatFundingStore.setState({ attempt });
	return true;
}

export function readPrivyFiatFundingAttempt(): PrivyFiatFundingAttempt | null {
	return usePrivyFiatFundingStore.getState().attempt;
}

export function isCurrentPrivyFiatFundingAttempt(attempt: PrivyFiatFundingAttempt): boolean {
	return readPrivyFiatFundingAttempt() === attempt;
}

export function finishPrivyFiatFunding(attempt: PrivyFiatFundingAttempt): void {
	if (isCurrentPrivyFiatFundingAttempt(attempt)) usePrivyFiatFundingStore.setState({ attempt: null });
}

/** @internal — exported only for deterministic tests. */
export function resetPrivyFiatFundingStore(): void {
	usePrivyFiatFundingStore.setState({ attempt: null, Host: null });
}
