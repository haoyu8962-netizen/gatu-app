const INFO_URL = "https://api.hyperliquid.xyz/info";
const APP_URL = "https://app.sairn.ai";
const COINS = ["BTC", "ETH", "SOL", "HYPE"];
const SPARK_DEBOUNCE_MS = 300;
const SPARK_CACHE_MS = 10 * 60 * 1000;

const root = document.documentElement;
const params = new URLSearchParams(location.search);
const mqReduced = matchMedia("(prefers-reduced-motion: reduce)");
const mqMobile = matchMedia("(max-width: 640px)");

const $ = (id) => document.getElementById(id);
const els = {
	window: $("window"),
	panel: $("market-panel"),
	stage: $("stage"),
	canvas: $("open-book"),
	tabs: [...document.querySelectorAll(".tab")],
	liveBadge: $("live-badge"),
	liveText: $("live-text"),
	pause: $("pause"),
	snapshot: $("snapshot"),
	snapshotOut: $("snapshot-out"),
	pair: $("pair"),
	last: $("last"),
	change: $("change"),
	spark: $("spark"),
	sparkPath: $("spark-path"),
	sparkLabel: $("spark-label"),
	axisTop: $("axis-top"),
	axisBottom: $("axis-bottom"),
	midLabel: $("mid-label"),
	showLive: $("show-live"),
	stillNote: $("still-note"),
	asks: $("book-asks"),
	bids: $("book-bids"),
	spread: $("book-spread"),
	bookCaption: $("book-caption"),
	bbo: $("bbo"),
	bboBid: $("bbo-bid"),
	bboAsk: $("bbo-ask"),
	windowSeconds: $("window-seconds"),
	note: $("win-note"),
	ctaTrade: $("cta-trade"),
	ctaEmail: $("cta-email"),
	ctaHeader: $("cta-header"),
	variantButtons: [...document.querySelectorAll("[data-variant-btn]")],
};

let variant = root.dataset.variant === "b" ? "b" : "a";
let coin = COINS.includes(params.get("coin")) ? params.get("coin") : "BTC";
let paused = false;
let liveOptIn = false;
let needsFirstRender = true;
let docVisible = document.visibilityState === "visible";
let onScreen = true;
let latest = null;
let worker = null;
const sparkCache = new Map();
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

function setEmpty(el, empty) {
	if (empty) el.setAttribute("data-empty", "");
	else el.removeAttribute("data-empty");
}

function updateUrl() {
	const next = new URL(location.href);
	next.searchParams.set("v", variant);
	if (coin === "BTC") next.searchParams.delete("coin");
	else next.searchParams.set("coin", coin);
	history.replaceState(null, "", next);
}

function applyVariant(next) {
	variant = next;
	root.dataset.variant = next;
	for (const button of els.variantButtons) {
		button.setAttribute("aria-pressed", String(button.dataset.variantBtn === next));
	}
	worker?.postMessage({ type: "variant", variant: next });
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

function clearMarketView() {
	for (const el of [els.last, els.change, els.spark, els.sparkLabel, els.bbo]) setEmpty(el, true);
	els.last.textContent = "";
	els.change.textContent = "";
	els.asks.replaceChildren();
	els.bids.replaceChildren();
	els.spread.textContent = "";
	els.bookCaption.textContent = "Top 5";
	els.midLabel.hidden = true;
	els.axisTop.hidden = true;
	els.axisBottom.hidden = true;
	els.liveBadge.hidden = true;
	latest = null;
}

function setCoin(next, focus) {
	coin = next;
	let selectedId = "";
	for (const tab of els.tabs) {
		const selected = tab.dataset.coin === next;
		tab.setAttribute("aria-selected", String(selected));
		tab.tabIndex = selected ? 0 : -1;
		if (selected) selectedId = tab.id;
		if (selected && focus) tab.focus();
	}
	els.panel.setAttribute("aria-labelledby", selectedId);
	els.pair.textContent = `${next}-USD perpetual`;
	els.note.textContent = `Hyperliquid ${next}-USD perpetual, live from the public API. A website view of public market data, not a terminal feature. Not a recommendation.`;
	els.ctaTrade.textContent = `Trade ${next}`;
	els.ctaTrade.href = tradeUrl(next, `hero_cta_${next.toLowerCase()}`);
	els.ctaEmail.href = tradeUrl(next, "hero_email");
	els.ctaHeader.href = tradeUrl(next, "header");
	needsFirstRender = true;
	clearMarketView();
	worker?.postMessage({ type: "coin", coin: next });
	scheduleSparkline(next);
	updateUrl();
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

function renderUi(msg) {
	if (msg.coin !== coin) return;
	if (paused && !msg.force && !needsFirstRender) return;
	latest = msg;
	const reduced = reducedActive();
	els.window.dataset.live = String(msg.live);
	els.liveBadge.hidden = !msg.live;
	els.liveText.textContent = paused ? "PAUSED" : reduced ? "STILL" : "LIVE";
	els.windowSeconds.textContent = String(msg.windowSeconds);

	if (msg.live && msg.last) {
		els.last.textContent = groupDigits(msg.last.pxS);
		setEmpty(els.last, false);
	} else {
		setEmpty(els.last, true);
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
		els.bookCaption.textContent = msg.tickS ? `Top 5 · step ${groupDigits(msg.tickS)}` : "Top 5";
		els.bboBid.textContent = groupDigits(msg.bestBidS);
		els.bboAsk.textContent = groupDigits(msg.bestAskS);
		setEmpty(els.bbo, false);
		needsFirstRender = false;
	} else {
		els.asks.replaceChildren();
		els.bids.replaceChildren();
		els.spread.textContent = "";
		setEmpty(els.bbo, true);
	}

	if (msg.live && !reduced) {
		placeLabel(els.midLabel, msg.mid);
	} else {
		els.midLabel.hidden = true;
	}
	if (!reduced || msg.force) {
		placeLabel(els.axisTop, msg.live ? msg.axis?.top : null);
		placeLabel(els.axisBottom, msg.live ? msg.axis?.bottom : null);
	}

	if (reduced && msg.frozenAt) {
		els.stillNote.textContent = `Still snapshot · ${new Date(msg.frozenAt).toISOString().slice(11, 19)} UTC`;
		els.stillNote.hidden = false;
	} else {
		els.stillNote.hidden = true;
	}
}

function scheduleSparkline(market) {
	clearTimeout(sparkTimer);
	sparkAbort?.abort();
	setEmpty(els.spark, true);
	setEmpty(els.sparkLabel, true);
	const cached = sparkCache.get(market);
	if (cached && Date.now() - cached.at < SPARK_CACHE_MS) {
		drawSparkline(cached.closes);
		return;
	}
	sparkTimer = setTimeout(() => loadSparkline(market), SPARK_DEBOUNCE_MS);
}

async function loadSparkline(market) {
	const abort = new AbortController();
	sparkAbort = abort;
	try {
		const end = Date.now();
		const res = await fetch(INFO_URL, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ type: "candleSnapshot", req: { coin: market, interval: "15m", startTime: end - 86_400_000, endTime: end } }),
			signal: abort.signal,
		});
		if (!res.ok) return;
		const candles = await res.json();
		if (market !== coin || !Array.isArray(candles) || candles.length < 24) return;
		const closes = candles.map((c) => Number(c.c));
		if (closes.some((v) => !Number.isFinite(v) || v <= 0)) return;
		sparkCache.set(market, { at: Date.now(), closes });
		drawSparkline(closes);
	} catch {
		// The sparkline is optional; it stays hidden when the snapshot is unavailable.
	}
}

function drawSparkline(closes) {
	const min = Math.min(...closes);
	const max = Math.max(...closes);
	const span = max - min || 1;
	const d = closes
		.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (closes.length - 1)) * 120).toFixed(2)},${(30 - ((v - min) / span) * 28).toFixed(2)}`)
		.join("");
	els.sparkPath.setAttribute("d", d);
	els.spark.dataset.dir = closes[closes.length - 1] >= closes[0] ? "up" : "down";
	setEmpty(els.spark, false);
	setEmpty(els.sparkLabel, false);
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
	};
}

function syncVisibility() {
	worker?.postMessage({ type: "visibility", value: docVisible && onScreen });
}

function syncReduced() {
	const reduced = reducedActive();
	els.showLive.hidden = !reduced;
	worker?.postMessage({ type: "reduced", value: reduced });
}

function startWorker() {
	if (!("transferControlToOffscreen" in els.canvas) || typeof Worker === "undefined") {
		const note = document.createElement("p");
		note.className = "no-canvas";
		note.textContent = "This browser cannot draw the live view off the main thread, so it is not shown.";
		els.stage.append(note);
		return;
	}
	const offscreen = els.canvas.transferControlToOffscreen();
	worker = new Worker(new URL("./open-book.worker.js", import.meta.url), { type: "module" });
	worker.onmessage = (event) => {
		if (event.data?.type === "ui") renderUi(event.data);
	};
	worker.postMessage({ type: "init", canvas: offscreen, ...stageSize(), variant, coin, reduced: reducedActive() }, [offscreen]);
	new ResizeObserver(() => worker.postMessage({ type: "resize", ...stageSize() })).observe(els.canvas);
	new IntersectionObserver((entries) => {
		onScreen = entries.some((entry) => entry.isIntersecting);
		syncVisibility();
	}).observe(els.stage);
}

function readSnapshot() {
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

function wireTabs() {
	for (const tab of els.tabs) {
		tab.addEventListener("click", () => {
			if (tab.dataset.coin !== coin) setCoin(tab.dataset.coin, false);
		});
	}
	els.tabs[0].parentElement.addEventListener("keydown", (event) => {
		if (event.repeat) return;
		const index = els.tabs.findIndex((t) => t.dataset.coin === coin);
		let next = index;
		if (event.key === "ArrowRight") next = (index + 1) % els.tabs.length;
		else if (event.key === "ArrowLeft") next = (index - 1 + els.tabs.length) % els.tabs.length;
		else if (event.key === "Home") next = 0;
		else if (event.key === "End") next = els.tabs.length - 1;
		else return;
		event.preventDefault();
		setCoin(els.tabs[next].dataset.coin, true);
	});
}

function wireControls() {
	els.pause.addEventListener("click", () => {
		paused = !paused;
		els.pause.setAttribute("aria-pressed", String(paused));
		els.window.dataset.paused = String(paused);
		els.liveText.textContent = paused ? "PAUSED" : "LIVE";
		worker?.postMessage({ type: "pause", value: paused });
	});
	els.snapshot.addEventListener("click", readSnapshot);
	els.showLive.addEventListener("click", () => {
		liveOptIn = true;
		syncReduced();
		els.pause.focus();
	});
	mqReduced.addEventListener("change", syncReduced);
	mqMobile.addEventListener("change", () => worker?.postMessage({ type: "resize", ...stageSize() }));
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

applyVariant(variant);
wireTabs();
wireControls();
startWorker();
setCoin(coin, false);
syncReduced();
