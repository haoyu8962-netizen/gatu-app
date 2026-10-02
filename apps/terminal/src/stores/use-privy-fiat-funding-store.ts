import { create } from "zustand";
import type { PrivyFiatFundingDestination, PrivyFiatFundingNetwork } from "@/domain/trade/privy-fiat-funding";

export interface PrivyFiatFundingAttempt {
	readonly destination: PrivyFiatFundingDestination;
	readonly network: PrivyFiatFundingNetwork;
	readonly ownerKey: string;
}

interface PrivyFiatFundingStore {
	attempt: PrivyFiatFundingAttempt | null;
}

const usePrivyFiatFundingStore = create<PrivyFiatFundingStore>(() => ({ attempt: null }));

export function usePrivyFiatFundingAttempt(): PrivyFiatFundingAttempt | null {
	return usePrivyFiatFundingStore((state) => state.attempt);
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
	usePrivyFiatFundingStore.setState({ attempt: null });
}
