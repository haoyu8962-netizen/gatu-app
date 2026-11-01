import { describe, expect, it } from "vitest";
import { type FillSnapshotState, getFilteredFillsEmptyPresentation } from "@/lib/trade/fill-filter-presentation";

const loaded: FillSnapshotState = {
	hasData: true,
	failed: false,
	fetching: false,
	offline: false,
	reachedLimit: false,
};

describe("filtered fills empty presentation", () => {
	it("concludes no match only from a loaded snapshot and current live fills", () => {
		expect(getFilteredFillsEmptyPresentation({ liveCurrent: true, snapshot: loaded })).toBe("noMatch");
		expect(getFilteredFillsEmptyPresentation({ liveCurrent: false, snapshot: loaded })).toBe("loading");
	});

	it("names the snapshot limit when the snapshot reached it", () => {
		expect(getFilteredFillsEmptyPresentation({ liveCurrent: true, snapshot: { ...loaded, reachedLimit: true } })).toBe(
			"noMatchWithinLimit",
		);
	});

	it("stays quiet while a snapshot request is on its way, even over an earlier snapshot or failure", () => {
		expect(
			getFilteredFillsEmptyPresentation({ liveCurrent: true, snapshot: { ...loaded, hasData: false, fetching: true } }),
		).toBe("loading");
		expect(getFilteredFillsEmptyPresentation({ liveCurrent: true, snapshot: { ...loaded, fetching: true } })).toBe(
			"loading",
		);
		expect(
			getFilteredFillsEmptyPresentation({ liveCurrent: true, snapshot: { ...loaded, failed: true, fetching: true } }),
		).toBe("loading");
		expect(getFilteredFillsEmptyPresentation({ liveCurrent: true, snapshot: { ...loaded, hasData: false } })).toBe(
			"loading",
		);
	});

	it("offers a retry after a failed request, with or without an earlier snapshot", () => {
		expect(getFilteredFillsEmptyPresentation({ liveCurrent: true, snapshot: { ...loaded, failed: true } })).toBe(
			"retry",
		);
		expect(
			getFilteredFillsEmptyPresentation({ liveCurrent: true, snapshot: { ...loaded, hasData: false, failed: true } }),
		).toBe("retry");
	});

	it("stays blank while offline", () => {
		expect(getFilteredFillsEmptyPresentation({ liveCurrent: true, snapshot: { ...loaded, offline: true } })).toBe(
			"offline",
		);
		expect(
			getFilteredFillsEmptyPresentation({ liveCurrent: true, snapshot: { ...loaded, offline: true, failed: true } }),
		).toBe("offline");
	});
});
