import { describe, expect, it, vi } from "vitest";
import { fetchHistoryPageWithRetry, fetchTimeRangeHistory } from "@/lib/trade/history-pagination";

interface Event {
	id: string;
	time: number;
}

describe("history pagination", () => {
	it("deduplicates inclusive cursor overlaps without dropping events at the same timestamp", async () => {
		const requestedCursors: number[] = [];
		const controller = new AbortController();
		const result = await fetchTimeRangeHistory<Event>({
			endTime: 3_000,
			fetchPage: async (startTime) => {
				requestedCursors.push(startTime);
				if (startTime === 0)
					return [
						{ id: "a", time: 1_000 },
						{ id: "b", time: 2_000 },
					];
				if (startTime === 2_000)
					return [
						{ id: "b", time: 2_000 },
						{ id: "c", time: 2_000 },
						{ id: "d", time: 3_000 },
					];
				if (startTime === 3_000) return [{ id: "d", time: 3_000 }];
				return [];
			},
			getKey: (event) => event.id,
			getTime: (event) => event.time,
			signal: controller.signal,
		});

		expect(requestedCursors).toEqual([0, 2_000, 3_000]);
		expect(result).toEqual({
			items: [
				{ id: "a", time: 1_000 },
				{ id: "b", time: 2_000 },
				{ id: "c", time: 2_000 },
				{ id: "d", time: 3_000 },
			],
			truncated: false,
		});
	});

	it("reports an explicit boundary when the protocol item limit is reached", async () => {
		const controller = new AbortController();
		const result = await fetchTimeRangeHistory<Event>({
			endTime: 3_000,
			fetchPage: async () => [
				{ id: "a", time: 1_000 },
				{ id: "b", time: 2_000 },
			],
			getKey: (event) => event.id,
			getTime: (event) => event.time,
			maxItems: 2,
			signal: controller.signal,
		});

		expect(result.truncated).toBe(true);
		expect(result.items).toHaveLength(2);
	});

	it("walks a busy bounded range to its end while retaining only the latest display rows", async () => {
		const rangeStart = 10_000;
		const events = Array.from({ length: 1_200 }, (_, index) => ({
			id: `event-${index + 1}`,
			time: rangeStart + index + 1,
		}));
		const requestedCursors: number[] = [];
		const controller = new AbortController();

		const result = await fetchTimeRangeHistory<Event>({
			endTime: rangeStart + 1_200,
			fetchPage: async (startTime) => {
				requestedCursors.push(startTime);
				return events.filter((event) => event.time >= startTime).slice(0, 500);
			},
			getKey: (event) => event.id,
			getTime: (event) => event.time,
			retainLatestItems: 200,
			signal: controller.signal,
			startTime: rangeStart,
		});

		expect(requestedCursors).toEqual([rangeStart, rangeStart + 500, rangeStart + 999, rangeStart + 1_200]);
		expect(result.truncated).toBe(false);
		expect(result.items).toHaveLength(200);
		expect(result.items.at(0)?.id).toBe("event-1001");
		expect(result.items.at(-1)?.id).toBe("event-1200");
	});

	it("stops after a complete endpoint-specific short page", async () => {
		const controller = new AbortController();
		const fetchPage = vi.fn(async () =>
			Array.from({ length: 478 }, (_, index) => ({ id: `event-${index}`, time: index + 1 })),
		);

		const result = await fetchTimeRangeHistory<Event>({
			endTime: 1_000,
			fetchPage,
			getKey: (event) => event.id,
			getTime: (event) => event.time,
			pageLimit: 500,
			requireAscending: true,
			signal: controller.signal,
		});

		expect(fetchPage).toHaveBeenCalledOnce();
		expect(result).toMatchObject({ items: expect.any(Array), truncated: false });
		expect(result.items).toHaveLength(478);
	});

	it("fails closed when an endpoint requiring ascending pages returns unordered timestamps", async () => {
		const controller = new AbortController();

		await expect(
			fetchTimeRangeHistory<Event>({
				endTime: 3_000,
				fetchPage: async () => [
					{ id: "later", time: 2_000 },
					{ id: "earlier", time: 1_000 },
				],
				getKey: (event) => event.id,
				getTime: (event) => event.time,
				pageLimit: 500,
				requireAscending: true,
				signal: controller.signal,
			}),
		).rejects.toMatchObject({ name: "MalformedHistoryPageError" });
	});

	it("preserves matching history outside the latest display window", async () => {
		const events = Array.from({ length: 600 }, (_, index) => ({
			id: `event-${index + 1}`,
			preserve: index === 9,
			time: index + 1,
		}));
		const controller = new AbortController();
		const result = await fetchTimeRangeHistory({
			endTime: 600,
			fetchPage: async (startTime) => events.filter((event) => event.time >= startTime).slice(0, 500),
			getKey: (event) => event.id,
			getTime: (event) => event.time,
			retainItemsMatching: (event) => event.preserve,
			retainLatestItems: 200,
			signal: controller.signal,
		});

		expect(result.truncated).toBe(false);
		expect(result.items).toHaveLength(201);
		expect(result.items.at(0)?.id).toBe("event-10");
		expect(result.items.at(1)?.id).toBe("event-401");
	});

	it("bounds retained matches without excluding raw items from pagination", async () => {
		const events = Array.from({ length: 12 }, (_, index) => ({
			id: `event-${index + 1}`,
			retain: (index + 1) % 2 === 0,
			time: index + 1,
		}));
		const requestedCursors: number[] = [];
		const validatedIds: string[] = [];
		const controller = new AbortController();

		const result = await fetchTimeRangeHistory({
			endTime: 12,
			fetchPage: async (startTime) => {
				requestedCursors.push(startTime);
				return events.filter((event) => event.time >= startTime).slice(0, 5);
			},
			getKey: (event) => event.id,
			getTime: (event) => event.time,
			pageLimit: 5,
			retainLatestItems: 3,
			retainItemsWhere: (event) => event.retain,
			signal: controller.signal,
			validateItem: (event) => {
				validatedIds.push(event.id);
				return true;
			},
		});

		expect(requestedCursors).toEqual([0, 5, 9]);
		expect(validatedIds).toContain("event-1");
		expect(result).toEqual({
			items: [
				{ id: "event-8", retain: true, time: 8 },
				{ id: "event-10", retain: true, time: 10 },
				{ id: "event-12", retain: true, time: 12 },
			],
			truncated: false,
		});
	});

	it("retries 429 responses and respects the abortable retry path", async () => {
		const controller = new AbortController();
		const request = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(
				Object.assign(new Error("rate limited"), {
					response: { headers: { get: () => "0" }, status: 429 },
				}),
			)
			.mockResolvedValue("ok");
		const wait = vi.fn(async () => undefined);

		await expect(fetchHistoryPageWithRetry(request, { signal: controller.signal, wait })).resolves.toBe("ok");
		expect(request).toHaveBeenCalledTimes(2);
		expect(wait).toHaveBeenCalledWith(0, controller.signal);
	});

	it("does not retry deterministic client errors", async () => {
		const controller = new AbortController();
		const error = Object.assign(new Error("bad request"), { response: { status: 400 } });
		const request = vi.fn<() => Promise<string>>().mockRejectedValue(error);
		const wait = vi.fn(async () => undefined);

		await expect(fetchHistoryPageWithRetry(request, { signal: controller.signal, wait })).rejects.toBe(error);
		expect(request).toHaveBeenCalledTimes(1);
		expect(wait).not.toHaveBeenCalled();
	});

	it("rejects malformed or out-of-range cursor timestamps", async () => {
		const controller = new AbortController();
		const baseOptions = {
			endTime: 2_000,
			getKey: (event: Event) => event.id,
			getTime: (event: Event) => event.time,
			signal: controller.signal,
			startTime: 1_000,
		};

		await expect(
			fetchTimeRangeHistory({ ...baseOptions, fetchPage: async () => [{ id: "invalid", time: Number.NaN }] }),
		).rejects.toMatchObject({ name: "MalformedHistoryPageError" });
		await expect(
			fetchTimeRangeHistory({ ...baseOptions, fetchPage: async () => [{ id: "future", time: 2_001 }] }),
		).rejects.toMatchObject({ name: "MalformedHistoryPageError" });
		await expect(
			fetchTimeRangeHistory({
				...baseOptions,
				fetchPage: async () => [{ id: "missing-identity", time: 1_500 }],
				validateItem: () => false,
			}),
		).rejects.toMatchObject({ name: "MalformedHistoryPageError" });
		await expect(
			fetchTimeRangeHistory({ ...baseOptions, fetchPage: async () => ({ items: [] }) as never }),
		).rejects.toMatchObject({ name: "MalformedHistoryPageError" });
	});
});
