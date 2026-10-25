// Runs the 02 runtime script (src/scripts/live-markets.ts) against the built dist/index.html in jsdom, with
// a fake clock, fetch, Web Lock and IntersectionObserver. It checks the fail-closed rules of plan §7 on the
// real markup; jsdom's event order is not a browser's, so a real-browser pass is still a separate check.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mock, test } from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { createRequestPlan } from "../../src/lib/markets/live.js";
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
async function boot(respond, { lockElsewhere = false, visible = true } = {}) {
	mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: START });
	const dom = new JSDOM(HOME_HTML, { pretendToBeVisual: true, url: "https://example.test/" });
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

test("the page under test has the live strip, both pause controls and ten featured cards", () => {
	const { document } = new JSDOM(HOME_HTML).window;
	assert.equal(document.querySelectorAll("[data-live-card]").length, 10);
	assert.equal(document.querySelectorAll("[data-live-pause]").length, 2, "02's Pause updates and the footer's Pause live data");
	assert.ok(document.querySelector("footer [data-live-pause]"));
	assert.deepEqual(PLAN.dexes, ["", "io", "xyz"]);
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
		assert.doesNotMatch(page.allNumberText(), /—|NaN|undefined|e[+-]?\d/);
	} finally {
		page.close();
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
		const sent = page.calls.length;
		await page.advance(PLAN.staleAfterMs + 10_000);
		assert.equal(page.calls.length, sent, "no request while paused");
		assert.equal(page.allNumberText(), "", "stale numbers are cleared even while paused");
		assert.equal(page.document.querySelector("[data-live-list]").getAttribute("aria-busy"), "true");
		page.document.querySelector("#markets-now [data-live-pause]").click();
		await flush();
		assert.equal(page.calls.length, sent + PLAN.dexes.length, "unpausing sends the whole round at once");
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
		assert.equal(page.calls.length, PLAN.dexes.length, "the queued lock request is granted without waiting for a retry timer");
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
		assert.match(hero.textContent.replace(/\s+/g, " "), /such as OpenAI and Anthropic, plus spot\./);
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
