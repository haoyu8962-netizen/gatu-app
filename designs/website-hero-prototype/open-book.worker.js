// Open Book prototype renderer. Runs in a dedicated module worker and owns the
// Hyperliquid public WebSockets, validation, the scene model and Canvas 2D drawing.
// Prototype only: see README.md for what is and is not production-ready.

const WS_URL = "wss://api.hyperliquid.xyz/ws";
const INFO_URL = "https://api.hyperliquid.xyz/info";
const TARGET_TICK_MS = 250;
const MIN_WINDOW_MS = 15000;
const FAST_STALE_MS = 4000;
const DEAD_MS = 15000;
const DEPTH_STALE_MS = 8000;
const SILENT_RECONNECT_MS = 30000;
const HIDDEN_SUSPEND_MS = 30000;
const UI_INTERVAL_MS = 250;
const RECENTER_MIN_MS = 10000;
const OUTSIDE_MIN_MS = 1000;
const SEED_DEBOUNCE_MS = 300;
const N_SIG_FIGS = 5;
const SZ_DECIMALS = { BTC: 5, ETH: 4, SOL: 2, HYPE: 2 };
const MAX_TRADES = 1500;
const MAX_PULSES_PER_BATCH = 8;
const PULSE_MS = 400;
const DECIMAL = /^\d+(\.\d+)?$/;

const PALETTES = {
	a: {
		bg: [15, 26, 31],
		heat: (side, i) => {
			const tint = side === "bid" ? [39, 210, 159] : [240, 139, 158];
			const c = mix([190, 198, 204], tint, 0.12);
			return [c[0], c[1], c[2], 0.04 + 0.56 * Math.pow(i, 1.6)];
		},
		mid: { under: "rgba(15,26,31,0.92)", glow: null, core: "#edeef2", width: 1.5 },
		buy: "#27d29f",
		sell: "#f08b9e",
		halo: false,
		grid: false,
		nowEdge: "rgba(237,238,242,0.14)",
		nowDot: null,
	},
	b: {
		bg: [9, 17, 20],
		heat: (_side, i) => {
			const k = Math.pow(i, 1.5);
			const c = k < 0.7 ? mix([92, 52, 12], [230, 183, 102], k / 0.7) : mix([230, 183, 102], [255, 244, 220], (k - 0.7) / 0.3);
			return [c[0], c[1], c[2], 0.05 + 0.9 * Math.pow(i, 1.4)];
		},
		mid: { under: "rgba(9,17,20,0.9)", glow: "rgba(255,248,236,0.14)", core: "rgba(255,250,242,0.96)", width: 1.5 },
		buy: "#27d29f",
		sell: "#f08b9e",
		halo: true,
		grid: true,
		nowEdge: "rgba(230,183,102,0.55)",
		nowDot: "230,183,102",
	},
};

let canvas = null;
let ctx = null;
let heat = null;
let W = 0;
let H = 0;
let dpr = 1;
let windowMs = 120000;
let effectiveWindowMs = MIN_WINDOW_MS;
let tickMs = TARGET_TICK_MS;
let tickTimer = 0;
let maxFps = 30;
let variant = "a";
let palette = PALETTES.a;
let heatLut = { bid: [], ask: [] };
let sprites = null;
let paused = false;
let visible = true;
let hiddenSince = 0;
let reduced = false;
let stillDirty = true;
let stillHasData = false;
let frozenAt = 0;

let coin = "BTC";
let szDecimals = SZ_DECIMALS.BTC;
let session = 0;
let suspended = false;
let seedTimer = 0;
let seedAbort = null;

// Two sockets, one book subscription each: frames do not say which grouping or
// speed they belong to, so the fast top-of-book stream and the slower 20-level
// depth stream must never share a connection.
const sockets = {
	fast: newSocketState(),
	depth: newSocketState(),
};

let book = null;
let depthBook = null;
let lastBookTime = { fast: 0, depth: 0 };
let invalidFrames = { fast: 0, depth: 0 };
let tradeSnapshotPending = false;
let step = 0;
let stepMagnitude = null;
let columns = [];
let firstColumnAt = 0;
let trades = [];
let seenTrades = new Set();
let pendingPulses = [];
let view = { center: 0, half: 0, lastRecenter: 0 };
let p95 = 1;
let lastTickAt = 0;
let lastFrameAt = 0;
let lastUiAt = 0;
let lastTrade = null;
let assetCtx = null;

function newSocketState() {
	return { ws: null, connId: 0, pingTimer: 0, reconnectTimer: 0, backoff: 1000, attempts: [], lastMsgAt: 0, failedClosed: false };
}

self.onmessage = (event) => {
	const msg = event.data;
	switch (msg.type) {
		case "init":
			canvas = msg.canvas;
			ctx = canvas.getContext("2d", { alpha: false });
			windowMs = msg.windowMs;
			maxFps = msg.maxFps;
			reduced = msg.reduced;
			setVariant(msg.variant);
			resize(msg.cssW, msg.cssH, msg.dpr);
			switchCoin(msg.coin);
			connect("fast");
			connect("depth");
			requestFrame();
			break;
		case "resize":
			windowMs = msg.windowMs ?? windowMs;
			maxFps = msg.maxFps ?? maxFps;
			resize(msg.cssW, msg.cssH, msg.dpr);
			break;
		case "variant":
			setVariant(msg.variant);
			rebuildHeat();
			stillDirty = true;
			break;
		case "coin":
			if (msg.coin !== coin) {
				unsubscribeAll("fast", coin);
				unsubscribeAll("depth", coin);
				switchCoin(msg.coin);
				subscribeAll("fast", coin);
				subscribeAll("depth", coin);
			}
			break;
		case "pause":
			paused = msg.value;
			stillDirty = true;
			break;
		case "visibility":
			visible = msg.value;
			if (visible) {
				hiddenSince = 0;
				if (suspended) resume();
			} else if (!hiddenSince) {
				hiddenSince = performance.now();
			}
			break;
		case "reduced":
			reduced = msg.value;
			stillDirty = true;
			break;
	}
};

function mix(a, b, t) {
	const k = Math.max(0, Math.min(1, t));
	return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function rgba(c) {
	return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${c[3].toFixed(3)})`;
}

function setVariant(v) {
	variant = v === "b" ? "b" : "a";
	palette = PALETTES[variant];
	heatLut = { bid: [], ask: [] };
	for (let s = 0; s < 64; s++) {
		const i = s / 63;
		heatLut.bid.push(rgba(palette.heat("bid", i)));
		heatLut.ask.push(rgba(palette.heat("ask", i)));
	}
	sprites = palette.halo ? { buy: makeHalo(palette.buy), sell: makeHalo(palette.sell) } : null;
}

function makeHalo(color) {
	const size = 64;
	const c = new OffscreenCanvas(size, size);
	const g = c.getContext("2d");
	const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	grad.addColorStop(0, color);
	grad.addColorStop(0.3, color);
	grad.addColorStop(1, "rgba(0,0,0,0)");
	g.fillStyle = grad;
	g.fillRect(0, 0, size, size);
	return c;
}

function resize(cssW, cssH, nextDpr) {
	if (!canvas || cssW <= 0 || cssH <= 0) return;
	dpr = nextDpr;
	W = Math.max(1, Math.round(cssW * dpr));
	H = Math.max(1, Math.round(cssH * dpr));
	canvas.width = W;
	canvas.height = H;
	heat = new OffscreenCanvas(W, H);
	const colsPx = Math.max(1, Math.round((W * TARGET_TICK_MS) / windowMs));
	tickMs = (windowMs * colsPx) / W;
	clearInterval(tickTimer);
	tickTimer = setInterval(onTick, tickMs);
	rebuildHeat();
	render(performance.now(), true);
	stillDirty = true;
}

function resetScene() {
	book = null;
	depthBook = null;
	lastBookTime = { fast: 0, depth: 0 };
	invalidFrames = { fast: 0, depth: 0 };
	step = 0;
	stepMagnitude = null;
	columns = [];
	firstColumnAt = 0;
	effectiveWindowMs = MIN_WINDOW_MS;
	trades = [];
	seenTrades = new Set();
	pendingPulses = [];
	view = { center: 0, half: 0, lastRecenter: 0 };
	p95 = 1;
	lastTrade = null;
	assetCtx = null;
	stillDirty = true;
	stillHasData = false;
	if (heat) heat.getContext("2d").clearRect(0, 0, W, H);
	postUi(true);
}

function switchCoin(next) {
	session += 1;
	coin = next;
	szDecimals = SZ_DECIMALS[next] ?? 2;
	resetScene();
	scheduleSeed();
}

function scheduleSeed() {
	clearTimeout(seedTimer);
	seedAbort?.abort();
	const mySession = session;
	const myCoin = coin;
	seedTimer = setTimeout(() => seed(mySession, myCoin), SEED_DEBOUNCE_MS);
}

async function seed(mySession, myCoin) {
	const abort = new AbortController();
	seedAbort = abort;
	try {
		const [bookRes, tradesRes] = await Promise.all([
			info({ type: "l2Book", coin: myCoin, nSigFigs: N_SIG_FIGS }, abort.signal),
			info({ type: "recentTrades", coin: myCoin }, abort.signal),
		]);
		if (mySession !== session) return;
		if (bookRes && depthBook === null) acceptBook(bookRes, "depth");
		if (bookRes && book === null) acceptBook(bookRes, "fast");
		if (Array.isArray(tradesRes)) acceptTrades(tradesRes, true);
	} catch {
		// Seeding is best effort; the WebSocket streams fill the scene either way.
	}
}

async function info(body, signal) {
	const res = await fetch(INFO_URL, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
		signal,
	});
	if (!res.ok) throw new Error(`info ${res.status}`);
	return res.json();
}

function connect(kind) {
	const sock = sockets[kind];
	if (suspended || sock.failedClosed) return;
	const now = performance.now();
	sock.attempts = sock.attempts.filter((t) => now - t < 300000);
	const lastMinute = sock.attempts.filter((t) => now - t < 60000).length;
	if (lastMinute >= 3 || sock.attempts.length >= 6) {
		sock.failedClosed = true;
		return;
	}
	sock.attempts.push(now);
	const my = ++sock.connId;
	let ws;
	try {
		ws = new WebSocket(WS_URL);
	} catch {
		scheduleReconnect(kind, my);
		return;
	}
	sock.ws = ws;
	ws.onopen = () => {
		if (my !== sock.connId) return;
		sock.lastMsgAt = performance.now();
		subscribeAll(kind, coin);
		clearInterval(sock.pingTimer);
		sock.pingTimer = setInterval(() => send(kind, { method: "ping" }), 50000);
	};
	ws.onmessage = (event) => {
		if (my !== sock.connId) return;
		sock.lastMsgAt = performance.now();
		let msg;
		try {
			msg = JSON.parse(event.data);
		} catch {
			return;
		}
		if (msg.channel === "error") {
			ws.close();
			return;
		}
		handle(msg, kind);
	};
	ws.onclose = () => {
		clearInterval(sock.pingTimer);
		if (my !== sock.connId) return;
		scheduleReconnect(kind, my);
	};
	ws.onerror = () => {
		try {
			ws.close();
		} catch {
			// Closing a failed socket can throw in some engines; the close handler reconnects.
		}
	};
}

function scheduleReconnect(kind, my) {
	const sock = sockets[kind];
	if (my !== sock.connId || suspended) return;
	clearTimeout(sock.reconnectTimer);
	sock.reconnectTimer = setTimeout(() => connect(kind), Math.random() * sock.backoff);
	sock.backoff = Math.min(sock.backoff * 2, 30000);
}

function closeSocket(kind) {
	const sock = sockets[kind];
	sock.connId += 1;
	clearInterval(sock.pingTimer);
	clearTimeout(sock.reconnectTimer);
	try {
		sock.ws?.close();
	} catch {
		// Already closed.
	}
	sock.ws = null;
}

function suspend() {
	suspended = true;
	closeSocket("fast");
	closeSocket("depth");
	clearTimeout(seedTimer);
	seedAbort?.abort();
}

function resume() {
	suspended = false;
	for (const kind of ["fast", "depth"]) {
		sockets[kind].failedClosed = false;
		sockets[kind].backoff = 1000;
	}
	session += 1;
	resetScene();
	scheduleSeed();
	connect("fast");
	connect("depth");
}

function send(kind, payload) {
	const ws = sockets[kind].ws;
	if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function subscriptionsFor(kind, c) {
	if (kind === "depth") return [{ type: "l2Book", coin: c, nSigFigs: N_SIG_FIGS }];
	return [
		{ type: "l2Book", coin: c, nSigFigs: N_SIG_FIGS, fast: true },
		{ type: "trades", coin: c },
		{ type: "activeAssetCtx", coin: c },
	];
}

function subscribeAll(kind, c) {
	if (kind === "fast") tradeSnapshotPending = true;
	for (const subscription of subscriptionsFor(kind, c)) send(kind, { method: "subscribe", subscription });
}

function unsubscribeAll(kind, c) {
	for (const subscription of subscriptionsFor(kind, c)) send(kind, { method: "unsubscribe", subscription });
}

function handle(msg, kind) {
	switch (msg.channel) {
		case "l2Book":
			acceptBook(msg.data, kind);
			break;
		case "trades":
			if (Array.isArray(msg.data) && msg.data[0]?.coin === coin) {
				// The first trades message after a subscribe is a snapshot of recent history.
				const isSnapshot = tradeSnapshotPending;
				tradeSnapshotPending = false;
				acceptTrades(msg.data, isSnapshot);
			}
			break;
		case "activeAssetCtx":
			acceptCtx(msg.data);
			break;
	}
}

function parseLevels(levels, isBid) {
	const out = [];
	for (const level of levels) {
		if (typeof level?.px !== "string" || typeof level?.sz !== "string") return null;
		if (!DECIMAL.test(level.px) || !DECIMAL.test(level.sz)) return null;
		const px = Number(level.px);
		const sz = Number(level.sz);
		if (px <= 0 || sz <= 0) return null;
		const prev = out[out.length - 1];
		if (prev && (isBid ? px >= prev.px : px <= prev.px)) return null;
		out.push({ px, sz, pxS: level.px, szS: level.sz });
	}
	return out;
}

function rejectFrame(kind) {
	invalidFrames[kind] += 1;
	if (invalidFrames[kind] >= 3) {
		invalidFrames[kind] = 0;
		sockets[kind].ws?.close();
	}
	return false;
}

function acceptBook(data, kind) {
	if (!data || data.coin !== coin) return false;
	if (!Array.isArray(data.levels) || data.levels.length !== 2) return rejectFrame(kind);
	const time = Number(data.time);
	if (!Number.isFinite(time)) return rejectFrame(kind);
	if (time < lastBookTime[kind]) return false;
	const bids = parseLevels(data.levels[0], true);
	const asks = parseLevels(data.levels[1], false);
	if (!bids || !asks || bids.length === 0 || asks.length === 0) return rejectFrame(kind);
	if (bids[0].px >= asks[0].px) return rejectFrame(kind);
	invalidFrames[kind] = 0;
	lastBookTime[kind] = time;
	sockets[kind].backoff = 1000;
	const recvAt = performance.now();
	if (kind === "depth") {
		depthBook = { bids, asks, recvAt, time };
	} else {
		book = { bids: bids.slice(0, 5), asks: asks.slice(0, 5), recvAt, time };
	}
	updateStep(bids[0].px);
	return true;
}

function updateStep(bestBid) {
	const magnitude = Math.floor(Math.log10(bestBid));
	if (magnitude === stepMagnitude && step > 0) return;
	stepMagnitude = magnitude;
	const bySigFigs = Number((10 ** (magnitude - (N_SIG_FIGS - 1))).toPrecision(1));
	const byDecimals = Number((10 ** -(6 - szDecimals)).toPrecision(1));
	step = Math.max(bySigFigs, byDecimals);
	view = { center: 0, half: 0, lastRecenter: 0 };
}

function stepDecimals() {
	return step > 0 ? Math.max(0, -Math.floor(Math.log10(step) + 1e-9)) : 0;
}

function formatPrice(value, extraDecimals) {
	const base = stepDecimals();
	const max = Math.max(base, Math.min(base + extraDecimals, 6 - szDecimals));
	let text = value.toFixed(max);
	if (max > base) text = text.replace(/0+$/, "").replace(/\.$/, "");
	if (base > 0 && !text.includes(".")) text = value.toFixed(base);
	return text;
}

function mergedSide(fast, depth, isBid, now) {
	const out = new Map();
	if (depth && now - depthBook.recvAt < DEPTH_STALE_MS) {
		const edge = fast[fast.length - 1].px;
		const best = fast[0].px;
		const full = fast.length >= 5;
		for (const level of depth) {
			const outside = full ? (isBid ? level.px < edge : level.px > edge) : isBid ? level.px <= best : level.px >= best;
			if (outside) out.set(level.px, level.sz);
		}
	}
	for (const level of fast) out.set(level.px, level.sz);
	return [...out.entries()];
}

function acceptTrades(list, isSeed) {
	const now = performance.now();
	const valid = [];
	let newest = 0;
	for (const trade of list) {
		if (!trade || trade.coin !== coin || (trade.side !== "B" && trade.side !== "A")) continue;
		if (typeof trade.px !== "string" || typeof trade.sz !== "string" || !DECIMAL.test(trade.px) || !DECIMAL.test(trade.sz)) continue;
		const time = Number(trade.time);
		const px = Number(trade.px);
		const sz = Number(trade.sz);
		if (!Number.isFinite(time) || px <= 0 || sz <= 0) continue;
		const key = `${time}:${trade.tid}`;
		if (seenTrades.has(key)) continue;
		seenTrades.add(key);
		valid.push({ px, sz, time, key, side: trade.side, pxS: trade.px });
		if (time > newest) newest = time;
	}
	valid.sort((a, b) => a.time - b.time);
	const anchorTime = book?.time ?? newest;
	const anchorAt = book?.recvAt ?? now;
	let pulses = 0;
	for (const trade of valid) {
		const t = isSeed ? Math.min(now, anchorAt - (anchorTime - trade.time)) : now;
		if (isSeed && now - t > windowMs) continue;
		trades.push({ t, px: trade.px, notional: trade.px * trade.sz, buy: trade.side === "B", key: trade.key });
		if (!isSeed && pulses < MAX_PULSES_PER_BATCH) {
			pendingPulses.push({ t: now, px: trade.px, notional: trade.px * trade.sz, buy: trade.side === "B" });
			pulses += 1;
		}
		if (!lastTrade || trade.time >= lastTrade.time) lastTrade = trade;
	}
	trades.sort((a, b) => a.t - b.t);
	if (trades.length > MAX_TRADES) {
		for (const old of trades.splice(0, trades.length - MAX_TRADES)) seenTrades.delete(old.key);
	}
}

function acceptCtx(data) {
	if (!data || data.coin !== coin || !data.ctx) return;
	const { markPx, prevDayPx } = data.ctx;
	if (typeof markPx !== "string" || typeof prevDayPx !== "string" || !DECIMAL.test(markPx) || !DECIMAL.test(prevDayPx)) return;
	const mark = Number(markPx);
	const prev = Number(prevDayPx);
	if (mark <= 0 || prev <= 0) return;
	assetCtx = { pct: ((mark - prev) / prev) * 100, recvAt: performance.now() };
}

function isLive(now) {
	return book !== null && now - book.recvAt < FAST_STALE_MS && step > 0;
}

function onTick() {
	const now = performance.now();
	for (const kind of ["fast", "depth"]) {
		const sock = sockets[kind];
		if (sock.ws?.readyState === WebSocket.OPEN && now - sock.lastMsgAt > SILENT_RECONNECT_MS) sock.ws.close();
	}
	if (!visible && !suspended && hiddenSince && now - hiddenSince > HIDDEN_SUSPEND_MS) suspend();
	if (book && now - book.recvAt > DEAD_MS) {
		resetScene();
		scheduleSeed();
	}
	if (book) pushColumn(now, isLive(now));
	const cutoff = now - windowMs - tickMs;
	while (columns.length && columns[0].t < cutoff) columns.shift();
	while (trades.length && trades[0].t < cutoff) seenTrades.delete(trades.shift().key);
	pendingPulses = pendingPulses.filter((pulse) => now - pulse.t < PULSE_MS);
	effectiveWindowMs = firstColumnAt ? Math.min(windowMs, Math.max(MIN_WINDOW_MS, now - firstColumnAt)) : MIN_WINDOW_MS;
	rebuildHeat();
	if (now - lastUiAt >= UI_INTERVAL_MS) postUi(false);
}

function pushColumn(now, live) {
	lastTickAt = now;
	if (!live) {
		columns.push({ t: now, mid: Number.NaN, bids: [], asks: [] });
		return;
	}
	const mid = (book.bids[0].px + book.asks[0].px) / 2;
	columns.push({
		t: now,
		mid,
		bids: mergedSide(book.bids, depthBook?.bids, true, now),
		asks: mergedSide(book.asks, depthBook?.asks, false, now),
	});
	if (!firstColumnAt) firstColumnAt = now;
	updateP95();
	maybeRecenter(mid, now);
	if (!stillHasData) stillDirty = true;
}

function updateP95() {
	const sample = [];
	const from = Math.max(0, columns.length - 40);
	for (let i = from; i < columns.length; i++) {
		for (const [, sz] of columns[i].bids) sample.push(sz);
		for (const [, sz] of columns[i].asks) sample.push(sz);
	}
	if (sample.length < 10) return;
	sample.sort((a, b) => a - b);
	p95 = Math.max(sample[Math.floor(sample.length * 0.95)], 1e-12);
}

function maybeRecenter(mid, now) {
	const levels = Math.max(depthBook ? Math.max(depthBook.bids.length, depthBook.asks.length) : 20, 10);
	const bookHalf = levels * step * 1.08;
	let low = mid;
	let high = mid;
	for (const column of columns) {
		if (Number.isNaN(column.mid)) continue;
		if (column.mid < low) low = column.mid;
		if (column.mid > high) high = column.mid;
	}
	const targetHalf = Math.min(bookHalf * 6, Math.max(bookHalf, (high - low) / 2 + bookHalf * 0.6));
	const rangeCenter = (high + low) / 2;
	const targetCenter = roundTo(Math.min(Math.max(rangeCenter, mid - 0.8 * targetHalf), mid + 0.8 * targetHalf), step);
	if (view.half === 0) {
		view = { center: targetCenter, half: targetHalf, lastRecenter: now };
		return;
	}
	const outside = Math.abs(mid - view.center) > view.half * 0.92;
	const drifted = Math.abs(targetCenter - view.center) > view.half * 0.15 || Math.abs(targetHalf / view.half - 1) > 0.2;
	const since = now - view.lastRecenter;
	if ((outside && since > OUTSIDE_MIN_MS) || (drifted && since > RECENTER_MIN_MS)) {
		view = { center: targetCenter, half: targetHalf, lastRecenter: now };
	}
}

function roundTo(value, increment) {
	return increment > 0 ? Math.round(value / increment) * increment : value;
}

function yOf(px) {
	return H / 2 - ((px - view.center) / view.half) * (H / 2);
}

function xOfTime(t, ref) {
	return W - ((ref - t) / effectiveWindowMs) * W;
}

function drawColumn(g, column, x, cw) {
	const half = step / 2;
	const denom = Math.log1p(p95);
	const paint = (levels, lut) => {
		for (const [px, sz] of levels) {
			const top = yOf(px + half);
			const bottom = yOf(px - half);
			if (bottom < 0 || top > H) continue;
			const distance = Math.abs(px - column.mid) / step;
			const fade = distance <= 14 ? 1 : Math.max(0, 1 - (distance - 14) / 6);
			if (fade <= 0) continue;
			const intensity = Math.min(1, Math.log1p(sz) / denom);
			const h = bottom - top;
			g.globalAlpha = fade;
			g.fillStyle = lut[Math.round(intensity * 63)];
			g.fillRect(x, top, cw + 0.5, h >= 6 * dpr ? h - 0.5 * dpr : Math.max(1, h));
		}
	};
	paint(column.bids, heatLut.bid);
	paint(column.asks, heatLut.ask);
	g.globalAlpha = 1;
}

function rebuildHeat() {
	if (!heat) return;
	const g = heat.getContext("2d");
	g.clearRect(0, 0, W, H);
	if (step <= 0 || view.half === 0) return;
	const cw = (W * tickMs) / effectiveWindowMs;
	for (const column of columns) {
		if (column.bids.length === 0) continue;
		const x = xOfTime(column.t, lastTickAt) - cw;
		if (x + cw < 0) continue;
		drawColumn(g, column, x, cw);
	}
}

function requestFrame() {
	if (typeof self.requestAnimationFrame === "function") {
		self.requestAnimationFrame(frame);
	} else {
		setTimeout(() => frame(performance.now()), 1000 / maxFps);
	}
}

function frame() {
	requestFrame();
	if (!ctx || W === 0 || !visible) return;
	const now = performance.now();
	const still = paused || reduced;
	if (still) {
		if (!stillDirty) return;
		render(now, true);
		stillDirty = false;
		if (columns.length) stillHasData = true;
		frozenAt = performance.timeOrigin + lastTickAt;
		postUi(true);
		return;
	}
	if (now - lastFrameAt < 1000 / maxFps - 2) return;
	lastFrameAt = now;
	render(now, false);
}

function render(now, still) {
	const p = palette;
	ctx.globalCompositeOperation = "source-over";
	ctx.globalAlpha = 1;
	ctx.fillStyle = `rgb(${p.bg[0]},${p.bg[1]},${p.bg[2]})`;
	ctx.fillRect(0, 0, W, H);
	const ref = still ? lastTickAt || now : now;
	if (p.grid) drawGrid(ref);
	if (step > 0 && view.half > 0 && columns.length) {
		const shift = still ? 0 : ((now - lastTickAt) / effectiveWindowMs) * W;
		if (heat) ctx.drawImage(heat, -shift, 0);
		drawMid(ref);
		drawTrades(ref, still);
		if (p.nowDot && isLive(now)) drawNowDot();
	}
	ctx.fillStyle = p.nowEdge;
	ctx.fillRect(W - Math.max(1, dpr), 0, Math.max(1, dpr), H);
}

function gridStep() {
	let s = step * 10;
	while ((s / view.half) * (H / 2) < 28 * dpr) s *= 5;
	return s;
}

function drawGrid(ref) {
	ctx.strokeStyle = "rgba(255,255,255,0.045)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	const epoch = performance.timeOrigin + ref;
	for (let t = Math.floor(epoch / 15000) * 15000; t > epoch - effectiveWindowMs; t -= 15000) {
		const x = Math.round(W - ((epoch - t) / effectiveWindowMs) * W) + 0.5;
		ctx.moveTo(x, 0);
		ctx.lineTo(x, H);
	}
	if (step > 0 && view.half > 0) {
		const s = gridStep();
		const top = view.center + view.half;
		for (let px = Math.ceil((view.center - view.half) / s) * s; px <= top; px += s) {
			const y = Math.round(yOf(px)) + 0.5;
			ctx.moveTo(0, y);
			ctx.lineTo(W, y);
		}
	}
	ctx.stroke();
}

function midPath(ref) {
	ctx.beginPath();
	let drawing = false;
	for (const column of columns) {
		if (Number.isNaN(column.mid)) {
			drawing = false;
			continue;
		}
		const x = xOfTime(column.t, ref);
		const y = yOf(column.mid);
		if (drawing) ctx.lineTo(x, y);
		else ctx.moveTo(x, y);
		drawing = true;
	}
}

function drawMid(ref) {
	const p = palette.mid;
	midPath(ref);
	ctx.lineJoin = "round";
	ctx.strokeStyle = p.under;
	ctx.lineWidth = (p.width + 2.5) * dpr;
	ctx.stroke();
	if (p.glow) {
		ctx.strokeStyle = p.glow;
		ctx.lineWidth = 5 * dpr;
		ctx.stroke();
	}
	ctx.strokeStyle = p.core;
	ctx.lineWidth = p.width * dpr;
	ctx.stroke();
}

function radiusFor(notional) {
	return Math.max(2, Math.min(14, 2 + Math.sqrt(notional) / 40)) * dpr;
}

function drawTrades(ref, still) {
	const p = palette;
	const bg = `rgb(${p.bg[0]},${p.bg[1]},${p.bg[2]})`;
	for (const trade of trades) {
		const x = xOfTime(trade.t, ref);
		if (x < -20) continue;
		const y = yOf(trade.px);
		if (y < -20 || y > H + 20) continue;
		const r = radiusFor(trade.notional);
		if (sprites) {
			const R = r * 2.2;
			ctx.globalAlpha = 0.5;
			ctx.drawImage(trade.buy ? sprites.buy : sprites.sell, x - R, y - R, R * 2, R * 2);
			ctx.globalAlpha = 1;
		}
		ctx.strokeStyle = bg;
		ctx.lineWidth = (trade.buy ? 2 : 3.5) * dpr;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.stroke();
		ctx.beginPath();
		if (trade.buy) {
			ctx.fillStyle = p.buy;
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();
		} else {
			ctx.strokeStyle = p.sell;
			ctx.lineWidth = 1.5 * dpr;
			ctx.arc(x, y, Math.max(r - dpr * 0.75, dpr), 0, Math.PI * 2);
			ctx.stroke();
		}
	}
	if (still) return;
	for (const pulse of pendingPulses) {
		const k = (ref - pulse.t) / PULSE_MS;
		if (k < 0 || k > 1) continue;
		const r = radiusFor(pulse.notional) + (p.halo ? 12 : 8) * dpr * k;
		ctx.strokeStyle = pulse.buy ? p.buy : p.sell;
		ctx.globalAlpha = (p.halo ? 0.6 : 0.5) * (1 - k);
		ctx.lineWidth = (p.halo ? 2 : 1.25) * dpr;
		ctx.beginPath();
		ctx.arc(xOfTime(pulse.t, ref), yOf(pulse.px), r, 0, Math.PI * 2);
		ctx.stroke();
		ctx.globalAlpha = 1;
	}
}

function drawNowDot() {
	const last = columns[columns.length - 1];
	if (!last || Number.isNaN(last.mid)) return;
	const y = yOf(last.mid);
	ctx.fillStyle = `rgba(${palette.nowDot},0.3)`;
	ctx.beginPath();
	ctx.arc(W - 2 * dpr, y, 8 * dpr, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = "rgba(255,241,210,0.95)";
	ctx.beginPath();
	ctx.arc(W - 2 * dpr, y, 3 * dpr, 0, Math.PI * 2);
	ctx.fill();
}

function postUi(force) {
	const now = performance.now();
	lastUiAt = now;
	const live = isLive(now);
	let mid = null;
	let axis = null;
	if (live && view.half > 0) {
		const m = (book.bids[0].px + book.asks[0].px) / 2;
		mid = { text: formatPrice(m, 1), frac: yOf(m) / H };
		const s = gridStep();
		const topPx = Math.floor((view.center + view.half) / s) * s;
		const bottomPx = Math.ceil((view.center - view.half) / s) * s;
		axis = {
			top: { text: formatPrice(topPx, 0), frac: yOf(topPx) / H },
			bottom: { text: formatPrice(bottomPx, 0), frac: yOf(bottomPx) / H },
		};
	}
	self.postMessage({
		type: "ui",
		session,
		coin,
		force,
		live,
		suspended,
		failed: sockets.fast.failedClosed || sockets.depth.failedClosed,
		last: live && lastTrade ? { pxS: lastTrade.pxS, buy: lastTrade.side === "B" } : null,
		pct: live && assetCtx && now - assetCtx.recvAt < 60000 ? assetCtx.pct : null,
		bids: live ? book.bids.map((l) => [l.pxS, l.szS, l.sz]) : null,
		asks: live ? book.asks.map((l) => [l.pxS, l.szS, l.sz]) : null,
		bestBidS: live ? book.bids[0].pxS : null,
		bestAskS: live ? book.asks[0].pxS : null,
		spreadS: live ? formatPrice(book.asks[0].px - book.bids[0].px, 0) : null,
		tickS: step > 0 ? formatPrice(step, 0) : null,
		mid,
		axis,
		frozenAt: paused || reduced ? frozenAt : 0,
		windowSeconds: Math.round(effectiveWindowMs / 1000),
	});
}
