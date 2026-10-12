import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ACCOUNT_MODE_SETUP_MAX_ATTEMPTS,
	ACCOUNT_MODE_SETUP_RETRY_DELAY_MS,
	ACCOUNT_MODE_SETUP_SETTLED_GRACE_MS,
} from "@/domain/trade/account-mode-setup";
import {
	beginAccountModeSetupAttempt,
	failAccountModeSetupAttempt,
	getAccountModeSetupAttemptStatus,
	resetAccountModeSetupAttempts,
	settleAccountModeSetupAttempt,
	subscribeAccountModeSetupAttempts,
} from "@/lib/trade/account-mode-setup-attempts";

const OWNER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

describe("account mode setup attempts", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		resetAccountModeSetupAttempts();
	});

	afterEach(() => {
		resetAccountModeSetupAttempts();
		vi.useRealTimers();
	});

	it("lets one attempt run at a time for an account", () => {
		expect(getAccountModeSetupAttemptStatus(OWNER)).toBe("idle");
		expect(beginAccountModeSetupAttempt(OWNER)).toBe(true);
		expect(getAccountModeSetupAttemptStatus(OWNER)).toBe("in-flight");
		expect(beginAccountModeSetupAttempt(OWNER)).toBe(false);
		expect(beginAccountModeSetupAttempt(OTHER)).toBe(true);
	});

	it("never starts again after a success or a skip", () => {
		beginAccountModeSetupAttempt(OWNER);
		settleAccountModeSetupAttempt(OWNER);
		expect(getAccountModeSetupAttemptStatus(OWNER)).toBe("settled");
		expect(beginAccountModeSetupAttempt(OWNER)).toBe(false);

		beginAccountModeSetupAttempt(OTHER);
		failAccountModeSetupAttempt(OTHER, "skipped");
		expect(getAccountModeSetupAttemptStatus(OTHER)).toBe("settled");
		vi.advanceTimersByTime(ACCOUNT_MODE_SETUP_RETRY_DELAY_MS * 2);
		expect(getAccountModeSetupAttemptStatus(OTHER)).toBe("settled");
		expect(beginAccountModeSetupAttempt(OTHER)).toBe(false);
	});

	it("hands a settled attempt back to the manual selection after the grace period, without a new attempt", () => {
		beginAccountModeSetupAttempt(OWNER);
		settleAccountModeSetupAttempt(OWNER);
		vi.advanceTimersByTime(ACCOUNT_MODE_SETUP_SETTLED_GRACE_MS - 1);
		expect(getAccountModeSetupAttemptStatus(OWNER)).toBe("settled");
		vi.advanceTimersByTime(1);
		expect(getAccountModeSetupAttemptStatus(OWNER)).toBe("exhausted");
		expect(beginAccountModeSetupAttempt(OWNER)).toBe(false);

		beginAccountModeSetupAttempt(OTHER);
		failAccountModeSetupAttempt(OTHER, "skipped");
		vi.advanceTimersByTime(ACCOUNT_MODE_SETUP_SETTLED_GRACE_MS);
		expect(getAccountModeSetupAttemptStatus(OTHER)).toBe("exhausted");
		expect(beginAccountModeSetupAttempt(OTHER)).toBe(false);
	});

	it("stops at once after a terminal rejection", () => {
		beginAccountModeSetupAttempt(OWNER);
		failAccountModeSetupAttempt(OWNER, "rejected");
		expect(getAccountModeSetupAttemptStatus(OWNER)).toBe("rejected");
		vi.advanceTimersByTime(ACCOUNT_MODE_SETUP_RETRY_DELAY_MS * 2);
		expect(getAccountModeSetupAttemptStatus(OWNER)).toBe("rejected");
		expect(beginAccountModeSetupAttempt(OWNER)).toBe(false);
	});

	it("waits the retry delay between failed attempts and gives up at the limit", () => {
		for (let attempt = 1; attempt < ACCOUNT_MODE_SETUP_MAX_ATTEMPTS; attempt++) {
			expect(beginAccountModeSetupAttempt(OWNER)).toBe(true);
			failAccountModeSetupAttempt(OWNER, "failed");
			expect(getAccountModeSetupAttemptStatus(OWNER)).toBe("waiting");
			expect(beginAccountModeSetupAttempt(OWNER)).toBe(false);
			vi.advanceTimersByTime(ACCOUNT_MODE_SETUP_RETRY_DELAY_MS - 1);
			expect(getAccountModeSetupAttemptStatus(OWNER)).toBe("waiting");
			vi.advanceTimersByTime(1);
			expect(getAccountModeSetupAttemptStatus(OWNER)).toBe("idle");
		}

		expect(beginAccountModeSetupAttempt(OWNER)).toBe(true);
		failAccountModeSetupAttempt(OWNER, "failed");
		expect(getAccountModeSetupAttemptStatus(OWNER)).toBe("exhausted");
		vi.advanceTimersByTime(ACCOUNT_MODE_SETUP_RETRY_DELAY_MS * 2);
		expect(getAccountModeSetupAttemptStatus(OWNER)).toBe("exhausted");
		expect(beginAccountModeSetupAttempt(OWNER)).toBe(false);
	});

	it("ignores a result for an attempt that is not in flight", () => {
		settleAccountModeSetupAttempt(OWNER);
		failAccountModeSetupAttempt(OWNER, "rejected");
		expect(getAccountModeSetupAttemptStatus(OWNER)).toBe("idle");

		beginAccountModeSetupAttempt(OWNER);
		failAccountModeSetupAttempt(OWNER, "failed");
		settleAccountModeSetupAttempt(OWNER);
		failAccountModeSetupAttempt(OWNER, "rejected");
		expect(getAccountModeSetupAttemptStatus(OWNER)).toBe("waiting");
	});

	it("notifies subscribers on every status change, including the retry becoming due", () => {
		const listener = vi.fn();
		const unsubscribe = subscribeAccountModeSetupAttempts(listener);
		beginAccountModeSetupAttempt(OWNER);
		failAccountModeSetupAttempt(OWNER, "failed");
		expect(listener).toHaveBeenCalledTimes(2);
		vi.advanceTimersByTime(ACCOUNT_MODE_SETUP_RETRY_DELAY_MS);
		expect(listener).toHaveBeenCalledTimes(3);
		unsubscribe();
		beginAccountModeSetupAttempt(OWNER);
		expect(listener).toHaveBeenCalledTimes(3);
	});
});
