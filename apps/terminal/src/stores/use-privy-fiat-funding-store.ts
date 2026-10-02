import { create } from "zustand";
import type { PrivyFiatFundingDestination, PrivyFiatFundingNetwork } from "@/domain/trade/privy-fiat-funding";

export interface PrivyFiatFundingAttempt {
	readonly destination: PrivyFiatFundingDestination;
	readonly network: PrivyFiatFundingNetwork;
	readonly ownerKey: string;
}

interface PrivyFiatFundingStore {
	attempt: PrivyFiatFundingAttempt | null;
	hostWarmed: boolean;
}

const usePrivyFiatFundingStore = create<PrivyFiatFundingStore>(() => ({ attempt: null, hostWarmed: false }));

export function usePrivyFiatFundingAttempt(): PrivyFiatFundingAttempt | null {
	return usePrivyFiatFundingStore((state) => state.attempt);
}

/**
 * Whether the page-level host should be loaded: a purchase was requested, or its entry is on screen
 * and was warmed so the request does not wait for the download.
 */
export function usePrivyFiatFundingHostWanted(): boolean {
	return usePrivyFiatFundingStore((state) => state.hostWarmed || state.attempt !== null);
}

export function warmPrivyFiatFundingHost(): void {
	usePrivyFiatFundingStore.setState({ hostWarmed: true });
}

export function forgetPrivyFiatFundingHostWarmUp(): void {
	usePrivyFiatFundingStore.setState({ hostWarmed: false });
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
	usePrivyFiatFundingStore.setState({ attempt: null, hostWarmed: false });
}
