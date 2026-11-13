// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	DIAGNOSTICS_MAX_BOOTS,
	DIAGNOSTICS_MAX_BYTES,
	DIAGNOSTICS_STORAGE_KEY,
	type DiagnosticsBootRecord,
	readDiagnosticsBuffer,
	upsertDiagnosticsBootRecord,
} from "@/lib/diagnostics/diagnostics-buffer";

function boot(id: number, overrides: Partial<DiagnosticsBootRecord> = {}): DiagnosticsBootRecord {
	return {
		id: String(id),
		startedAt: id,
		build: { commit: "abcdef123456", release: "local" },
		navigation: null,
		resources: { total: 3, fetched: 2, fetchedBytes: 4096 },
		milestones: { entry: 40, reveal: 900 },
		hiddenAt: null,
		recoveries: [],
		...overrides,
	};
}

describe("diagnostics buffer", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts empty and replaces the entry of the same boot instead of adding a second one", () => {
		expect(readDiagnosticsBuffer()).toEqual({ v: 1, boots: [] });
		upsertDiagnosticsBootRecord(boot(1));
		upsertDiagnosticsBootRecord(boot(2));
		upsertDiagnosticsBootRecord(boot(1, { milestones: { entry: 40, reveal: 900, route: 1200 } }));
		const { boots } = readDiagnosticsBuffer();
		expect(boots.map((record) => record.id)).toEqual(["2", "1"]);
		expect(boots[1]?.milestones.route).toBe(1200);
	});

	it("keeps only the newest ten boots", () => {
		for (let index = 1; index <= DIAGNOSTICS_MAX_BOOTS + 3; index += 1) upsertDiagnosticsBootRecord(boot(index));
		const { boots } = readDiagnosticsBuffer();
		expect(boots).toHaveLength(DIAGNOSTICS_MAX_BOOTS);
		expect(boots[0]?.id).toBe("4");
		expect(boots.at(-1)?.id).toBe(String(DIAGNOSTICS_MAX_BOOTS + 3));
	});

	it("drops the oldest boots when the stored text would exceed its size cap", () => {
		const recoveries = Array.from({ length: 20 }, (_, index) => ({
			at: index,
			cause: "multiple-streams-stale" as const,
			action: "reconnect" as const,
			streams: 12,
			visibility: "visible" as const,
			network: "online" as const,
			durationMs: 123_456,
			result: "recovered" as const,
		}));
		for (let index = 1; index <= DIAGNOSTICS_MAX_BOOTS; index += 1)
			upsertDiagnosticsBootRecord(boot(index, { recoveries }));
		const stored = localStorage.getItem(DIAGNOSTICS_STORAGE_KEY) ?? "";
		expect(stored.length).toBeLessThanOrEqual(DIAGNOSTICS_MAX_BYTES);
		const { boots } = readDiagnosticsBuffer();
		expect(boots.length).toBeLessThan(DIAGNOSTICS_MAX_BOOTS);
		expect(boots.at(-1)?.id).toBe(String(DIAGNOSTICS_MAX_BOOTS));
	});

	it.each([
		["text that is not JSON", "{not json"],
		["an unknown version", JSON.stringify({ v: 2, boots: [] })],
		[
			"a boot with a text field where a time belongs",
			JSON.stringify({ v: 1, boots: [{ ...boot(1), startedAt: "x" }] }),
		],
	])("discards %s and starts over", (_label, stored) => {
		localStorage.setItem(DIAGNOSTICS_STORAGE_KEY, stored);
		expect(readDiagnosticsBuffer()).toEqual({ v: 1, boots: [] });
		expect(localStorage.getItem(DIAGNOSTICS_STORAGE_KEY)).toBeNull();
		upsertDiagnosticsBootRecord(boot(5));
		expect(readDiagnosticsBuffer().boots.map((record) => record.id)).toEqual(["5"]);
	});

	it("never throws when the browser refuses to store", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("quota", "QuotaExceededError");
		});
		expect(() => upsertDiagnosticsBootRecord(boot(1))).not.toThrow();
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new DOMException("denied", "SecurityError");
		});
		expect(readDiagnosticsBuffer()).toEqual({ v: 1, boots: [] });
	});
});
