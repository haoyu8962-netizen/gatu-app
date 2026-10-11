import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readTradingActivation, TRADING_ACTIVATION_CHECK_TIMEOUT_MS } from "@/lib/mobile-sync/trading-activation";

const OWNER = "0x1111111111111111111111111111111111111111";
const BUILDER = "0x9999999999999999999999999999999999999999";

function reader(answer: unknown) {
	return { maxBuilderFee: vi.fn(async () => answer as number) };
}

describe("readTradingActivation", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("asks for the exact owner and builder and accepts an approval at or above the configured fee", async () => {
		const info = reader(10);
		await expect(readTradingActivation(info, OWNER, { b: BUILDER, f: 10 }, new AbortController().signal)).resolves.toBe(
			"activated",
		);
		expect(info.maxBuilderFee).toHaveBeenCalledWith({ user: OWNER, builder: BUILDER }, expect.any(AbortSignal));
		await expect(
			readTradingActivation(reader(25), OWNER, { b: BUILDER, f: 10 }, new AbortController().signal),
		).resolves.toBe("activated");
	});

	it("reports an approval below the configured fee as not activated", async () => {
		for (const answer of [0, 9]) {
			await expect(
				readTradingActivation(reader(answer), OWNER, { b: BUILDER, f: 10 }, new AbortController().signal),
			).resolves.toBe("notActivated");
		}
	});

	it("fails instead of guessing when the answer is not a finite number", async () => {
		for (const answer of ["10", Number.POSITIVE_INFINITY, Number.NaN, null, undefined]) {
			await expect(
				readTradingActivation(reader(answer), OWNER, { b: BUILDER, f: 10 }, new AbortController().signal),
			).rejects.toThrow();
		}
	});

	it("needs no request when no builder code is configured", async () => {
		const info = reader(0);
		await expect(readTradingActivation(info, OWNER, undefined, new AbortController().signal)).resolves.toBe(
			"activated",
		);
		expect(info.maxBuilderFee).not.toHaveBeenCalled();
	});

	it("aborts the request when the caller aborts or the check times out", async () => {
		const signals: AbortSignal[] = [];
		const info = {
			maxBuilderFee: vi.fn(
				(_params: unknown, signal?: AbortSignal) =>
					new Promise<number>((_resolve, reject) => {
						if (signal) signals.push(signal);
						signal?.addEventListener("abort", () => reject(new Error("aborted")));
					}),
			),
		};
		const caller = new AbortController();
		const aborted = readTradingActivation(info, OWNER, { b: BUILDER, f: 10 }, caller.signal);
		caller.abort();
		await expect(aborted).rejects.toThrow("aborted");
		expect(signals[0]?.aborted).toBe(true);

		const timedOut = readTradingActivation(info, OWNER, { b: BUILDER, f: 10 }, new AbortController().signal);
		const assertion = expect(timedOut).rejects.toThrow("aborted");
		await vi.advanceTimersByTimeAsync(TRADING_ACTIVATION_CHECK_TIMEOUT_MS);
		await assertion;
		expect(signals[1]?.aborted).toBe(true);
	});
});
