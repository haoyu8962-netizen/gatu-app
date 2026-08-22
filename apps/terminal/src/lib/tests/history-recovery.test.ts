import { afterEach, describe, expect, it, vi } from "vitest";
import { createHistoryRecoveryController } from "@/lib/chart/history-recovery";

describe("chart history recovery", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("retries with bounded backoff and resets the sequence after success", async () => {
		vi.useFakeTimers();
		const onRetry = vi.fn();
		const onExhausted = vi.fn();
		const controller = createHistoryRecoveryController({
			canRetry: () => true,
			delaysMs: [100, 200],
			onExhausted,
			onRetry,
		});

		controller.handleFailure();
		await vi.advanceTimersByTimeAsync(99);
		expect(onRetry).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(onRetry).toHaveBeenCalledTimes(1);

		controller.handleFailure();
		await vi.advanceTimersByTimeAsync(200);
		expect(onRetry).toHaveBeenCalledTimes(2);

		controller.handleSuccess();
		controller.handleFailure();
		await vi.advanceTimersByTimeAsync(100);
		expect(onRetry).toHaveBeenCalledTimes(3);
		expect(onExhausted).not.toHaveBeenCalled();
	});

	it("coalesces concurrent failures into one retry", async () => {
		vi.useFakeTimers();
		const onRetry = vi.fn();
		const controller = createHistoryRecoveryController({
			canRetry: () => true,
			delaysMs: [100],
			onExhausted: vi.fn(),
			onRetry,
		});

		controller.handleFailure();
		controller.handleFailure();
		await vi.advanceTimersByTimeAsync(100);

		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("waits while retries are paused and flushes immediately after resume", async () => {
		vi.useFakeTimers();
		let canRetry = false;
		const onRetry = vi.fn();
		const controller = createHistoryRecoveryController({
			canRetry: () => canRetry,
			delaysMs: [100],
			onExhausted: vi.fn(),
			onRetry,
		});

		controller.handleFailure();
		await vi.advanceTimersByTimeAsync(1_000);
		expect(onRetry).not.toHaveBeenCalled();

		canRetry = true;
		controller.flush();
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("does not let a concurrent stale success cancel a pending retry", async () => {
		vi.useFakeTimers();
		const onRetry = vi.fn();
		const controller = createHistoryRecoveryController({
			canRetry: () => true,
			delaysMs: [100],
			onExhausted: vi.fn(),
			onRetry,
		});

		controller.handleFailure();
		controller.handleSuccess();
		await vi.advanceTimersByTimeAsync(100);

		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("reports exhaustion once after the final retry fails", async () => {
		vi.useFakeTimers();
		const onExhausted = vi.fn();
		const controller = createHistoryRecoveryController({
			canRetry: () => true,
			delaysMs: [100, 200],
			onExhausted,
			onRetry: vi.fn(),
		});

		controller.handleFailure();
		await vi.advanceTimersByTimeAsync(100);
		controller.handleFailure();
		await vi.advanceTimersByTimeAsync(200);
		controller.handleFailure();
		controller.handleFailure();

		expect(onExhausted).toHaveBeenCalledTimes(1);
	});

	it("cancels pending work when destroyed", async () => {
		vi.useFakeTimers();
		const onRetry = vi.fn();
		const controller = createHistoryRecoveryController({
			canRetry: () => true,
			delaysMs: [100],
			onExhausted: vi.fn(),
			onRetry,
		});

		controller.handleFailure();
		controller.destroy();
		await vi.advanceTimersByTimeAsync(100);

		expect(onRetry).not.toHaveBeenCalled();
	});
});
