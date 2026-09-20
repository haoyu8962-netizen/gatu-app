import type { InfoClient } from "@nktkas/hyperliquid";
import Big from "big.js";

export type PairingFundingInfoClient = Pick<InfoClient, "clearinghouseState" | "perpDexs">;

/**
 * The SDK resolves any JSON body without checking its shape, so a resolved request is not yet a
 * usable snapshot. A missing field or an amount that is not a decimal string is unknown, never zero.
 */
export class AccountFundingSnapshotError extends Error {
	constructor(scope: string) {
		super(`Hyperliquid returned an incomplete ${scope} snapshot.`);
		this.name = "AccountFundingSnapshotError";
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readAmount(value: unknown, scope: string): Big {
	if (typeof value !== "string") throw new AccountFundingSnapshotError(scope);
	try {
		return Big(value);
	} catch {
		throw new AccountFundingSnapshotError(scope);
	}
}

export function hasPerpAccountFunding(state: unknown): boolean {
	const scope = "perpetuals account";
	if (!isRecord(state) || !isRecord(state.marginSummary) || !Array.isArray(state.assetPositions)) {
		throw new AccountFundingSnapshotError(scope);
	}
	const amounts = [
		readAmount(state.marginSummary.accountValue, scope),
		readAmount(state.marginSummary.totalRawUsd, scope),
		readAmount(state.marginSummary.totalNtlPos, scope),
		readAmount(state.withdrawable, scope),
	];
	return state.assetPositions.length > 0 || amounts.some((amount) => !amount.eq(0));
}

export function hasSpotAccountFunding(state: unknown): boolean {
	const scope = "spot account";
	if (!isRecord(state) || !Array.isArray(state.balances)) throw new AccountFundingSnapshotError(scope);
	const balances = state.balances.map((balance: unknown) => {
		if (!isRecord(balance)) throw new AccountFundingSnapshotError(scope);
		return [readAmount(balance.total, scope), readAmount(balance.hold, scope)];
	});
	return balances.some(([total, hold]) => total.gt(0) || hold.gt(0));
}

function readBuilderDexNames(dexs: unknown): string[] {
	const scope = "perp dex list";
	if (!Array.isArray(dexs)) throw new AccountFundingSnapshotError(scope);
	const names = dexs.flatMap((dex: unknown) => {
		if (dex === null) return [];
		if (!isRecord(dex) || typeof dex.name !== "string" || dex.name === "") throw new AccountFundingSnapshotError(scope);
		return [dex.name];
	});
	return [...new Set(names)];
}

/**
 * An owner can hold its whole balance on a builder dex while the default dex and spot are empty.
 * Every named dex is read before the account is called unfunded, and a failed dex list, a failed
 * dex request or an unusable dex snapshot rejects instead of counting as empty: an incomplete read
 * is not an empty account.
 */
export async function hasBuilderDexAccountFunding(
	info: PairingFundingInfoClient,
	user: `0x${string}`,
	signal?: AbortSignal,
): Promise<boolean> {
	const builderDexNames = readBuilderDexNames(await info.perpDexs(signal));
	const states = await Promise.all(builderDexNames.map((dex) => info.clearinghouseState({ user, dex }, signal)));
	return states.map(hasPerpAccountFunding).some(Boolean);
}
