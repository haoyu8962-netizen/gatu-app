const INFO_URL = "https://api.hyperliquid.xyz/info";
const APP_URL = "https://app.sairn.ai";
const COINS = ["BTC", "ETH", "SOL", "HYPE"];
const SPARK_DEBOUNCE_MS = 300;
const SPARK_CACHE_MS = 10 * 60 * 1000;
const POSTER_META_URL = "./posters/btc.json";
const LIVE_HANDOFF_SECONDS = 15;
const RECORDED_FALLBACK_MS = 20_000;
const SPARK_PREFETCH_SECONDS = 5;
const SWAP_HALF_MS = 100;
const SWAP_READY_TIMEOUT_MS = 300;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const root = document.documentElement;
const params = new URLSearchParams(location.search);
const mqReduced = matchMedia("(prefers-reduced-motion: reduce)");
const mqMobile = matchMedia("(max-width: 640px)");

const $ = (id) => document.getElementById(id);
const els = {
	window: $("window"),
	viewTabs: [...document.querySelectorAll(".view-tab")],
	terminalPanel: $("terminal-panel"),
	marketPanel: $("market-panel"),
	marketBody: $("market-body"),
	plot: $("plot"),
	canvas: $("open-book"),
	poster: $("poster"),
	tabs: [...document.querySelectorAll(".tab")],
	stateBadge: $("state-badge"),
	stateText: $("state-text"),
	pause: $("pause"),
	snapshot: $("snapshot"),
	snapshotOut: $("snapshot-out"),
	last: $("last"),
	lastLabel: $("last-label"),
	change: $("change"),
	spark: $("spark"),
	sparkPath: $("spark-path"),
	axisTop: $("axis-top"),
	axisBottom: $("axis-bottom"),
	midLabel: $("mid-label"),
	tLeft: $("t-left"),
	tMid: $("t-mid"),
	tRight: $("t-right"),
	showLive: $("show-live"),
	stateNote: $("state-note"),
	footNote: $("foot-note"),
	video: $("terminal-video"),
	demoPoster: $("demo-poster"),
	demoToggle: $("demo-toggle"),
	asks: $("book-asks"),
	bids: $("book-bids"),
	spread: $("book-spread"),
	bookCaption: $("book-caption"),
	bookSizeHead: $("book-size-head"),
	bbo: $("bbo"),
	bboBid: $("bbo-bid"),
	bboAsk: $("bbo-ask"),
	ctaTrade: $("cta-trade"),
	ctaHeader: $("cta-header"),
	variantButtons: [...document.querySelectorAll("[data-variant-btn]")],
};

let variant = root.dataset.variant === "b" ? "b" : "a";
let coin = COINS.includes(params.get("coin")) ? params.get("coin") : "BTC";
let view = params.get("view") === "live" ? "live" : "terminal";
let phase = coin === "BTC" ? "recorded" : "live";
let posterMeta = null;
let paused = false;
let liveOptIn = false;
let needsFirstRender = true;
let docVisible = document.visibilityState === "visible";
let onScreen = true;
let latest = null;
let workerFailed = false;
let pendingPhase = null;
let swapToken = 0;
let renderedWaiters = [];
let worker = null;
const sparkCache = new Map();
const sparkPrefetching = new Set();
let sparkTimer = 0;
let sparkAbort = null;

function reducedActive() {
	return mqReduced.matches && !liveOptIn;
}

function tradeUrl(market, slot) {
	const url = new URL(`/trade/${market}`, APP_URL);
	url.searchParams.set("utm_source", "website");
	url.searchParams.set("utm_medium", "site");
	url.searchParams.set("utm_campaign", "en_home_prototype");
	url.searchParams.set("utm_content", slot);
	return url.toString();
}

function groupDigits(value) {
	const [int, frac] = String(value).split(".");
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return frac === undefined ? grouped : `${grouped}.${frac}`;
}

function utcTime(ms) {
	return new Date(ms).toISOString().slice(11, 19);
}

function utcDate(ms) {
	const d = new Date(ms);
	return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function setEmpty(el, empty) {
	if (empty) el.setAttribute("data-empty", "");
	else el.removeAttribute("data-empty");
}

function updateUrl() {
	const next = new URL(location.href);
	next.searchParams.set("v", variant);
	if (coin === "BTC") next.searchParams.delete("coin");
	else next.searchParams.set("coin", coin);
	if (view === "live") next.searchParams.set("view", "live");
	else next.searchParams.delete("view");
	history.replaceState(null, "", next);
}

// Posters exist for each plot ratio: phone, a window narrower than 900px, and a wider one.
function posterKey() {
	if (mqMobile.matches) return `${variant}-mobile`;
	return `${variant}-${els.window.clientWidth >= 900 ? "tall" : "wide"}`;
}

function applyVariant(next) {
	variant = next;
	root.dataset.variant = next;
	for (const button of els.variantButtons) {
		button.setAttribute("aria-pressed", String(button.dataset.variantBtn === next));
	}
	worker?.postMessage({ type: "variant", variant: next });
	if (phase === "recorded" && posterMeta) showRecorded();
	updateUrl();
}

function setVariant(next) {
	if (next === variant) return;
	if (document.startViewTransition && !mqReduced.matches) {
		document.startViewTransition(() => applyVariant(next));
	} else {
		applyVariant(next);
	}
}

function setView(next, focus) {
	view = next;
	for (const tab of els.viewTabs) {
		const selected = tab.dataset.view === next;
		tab.setAttribute("aria-selected", String(selected));
		tab.tabIndex = selected ? 0 : -1;
		if (selected && focus) tab.focus();
	}
	els.window.dataset.view = next;
	els.terminalPanel.toggleAttribute("data-inactive", next !== "terminal");
	els.marketPanel.toggleAttribute("data-inactive", next !== "live");
	syncVisibility();
	updateUrl();
}

function clearMarketView() {
	for (const el of [els.last, els.change, els.spark, els.bbo]) setEmpty(el, true);
	els.last.textContent = "";
	els.change.textContent = "";
	els.asks.replaceChildren();
	els.bids.replaceChildren();
	els.spread.textContent = "";
	els.bookCaption.textContent = "Top 5";
	els.midLabel.hidden = true;
	els.axisTop.hidden = true;
	els.axisBottom.hidden = true;
	els.stateBadge.hidden = true;
	latest = null;
}

function setCoin(next, focus) {
	const changed = next !== coin;
	coin = next;
	let selectedId = "";
	for (const tab of els.tabs) {
		const selected = tab.dataset.coin === next;
		tab.setAttribute("aria-selected", String(selected));
		tab.tabIndex = selected ? 0 : -1;
		if (selected) selectedId = tab.id;
		if (selected && focus) tab.focus();
	}
	els.marketBody.setAttribute("aria-labelledby", selectedId);
	els.bookSizeHead.textContent = `Size (${next})`;
	els.footNote.textContent = `${next}-USD perpetual · Not advice.`;
	els.ctaTrade.textContent = `Trade ${next}`;
	els.ctaTrade.href = tradeUrl(next, `hero_cta_${next.toLowerCase()}`);
	els.ctaHeader.href = tradeUrl(next, "header");
	if (!changed) return;
	needsFirstRender = true;
	updateUrl();
	if (phase === "recorded") {
		clearMarketView();
		worker?.postMessage({ type: "coin", coin: next });
		leaveRecorded(false);
		return;
	}
	swapScene(
		() => {
			clearMarketView();
			worker?.postMessage({ type: "coin", coin: next });
			scheduleSparkline(next);
		},
		() => Promise.resolve(),
		true,
	);
}

function bookRow(kind, [pxS, szS, sz], maxSz) {
	const tr = document.createElement("tr");
	tr.className = kind;
	tr.style.setProperty("--w", String(Math.min(1, sz / maxSz)));
	const px = document.createElement("td");
	px.textContent = groupDigits(pxS);
	const size = document.createElement("td");
	size.textContent = groupDigits(szS);
	tr.append(px, size);
	return tr;
}

function placeLabel(el, label) {
	if (!label || label.frac < 0 || label.frac > 1) {
		el.hidden = true;
		return;
	}
	el.textContent = groupDigits(label.text);
	el.style.top = `${label.frac * 100}%`;
	el.hidden = false;
}

function stateLabel(recorded) {
	if (recorded) return "RECORDED";
	if (paused) return "PAUSED";
	return reducedActive() ? "STILL" : "LIVE";
}

// Every number in the market view comes from one source at a time: the recording's
// final state while the poster shows, the live worker afterwards.
function renderFrame(msg, recorded) {
	const reduced = reducedActive();
	els.stateBadge.hidden = !recorded && !msg.live;
	els.stateText.textContent = stateLabel(recorded);

	const w = msg.windowSeconds;
	if (recorded) {
		els.tLeft.textContent = utcTime(posterMeta.recordedTo - w * 1000);
		els.tMid.textContent = "";
		els.tRight.textContent = `${utcTime(posterMeta.recordedTo)} UTC`;
	} else {
		els.tLeft.textContent = `−${w} s`;
		els.tMid.textContent = `−${Math.round(w / 2)} s`;
		els.tRight.textContent = "Now";
	}

	if (msg.live && msg.last) {
		els.last.textContent = groupDigits(msg.last.pxS);
		els.last.title = Number.isFinite(msg.last.time) ? `Last trade ${utcTime(msg.last.time)} UTC` : "Last trade";
		setEmpty(els.last, false);
		setEmpty(els.lastLabel, false);
	} else {
		setEmpty(els.last, true);
		setEmpty(els.lastLabel, true);
	}

	if (msg.live && msg.pct !== null) {
		const up = msg.pct >= 0;
		els.change.textContent = `${up ? "▲ +" : "▼ −"}${Math.abs(msg.pct).toFixed(2)}% 24h`;
		els.change.dataset.dir = up ? "up" : "down";
		setEmpty(els.change, false);
	} else {
		setEmpty(els.change, true);
	}

	if (msg.live && msg.asks?.length && msg.bids?.length) {
		const maxSz = Math.max(...msg.asks.map((l) => l[2]), ...msg.bids.map((l) => l[2]), 1e-12);
		els.asks.replaceChildren(...[...msg.asks].reverse().map((l) => bookRow("ask", l, maxSz)));
		els.bids.replaceChildren(...msg.bids.map((l) => bookRow("bid", l, maxSz)));
		els.spread.textContent = `Spread ${groupDigits(msg.spreadS)}`;
		const at = Number.isFinite(msg.depthAt) ? ` · ${utcTime(msg.depthAt)} UTC` : "";
		els.bookCaption.textContent = `Top 5 · step ${groupDigits(msg.tickS)}${at}`;
		if (!recorded) needsFirstRender = false;
	} else {
		els.asks.replaceChildren();
		els.bids.replaceChildren();
		els.spread.textContent = "";
		els.bookCaption.textContent = "Top 5";
	}
	if (msg.live && msg.bestBidS) {
		els.bboBid.textContent = groupDigits(msg.bestBidS);
		els.bboAsk.textContent = groupDigits(msg.bestAskS);
		setEmpty(els.bbo, false);
	} else {
		setEmpty(els.bbo, true);
	}

	if (msg.live && (recorded || !reduced)) placeLabel(els.midLabel, msg.mid);
	else els.midLabel.hidden = true;
	if (recorded || !reduced || msg.force) {
		placeLabel(els.axisTop, msg.live ? msg.axis?.top : null);
		placeLabel(els.axisBottom, msg.live ? msg.axis?.bottom : null);
	}
	updateStateNote(msg);
}

// The state line has room for two lines in every layout, so a state change never
// resizes the window.
function updateStateNote(msg) {
	let text = "Live from the Hyperliquid public API.";
	if (msg?.live && Number.isFinite(msg.last?.time)) text += ` Last trade ${utcTime(msg.last.time)} UTC.`;
	if (phase === "recorded" && posterMeta) {
		const from = utcTime(posterMeta.recordedFrom).slice(0, 5);
		const to = utcTime(posterMeta.recordedTo).slice(0, 5);
		const span = `Recorded ${utcDate(posterMeta.recordedFrom)}, ${from}–${to} UTC.`;
		if (workerFailed) text = `${span} Live data is unavailable right now.`;
		else if (reducedActive()) text = `${span} Live view on request.`;
		else text = `${span} Switches to live after ${LIVE_HANDOFF_SECONDS} s of live data.`;
	} else if (workerFailed) {
		text = "Live data is unavailable right now.";
	} else if (paused) {
		text = "Paused. Numbers and chart are frozen.";
	} else if (msg && !msg.live) {
		text = msg.reason === "waiting" ? "Waiting for Hyperliquid public data." : "Live data is unavailable right now.";
	} else if (reducedActive() && msg?.frozenAt) {
		text = `Still snapshot · ${utcTime(msg.frozenAt)} UTC.`;
	}
	els.stateNote.textContent = text;
}

function showRecorded() {
	const poster = posterMeta.posters[posterKey()];
	if (!poster) {
		leaveRecorded(false);
		return;
	}
	els.window.dataset.phase = "recorded";
	els.poster.dataset.key = posterKey();
	els.poster.src = `./posters/${poster.file}`;
	els.poster.hidden = false;
	els.showLive.hidden = !reducedActive();
	drawSparkline(posterMeta.closes24h.map(Number));
	renderFrame(poster.ui, true);
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForRendered() {
	return new Promise((resolve) => renderedWaiters.push(resolve));
}

// Swaps the whole market view as one scene: the data region fades out, the picture,
// every number, the axes and the state badge change while it is invisible, and it
// fades back in once the new picture is drawn. No visible frame mixes recorded and
// live values.
async function swapScene(apply, ready, fade) {
	const token = ++swapToken;
	const animate = fade && !mqReduced.matches && docVisible && onScreen && view === "live";
	try {
		if (animate) {
			els.marketPanel.dataset.swap = "out";
			await delay(SWAP_HALF_MS);
			if (token !== swapToken) return;
		}
		apply();
		if (animate) await Promise.race([ready(), delay(SWAP_READY_TIMEOUT_MS)]);
	} finally {
		if (token === swapToken) delete els.marketPanel.dataset.swap;
	}
}

function leaveRecorded(fade) {
	pendingPhase = "live";
	swapScene(
		() => {
			pendingPhase = null;
			phase = "live";
			els.window.dataset.phase = "live";
			els.poster.hidden = true;
			syncReduced();
			syncVisibility();
			scheduleSparkline(coin);
			if (latest) renderFrame(latest, false);
			else clearMarketView();
		},
		waitForRendered,
		fade,
	);
}

// Brief gaps stay on the live canvas; only a stopped connection or 20 s without
// data brings the recording back, so the view never flickers between the two.
function returnToRecorded() {
	pendingPhase = "recorded";
	latest = null;
	swapScene(
		() => {
			pendingPhase = null;
			phase = "recorded";
			showRecorded();
			syncVisibility();
		},
		() => els.poster.decode().catch(() => {}),
		true,
	);
}

async function loadPosterMeta() {
	try {
		const res = await fetch(POSTER_META_URL);
		if (!res.ok) throw new Error(String(res.status));
		const meta = await res.json();
		if (phase !== "recorded" || meta.coin !== coin) return;
		posterMeta = meta;
		showRecorded();
	} catch {
		if (phase === "recorded") leaveRecorded(false);
	}
}

function onWorkerUi(msg) {
	if (msg.coin !== coin) return;
	workerFailed = msg.failed;
	els.window.dataset.live = String(msg.live);
	if (pendingPhase) {
		if (pendingPhase === "live") latest = msg;
		return;
	}
	if (phase === "recorded") {
		latest = msg;
		if (!posterMeta) return;
		if (msg.live && msg.liveSeconds >= SPARK_PREFETCH_SECONDS) prefetchSparkline(coin);
		if (msg.live && msg.liveSeconds >= LIVE_HANDOFF_SECONDS && !reducedActive()) leaveRecorded(true);
		else updateStateNote(msg);
		return;
	}
	if (posterMeta && coin === posterMeta.coin && (msg.failed || msg.silentMs >= RECORDED_FALLBACK_MS)) {
		returnToRecorded();
		return;
	}
	if (paused && !msg.force && !needsFirstRender) return;
	latest = msg;
	renderFrame(msg, false);
}

function scheduleSparkline(market) {
	clearTimeout(sparkTimer);
	sparkAbort?.abort();
	setEmpty(els.spark, true);
	const cached = sparkCache.get(market);
	if (cached && Date.now() - cached.at < SPARK_CACHE_MS) {
		drawSparkline(cached.closes);
		return;
	}
	sparkTimer = setTimeout(() => loadSparkline(market), SPARK_DEBOUNCE_MS);
}

async function fetchCloses(market, signal) {
	const end = Date.now();
	const res = await fetch(INFO_URL, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ type: "candleSnapshot", req: { coin: market, interval: "15m", startTime: end - 86_400_000, endTime: end } }),
		signal,
	});
	if (!res.ok) return null;
	const candles = await res.json();
	if (!Array.isArray(candles) || candles.length < 24) return null;
	const closes = candles.map((c) => Number(c.c));
	if (closes.some((v) => !Number.isFinite(v) || v <= 0)) return null;
	sparkCache.set(market, { at: Date.now(), closes });
	return closes;
}

async function loadSparkline(market) {
	const abort = new AbortController();
	sparkAbort = abort;
	try {
		const closes = await fetchCloses(market, abort.signal);
		if (closes && market === coin && phase === "live") drawSparkline(closes);
	} catch {
		// The sparkline is optional; it stays hidden when the snapshot is unavailable.
	}
}

// Fetched before the recorded-to-live swap so the live scene arrives with its sparkline.
function prefetchSparkline(market) {
	const cached = sparkCache.get(market);
	if ((cached && Date.now() - cached.at < SPARK_CACHE_MS) || sparkPrefetching.has(market)) return;
	sparkPrefetching.add(market);
	fetchCloses(market)
		.catch(() => null)
		.finally(() => sparkPrefetching.delete(market));
}

function drawSparkline(closes) {
	if (closes.length < 2 || closes.some((v) => !Number.isFinite(v))) return;
	const min = Math.min(...closes);
	const max = Math.max(...closes);
	const span = max - min || 1;
	const d = closes
		.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (closes.length - 1)) * 120).toFixed(2)},${(30 - ((v - min) / span) * 28).toFixed(2)}`)
		.join("");
	els.sparkPath.setAttribute("d", d);
	els.spark.dataset.dir = closes[closes.length - 1] >= closes[0] ? "up" : "down";
	setEmpty(els.spark, false);
}

function stageSize() {
	const rect = els.canvas.getBoundingClientRect();
	const mobile = mqMobile.matches;
	return {
		cssW: rect.width,
		cssH: rect.height,
		dpr: Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.5),
		windowMs: mobile ? 60_000 : 120_000,
		maxFps: mobile ? 20 : 30,
		maxRadius: mobile ? 6 : 8,
	};
}

// The terminal recordings. record-demo.cjs reads the AV1 codec string and the pixel size back
// from the encoded files and refuses to publish files that differ from these entries.
const DEMO_SOURCES = {
	desktop: {
		base: "./media/demo-desktop",
		codecs: "av01.0.05M.08",
		width: 1440, height: 732,
		label: "Screen recording of the Sairn terminal, signed out, on the HYPE/USDC spot market: the chart interval changes, recent trades and the order book, a Limit price filled from the order book, the Sell side, and the TWAP, Scale and Market order types.",
	},
	mobile: {
		base: "./media/demo-mobile",
		codecs: "av01.0.05M.08",
		width: 780, height: 1210,
		label: "Screen recording of the Sairn terminal on a phone, signed out, on the HYPE/USDC spot market: a Limit order with its price filled from the order book, the Sell side, the asks-only order book, and back to a Market buy.",
	},
};

// The terminal recording plays muted and looped only while the Terminal view is on screen
// and the page is visible. Reduced motion and Save-Data keep the poster until the visitor
// presses Play, and switching either on later pauses it; the button can pause it at any time
// (WCAG 2.2.2). A pause the browser makes on its own, or a refused play(), shows Play.
// Before this runs (and without JavaScript) the <picture> poster shows on its own; once the
// video is wired it covers the picture, which is then hidden from assistive technology so only
// the video's label is announced.
let demoUserPaused = mqReduced.matches || Boolean(navigator.connection?.saveData);
let demoOnScreen = false;
// The page-level Pause also pauses the recording; resuming restores the recording's own state.
let demoPausedBeforePage = false;

function demoWanted() {
	return !demoUserPaused && demoOnScreen && docVisible && view === "terminal";
}

function attachDemoSources(source) {
	els.video.dataset.loaded = "true";
	els.video.replaceChildren(
		Object.assign(document.createElement("source"), { src: `${source.base}.webm`, type: `video/webm; codecs="${source.codecs}"` }),
		Object.assign(document.createElement("source"), { src: `${source.base}.mp4`, type: "video/mp4" }),
	);
	els.video.load();
}

// The source follows the 640px breakpoint; an element that already loaded the other recording
// reloads at once so its frame and aspect ratio match the layout.
function applyDemoSource() {
	const key = mqMobile.matches ? "mobile" : "desktop";
	if (els.video.dataset.source === key) return;
	const source = DEMO_SOURCES[key];
	els.video.dataset.source = key;
	els.video.poster = `${source.base}.jpg`;
	els.video.width = source.width;
	els.video.height = source.height;
	els.video.setAttribute("aria-label", source.label);
	if (els.video.dataset.loaded === "true") attachDemoSources(source);
}

function renderDemoToggle() {
	els.demoToggle.textContent = demoUserPaused ? "Play" : "Pause";
}

function syncDemo() {
	applyDemoSource();
	if (demoWanted()) {
		if (els.video.dataset.loaded !== "true") attachDemoSources(DEMO_SOURCES[els.video.dataset.source]);
		els.video.play()?.catch((error) => {
			if (error?.name === "AbortError") return;
			demoUserPaused = true;
			renderDemoToggle();
		});
	} else if (!els.video.paused) {
		els.video.pause();
	}
	renderDemoToggle();
}

function pauseDemoForPreference() {
	if (demoUserPaused) return;
	demoUserPaused = true;
	syncDemo();
}

function startDemo() {
	applyDemoSource();
	renderDemoToggle();
	els.demoPoster.setAttribute("aria-hidden", "true");
	els.video.hidden = false;
	els.demoToggle.hidden = false;
	els.demoToggle.addEventListener("click", () => {
		demoUserPaused = !demoUserPaused;
		syncDemo();
	});
	els.video.addEventListener("play", () => {
		if (!els.video.paused) demoUserPaused = false;
		renderDemoToggle();
	});
	els.video.addEventListener("pause", () => {
		if (els.video.paused && demoWanted()) demoUserPaused = true;
		renderDemoToggle();
	});
	new IntersectionObserver((entries) => {
		demoOnScreen = entries.some((entry) => entry.isIntersecting);
		syncDemo();
	}).observe(els.video);
	mqMobile.addEventListener("change", syncDemo);
	mqReduced.addEventListener("change", () => {
		if (mqReduced.matches) pauseDemoForPreference();
	});
	navigator.connection?.addEventListener?.("change", () => {
		if (navigator.connection.saveData) pauseDemoForPreference();
	});
}

function renderWanted() {
	return docVisible && onScreen && view === "live" && phase === "live";
}

function syncVisibility() {
	worker?.postMessage({ type: "visibility", page: docVisible, render: renderWanted() });
	syncDemo();
}

function syncReduced() {
	const reduced = reducedActive();
	els.showLive.hidden = !reduced;
	worker?.postMessage({ type: "reduced", value: reduced });
	if (phase === "recorded") updateStateNote(latest);
}

function startWorker() {
	if (!("transferControlToOffscreen" in els.canvas) || typeof Worker === "undefined") {
		const note = document.createElement("p");
		note.className = "no-canvas";
		note.textContent = "This browser cannot draw the live view off the main thread, so only the recording is shown.";
		els.plot.append(note);
		return;
	}
	const offscreen = els.canvas.transferControlToOffscreen();
	worker = new Worker(new URL("./open-book.worker.js", import.meta.url), { type: "module" });
	worker.onmessage = (event) => {
		if (event.data?.type === "ui") onWorkerUi(event.data);
		if (event.data?.type === "rendered") {
			for (const resolve of renderedWaiters) resolve();
			renderedWaiters = [];
		}
	};
	worker.postMessage(
		{ type: "init", canvas: offscreen, ...stageSize(), variant, coin, reduced: reducedActive(), render: renderWanted() },
		[offscreen],
	);
	new ResizeObserver(() => worker.postMessage({ type: "resize", ...stageSize() })).observe(els.canvas);
	new ResizeObserver(() => {
		if (phase === "recorded" && posterMeta && !pendingPhase && els.poster.dataset.key !== posterKey()) showRecorded();
	}).observe(els.window);
	new IntersectionObserver((entries) => {
		onScreen = entries.some((entry) => entry.isIntersecting);
		syncVisibility();
	}).observe(els.plot);
}

function readSnapshot() {
	if (phase === "recorded" && posterMeta) {
		const m = posterMeta.posters[posterKey()].ui;
		const at = utcTime(posterMeta.recordedTo).slice(0, 5);
		els.snapshotOut.textContent = `Recording from ${at} UTC, not live: BTC-USD perpetual, best bid ${groupDigits(m.bestBidS)}, best ask ${groupDigits(m.bestAskS)}.`;
		return;
	}
	const m = latest;
	if (!m || !m.live || !m.bestBidS) {
		els.snapshotOut.textContent = `${coin}: live data is not available right now.`;
		return;
	}
	const parts = [`${coin}-USD perpetual`, `best bid ${groupDigits(m.bestBidS)}`, `best ask ${groupDigits(m.bestAskS)}`];
	if (m.last) parts.push(`last trade ${m.last.buy ? "buy" : "sell"} at ${groupDigits(m.last.pxS)}`);
	if (m.pct !== null) parts.push(`${m.pct >= 0 ? "up" : "down"} ${Math.abs(m.pct).toFixed(2)} percent over 24 hours`);
	els.snapshotOut.textContent = `${parts.join(", ")}.`;
}

function wireTablist(tabs, select) {
	tabs[0].parentElement.addEventListener("keydown", (event) => {
		if (event.repeat) return;
		const index = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
		let next = index;
		if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
		else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
		else if (event.key === "Home") next = 0;
		else if (event.key === "End") next = tabs.length - 1;
		else return;
		event.preventDefault();
		select(tabs[next], true);
	});
	for (const tab of tabs) tab.addEventListener("click", () => select(tab, false));
}

function wireControls() {
	wireTablist(els.viewTabs, (tab, focus) => setView(tab.dataset.view, focus));
	wireTablist(els.tabs, (tab, focus) => setCoin(tab.dataset.coin, focus));
	els.pause.addEventListener("click", () => {
		paused = !paused;
		els.pause.setAttribute("aria-pressed", String(paused));
		els.window.dataset.paused = String(paused);
		els.stateText.textContent = stateLabel(false);
		updateStateNote(latest);
		worker?.postMessage({ type: "pause", value: paused });
		if (paused) {
			demoPausedBeforePage = demoUserPaused;
			demoUserPaused = true;
		} else {
			demoUserPaused = demoPausedBeforePage;
		}
		syncDemo();
	});
	els.snapshot.addEventListener("click", readSnapshot);
	els.showLive.addEventListener("click", () => {
		liveOptIn = true;
		if (phase === "recorded") leaveRecorded(false);
		syncReduced();
		els.pause.focus();
	});
	mqReduced.addEventListener("change", syncReduced);
	mqMobile.addEventListener("change", () => {
		worker?.postMessage({ type: "resize", ...stageSize() });
		if (phase === "recorded" && posterMeta) showRecorded();
	});
	document.addEventListener("visibilitychange", () => {
		docVisible = document.visibilityState === "visible";
		syncVisibility();
	});
	for (const button of els.variantButtons) {
		button.addEventListener("click", () => setVariant(button.dataset.variantBtn));
	}
	document.addEventListener("keydown", (event) => {
		if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
		const target = event.target;
		if (target !== document.body && !(target instanceof HTMLElement && target.closest(".proto-bar"))) return;
		if (event.key === "1") setVariant("a");
		if (event.key === "2") setVariant("b");
	});
}

els.window.dataset.phase = phase;
startDemo();
applyVariant(variant);
setView(view, false);
wireControls();
startWorker();
setCoin(coin, false);
if (phase === "live") scheduleSparkline(coin);
syncReduced();
if (phase === "recorded") loadPosterMeta();
