import type { ExchangeClient } from "@nktkas/hyperliquid";
import type { ExchangeMethod } from "../../types/clients";

export type ExchangeRequestPriority = "normal" | "urgent";

type QueueEntry<T> = {
	run: () => Promise<T>;
	resolve: (value: T) => void;
	reject: (reason: unknown) => void;
};

export class ExchangeRequestScheduler {
	private readonly urgentQueue: QueueEntry<unknown>[] = [];
	private readonly normalQueue: QueueEntry<unknown>[] = [];
	private running = false;

	schedule<T>(priority: ExchangeRequestPriority, run: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const entry = { run, resolve, reject } as QueueEntry<unknown>;
			if (priority === "urgent") this.urgentQueue.push(entry);
			else this.normalQueue.push(entry);
			this.drain();
		});
	}

	private drain(): void {
		if (this.running) return;
		const entry = this.urgentQueue.shift() ?? this.normalQueue.shift();
		if (!entry) return;

		this.running = true;
		Promise.resolve()
			.then(entry.run)
			.then(entry.resolve, entry.reject)
			.finally(() => {
				this.running = false;
				this.drain();
			});
	}
}

const schedulers = new WeakMap<ExchangeClient, ExchangeRequestScheduler>();

function containsOnlyReduceOnlyOrders(params: unknown, field: "modifies" | "orders"): boolean {
	if (!params || typeof params !== "object") return false;
	const entries = (params as Record<string, unknown>)[field];
	if (!Array.isArray(entries) || entries.length === 0) return false;

	return entries.every((entry) => {
		if (!entry || typeof entry !== "object") return false;
		const order = field === "modifies" ? (entry as Record<string, unknown>).order : entry;
		return !!order && typeof order === "object" && (order as Record<string, unknown>).r === true;
	});
}

export function getExchangeRequestPriority(method: ExchangeMethod, params: unknown): ExchangeRequestPriority {
	if (method === "cancel" || method === "cancelByCloid" || method === "twapCancel") return "urgent";
	if (method === "order" && containsOnlyReduceOnlyOrders(params, "orders")) return "urgent";
	if (method === "batchModify" && containsOnlyReduceOnlyOrders(params, "modifies")) return "urgent";
	if (method === "twapOrder" && params && typeof params === "object") {
		const twap = (params as Record<string, unknown>).twap;
		if (twap && typeof twap === "object" && (twap as Record<string, unknown>).r === true) return "urgent";
	}
	return "normal";
}

export function scheduleExchangeRequest<T>(
	client: ExchangeClient,
	priority: ExchangeRequestPriority,
	run: () => Promise<T>,
): Promise<T> {
	let scheduler = schedulers.get(client);
	if (!scheduler) {
		scheduler = new ExchangeRequestScheduler();
		schedulers.set(client, scheduler);
	}
	return scheduler.schedule(priority, run);
}
