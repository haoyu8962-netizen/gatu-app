import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { PAIRING_HEAD_SCRUB_SCRIPT } from "@/lib/mobile-sync/head-scrub-script.generated";
import {
	canonicalPairingPath,
	classifyPairingPath,
	installPairingBootstrap,
	PAIRING_BOOTSTRAP_GLOBAL,
	type PairingBootstrapHandoff,
	type PairingScrubWindow,
	scrubPairingLocation,
} from "@/lib/mobile-sync/pairing-location";

interface HeadScrubRenderer {
	renderGeneratedModule: (script: string) => string;
	renderPairingHeadScrubScript: () => Promise<string>;
}

const ORIGIN = "https://app.gatu.test";

function createWindow(url: string, replaceState?: (win: PairingScrubWindow, url: string) => void) {
	const current = new URL(url, ORIGIN);
	const written: string[] = [];
	const win: PairingScrubWindow = {
		location: {
			get hash() {
				return current.hash;
			},
			get href() {
				return current.href;
			},
			get pathname() {
				return current.pathname;
			},
			get search() {
				return current.search;
			},
		},
		history: {
			state: { key: "kept" },
			replaceState(_state, _unused, next) {
				written.push(next);
				if (replaceState) return replaceState(win, next);
				const target = new URL(next, current.href);
				current.pathname = target.pathname;
				current.search = target.search;
				current.hash = target.hash;
			},
		},
	};
	return { win, written, address: () => `${current.pathname}${current.search}${current.hash}` };
}

describe("pairing path classification", () => {
	it.each([
		["/mobile-agent-sync", "pairing"],
		["/mobile-agent-sync/", "pairing"],
		["/Mobile-Agent-Sync", "pairing"],
		["/MOBILE-AGENT-SYNC/", "pairing"],
		["/%4Dobile-agent-sync", "pairing"],
		["/mobile-agent-sync/nested", "rejected"],
		["/mobile-agent-sync//", "rejected"],
		["/mobile-agent-sync%2Fchild", "rejected"],
		["/Mobile-Agent-Sync/ht-mobile-sync=secret", "rejected"],
		["/mobile-agent-sync%", "rejected"],
		["/MOBILE-AGENT-SYNC/%zz", "rejected"],
		["/mobile-agent-sync-ticket", "other"],
		["/mobile-agent-sync-ticket%", "other"],
		["/mobile-agent-syncs", "other"],
		["/mobile-agent-sync;v=1", "other"],
		["/mobile-agent-ſync", "other"],
		["/%252Fmobile-agent-sync", "other"],
		["/trade/HYPE", "other"],
		["/", "other"],
	] as const)("classifies %s as %s", (pathname, kind) => {
		expect(classifyPairingPath(pathname)).toBe(kind);
	});

	it("keeps the exact route spelling and canonicalises every other accepted spelling", () => {
		expect(canonicalPairingPath("/mobile-agent-sync")).toBe("/mobile-agent-sync");
		expect(canonicalPairingPath("/mobile-agent-sync/")).toBe("/mobile-agent-sync/");
		expect(canonicalPairingPath("/Mobile-Agent-Sync")).toBe("/mobile-agent-sync");
		expect(canonicalPairingPath("/%4Dobile-agent-sync/")).toBe("/mobile-agent-sync");
	});
});

describe("pairing location scrub", () => {
	it.each([
		["/mobile-agent-sync?from=qr#bearer", "/mobile-agent-sync?from=qr"],
		["/mobile-agent-sync/#bearer", "/mobile-agent-sync/"],
		["/Mobile-Agent-Sync?from=qr#bearer", "/mobile-agent-sync?from=qr"],
		["/%4Dobile-agent-sync#bearer", "/mobile-agent-sync"],
	])("captures %s and leaves %s in the address bar", (url, clean) => {
		const { win, address } = createWindow(url);
		const bearerUrl = win.location.href;

		expect(scrubPairingLocation(win)).toEqual({ status: "captured", capturedUrl: bearerUrl });
		expect(address()).toBe(clean);
	});

	it.each([
		["/mobile-agent-sync?from=camera&ht-mobile-sync=envelope&k=key#also-secret", "/mobile-agent-sync?from=camera"],
		["/mobile-agent-sync/ht-mobile-sync=envelope/k=key#also-secret", "/mobile-agent-sync"],
		["/mobile-agent-sync%2Fht-mobile-sync%3Denvelope#also-secret", "/mobile-agent-sync"],
		["/Mobile-Agent-Sync/nested?k=key", "/mobile-agent-sync"],
		["/mobile-agent-sync%#also-secret", "/mobile-agent-sync"],
	])("scrubs %s without capturing anything", (url, clean) => {
		const { win, address } = createWindow(url);

		expect(scrubPairingLocation(win)).toEqual({ status: "invalid", capturedUrl: null });
		expect(address()).toBe(clean);
	});

	it.each(["/trade/HYPE#bearer", "/mobile-agent-sync", "/Mobile-Agent-Sync?from=qr", "/mobile-agent-sync-ticket#x"])(
		"leaves %s alone",
		(url) => {
			const { win, written } = createWindow(url);

			expect(scrubPairingLocation(win)).toEqual({ status: "none", capturedUrl: null });
			expect(written).toEqual([]);
		},
	);

	it("is blocked when the history entry cannot be replaced, and keeps nothing", () => {
		const throwing = createWindow("/mobile-agent-sync#bearer", () => {
			throw new DOMException("blocked", "SecurityError");
		});
		expect(scrubPairingLocation(throwing.win)).toEqual({ status: "blocked", capturedUrl: null });

		const ignored = createWindow("/mobile-agent-sync#bearer", () => undefined);
		expect(scrubPairingLocation(ignored.win)).toEqual({ status: "blocked", capturedUrl: null });
		expect(ignored.address()).toBe("/mobile-agent-sync#bearer");

		const stuckQuery = createWindow("/mobile-agent-sync?k=key", () => undefined);
		expect(scrubPairingLocation(stuckQuery.win)).toEqual({ status: "blocked", capturedUrl: null });
	});

	it("keeps the history state it found", () => {
		const states: unknown[] = [];
		const { win } = createWindow("/mobile-agent-sync#bearer");
		const replaceState = win.history.replaceState.bind(win.history);
		win.history.replaceState = (state, unused, url) => {
			states.push(state);
			replaceState(state, unused, url);
		};

		scrubPairingLocation(win);
		expect(states).toEqual([{ key: "kept" }]);
	});
});

describe("pairing bootstrap handoff", () => {
	function readHandoff(win: PairingScrubWindow): PairingBootstrapHandoff {
		return Reflect.get(win, PAIRING_BOOTSTRAP_GLOBAL) as PairingBootstrapHandoff;
	}

	it("hands the captured url over exactly once and keeps its status readable", () => {
		const { win } = createWindow("/mobile-agent-sync#bearer");
		const bearerUrl = win.location.href;
		installPairingBootstrap(win);
		const handoff = readHandoff(win);

		expect(handoff.v).toBe(1);
		expect(handoff.status).toBe("captured");
		expect(JSON.stringify(handoff)).not.toContain("bearer");
		expect(handoff.take()).toBe(bearerUrl);
		expect(handoff.take()).toBeNull();
		expect(handoff.status).toBe("captured");
	});

	it("cannot be replaced, rewritten or removed by a later script", () => {
		const { win } = createWindow("/mobile-agent-sync#bearer");
		installPairingBootstrap(win);
		const handoff = readHandoff(win);

		expect(() => Object.defineProperty(win, PAIRING_BOOTSTRAP_GLOBAL, { value: {} })).toThrow(TypeError);
		expect(Reflect.deleteProperty(win, PAIRING_BOOTSTRAP_GLOBAL)).toBe(false);
		expect(Reflect.set(handoff, "status", "none")).toBe(false);
		expect(Reflect.set(handoff, "take", () => "forged")).toBe(false);
		expect(readHandoff(win)).toBe(handoff);
	});

	it.each([
		["/trade/HYPE#x", "none"],
		["/mobile-agent-sync?k=key", "invalid"],
	] as const)("reports %s as %s with nothing to take", (url, status) => {
		const { win } = createWindow(url);
		installPairingBootstrap(win);

		expect(readHandoff(win).status).toBe(status);
		expect(readHandoff(win).take()).toBeNull();
	});
});

describe("rendered head scrub script", () => {
	it("is the committed rendering of the single source", async () => {
		const rendererUrl = pathToFileURL(resolve(__dirname, "../../../scripts/render-pairing-head-scrub.mjs")).href;
		const renderer = (await import(/* @vite-ignore */ rendererUrl)) as HeadScrubRenderer;
		const script = await renderer.renderPairingHeadScrubScript();

		expect(PAIRING_HEAD_SCRUB_SCRIPT, "run: node apps/terminal/scripts/render-pairing-head-scrub.mjs").toBe(script);
		expect(script).not.toMatch(/<\/script|<!--/i);
		expect(script).not.toContain("`");
		expect(Buffer.byteLength(script, "utf8")).toBeLessThan(2_048);
	});

	it.each([
		["/mobile-agent-sync?from=qr#bearer", "captured", "/mobile-agent-sync?from=qr"],
		["/Mobile-Agent-Sync/#bearer", "captured", "/mobile-agent-sync"],
		["/mobile-agent-sync/nested#bearer", "invalid", "/mobile-agent-sync"],
		["/trade/HYPE#bearer", "none", "/trade/HYPE#bearer"],
	])("runs as a classic script on %s and reports %s", (url, status, clean) => {
		const { win, address } = createWindow(url);
		const bearerUrl = win.location.href;
		const sandbox = Object.assign(win, { URLSearchParams, decodeURIComponent });
		runInNewContext(PAIRING_HEAD_SCRUB_SCRIPT, { ...sandbox, window: sandbox });

		const handoff = Reflect.get(sandbox, PAIRING_BOOTSTRAP_GLOBAL) as PairingBootstrapHandoff;
		expect(handoff.status).toBe(status);
		expect(handoff.take()).toBe(status === "captured" ? bearerUrl : null);
		expect(address()).toBe(clean);
	});

	it("reports blocked instead of throwing when the address cannot be scrubbed", () => {
		const { win } = createWindow("/mobile-agent-sync#bearer", () => {
			throw new DOMException("blocked", "SecurityError");
		});
		const sandbox = Object.assign(win, { URLSearchParams, decodeURIComponent });
		runInNewContext(PAIRING_HEAD_SCRUB_SCRIPT, { ...sandbox, window: sandbox });

		const handoff = Reflect.get(sandbox, PAIRING_BOOTSTRAP_GLOBAL) as PairingBootstrapHandoff;
		expect(handoff.status).toBe("blocked");
		expect(handoff.take()).toBeNull();
	});
});
