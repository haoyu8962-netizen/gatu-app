import type { UserNonFundingLedgerUpdatesResponse } from "@nktkas/hyperliquid";
import Big from "big.js";

export type AccountLedgerUpdate = UserNonFundingLedgerUpdatesResponse[number];

export type AccountLedgerAction =
	| "activateDex"
	| "borrow"
	| "deployGasAuction"
	| "deposit"
	| "genesisDistribution"
	| "liquidation"
	| "repay"
	| "rewardsClaim"
	| "send"
	| "stake"
	| "subAccountTransfer"
	| "supply"
	| "transfer"
	| "unstake"
	| "vaultCommission"
	| "vaultCreate"
	| "vaultDeposit"
	| "vaultDistribution"
	| "vaultWithdrawal"
	| "withdrawal";

export interface AccountLedgerLocation {
	kind: "arbitrum" | "earn" | "perpDex" | "perps" | "spot" | "staking";
	dex?: string;
}

export interface AccountLedgerFee {
	amount: string;
	token: string;
}

export interface AccountLedgerRow {
	action: AccountLedgerAction;
	amount: string;
	destination: AccountLedgerLocation;
	explorer: "arbitrum" | "hyperliquid";
	fee: AccountLedgerFee | null;
	hash: string;
	id: string;
	source: AccountLedgerLocation;
	time: number;
	token: string;
}

const ARBITRUM_LOCATION: AccountLedgerLocation = { kind: "arbitrum" };
const EARN_LOCATION: AccountLedgerLocation = { kind: "earn" };
const PERPS_LOCATION: AccountLedgerLocation = { kind: "perps" };
const SPOT_LOCATION: AccountLedgerLocation = { kind: "spot" };
const STAKING_LOCATION: AccountLedgerLocation = { kind: "staking" };

function add(left: string, right: string): string {
	return Big(left).plus(right).toString();
}

function subtract(left: string, right: string): string {
	return Big(left).minus(right).toString();
}

function negate(value: string): string {
	return Big(value).times(-1).toString();
}

function hasSameAddress(left: string, right: string): boolean {
	return left.toLowerCase() === right.toLowerCase();
}

function createFee(amount: string, token: string): AccountLedgerFee | null {
	return Big(amount).eq(0) ? null : { amount, token };
}

function getDexLocation(dex: string): AccountLedgerLocation {
	if (dex === "spot") return SPOT_LOCATION;
	if (dex === "") return PERPS_LOCATION;
	return { kind: "perpDex", dex };
}

export function getAccountLedgerUpdateKey(update: AccountLedgerUpdate): string {
	return `${update.hash}:${update.time}:${JSON.stringify(update.delta)}`;
}

export function mergeAccountLedgerUpdates(
	...sources: ReadonlyArray<UserNonFundingLedgerUpdatesResponse | undefined>
): UserNonFundingLedgerUpdatesResponse {
	const updatesById = new Map<string, AccountLedgerUpdate>();

	for (const source of sources) {
		for (const update of source ?? []) {
			updatesById.set(getAccountLedgerUpdateKey(update), update);
		}
	}

	return [...updatesById.values()].sort((left, right) => right.time - left.time);
}

export interface AccountLedgerHistoryResult {
	truncated: boolean;
	updates: UserNonFundingLedgerUpdatesResponse;
}

export async function fetchAccountLedgerHistory(
	fetchPage: (startTime: number) => Promise<UserNonFundingLedgerUpdatesResponse>,
	maxPages = 200,
): Promise<AccountLedgerHistoryResult> {
	const updates: AccountLedgerUpdate[] = [];
	let startTime = 0;
	let overlapKey: string | null = null;

	for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
		const page = await fetchPage(startTime);
		let pageUpdates = page;

		if (overlapKey) {
			const overlapIndex = page.findIndex((update) => getAccountLedgerUpdateKey(update) === overlapKey);
			if (overlapIndex >= 0) pageUpdates = page.slice(overlapIndex + 1);
		}

		if (pageUpdates.length === 0) {
			return { truncated: false, updates: mergeAccountLedgerUpdates(updates) };
		}

		updates.push(...pageUpdates);
		const nextCursor = pageUpdates.at(-1);
		if (!nextCursor) return { truncated: false, updates: mergeAccountLedgerUpdates(updates) };

		const nextOverlapKey = getAccountLedgerUpdateKey(nextCursor);
		if (nextOverlapKey === overlapKey || nextCursor.time < startTime) {
			return { truncated: false, updates: mergeAccountLedgerUpdates(updates) };
		}

		overlapKey = nextOverlapKey;
		startTime = nextCursor.time;
	}

	return { truncated: true, updates: mergeAccountLedgerUpdates(updates) };
}

export function buildAccountLedgerRows(updates: UserNonFundingLedgerUpdatesResponse, user: string): AccountLedgerRow[] {
	return updates.flatMap((update) => {
		const row = buildAccountLedgerRow(update, user);
		return row ? [row] : [];
	});
}

export function buildAccountLedgerRow(update: AccountLedgerUpdate, user: string): AccountLedgerRow | null {
	const { delta } = update;
	const base = {
		hash: update.hash,
		id: getAccountLedgerUpdateKey(update),
		time: update.time,
	};

	switch (delta.type) {
		case "accountClassTransfer":
			return {
				...base,
				action: "transfer",
				amount: delta.toPerp ? delta.usdc : negate(delta.usdc),
				destination: delta.toPerp ? PERPS_LOCATION : SPOT_LOCATION,
				explorer: "hyperliquid",
				fee: null,
				source: delta.toPerp ? SPOT_LOCATION : PERPS_LOCATION,
				token: "USDC",
			};
		case "activateDexAbstraction":
			return {
				...base,
				action: "activateDex",
				amount: delta.amount,
				destination: delta.token === "USDC" ? PERPS_LOCATION : SPOT_LOCATION,
				explorer: "hyperliquid",
				fee: null,
				source: { kind: "perpDex", dex: delta.dex },
				token: delta.token,
			};
		case "borrowLend": {
			const incoming = delta.operation === "borrow" || delta.operation === "withdraw";
			let action: AccountLedgerAction = "supply";
			if (delta.operation === "borrow") action = "borrow";
			if (delta.operation === "repay") action = "repay";
			if (delta.operation === "withdraw") action = "withdrawal";
			return {
				...base,
				action,
				amount: incoming ? delta.amount : negate(delta.amount),
				destination: incoming ? SPOT_LOCATION : EARN_LOCATION,
				explorer: "hyperliquid",
				fee: null,
				source: incoming ? EARN_LOCATION : SPOT_LOCATION,
				token: delta.token,
			};
		}
		case "cStakingTransfer":
			return {
				...base,
				action: delta.isDeposit ? "stake" : "unstake",
				amount: delta.isDeposit ? negate(delta.amount) : delta.amount,
				destination: delta.isDeposit ? STAKING_LOCATION : SPOT_LOCATION,
				explorer: "hyperliquid",
				fee: null,
				source: delta.isDeposit ? SPOT_LOCATION : STAKING_LOCATION,
				token: delta.token,
			};
		case "deployGasAuction":
			return {
				...base,
				action: "deployGasAuction",
				amount: negate(delta.amount),
				destination: SPOT_LOCATION,
				explorer: "hyperliquid",
				fee: null,
				source: SPOT_LOCATION,
				token: delta.token,
			};
		case "deposit":
			return {
				...base,
				action: "deposit",
				amount: delta.usdc,
				destination: PERPS_LOCATION,
				explorer: "arbitrum",
				fee: null,
				source: ARBITRUM_LOCATION,
				token: "USDC",
			};
		case "internalTransfer": {
			const incoming = hasSameAddress(delta.destination, user);
			return {
				...base,
				action: "send",
				amount: incoming ? subtract(delta.usdc, delta.fee) : negate(delta.usdc),
				destination: PERPS_LOCATION,
				explorer: "hyperliquid",
				fee: createFee(delta.fee, "USDC"),
				source: PERPS_LOCATION,
				token: "USDC",
			};
		}
		case "liquidation": {
			const amount = negate(delta.accountValue);
			if (Big(amount).gt(0)) return null;
			return {
				...base,
				action: "liquidation",
				amount,
				destination: PERPS_LOCATION,
				explorer: "hyperliquid",
				fee: null,
				source: PERPS_LOCATION,
				token: "USDC",
			};
		}
		case "rewardsClaim":
			return {
				...base,
				action: "rewardsClaim",
				amount: delta.amount,
				destination: SPOT_LOCATION,
				explorer: "hyperliquid",
				fee: null,
				source: SPOT_LOCATION,
				token: delta.token,
			};
		case "send": {
			const incoming = hasSameAddress(delta.destination, user);
			const nativeFee = createFee(delta.nativeTokenFee, "HYPE");
			return {
				...base,
				action: "send",
				amount: incoming ? delta.amount : negate(delta.amount),
				destination: getDexLocation(delta.destinationDex),
				explorer: "hyperliquid",
				fee: nativeFee ?? createFee(delta.fee, delta.feeToken || delta.token),
				source: getDexLocation(delta.sourceDex),
				token: delta.token,
			};
		}
		case "spotGenesis":
			return {
				...base,
				action: "genesisDistribution",
				amount: delta.amount,
				destination: SPOT_LOCATION,
				explorer: "hyperliquid",
				fee: null,
				source: SPOT_LOCATION,
				token: delta.token,
			};
		case "spotTransfer": {
			const incoming = hasSameAddress(delta.destination, user);
			const nativeFee = createFee(delta.nativeTokenFee, "HYPE");
			return {
				...base,
				action: "send",
				amount: incoming ? delta.amount : negate(delta.amount),
				destination: SPOT_LOCATION,
				explorer: "hyperliquid",
				fee: nativeFee ?? createFee(delta.fee, delta.feeToken || delta.token),
				source: SPOT_LOCATION,
				token: delta.token,
			};
		}
		case "subAccountTransfer": {
			const incoming = hasSameAddress(delta.destination, user);
			return {
				...base,
				action: "subAccountTransfer",
				amount: incoming ? delta.usdc : negate(delta.usdc),
				destination: PERPS_LOCATION,
				explorer: "hyperliquid",
				fee: null,
				source: PERPS_LOCATION,
				token: "USDC",
			};
		}
		case "vaultCreate":
			return {
				...base,
				action: "vaultCreate",
				amount: negate(delta.usdc),
				destination: PERPS_LOCATION,
				explorer: "hyperliquid",
				fee: createFee(delta.fee, "USDC"),
				source: PERPS_LOCATION,
				token: "USDC",
			};
		case "vaultDeposit":
			return {
				...base,
				action: "vaultDeposit",
				amount: negate(delta.usdc),
				destination: PERPS_LOCATION,
				explorer: "hyperliquid",
				fee: null,
				source: PERPS_LOCATION,
				token: "USDC",
			};
		case "vaultDistribution":
			return {
				...base,
				action: "vaultDistribution",
				amount: delta.usdc,
				destination: PERPS_LOCATION,
				explorer: "hyperliquid",
				fee: null,
				source: PERPS_LOCATION,
				token: "USDC",
			};
		case "vaultLeaderCommission":
			return {
				...base,
				action: "vaultCommission",
				amount: delta.usdc,
				destination: PERPS_LOCATION,
				explorer: "hyperliquid",
				fee: null,
				source: PERPS_LOCATION,
				token: "USDC",
			};
		case "vaultWithdraw":
			return {
				...base,
				action: "vaultWithdrawal",
				amount: add(delta.netWithdrawnUsd, delta.commission),
				destination: PERPS_LOCATION,
				explorer: "hyperliquid",
				fee: null,
				source: PERPS_LOCATION,
				token: "USDC",
			};
		case "withdraw":
			return {
				...base,
				action: "withdrawal",
				amount: negate(delta.usdc),
				destination: ARBITRUM_LOCATION,
				explorer: "arbitrum",
				fee: createFee(delta.fee, "USDC"),
				source: PERPS_LOCATION,
				token: "USDC",
			};
	}
}
