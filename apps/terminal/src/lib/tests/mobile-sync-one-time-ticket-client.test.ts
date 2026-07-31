import { describe, expect, it } from "vitest";
import { getOrCreateMobileSyncConsumerId } from "../mobile-sync/one-time-ticket-client";

class MemoryStorage implements Storage {
	private readonly values = new Map<string, string>();

	get length() {
		return this.values.size;
	}

	clear() {
		this.values.clear();
	}

	getItem(key: string) {
		return this.values.get(key) ?? null;
	}

	key(index: number) {
		return [...this.values.keys()][index] ?? null;
	}

	removeItem(key: string) {
		this.values.delete(key);
	}

	setItem(key: string, value: string) {
		this.values.set(key, value);
	}
}

describe("mobile sync consumer identity", () => {
	it("persists a stable per-session id for idempotent consume retries", () => {
		const storage = new MemoryStorage();
		const first = getOrCreateMobileSyncConsumerId(storage);
		const second = getOrCreateMobileSyncConsumerId(storage);

		expect(first).toMatch(/^[0-9a-f]{32}$/);
		expect(second).toBe(first);
	});

	it("fails closed when the session id cannot be persisted", () => {
		const storage = new MemoryStorage();
		storage.setItem = () => {
			throw new Error("blocked");
		};

		expect(getOrCreateMobileSyncConsumerId(storage)).toBeNull();
	});
});
