import {
	captureExchangeRequestGeneration,
	type ExchangeProviderLifecycleLease,
	ExchangeRequestInvalidatedError,
	ExchangeRequestScheduler,
	getExchangeRequestPriority,
	invalidateExchangeRequestIdentity,
} from "@sairn/hl-react/internal/exchange/request-scheduler";
import { describe, expect, it, vi } from "vitest";

describe("exchange request scheduler", () => {
	it("runs an urgent cancel before normal requests that have not entered the SDK lock", async () => {
		const scheduler = new ExchangeRequestScheduler();
		const order: string[] = [];
		let releaseFirst: (() => void) | undefined;
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});

		const first = scheduler.schedule("normal", async () => {
			order.push("first-start");
			await firstGate;
			order.push("first-end");
		});
		const second = scheduler.schedule("normal", async () => {
			order.push("second");
		});
		const cancel = scheduler.schedule("urgent", async () => {
			order.push("cancel");
		});

		await vi.waitFor(() => expect(order).toEqual(["first-start"]));
		releaseFirst?.();
		await Promise.all([first, second, cancel]);

		expect(order).toEqual(["first-start", "first-end", "cancel", "second"]);
	});

	it("continues draining after a failed request", async () => {
		const scheduler = new ExchangeRequestScheduler();
		const next = vi.fn(async () => "ok");

		const failed = scheduler.schedule("normal", async () => {
			throw new Error("failed");
		});
		const completed = scheduler.schedule("normal", next);

		await expect(failed).rejects.toThrow("failed");
		await expect(completed).resolves.toBe("ok");
		expect(next).toHaveBeenCalledOnce();
	});

	it("rejects queued work after identity loss while allowing an already-started request to finish", async () => {
		const scheduler = new ExchangeRequestScheduler();
		const generation = captureExchangeRequestGeneration(
			"Mainnet",
			"0x1111111111111111111111111111111111111111",
			"wallet",
		);
		let releaseStarted: (() => void) | undefined;
		const startedGate = new Promise<void>((resolve) => {
			releaseStarted = resolve;
		});
		const startedRun = vi.fn(async () => {
			await startedGate;
			return "started-result";
		});
		const queuedRun = vi.fn(async () => "queued-result");

		const started = scheduler.schedule("normal", startedRun, generation);
		await vi.waitFor(() => expect(startedRun).toHaveBeenCalledOnce());
		const queued = scheduler.schedule("normal", queuedRun, generation);
		const queuedRejection = expect(queued).rejects.toBeInstanceOf(ExchangeRequestInvalidatedError);

		invalidateExchangeRequestIdentity("Mainnet", generation.clientKey, "wallet");
		await queuedRejection;
		expect(queuedRun).not.toHaveBeenCalled();

		releaseStarted?.();
		await expect(started).resolves.toBe("started-result");
	});

	it("does not enter the SDK when identity loss happens before the selected request starts", async () => {
		const scheduler = new ExchangeRequestScheduler();
		const generation = captureExchangeRequestGeneration(
			"Mainnet",
			"0x2222222222222222222222222222222222222222",
			"wallet",
		);
		const run = vi.fn(async () => "unexpected");
		const pending = scheduler.schedule("normal", run, generation);
		const rejection = expect(pending).rejects.toBeInstanceOf(ExchangeRequestInvalidatedError);

		invalidateExchangeRequestIdentity("Mainnet", generation.clientKey, "wallet");

		await rejection;
		await Promise.resolve();
		expect(run).not.toHaveBeenCalled();
	});

	it("allows a newly captured generation without reviving the invalidated one", async () => {
		const scheduler = new ExchangeRequestScheduler();
		const clientKey = "0x3333333333333333333333333333333333333333";
		const staleGeneration = captureExchangeRequestGeneration("Testnet", clientKey, "agent-only");
		invalidateExchangeRequestIdentity("Testnet", clientKey);
		const currentGeneration = captureExchangeRequestGeneration("Testnet", clientKey, "agent-only");

		expect(currentGeneration).not.toBe(staleGeneration);
		await expect(scheduler.schedule("normal", async () => "stale", staleGeneration)).rejects.toBeInstanceOf(
			ExchangeRequestInvalidatedError,
		);
		await expect(scheduler.schedule("normal", async () => "current", currentGeneration)).resolves.toBe("current");
	});

	it("can retire one session mode without invalidating the replacement mode for the same address", async () => {
		const scheduler = new ExchangeRequestScheduler();
		const clientKey = "0x4444444444444444444444444444444444444444";
		const walletGeneration = captureExchangeRequestGeneration("Mainnet", clientKey, "wallet");
		const agentOnlyGeneration = captureExchangeRequestGeneration("Mainnet", clientKey, "agent-only");

		invalidateExchangeRequestIdentity("Mainnet", clientKey, "wallet");

		await expect(scheduler.schedule("normal", async () => "wallet", walletGeneration)).rejects.toBeInstanceOf(
			ExchangeRequestInvalidatedError,
		);
		await expect(scheduler.schedule("normal", async () => "agent", agentOnlyGeneration)).resolves.toBe("agent");
	});

	it("does not start queued work after its Provider lifecycle has unmounted", async () => {
		const scheduler = new ExchangeRequestScheduler();
		const lifecycle: ExchangeProviderLifecycleLease = {
			id: Symbol("provider-lifecycle"),
			active: true,
		};
		const generation = captureExchangeRequestGeneration(
			"Mainnet",
			"0x5555555555555555555555555555555555555555",
			"wallet",
			{ lifecycle },
		);
		let releaseStarted: (() => void) | undefined;
		const startedGate = new Promise<void>((resolve) => {
			releaseStarted = resolve;
		});
		const startedRun = vi.fn(async () => {
			await startedGate;
			return "started";
		});
		const queuedRun = vi.fn(async () => "queued");

		const started = scheduler.schedule("normal", startedRun, generation);
		await vi.waitFor(() => expect(startedRun).toHaveBeenCalledOnce());
		const queued = scheduler.schedule("normal", queuedRun, generation);
		const queuedRejection = expect(queued).rejects.toBeInstanceOf(ExchangeRequestInvalidatedError);

		lifecycle.active = false;
		releaseStarted?.();

		await expect(started).resolves.toBe("started");
		await queuedRejection;
		expect(queuedRun).not.toHaveBeenCalled();
	});

	it("prioritizes cancellation and reduce-only actions without changing other methods", () => {
		expect(getExchangeRequestPriority("cancel", { cancels: [] })).toBe("urgent");
		expect(getExchangeRequestPriority("twapCancel", { a: 0, t: 1 })).toBe("urgent");
		expect(getExchangeRequestPriority("order", { orders: [{ r: true }] })).toBe("urgent");
		expect(getExchangeRequestPriority("order", { orders: [{ r: true }, { r: false }] })).toBe("normal");
		expect(getExchangeRequestPriority("batchModify", { modifies: [{ order: { r: true } }] })).toBe("urgent");
		expect(getExchangeRequestPriority("twapOrder", { twap: { r: true } })).toBe("urgent");
		expect(getExchangeRequestPriority("updateLeverage", { leverage: 5 })).toBe("normal");
	});
});
