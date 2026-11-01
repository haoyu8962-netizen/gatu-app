import { describe, expect, it } from "vitest";
import {
	type FillSnapshotState,
	fillSnapshotReachesLiveFills,
	getFilteredFillsEmptyPresentation,
} from "@/lib/trade/fill-filter-presentation";

const loaded: FillSnapshotState = {
	hasData: true,
	failed: false,
	fetching: false,
	offline: false,
	reachedLimit: false,
	reachesLive: true,
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

	it("offers a retry instead of a conclusion while fills could fall between the snapshot and the live fills", () => {
		expect(getFilteredFillsEmptyPresentation({ liveCurrent: true, snapshot: { ...loaded, reachesLive: false } })).toBe(
			"retry",
		);
		expect(
			getFilteredFillsEmptyPresentation({
				liveCurrent: true,
				snapshot: { ...loaded, reachesLive: false, reachedLimit: true },
			}),
		).toBe("retry");
		expect(
			getFilteredFillsEmptyPresentation({
				liveCurrent: true,
				snapshot: { ...loaded, reachesLive: false, fetching: true },
			}),
		).toBe("loading");
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

describe("whether a fills snapshot reaches the live fills", () => {
	it("reaches them when the oldest live fill is not newer than the newest snapshot fill", () => {
		expect(fillSnapshotReachesLiveFills(300, 300)).toBe(true);
		expect(fillSnapshotReachesLiveFills(300, 250)).toBe(true);
	});

	it("leaves a gap when the oldest live fill is newer than the newest snapshot fill", () => {
		expect(fillSnapshotReachesLiveFills(300, 301)).toBe(false);
	});

	it("has nothing to bridge when the subscription holds no fill", () => {
		expect(fillSnapshotReachesLiveFills(300, null)).toBe(true);
		expect(fillSnapshotReachesLiveFills(null, null)).toBe(true);
	});

	it("does not let a snapshot without fills vouch for live fills the subscription may have dropped", () => {
		expect(fillSnapshotReachesLiveFills(null, 500)).toBe(false);
	});
});
