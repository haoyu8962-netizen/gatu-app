import type { UserNonFundingLedgerUpdatesResponse } from "@nktkas/hyperliquid";
import Big from "big.js";
import { CCTP_NETWORKS } from "@/config/cctp";
import { fetchTimeRangeHistory } from "@/lib/trade/history-pagination";

type SdkAccountLedgerDelta = UserNonFundingLedgerUpdatesResponse[number]["delta"];
type SdkSendDelta = Extract<SdkAccountLedgerDelta, { type: "send" }>;

/** The SDK validates requests, but the Info transport returns production response data unchecked. */
export interface AccountLedgerUpdate {
	delta: unknown;
	hash: string;
	time: number;
}

export type AccountLedgerAction =
	| "activateDex"
	| "accountActivationFee"
	| "borrow"
	| "deployGasAuction"
	| "deposit"
	| "gasAuctionFee"
	| "genesisDistribution"
	| "hip3LiquidatorDeposit"
	| "hip3LiquidatorWithdrawal"
	| "liquidation"
	| "other"
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
	| "welcomeBonus"
	| "withdrawal";

export interface AccountLedgerLocation {
	kind: "arbitrum" | "earn" | "hyperevm" | "perpDex" | "perps" | "spot" | "staking";
	dex?: string;
}

export interface AccountLedgerFee {
	amount: string;
	token: string;
}

export interface AccountLedgerRow {
	action: AccountLedgerAction;
	amount: string | null;
	destination: AccountLedgerLocation;
	explorer: "arbitrum" | "hyperliquid";
	fee: AccountLedgerFee | null;
	hash: string;
	id: string;
	rawType: string | null;
	source: AccountLedgerLocation;
	time: number;
	token: string;
}

/**
 * Where native USDC crosses between HyperCore and HyperEVM. A CCTP withdrawal sends USDC to its spot
 * system address and a CCTP deposit arrives from its linked HyperEVM contract, Circle's
 * CoreDepositWallet. Without the bridge's own records the chain beyond HyperEVM is unknown, so these
 * addresses only decide how a ledger row is labelled.
 */
export interface AccountLedgerUsdcBridge {
	evmContract: string;
	systemAddress: string;
}

/** USDC is spot token 0 on both networks, so its system address is the base `0x2000…0000`. */
const USDC_SPOT_SYSTEM_ADDRESS = "0x2000000000000000000000000000000000000000";
const HYPE_SYSTEM_ADDRESS = "0x2222222222222222222222222222222222222222";
const SPOT_SYSTEM_ADDRESS_PREFIX = "0x200000000000000000000000";

const ARBITRUM_LOCATION: AccountLedgerLocation = { kind: "arbitrum" };
const EARN_LOCATION: AccountLedgerLocation = { kind: "earn" };
const HYPEREVM_LOCATION: AccountLedgerLocation = { kind: "hyperevm" };
const PERPS_LOCATION: AccountLedgerLocation = { kind: "perps" };
const SPOT_LOCATION: AccountLedgerLocation = { kind: "spot" };
const STAKING_LOCATION: AccountLedgerLocation = { kind: "staking" };

function add(left: string, right: string): string {
	return Big(left).plus(right).toFixed();
}

function subtract(left: string, right: string): string {
	return Big(left).minus(right).toFixed();
}

function negate(value: string): string {
	return Big(value).times(-1).toFixed();
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

export function getAccountLedgerUsdcBridge(isTestnet: boolean): AccountLedgerUsdcBridge {
	return {
		evmContract: CCTP_NETWORKS[isTestnet ? "testnet" : "mainnet"].coreDepositWallet,
		systemAddress: USDC_SPOT_SYSTEM_ADDRESS,
	};
}

/** HyperCore moves tokens to HyperEVM through system addresses: `0x2222…` for HYPE, `0x2000…` plus the token index otherwise. */
function isSystemAddress(address: string): boolean {
	const normalized = address.toLowerCase();
	return normalized === HYPE_SYSTEM_ADDRESS || normalized.startsWith(SPOT_SYSTEM_ADDRESS_PREFIX);
}

function getSendLocation(dex: string, address: string): AccountLedgerLocation {
	return dex === "spot" && isSystemAddress(address) ? HYPEREVM_LOCATION : getDexLocation(dex);
}

/** The official terminal's classification of a `send` when it has no CCTP record for the transfer. */
function getSendAction(delta: SdkSendDelta, user: string, usdcBridge: AccountLedgerUsdcBridge): AccountLedgerAction {
	if (delta.destinationDex === "spot" && hasSameAddress(delta.destination, usdcBridge.systemAddress)) {
		return "withdrawal";
	}
	const betweenOwnBalances = hasSameAddress(delta.user, user) && hasSameAddress(delta.destination, user);
	if (betweenOwnBalances || isSystemAddress(delta.user) || isSystemAddress(delta.destination)) return "transfer";
	if (hasSameAddress(delta.destination, user) && hasSameAddress(delta.user, usdcBridge.evmContract)) return "deposit";
	return "send";
}

export function getAccountLedgerUpdateKey(update: AccountLedgerUpdate): string {
	return `${update.hash}:${update.time}:${JSON.stringify(update.delta)}`;
}

export function isValidAccountLedgerUpdate(item: unknown): item is AccountLedgerUpdate {
	if (
		!isRecord(item) ||
		typeof item.time !== "number" ||
		!Number.isSafeInteger(item.time) ||
		item.time < 0 ||
		typeof item.hash !== "string" ||
		item.hash.length === 0 ||
		!isRecord(item.delta)
	) {
		return false;
	}
	return typeof item.delta.type === "string" && item.delta.type.length > 0;
}

export function isAccountLedgerRewardsClaimUpdate(update: AccountLedgerUpdate): boolean {
	return isRecord(update.delta) && update.delta.type === "rewardsClaim";
}

export function isAccountLedgerEarnUpdate(update: AccountLedgerUpdate): boolean {
	return isRecord(update.delta) && update.delta.type === "borrowLend";
}

export function mergeAccountLedgerUpdates(
	...sources: ReadonlyArray<readonly AccountLedgerUpdate[] | undefined>
): AccountLedgerUpdate[] {
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
	updates: AccountLedgerUpdate[];
}

export async function fetchAccountLedgerHistory(
	fetchPage: (startTime: number, endTime: number, signal: AbortSignal) => Promise<readonly AccountLedgerUpdate[]>,
	options: { endTime: number; maxPages?: number; signal: AbortSignal },
): Promise<AccountLedgerHistoryResult> {
	const result = await fetchTimeRangeHistory({
		endTime: options.endTime,
		fetchPage,
		getKey: getAccountLedgerUpdateKey,
		getTime: (update: AccountLedgerUpdate) => update.time,
		...(options.maxPages === undefined ? {} : { maxPages: options.maxPages }),
		signal: options.signal,
		validateItem: isValidAccountLedgerUpdate,
	});
	return { truncated: result.truncated, updates: mergeAccountLedgerUpdates(result.items) };
}

export function buildAccountLedgerRows(
	updates: readonly AccountLedgerUpdate[],
	user: string,
	usdcBridge: AccountLedgerUsdcBridge,
): AccountLedgerRow[] {
	return updates.flatMap((update) => {
		const row = buildAccountLedgerRow(update, user, usdcBridge);
		return row ? [row] : [];
	});
}

export function buildAccountLedgerRow(
	update: AccountLedgerUpdate,
	user: string,
	usdcBridge: AccountLedgerUsdcBridge,
): AccountLedgerRow | null {
	try {
		const row = buildAccountLedgerRowUnchecked(update, user, usdcBridge);
		if (row === null || isValidAccountLedgerRow(row)) return row;
	} catch {
		// Production may add fields or variants before the pinned SDK updates its union.
	}

	if (!isRecord(update.delta) || typeof update.delta.type !== "string") return null;
	return buildUnknownAccountLedgerRow(update.delta, getAccountLedgerRowBase(update));
}

function buildAccountLedgerRowUnchecked(
	update: AccountLedgerUpdate,
	user: string,
	usdcBridge: AccountLedgerUsdcBridge,
): AccountLedgerRow | null {
	if (!isRecord(update.delta) || typeof update.delta.type !== "string") return null;
	const rawDelta = update.delta;
	const base = getAccountLedgerRowBase(update);
	const runtimeRow = buildRuntimeAccountLedgerRow(rawDelta, base);
	if (runtimeRow) return runtimeRow;
	const delta = rawDelta as SdkAccountLedgerDelta;

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
			const action = getSendAction(delta, user, usdcBridge);
			return {
				...base,
				action,
				amount: incoming ? delta.amount : negate(delta.amount),
				destination: getSendLocation(delta.destinationDex, delta.destination),
				explorer: "hyperliquid",
				fee: nativeFee ?? createFee(delta.fee, delta.feeToken || delta.token),
				source: action === "deposit" ? HYPEREVM_LOCATION : getSendLocation(delta.sourceDex, delta.user),
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
			const throughHyperEvm = isSystemAddress(delta.user) || isSystemAddress(delta.destination);
			return {
				...base,
				action: throughHyperEvm ? "transfer" : "send",
				amount: incoming ? delta.amount : negate(delta.amount),
				destination: throughHyperEvm && !incoming ? HYPEREVM_LOCATION : SPOT_LOCATION,
				explorer: "hyperliquid",
				fee: nativeFee ?? createFee(delta.fee, delta.feeToken || delta.token),
				source: throughHyperEvm && incoming ? HYPEREVM_LOCATION : SPOT_LOCATION,
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

	return buildUnknownAccountLedgerRow(rawDelta, base);
}

type AccountLedgerRowBase = Pick<AccountLedgerRow, "hash" | "id" | "rawType" | "time">;

function getAccountLedgerRowBase(update: AccountLedgerUpdate): AccountLedgerRowBase {
	return {
		hash: update.hash,
		id: getAccountLedgerUpdateKey(update),
		rawType: null,
		time: update.time,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getStringNumber(delta: Record<string, unknown>, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = delta[key];
		if (typeof value === "string") {
			try {
				return Big(value).toFixed();
			} catch {
				continue;
			}
		}
		if (typeof value === "number" && Number.isFinite(value)) return Big(value).toFixed();
	}
	return null;
}

function isValidNumericString(value: string): boolean {
	try {
		Big(value);
		return true;
	} catch {
		return false;
	}
}

function isValidAccountLedgerRow(row: AccountLedgerRow): boolean {
	if (!Number.isSafeInteger(row.time) || typeof row.hash !== "string" || typeof row.token !== "string") return false;
	if (row.amount !== null && (typeof row.amount !== "string" || !isValidNumericString(row.amount))) return false;
	if (row.fee && (!isValidNumericString(row.fee.amount) || typeof row.fee.token !== "string")) return false;
	return (
		isRecord(row.source) &&
		typeof row.source.kind === "string" &&
		isRecord(row.destination) &&
		typeof row.destination.kind === "string"
	);
}

function getString(delta: Record<string, unknown>, key: string): string | null {
	const value = delta[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

function getRuntimeLocation(delta: Record<string, unknown>): AccountLedgerLocation {
	const dex = getString(delta, "dex");
	return dex ? { dex, kind: "perpDex" } : SPOT_LOCATION;
}

function buildRuntimeAccountLedgerRow(
	delta: Record<string, unknown>,
	base: AccountLedgerRowBase,
): AccountLedgerRow | null {
	const amount = getStringNumber(delta, "amount", "usdc");
	const token = getString(delta, "token") ?? ("usdc" in delta ? "USDC" : null);
	const location = getRuntimeLocation(delta);
	if (!amount || !token) return null;

	if (delta.type === "accountActivationGas") {
		return createRuntimeRow(base, "accountActivationFee", negate(amount), token, location);
	}
	if (delta.type === "gossipPriorityGasAuction") {
		return createRuntimeRow(base, "gasAuctionFee", negate(amount), token, location);
	}
	if (delta.type === "welcomeBonus") {
		return createRuntimeRow(base, "welcomeBonus", amount, token, location);
	}
	if (delta.type === "hip3LiquidatorDeposit") {
		return createRuntimeRow(base, "hip3LiquidatorDeposit", negate(amount), token, location);
	}
	if (delta.type === "hip3LiquidatorWithdraw" || delta.type === "hip3LiquidatorWithdrawal") {
		return createRuntimeRow(base, "hip3LiquidatorWithdrawal", amount, token, location);
	}
	return null;
}

function createRuntimeRow(
	base: AccountLedgerRowBase,
	action: AccountLedgerAction,
	amount: string,
	token: string,
	location: AccountLedgerLocation,
): AccountLedgerRow {
	return {
		...base,
		action,
		amount,
		destination: location,
		explorer: "hyperliquid",
		fee: null,
		source: location,
		token,
	};
}

function buildUnknownAccountLedgerRow(delta: Record<string, unknown>, base: AccountLedgerRowBase): AccountLedgerRow {
	const amount = getStringNumber(delta, "amount", "usdc", "accountValue", "netWithdrawnUsd", "requestedUsd");
	const token = getString(delta, "token") ?? ("usdc" in delta ? "USDC" : "");
	const location = getRuntimeLocation(delta);

	return {
		...base,
		action: "other",
		amount,
		destination: location,
		explorer: "hyperliquid",
		fee: null,
		rawType: typeof delta.type === "string" ? delta.type : "unknown",
		source: location,
		token,
	};
}
