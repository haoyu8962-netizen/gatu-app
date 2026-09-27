import Big from "big.js";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { toBig } from "@/lib/trade/numbers";

export type EarnOperation = "supply" | "withdraw" | "borrow" | "repay";

export const EARN_OPERATIONS: readonly EarnOperation[] = ["supply", "withdraw", "borrow", "repay"];

export const EARN_HIDDEN_UNLESS_HELD_TOKEN = "USDH";

const HEALTH_FACTOR_DISPLAY_CAP = Big(10);

export interface EarnTokenMeta {
	index: number;
	name: string;
	displayName: string;
	weiDecimals: number;
	szDecimals: number;
}

export interface EarnReserve {
	token: number;
	borrowYearlyRate: string;
	supplyYearlyRate: string;
	utilization: string | null;
	oraclePx: string;
	ltv: string;
	totalSupplied: string;
	totalBorrowed: string;
}

export interface EarnPosition {
	basis: string;
	value: string;
}

export interface EarnUserState {
	positions: Map<number, { supply: EarnPosition; borrow: EarnPosition }>;
	healthFactor: string | null;
}

export interface EarnAssetRow {
	token: number;
	name: string;
	displayName: string;
	weiDecimals: number;
	amountDecimals: number;
	isCollateral: boolean;
	ltv: string;
	supplyYearlyRate: string;
	borrowYearlyRate: string;
	oraclePx: string;
	totalSupplied: string;
	totalBorrowed: string;
	supplied: string;
	suppliedInterest: string;
	borrowed: string;
	borrowedInterest: string;
	liquidationPx: string | null;
}

export interface EarnAccountSummary {
	totalSuppliedUsd: string;
	weightedSuppliedUsd: string;
	totalBorrowedUsd: string;
	availableToBorrowUsd: string;
	healthFactor: string | null;
	hasBorrows: boolean;
	hasSupplies: boolean;
	hasCollateralSupply: boolean;
}

export interface EarnSnapshot {
	supplyRows: EarnAssetRow[];
	borrowRows: EarnAssetRow[];
	summary: EarnAccountSummary;
}

export interface EarnSpotBalance {
	token: number;
	available: string;
	total: string;
}

export interface BuildEarnSnapshotInput {
	reserves: readonly EarnReserve[];
	userState: EarnUserState | null;
	tokens: ReadonlyMap<number, EarnTokenMeta>;
	portfolioMargin: boolean;
	spotBalances: ReadonlyMap<number, EarnSpotBalance>;
	availableAfterMaintenance: ReadonlyMap<number, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function readDecimal(value: unknown): string | null {
	if (typeof value !== "string" && typeof value !== "number") return null;
	const big = toBig(value);
	return big ? big.toFixed() : null;
}

function readNonNegativeDecimal(value: unknown): string | null {
	const decimal = readDecimal(value);
	return decimal !== null && Big(decimal).gte(0) ? decimal : null;
}

function readTokenId(value: unknown): number | null {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function parseEarnReserves(data: unknown): EarnReserve[] | null {
	if (!Array.isArray(data)) return null;
	const reserves: EarnReserve[] = [];
	const seen = new Set<number>();
	for (const entry of data) {
		if (!Array.isArray(entry) || entry.length !== 2 || !isRecord(entry[1])) return null;
		const token = readTokenId(entry[0]);
		const state = entry[1];
		const borrowYearlyRate = readNonNegativeDecimal(state.borrowYearlyRate);
		const supplyYearlyRate = readNonNegativeDecimal(state.supplyYearlyRate);
		const oraclePx = readNonNegativeDecimal(state.oraclePx);
		const ltv = readNonNegativeDecimal(state.ltv);
		const totalSupplied = readNonNegativeDecimal(state.totalSupplied);
		const totalBorrowed = readNonNegativeDecimal(state.totalBorrowed);
		if (
			token === null ||
			borrowYearlyRate === null ||
			supplyYearlyRate === null ||
			oraclePx === null ||
			ltv === null ||
			Big(ltv).gte(1) ||
			totalSupplied === null ||
			totalBorrowed === null ||
			seen.has(token)
		) {
			return null;
		}
		seen.add(token);
		reserves.push({
			token,
			borrowYearlyRate,
			supplyYearlyRate,
			utilization: state.utilization === undefined ? null : readNonNegativeDecimal(state.utilization),
			oraclePx,
			ltv,
			totalSupplied,
			totalBorrowed,
		});
	}
	return reserves;
}

function parsePosition(value: unknown): EarnPosition | null {
	if (!isRecord(value)) return null;
	const basis = readDecimal(value.basis);
	const amount = readNonNegativeDecimal(value.value);
	return basis === null || amount === null ? null : { basis, value: amount };
}

export function parseEarnUserState(data: unknown): EarnUserState | null {
	if (!isRecord(data) || !Array.isArray(data.tokenToState)) return null;
	const positions = new Map<number, { supply: EarnPosition; borrow: EarnPosition }>();
	for (const entry of data.tokenToState) {
		if (!Array.isArray(entry) || entry.length !== 2 || !isRecord(entry[1])) return null;
		const token = readTokenId(entry[0]);
		const supply = parsePosition(entry[1].supply);
		const borrow = parsePosition(entry[1].borrow);
		if (token === null || !supply || !borrow || positions.has(token)) return null;
		positions.set(token, { supply, borrow });
	}
	let healthFactor: string | null = null;
	if (data.healthFactor !== null && data.healthFactor !== undefined) {
		healthFactor = readNonNegativeDecimal(data.healthFactor);
		if (healthFactor === null) return null;
	}
	return { positions, healthFactor };
}

export function getLiquidationThreshold(ltv: string): Big {
	const value = Big(ltv);
	if (value.lte(0)) return Big(0);
	if (value.gte(0.5)) return value.plus(1).div(2);
	return value.times(2).div(value.plus(1));
}

function getAmountDecimals(name: string, szDecimals: number): number {
	return name === DEFAULT_QUOTE_TOKEN ? 2 : szDecimals;
}

interface PositionTotals {
	totalBorrowedUsd: Big;
	thresholdSuppliedUsd: Big;
}

function computeStandardLiquidationPx(
	row: Pick<EarnAssetRow, "supplied" | "borrowed" | "oraclePx" | "ltv">,
	totals: PositionTotals,
): string | null {
	const supplied = Big(row.supplied);
	if (supplied.lte(0)) return null;
	const threshold = getLiquidationThreshold(row.ltv);
	if (threshold.lte(0)) return null;
	const price = Big(row.oraclePx);
	const borrowed = Big(row.borrowed);
	const otherBorrowedUsd = totals.totalBorrowedUsd.minus(borrowed.times(price));
	const otherThresholdUsd = totals.thresholdSuppliedUsd.minus(supplied.times(price).times(threshold));
	const netCollateral = supplied.times(threshold).minus(borrowed);
	if (netCollateral.lte(0)) return null;
	const liquidationPx = otherBorrowedUsd.minus(otherThresholdUsd).div(netCollateral);
	return liquidationPx.lte(0) || liquidationPx.gt(price) ? null : liquidationPx.toFixed();
}

function computePortfolioMarginLiquidationPx(
	row: Pick<EarnAssetRow, "oraclePx" | "ltv">,
	spotTotal: string | undefined,
	availableAfterMaintenance: string | undefined,
): string | null {
	if (getLiquidationThreshold(row.ltv).lte(0)) return null;
	const total = toBig(spotTotal);
	const available = toBig(availableAfterMaintenance);
	if (!total || total.lte(0) || !available) return null;
	const price = Big(row.oraclePx);
	const liquidationPx = price.times(Big(1).minus(available.div(total)));
	return liquidationPx.lte(0) || liquidationPx.gt(price) ? null : liquidationPx.toFixed();
}

export function buildEarnSnapshot({
	reserves,
	userState,
	tokens,
	portfolioMargin,
	spotBalances,
	availableAfterMaintenance,
}: BuildEarnSnapshotInput): EarnSnapshot | null {
	const reserveTokens = new Set(reserves.map((reserve) => reserve.token));
	for (const [token, position] of userState?.positions ?? []) {
		const hasExposure = Big(position.supply.value).gt(0) || Big(position.borrow.value).gt(0);
		if (hasExposure && !reserveTokens.has(token)) return null;
	}
	const rows: EarnAssetRow[] = [];
	let totalSuppliedUsd = Big(0);
	let weightedSuppliedUsd = Big(0);
	let totalBorrowedUsd = Big(0);
	let thresholdSuppliedUsd = Big(0);

	for (const reserve of reserves) {
		const meta = tokens.get(reserve.token);
		if (!meta) return null;
		const position = userState?.positions.get(reserve.token);
		const supplied = position?.supply.value ?? "0";
		const borrowed = position?.borrow.value ?? "0";
		const price = Big(reserve.oraclePx);
		const suppliedUsd = Big(supplied).times(price);
		const borrowedUsd = Big(borrowed).times(price);
		totalSuppliedUsd = totalSuppliedUsd.plus(suppliedUsd);
		weightedSuppliedUsd = weightedSuppliedUsd.plus(suppliedUsd.times(reserve.ltv));
		totalBorrowedUsd = totalBorrowedUsd.plus(borrowedUsd);
		thresholdSuppliedUsd = thresholdSuppliedUsd.plus(suppliedUsd.times(getLiquidationThreshold(reserve.ltv)));
		rows.push({
			token: reserve.token,
			name: meta.name,
			displayName: meta.displayName,
			weiDecimals: meta.weiDecimals,
			amountDecimals: getAmountDecimals(meta.name, meta.szDecimals),
			isCollateral: Big(reserve.ltv).gt(0),
			ltv: reserve.ltv,
			supplyYearlyRate: reserve.supplyYearlyRate,
			borrowYearlyRate: reserve.borrowYearlyRate,
			oraclePx: reserve.oraclePx,
			totalSupplied: reserve.totalSupplied,
			totalBorrowed: reserve.totalBorrowed,
			supplied,
			suppliedInterest: position ? Big(supplied).minus(position.supply.basis).toFixed() : "0",
			borrowed,
			borrowedInterest: position ? Big(borrowed).minus(position.borrow.basis).toFixed() : "0",
			liquidationPx: null,
		});
	}

	const totals = { totalBorrowedUsd, thresholdSuppliedUsd };
	for (const row of rows) {
		row.liquidationPx = portfolioMargin
			? computePortfolioMarginLiquidationPx(
					row,
					spotBalances.get(row.token)?.total,
					availableAfterMaintenance.get(row.token),
				)
			: computeStandardLiquidationPx(row, totals);
	}

	const isVisible = (row: EarnAssetRow) =>
		row.name !== EARN_HIDDEN_UNLESS_HELD_TOKEN || Big(row.supplied).gt(0) || Big(row.borrowed).gt(0);
	const availableToBorrowUsd = weightedSuppliedUsd.minus(totalBorrowedUsd);

	return {
		supplyRows: rows.filter(isVisible),
		borrowRows: rows.filter((row) => !row.isCollateral && isVisible(row)),
		summary: {
			totalSuppliedUsd: totalSuppliedUsd.toFixed(),
			weightedSuppliedUsd: weightedSuppliedUsd.toFixed(),
			totalBorrowedUsd: totalBorrowedUsd.toFixed(),
			availableToBorrowUsd: availableToBorrowUsd.gt(0) ? availableToBorrowUsd.toFixed() : "0",
			healthFactor: userState?.healthFactor ?? null,
			hasBorrows: rows.some((row) => Big(row.borrowed).gt(0)),
			hasSupplies: rows.some((row) => Big(row.supplied).gt(0)),
			hasCollateralSupply: rows.some((row) => row.isCollateral && Big(row.supplied).gt(0)),
		},
	};
}

export function getHealthFactorDisplayRatio(summary: EarnAccountSummary): string | null {
	if (!summary.hasBorrows || summary.healthFactor === null) return null;
	const value = Big(summary.healthFactor);
	return (value.gt(HEALTH_FACTOR_DISPLAY_CAP) ? HEALTH_FACTOR_DISPLAY_CAP : value).toFixed();
}

export interface EarnMaxAmountInput {
	operation: EarnOperation;
	row: EarnAssetRow;
	summary: EarnAccountSummary;
	spotAvailable: string | null;
}

export function getEarnMaxAmount({ operation, row, summary, spotAvailable }: EarnMaxAmountInput): string | null {
	const decimals = row.weiDecimals;
	const floorToDecimals = (value: Big) => (value.lte(0) ? "0" : value.round(decimals, Big.roundDown).toFixed());
	if (operation === "supply") {
		const available = toBig(spotAvailable);
		return available ? floorToDecimals(available) : null;
	}
	if (operation === "withdraw") {
		const supplied = Big(row.supplied);
		if (!row.isCollateral) return floorToDecimals(supplied);
		const collateralValue = Big(row.oraclePx).times(row.ltv);
		if (collateralValue.lte(0)) return null;
		const collateralLimit = Big(summary.availableToBorrowUsd).div(collateralValue);
		return floorToDecimals(supplied.lt(collateralLimit) ? supplied : collateralLimit);
	}
	if (operation === "borrow") {
		const price = Big(row.oraclePx);
		return price.gt(0) ? floorToDecimals(Big(summary.availableToBorrowUsd).div(price)) : null;
	}
	const borrowed = Big(row.borrowed);
	if (borrowed.lte(0)) return "0";
	const available = toBig(spotAvailable);
	if (!available) return null;
	const withBuffer = borrowed.plus(Big(10).pow(-decimals));
	return floorToDecimals(withBuffer.lt(available) ? withBuffer : available);
}

export function getEarnOperationRows(operation: EarnOperation, snapshot: EarnSnapshot): EarnAssetRow[] {
	if (operation === "supply") {
		const eligible = snapshot.supplyRows.filter((row) => row.name !== EARN_HIDDEN_UNLESS_HELD_TOKEN);
		return [...eligible.filter((row) => !row.isCollateral), ...eligible.filter((row) => row.isCollateral)];
	}
	if (operation === "withdraw") return snapshot.supplyRows;
	if (operation === "borrow") return snapshot.borrowRows;
	return snapshot.borrowRows.filter((row) => Big(row.borrowed).gt(0));
}

export type EarnAmountValidation = "empty" | "invalid" | "zero" | "exceedsMax" | "unavailable" | "valid";

export function validateEarnAmount(
	amount: string,
	maxAmount: string | null,
	weiDecimals: number,
): EarnAmountValidation {
	if (amount.trim() === "") return "empty";
	if (!/^\d+(\.\d+)?$/.test(amount.trim())) return "invalid";
	const value = Big(amount.trim());
	if (value.lte(0)) return "zero";
	if (value.round(weiDecimals, Big.roundDown).cmp(value) !== 0) return "invalid";
	if (maxAmount === null) return "unavailable";
	return value.gt(maxAmount) ? "exceedsMax" : "valid";
}

export function toEarnProtocolAmount(amount: string): string {
	return Big(amount.trim()).toFixed();
}

export interface EarnActionAvailabilityInput {
	portfolioMargin: boolean;
	accountReady: boolean;
	summary: EarnAccountSummary | null;
	supplyRows: readonly EarnAssetRow[];
}

export type EarnActionBlock = "portfolioMargin" | "unavailable" | "noSupplies" | "noCollateral" | "noBorrows" | null;

export function getEarnActionBlock(
	operation: EarnOperation,
	{ portfolioMargin, accountReady, summary, supplyRows }: EarnActionAvailabilityInput,
): EarnActionBlock {
	if (portfolioMargin) return "portfolioMargin";
	if (!accountReady || !summary) return "unavailable";
	if (operation === "supply") {
		return supplyRows.some((row) => row.name !== EARN_HIDDEN_UNLESS_HELD_TOKEN) ? null : "unavailable";
	}
	if (operation === "withdraw") return summary.hasSupplies ? null : "noSupplies";
	if (operation === "borrow") return summary.hasCollateralSupply ? null : "noCollateral";
	return summary.hasBorrows ? null : "noBorrows";
}

export interface EarnInterestEntry {
	time: number;
	token: string;
	supply: string;
	borrow: string;
}

export function parseEarnInterest(data: unknown): EarnInterestEntry[] | null {
	if (!Array.isArray(data)) return null;
	const entries: EarnInterestEntry[] = [];
	for (const item of data) {
		if (!isRecord(item) || typeof item.time !== "number" || typeof item.token !== "string") return null;
		const supply = readNonNegativeDecimal(item.supply);
		const borrow = readNonNegativeDecimal(item.borrow);
		if (supply === null || borrow === null) return null;
		entries.push({ time: item.time, token: item.token, supply, borrow });
	}
	return entries.sort((left, right) => right.time - left.time);
}
