// Runs the 02 runtime script (src/scripts/live-markets.ts) against the built dist/index.html in jsdom, with
// a fake clock, fetch, Web Lock and IntersectionObserver. It checks the fail-closed rules of plan §7 on the
// real markup; jsdom's event order is not a browser's, so a real-browser pass is still a separate check.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mock, test } from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import {
	combineDexTotals,
	createRequestPlan,
	formatStatUsd,
	META_AND_ASSET_CTXS_WEIGHT,
	readDexTotals,
	WEIGHT_LIMIT,
	WEIGHT_WINDOW_MS,
} from "../../src/lib/markets/live.js";
import { REQUEST_TIMEOUT_MS, startLiveMarkets } from "../../src/scripts/live-markets.ts";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const HOME_HTML = readFileSync(resolve(WEBSITE_ROOT, "dist/index.html"), "utf8");
const FIXTURES = resolve(WEBSITE_ROOT, "tests/fixtures");
const START = Date.parse("2026-10-26T00:00:00Z");

function fixtureBody(dex) {
	const file = `meta-and-asset-ctxs-${dex === "" ? "main" : dex}.json`;
	return JSON.parse(readFileSync(resolve(FIXTURES, file), "utf8")).body;
}

function setEntry(body, coin, part, fields) {
	const index = body[0].universe.findIndex((asset) => asset.name === coin);
	Object.assign(part === "asset" ? body[0].universe[index] : body[1][index], fields);
	return body;
}

function createLocks() {
	let holder = null;
	const queue = [];
	function grantNext() {
		if (holder !== null || queue.length === 0) return;
		const entry = queue.shift();
		holder = entry;
		Promise.resolve()
			.then(() => entry.callback({ name: "lock" }))
			.then(
				(value) => {
					holder = null;
					entry.resolve(value);
					grantNext();
				},
				(error) => {
					holder = null;
					entry.reject(error);
					grantNext();
				},
			);
	}
	return {
		isHeldHere: () => holder !== null && holder !== "elsewhere",
		holdElsewhere() {
			holder = "elsewhere";
		},
		releaseElsewhere() {
			if (holder === "elsewhere") holder = null;
			grantNext();
		},
		request(_name, options, callback) {
			return new Promise((resolvePromise, reject) => {
				const entry = { callback, resolve: resolvePromise, reject };
				if (options.ifAvailable) {
					reject(new Error("this page must queue for the lock, not ask ifAvailable"));
					return;
				}
				options.signal?.addEventListener(
					"abort",
					() => {
						const index = queue.indexOf(entry);
						if (index === -1) return;
						queue.splice(index, 1);
						reject(new Error("AbortError"));
					},
					{ once: true },
				);
				queue.push(entry);
				grantNext();
			});
		},
	};
}

async function flush() {
	for (let index = 0; index < 30; index += 1) await new Promise((resolveTick) => setImmediate(resolveTick));
}

/** Starts the script on a fresh copy of the built page; `respond(dex, call)` returns { status, body } or "hang". */
async function boot(respond, { lockElsewhere = false, visible = true, html = HOME_HTML } = {}) {
	mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: START });
	const dom = new JSDOM(html, { pretendToBeVisual: true, url: "https://example.test/" });
	const { window } = dom;
	const calls = [];
	const locks = createLocks();
	if (lockElsewhere) locks.holdElsewhere();
	const observers = [];
	class FakeIntersectionObserver {
		constructor(callback) {
			this.callback = callback;
			observers.push(this);
		}
		observe() {}
	}
	window.IntersectionObserver = FakeIntersectionObserver;
	const restore = [
		["window", window],
		["navigator", { locks }],
		["IntersectionObserver", FakeIntersectionObserver],
		["performance", { now: () => Date.now() - START }],
		[
			"fetch",
			(_url, init) => {
				const dex = JSON.parse(init.body).dex ?? "";
				const call = { dex, at: Date.now() - START, signal: init.signal };
				calls.push(call);
				const answer = respond(dex, calls.filter((entry) => entry.dex === dex).length);
				if (answer === "hang") {
					return new Promise((_resolve, reject) => {
						init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
					});
				}
				return Promise.resolve({ status: answer.status, json: async () => answer.body });
			},
		],
	].map(([name, value]) => {
		const previous = Object.getOwnPropertyDescriptor(globalThis, name);
		Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
		return () => {
			if (previous) Object.defineProperty(globalThis, name, previous);
			else delete globalThis[name];
		};
	});
	startLiveMarkets(window.document);
	const page = {
		window,
		document: window.document,
		calls,
		locks,
		setVisible(isVisible) {
			for (const observer of observers) {
				observer.callback([{ isIntersecting: isVisible, intersectionRatio: isVisible ? 1 : 0 }]);
			}
		},
		async advance(ms) {
			for (let elapsed = 0; elapsed < ms; elapsed += 1_000) {
				mock.timers.tick(Math.min(1_000, ms - elapsed));
				await flush();
			}
		},
		filledCards() {
			return [...window.document.querySelectorAll("[data-live-card]")].filter(
				(card) => card.querySelector("[data-live-primary]").textContent !== "",
			);
		},
		allNumberText() {
			return [...window.document.querySelectorAll("[data-live-primary], [data-live-secondary], [data-live-change]")]
				.map((slot) => slot.textContent)
				.join("");
		},
		close() {
			window.dispatchEvent(new window.Event("pagehide"));
			window.close();
			for (const undo of restore) undo();
			mock.timers.reset();
		},
	};
	await flush();
	if (visible) page.setVisible(true);
	await flush();
	return page;
}

const ok = (dex) => ({ status: 200, body: fixtureBody(dex) });
const INPUTS = JSON.parse(new JSDOM(HOME_HTML).window.document.querySelector("[data-live-inputs]").textContent);
const PLAN = createRequestPlan(INPUTS.map((input) => input.coin));
const FIRST_ROUND = Math.floor(WEIGHT_LIMIT / META_AND_ASSET_CTXS_WEIGHT);

test("the page under test has the live strip, both pause controls and ten featured cards", () => {
	const { document } = new JSDOM(HOME_HTML).window;
	assert.equal(document.querySelectorAll("[data-live-card]").length, 10);
	assert.equal(document.querySelectorAll("[data-live-pause]").length, 2, "02's Pause updates and the footer's Pause live data");
	assert.ok(document.querySelector("footer [data-live-pause]"));
	assert.deepEqual(PLAN.dexes.slice(0, 3), ["", "io", "xyz"], "the stats band's and the featured cards' dexes come first");
	assert.deepEqual(PLAN.dexes.slice(3).sort(), ["para"], "03's tab rows add the other listed dexes");
	assert.ok(document.querySelectorAll("[data-live-row]").length >= 20, "03 tab rows carry live slots");
	assert.equal(document.querySelectorAll("[data-live-mirror]").length, 10, "the marquee's mirror copy has one card per featured market");
	assert.equal(document.querySelector("[data-live-strip]").dataset.ticker, "static", "the ticker is a scroll-snap row until the script runs");
});

test("numbers appear only from validated answers, and the strip stays blank until they arrive", async () => {
	const page = await boot((dex) => ok(dex));
	try {
		for (const button of page.document.querySelectorAll("[data-live-pause]")) assert.equal(button.hidden, false);
		assert.equal(page.calls.length, 1);
		const filled = page.filledCards().map((card) => card.dataset.liveCard);
		assert.deepEqual(filled, ["io:OAI", "io:ANTH"]);
		const oai = page.document.querySelector('[data-live-card="io:OAI"]');
		assert.match(oai.querySelector("[data-live-primary]").textContent, /^US\$\d.*implied valuation$/);
		assert.match(oai.querySelector("[data-live-secondary]").textContent, /^Mark \$/);
		assert.equal(page.document.querySelector("[data-live-list]").getAttribute("aria-busy"), "false");
		assert.equal(page.document.querySelector("[data-live-asof]").hidden, false);
		await page.advance(2 * PLAN.requestSpacingMs + 1_000);
		assert.equal(page.filledCards().length, 10);
		assert.doesNotMatch(page.allNumberText(), /—|NaN|undefined|\de[+-]?\d/);
	} finally {
		page.close();
	}
});

test("Pre-IPO rows show EntropyIO's implied valuation and XYZ's per-share mark price from the recorded answers", async () => {
	const basis = Object.fromEntries(INPUTS.filter((input) => input.kind === "preipo").map((input) => [input.coin, input.quoteBasis]));
	assert.deepEqual(basis, { "io:OAI": "valuation", "io:ANTH": "valuation", "xyz:OURA": "per-share" });
	const page = await boot((dex) => ok(dex));
	try {
		await page.advance(2 * PLAN.requestSpacingMs + 1_000);
		const slots = (coin) => {
			const row = page.document.querySelector(`[data-live-row="${coin}"]`);
			return ["primary", "secondary", "change"].map((name) => row.querySelector(`[data-live-${name}]`).textContent);
		};
		assert.deepEqual(slots("xyz:OURA"), ["$48.707", "Quoted per share", "-0.56% ▼"]);
		const [primary, secondary, change] = slots("io:OAI");
		assert.match(primary, /^US\$\d[\d.,]*[KMBT]implied valuation$/);
		assert.match(secondary, /^Mark \$\d/);
		assert.match(change, /^[+-]?\d+\.\d{2}%/);
		const label = page.document.querySelector('[data-live-row="io:OAI"] [data-live-primary] span');
		assert.match(label.className, /\btext-xs\b/, "the unit label is at least 12px");
		const perShare = page.document.querySelector('[data-live-row="xyz:OURA"] [data-live-secondary] span');
		assert.equal(perShare.textContent, "Quoted per share");
	} finally {
		page.close();
	}
});

test("a Pre-IPO input without a verified unit, or without a quote basis, shows no number and derives no valuation", async () => {
	// The page has one per-share Pre-IPO row, so its unknown and missing quote bases each get a page of their own.
	const variants = [
		{
			"xyz:OURA": (input) => ({ ...input, quoteBasis: "unknown" }),
			"io:ANTH": (input) => ({ ...input, valuationPerPriceUsd: null }),
		},
		{ "xyz:OURA": ({ quoteBasis: _dropped, ...rest }) => rest },
	];
	for (const variant of variants) {
		const inputs = INPUTS.map((input) => variant[input.coin]?.(input) ?? input);
		const html = HOME_HTML.replace(
			/(<script type="application\/json" data-live-inputs>)[\s\S]*?(<\/script>)/,
			(_match, open, close) => `${open}${JSON.stringify(inputs)}${close}`,
		);
		assert.notEqual(html, HOME_HTML);
		const page = await boot((dex) => ok(dex), { html });
		try {
			await page.advance(2 * PLAN.requestSpacingMs + 1_000);
			for (const coin of Object.keys(variant)) {
				const row = page.document.querySelector(`[data-live-row="${coin}"]`);
				const text = [...row.querySelectorAll("[data-live-primary], [data-live-secondary], [data-live-change]")].map((slot) => slot.textContent).join("");
				assert.equal(text, "", `${coin} shows nothing`);
			}
			assert.match(page.document.querySelector('[data-live-row="io:OAI"] [data-live-primary]').textContent, /implied valuation$/);
		} finally {
			page.close();
		}
	}
});

test("a malformed or rejected answer shows no number for that dex", async () => {
	const page = await boot((dex) => {
		if (dex === "io") return { status: 200, body: setEntry(fixtureBody("io"), "io:OAI", "ctx", { markPx: "abc" }) };
		if (dex === "xyz") return { status: 429, body: null };
		return ok(dex);
	});
	try {
		assert.deepEqual(page.filledCards(), []);
		assert.equal(page.document.querySelector("[data-live-list]").getAttribute("aria-busy"), "true");
		assert.equal(page.document.querySelector("[data-live-asof]").hidden, true);
		await page.advance(2 * PLAN.requestSpacingMs + 1_000);
		const filled = page.filledCards().map((card) => card.dataset.liveCard);
		assert.ok(filled.length > 0 && filled.every((coin) => !coin.includes(":")), `only main-dex cards may show numbers: ${filled}`);
	} finally {
		page.close();
	}
});

test("pausing from the footer stops requests; numbers clear once stale and requests resume on unpause", async () => {
	const page = await boot((dex) => ok(dex));
	try {
		await page.advance(2 * PLAN.requestSpacingMs + 1_000);
		assert.equal(page.filledCards().length, 10);
		const footerPause = page.document.querySelector("footer [data-live-pause]");
		footerPause.click();
		for (const button of page.document.querySelectorAll("[data-live-pause]")) {
			assert.equal(button.getAttribute("aria-pressed"), "true");
		}
		assert.equal(page.document.querySelector("[data-live-strip]").dataset.ticker, "paused", "Pause also stops the marquee (WCAG 2.2.2)");
		const sent = page.calls.length;
		await page.advance(PLAN.staleAfterMs + 10_000);
		assert.equal(page.calls.length, sent, "no request while paused");
		assert.equal(page.allNumberText(), "", "stale numbers are cleared even while paused");
		assert.equal(page.document.querySelector("[data-live-list]").getAttribute("aria-busy"), "true");
		page.document.querySelector("#markets-now [data-live-pause]").click();
		await flush();
		assert.equal(page.calls.length, sent + FIRST_ROUND, "unpausing sends as much of the round as 60 weight per minute allows at once");
		await page.advance(WEIGHT_WINDOW_MS + 1_000);
		assert.deepEqual([...new Set(page.calls.slice(sent).map((call) => call.dex))].sort(), [...PLAN.dexes].sort(), "the rest of the round follows within the window");
	} finally {
		page.close();
	}
});

test("while another tab holds the lock this tab sends nothing, and it takes over as soon as the lock is free", async () => {
	const page = await boot((dex) => ok(dex), { lockElsewhere: true });
	try {
		await page.advance(5 * 60_000);
		assert.equal(page.calls.length, 0);
		assert.equal(page.allNumberText(), "");
		page.locks.releaseElsewhere();
		await flush();
		assert.equal(page.calls.length, FIRST_ROUND, "the queued lock request is granted without waiting for a retry timer");
		assert.equal(page.locks.isHeldHere(), true);
	} finally {
		page.close();
	}
});

test("a market reported delisted is removed from 02 and 03 while the hero sentence stays whole", async () => {
	const page = await boot((dex) =>
		dex === "io" ? { status: 200, body: setEntry(fixtureBody("io"), "io:ANTH", "asset", { isDelisted: true }) } : ok(dex),
	);
	try {
		assert.equal(page.document.querySelectorAll('[data-market-coin="io:ANTH"]').length, 0);
		assert.ok(page.document.querySelector('[data-market-coin="io:OAI"]'));
		const hero = page.document.querySelector("h1").closest("section");
		assert.ok(hero.querySelector('a[href*="/trade/io:ANTH"]'), "the hero link is not removed at run time");
		assert.match(hero.textContent.replace(/\s+/g, " "), /Pre-IPO perpetuals by EntropyIO — not shares OpenAI\b[^.]*\bAnthropic\b/);
	} finally {
		page.close();
	}
});

test("a hung request times out, and once retries are used up every number clears and the lock is released", async () => {
	mock.method(Math, "random", () => 0);
	const page = await boot((dex) => (dex === "xyz" ? "hang" : ok(dex)));
	try {
		await page.advance(PLAN.requestSpacingMs + 1_000);
		const firstXyz = page.calls.find((call) => call.dex === "xyz");
		assert.ok(firstXyz, "xyz was requested");
		await page.advance(REQUEST_TIMEOUT_MS);
		assert.equal(firstXyz.signal.aborted, true, "the hung request was aborted by the timeout");
		await page.advance(15 * 60_000);
		assert.equal(page.allNumberText(), "");
		assert.equal(page.locks.isHeldHere(), false, "the lock is released once the strip gives up");
		const sent = page.calls.length;
		assert.equal(page.calls.filter((call) => call.dex === "xyz").length, 6, "one request and five retries");
		await page.advance(10 * 60_000);
		assert.equal(page.calls.length, sent, "nothing more is sent on this visit");
	} finally {
		page.close();
		mock.restoreAll();
	}
});

test("pagehide releases the lock; a page restored from the back-forward cache drops stale numbers at once and resumes", async () => {
	const page = await boot((dex) => (dex === "io" ? ok(dex) : "hang"));
	try {
		assert.equal(page.filledCards().length, 2);
		assert.equal(page.locks.isHeldHere(), true);
		page.window.dispatchEvent(new page.window.Event("pagehide"));
		await flush();
		assert.equal(page.locks.isHeldHere(), false);
		mock.timers.setTime(Date.now() + PLAN.staleAfterMs + 1_000);
		const restored = new page.window.Event("pageshow");
		Object.defineProperty(restored, "persisted", { value: true });
		page.window.dispatchEvent(restored);
		await flush();
		assert.equal(page.allNumberText(), "", "frozen timers did not run, so the restore itself clears stale numbers");
		assert.equal(page.locks.isHeldHere(), true);
	} finally {
		page.close();
	}
});

function statsSlots(document) {
	return [...document.querySelectorAll("[data-live-stat]")].map((stat) => ({
		key: stat.dataset.liveStat,
		value: stat.querySelector("[data-live-stat-value]").textContent,
		pending: stat.querySelector("[data-live-stat-pending]").hidden,
		busy: stat.querySelector("[data-live-stat-slot]").getAttribute("aria-busy"),
		asOf: document.querySelector("[data-live-stats] [data-live-stats-asof]").hidden,
	}));
}

test("the stats band sums exactly the dexes it names, with Big.js, once all of them have answered", async () => {
	const dexes = JSON.parse(new JSDOM(HOME_HTML).window.document.querySelector("[data-live-stats]").dataset.liveStatsDexes);
	assert.deepEqual(dexes, ["", "io", "xyz"]);
	const totals = Object.fromEntries(dexes.map((dex) => [dex, readDexTotals(ok(dex), dex)]));
	const expected = combineDexTotals(dexes, totals);
	const page = await boot((dex) => ok(dex));
	try {
		assert.deepEqual(
			statsSlots(page.document).map(({ value, busy }) => [value, busy]),
			[["", "true"], ["", "true"]],
			"one dex is not enough: the band shows nothing until every named dex has answered",
		);
		await page.advance(2 * PLAN.requestSpacingMs + 1_000);
		const shown = statsSlots(page.document);
		assert.deepEqual(shown.map((stat) => stat.key), ["volume", "openInterest"]);
		assert.equal(shown[0].value, formatStatUsd(expected.dayNtlVlm));
		assert.equal(shown[1].value, formatStatUsd(expected.openInterestUsd));
		for (const stat of shown) {
			assert.match(stat.value, /^\$\d[\d,]*(\.\d\d)?[MBT]?$/);
			assert.equal(stat.pending, true);
			assert.equal(stat.busy, "false");
			assert.equal(stat.asOf, false, "a shown number carries its time");
		}
		await page.advance(PLAN.staleAfterMs + 10_000);
	} finally {
		page.close();
	}
});

test("the stats band stays empty, never '—' or '$0', when a named dex fails or answers with a bad number", async () => {
	const badXyz = await boot((dex) =>
		dex === "xyz" ? { status: 200, body: setEntry(fixtureBody("xyz"), "xyz:CL", "ctx", { dayNtlVlm: "n/a" }) } : ok(dex),
	);
	try {
		await badXyz.advance(2 * PLAN.requestSpacingMs + 1_000);
		assert.ok(badXyz.filledCards().length > 0, "prices still show: only the totals failed");
		for (const stat of statsSlots(badXyz.document)) {
			assert.equal(stat.value, "");
			assert.equal(stat.pending, false);
			assert.equal(stat.busy, "true");
			assert.equal(stat.asOf, true);
		}
	} finally {
		badXyz.close();
	}
	const rejected = await boot((dex) => (dex === "io" ? { status: 429, body: null } : ok(dex)));
	try {
		await rejected.advance(2 * PLAN.requestSpacingMs + 1_000);
		assert.deepEqual(statsSlots(rejected.document).map(({ value }) => value), ["", ""]);
		assert.doesNotMatch(rejected.document.querySelector("[data-live-stats]").textContent, /—|\$0\b|NaN/);
	} finally {
		rejected.close();
	}
});
