import type { InfoClient } from "@nktkas/hyperliquid";
import Big from "big.js";

interface PerpFundingSnapshot {
	assetPositions?: readonly unknown[];
	marginSummary?: { accountValue?: string; totalNtlPos?: string; totalRawUsd?: string };
	withdrawable?: string;
}

interface SpotFundingSnapshot {
	balances?: readonly { hold?: string; total?: string }[];
}

export type PairingFundingInfoClient = Pick<InfoClient, "clearinghouseState" | "perpDexs">;

function isNonZero(value: string | undefined): boolean {
	if (!value) return false;
	try {
		return !Big(value).eq(0);
	} catch {
		return false;
	}
}

function isPositive(value: string | undefined): boolean {
	if (!value) return false;
	try {
		return Big(value).gt(0);
	} catch {
		return false;
	}
}

export function hasPerpAccountFunding(state: PerpFundingSnapshot | undefined): boolean {
	return (
		isNonZero(state?.marginSummary?.accountValue) ||
		isNonZero(state?.marginSummary?.totalRawUsd) ||
		isNonZero(state?.marginSummary?.totalNtlPos) ||
		isNonZero(state?.withdrawable) ||
		(state?.assetPositions?.length ?? 0) > 0
	);
}

export function hasSpotAccountFunding(state: SpotFundingSnapshot | undefined): boolean {
	return (state?.balances ?? []).some((balance) => isPositive(balance.total) || isPositive(balance.hold));
}

/**
 * An owner can hold its whole balance on a builder dex while the default dex and spot are empty.
 * Every named dex is read before the account is called unfunded, and a failed dex list or a failed
 * dex snapshot rejects instead of counting as empty: an incomplete read is not an empty account.
 */
export async function hasBuilderDexAccountFunding(
	info: PairingFundingInfoClient,
	user: `0x${string}`,
	signal?: AbortSignal,
): Promise<boolean> {
	const dexs = await info.perpDexs(signal);
	const builderDexNames = dexs.flatMap((dex) => (dex ? [dex.name] : []));
	const states = await Promise.all(builderDexNames.map((dex) => info.clearinghouseState({ user, dex }, signal)));
	return states.some(hasPerpAccountFunding);
}
