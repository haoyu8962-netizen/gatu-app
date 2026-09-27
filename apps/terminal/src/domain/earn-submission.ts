import Big from "big.js";
import {
	type BuildEarnSnapshotInput,
	buildEarnSnapshot,
	type EarnOperation,
	type EarnReserve,
	type EarnSnapshot,
	type EarnUserState,
	getEarnMaxAmount,
	getEarnOperationRows,
} from "./earn";

export interface EarnSubmissionRequest {
	operation: EarnOperation;
	token: number;
	amount: string;
	displayedMax: string;
}

export class EarnSubmissionStaleError extends Error {
	constructor(readonly reason: "unavailable" | "exceedsDisplayed" | "exceedsFresh" | "portfolioMargin") {
		super(`Earn submission is no longer valid: ${reason}`);
		this.name = "EarnSubmissionStaleError";
	}
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
	const amount = Big(request.amount);
	if (amount.lte(0) || amount.gt(request.displayedMax)) throw new EarnSubmissionStaleError("exceedsDisplayed");
	const snapshot = buildEarnSnapshot({ reserves, userState, ...inputs });
	const row = snapshot
		? getEarnOperationRows(request.operation, snapshot).find((candidate) => candidate.token === request.token)
		: undefined;
	if (!snapshot || !row) throw new EarnSubmissionStaleError("unavailable");
	const freshMax = getEarnMaxAmount({
		operation: request.operation,
		row,
		summary: snapshot.summary,
		spotAvailable,
	});
	if (freshMax === null) throw new EarnSubmissionStaleError("unavailable");
	if (amount.gt(freshMax)) throw new EarnSubmissionStaleError("exceedsFresh");
	return freshMax;
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
	const latestMax = getEarnMaxAmount({ operation: request.operation, row, summary: snapshot.summary, spotAvailable });
	if (latestMax === null) throw new EarnSubmissionStaleError("unavailable");
	const amount = Big(request.amount);
	if (amount.gt(request.displayedMax)) throw new EarnSubmissionStaleError("exceedsDisplayed");
	if (amount.gt(latestMax)) throw new EarnSubmissionStaleError("exceedsFresh");
}
