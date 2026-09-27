import Big from "big.js";
import {
	type BuildEarnSnapshotInput,
	buildEarnSnapshot,
	type EarnAccountSummary,
	type EarnAssetRow,
	type EarnFullPosition,
	type EarnOperation,
	type EarnReserve,
	type EarnSnapshot,
	type EarnUserState,
	getEarnFullPosition,
	getEarnMaxAmount,
	getEarnMinimumIssue,
	getEarnOperationRows,
} from "./earn";

export interface EarnSubmissionRequest {
	operation: EarnOperation;
	token: number;
	amount: string;
	displayedMax: string;
	full: EarnFullPosition | null;
}

export type EarnSubmissionStaleReason =
	| "unavailable"
	| "exceedsDisplayed"
	| "exceedsFresh"
	| "portfolioMargin"
	| "positionChanged"
	| "belowMinimum";

export class EarnSubmissionStaleError extends Error {
	constructor(readonly reason: EarnSubmissionStaleReason) {
		super(`Earn submission is no longer valid: ${reason}`);
		this.name = "EarnSubmissionStaleError";
	}
}

export function getEarnProtocolAmount(request: EarnSubmissionRequest): string | null {
	return request.full ? null : request.amount;
}

interface EarnSubmissionBoundInput {
	request: EarnSubmissionRequest;
	row: EarnAssetRow;
	summary: EarnAccountSummary;
	spotAvailable: string | null;
}

function assertEarnSubmissionWithinState({ request, row, summary, spotAvailable }: EarnSubmissionBoundInput): string {
	const input = { operation: request.operation, row, summary, spotAvailable };
	const latestMax = getEarnMaxAmount(input);
	if (latestMax === null) throw new EarnSubmissionStaleError("unavailable");
	if (request.full) {
		const latestFull = getEarnFullPosition(input);
		if (!latestFull) throw new EarnSubmissionStaleError("exceedsFresh");
		if (latestFull.principal !== request.full.principal) throw new EarnSubmissionStaleError("positionChanged");
		return latestMax;
	}
	const amount = Big(request.amount);
	if (amount.lte(0) || amount.gt(request.displayedMax)) throw new EarnSubmissionStaleError("exceedsDisplayed");
	if (amount.gt(latestMax)) throw new EarnSubmissionStaleError("exceedsFresh");
	if (getEarnMinimumIssue(request.operation, row, request.amount)) throw new EarnSubmissionStaleError("belowMinimum");
	return latestMax;
}

export interface VerifyFreshEarnSubmissionInput {
	request: EarnSubmissionRequest;
	reserves: readonly EarnReserve[];
	userState: EarnUserState;
	inputs: Omit<BuildEarnSnapshotInput, "reserves" | "userState">;
	spotAvailable: string | null;
}

export function verifyFreshEarnSubmission({
	request,
	reserves,
	userState,
	inputs,
	spotAvailable,
}: VerifyFreshEarnSubmissionInput): string {
	if (inputs.portfolioMargin) throw new EarnSubmissionStaleError("portfolioMargin");
	const snapshot = buildEarnSnapshot({ reserves, userState, ...inputs });
	const row = snapshot
		? getEarnOperationRows(request.operation, snapshot).find((candidate) => candidate.token === request.token)
		: undefined;
	if (!snapshot || !row) throw new EarnSubmissionStaleError("unavailable");
	return assertEarnSubmissionWithinState({ request, row, summary: snapshot.summary, spotAvailable });
}

export const EARN_VERIFICATION_TTL_MS = 20_000;

export interface VerifyEarnSubmissionAtBoundaryInput {
	request: EarnSubmissionRequest;
	verifiedAt: number;
	now: number;
	snapshot: EarnSnapshot | null;
	accountReady: boolean;
	portfolioMargin: boolean;
	spotAvailable: string | null;
}

export function verifyEarnSubmissionAtBoundary({
	request,
	verifiedAt,
	now,
	snapshot,
	accountReady,
	portfolioMargin,
	spotAvailable,
}: VerifyEarnSubmissionAtBoundaryInput): void {
	const age = now - verifiedAt;
	if (age < 0 || age > EARN_VERIFICATION_TTL_MS) throw new EarnSubmissionStaleError("unavailable");
	if (portfolioMargin) throw new EarnSubmissionStaleError("portfolioMargin");
	if (!accountReady || !snapshot) throw new EarnSubmissionStaleError("unavailable");
	const row = getEarnOperationRows(request.operation, snapshot).find((candidate) => candidate.token === request.token);
	if (!row) throw new EarnSubmissionStaleError("unavailable");
	assertEarnSubmissionWithinState({ request, row, summary: snapshot.summary, spotAvailable });
}
