import {
	ExchangeRequestScheduler,
	getExchangeRequestPriority,
} from "@gatu/hl-react/internal/exchange/request-scheduler";
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
