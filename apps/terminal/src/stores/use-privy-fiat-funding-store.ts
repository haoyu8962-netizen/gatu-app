import type { ComponentType } from "react";
import { create } from "zustand";
import type { PrivyFiatFundingDestination, PrivyFiatFundingNetwork } from "@/domain/trade/privy-fiat-funding";
import type { PrivyFiatFundingNotice } from "@/lib/trade/privy-fiat-funding-feedback";

export interface PrivyFiatFundingAttempt {
	readonly destination: PrivyFiatFundingDestination;
	readonly network: PrivyFiatFundingNetwork;
	readonly ownerKey: string;
}

interface PrivyFiatFundingStore {
	attempt: PrivyFiatFundingAttempt | null;
	started: PrivyFiatFundingAttempt | null;
	Host: ComponentType | null;
	notices: readonly PrivyFiatFundingNotice[];
}

const INITIAL_STATE: PrivyFiatFundingStore = { attempt: null, started: null, Host: null, notices: [] };

const usePrivyFiatFundingStore = create<PrivyFiatFundingStore>(() => INITIAL_STATE);

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

/**
 * Claims the current attempt for the host that is about to open Privy. It answers true once per
 * attempt, whichever host instance asks, so an effect replay or a host that mounts again while the
 * purchase is open cannot open a second window.
 */
export function startPrivyFiatFunding(attempt: PrivyFiatFundingAttempt): boolean {
	if (!isCurrentPrivyFiatFundingAttempt(attempt) || usePrivyFiatFundingStore.getState().started === attempt) {
		return false;
	}
	usePrivyFiatFundingStore.setState({ started: attempt });
	return true;
}

export function finishPrivyFiatFunding(attempt: PrivyFiatFundingAttempt): void {
	if (isCurrentPrivyFiatFundingAttempt(attempt)) usePrivyFiatFundingStore.setState({ attempt: null });
}

/** What finished purchases still have to tell their owners. In memory only: a reload starts empty. */
export function usePrivyFiatFundingNotices(): readonly PrivyFiatFundingNotice[] {
	return usePrivyFiatFundingStore((state) => state.notices);
}

export function addPrivyFiatFundingNotice(notice: PrivyFiatFundingNotice): void {
	usePrivyFiatFundingStore.setState((state) => ({ notices: [...state.notices, notice] }));
}

export function removePrivyFiatFundingNotice(notice: PrivyFiatFundingNotice): void {
	usePrivyFiatFundingStore.setState((state) => ({ notices: state.notices.filter((kept) => kept !== notice) }));
}

/** @internal — exported only for deterministic tests. */
export function resetPrivyFiatFundingStore(): void {
	usePrivyFiatFundingStore.setState(INITIAL_STATE);
}
