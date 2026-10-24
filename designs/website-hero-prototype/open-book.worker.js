// Open Book prototype renderer. Runs in a dedicated module worker and owns the
// Hyperliquid public WebSocket, validation, the scene model and Canvas 2D drawing.
// The same code replays a recording with a virtual clock to make the cold-start poster.
// Prototype only: see README.md for what is and is not production-ready.

const WS_URL = "wss://api.hyperliquid.xyz/ws";
const INFO_URL = "https://api.hyperliquid.xyz/info";
const TARGET_TICK_MS = 250;
const MIN_WINDOW_MS = 15000;
const TOP_STALE_MS = 6000;
const DEPTH_STALE_MS = 12000;
const DEAD_MS = 20000;
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
const PULSE_MS = 320;
const LAST_TRADE_MAX_AGE_MS = 60000;
const REPLAY_CLOCK_OFFSET = 10000;
const DECIMAL = /^\d+(\.\d+)?$/;

const PALETTES = {
	a: {
		bg: [15, 26, 31],
		heat: (side, i) => {
			const tint = side === "bid" ? [39, 210, 159] : [240, 139, 158];
			const c = mix([190, 198, 204], tint, 0.12);
			return [c[0], c[1], c[2], 0.04 + 0.56 * i ** 1.6];
		},
		mid: { under: "rgba(15,26,31,0.92)", core: "#edeef2", width: 1.5 },
		buy: "#27d29f",
		sell: "#f08b9e",
		pulseGrow: 8,
		grid: 0,
		nowEdge: "rgba(237,238,242,0.14)",
		nowDot: false,
	},
	b: {
		bg: [9, 17, 20],
		heat: (_side, i) => {
			const k = i ** 1.3;
			const c = k < 0.6 ? mix([38, 49, 56], [104, 116, 125], k / 0.6) : mix([104, 116, 125], [170, 180, 188], (k - 0.6) / 0.4);
			return [c[0], c[1], c[2], 0.08 + 0.57 * i ** 1.4];
		},
		mid: { under: "rgba(9,17,20,0.9)", core: "#edeef2", width: 1.5 },
		buy: "#27d29f",
		sell: "#f08b9e",
		pulseGrow: 12,
		grid: 0.035,
		nowEdge: "rgba(237,238,242,0.22)",
		nowDot: true,
	},
};

let canvas = null;
let ctx = null;
let heat = null;
let heatDirty = true;
let W = 0;
let H = 0;
let dpr = 1;
let windowMs = 120000;
let effectiveWindowMs = MIN_WINDOW_MS;
let tickMs = TARGET_TICK_MS;
let tickTimer = 0;
let maxFps = 30;
let maxRadius = 8;
let palette = PALETTES.a;
let heatLut = { bid: [], ask: [] };
let paused = false;
let pageVisible = true;
let rendering = true;
let hiddenSince = 0;
let reduced = false;
let stillDirty = true;
let stillHasData = false;
let replay = null;

let coin = "BTC";
let szDecimals = SZ_DECIMALS.BTC;
let session = 0;
let suspended = false;
let seedTimer = 0;
let seedAbort = null;

// One connection with one l2Book subscription: book frames do not say which
// grouping or speed they belong to, so a second book stream would need its own socket.
const sock = { ws: null, connId: 0, pingTimer: 0, reconnectTimer: 0, backoff: 1000, attempts: [], lastMsgAt: 0, failedClosed: false };

let depth = null;
let top = null;
let lastFrameTime = { l2Book: 0, bbo: 0 };
let invalidFrames = { l2Book: 0, bbo: 0 };
let lastDataAt = 0;
let streamStartAt = 0;
let lastDepthResubscribe = 0;
let hadData = false;
let announceRender = false;
let tradeSnapshotPending = false;
let step = 0;
let stepMagnitude = null;
let columns = [];
let firstColumnAt = 0;
let liveSince = 0;
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

function nowMs() {
	return replay ? replay.now : performance.now();
}

function epochOf(t) {
	return (replay ? replay.epoch : performance.timeOrigin) + t;
}

self.onmessage = (event) => {
	const msg = event.data;
	switch (msg.type) {
		case "init":
			canvas = msg.canvas;
			ctx = canvas.getContext("2d", { alpha: false });
			windowMs = msg.windowMs;
			maxFps = msg.maxFps;
			maxRadius = msg.maxRadius;
			reduced = msg.reduced;
			rendering = msg.render;
			setVariant(msg.variant);
			startTick();
			resize(msg.cssW, msg.cssH, msg.dpr);
			switchCoin(msg.coin);
			connect();
			requestFrame();
			break;
		case "resize":
			windowMs = msg.windowMs ?? windowMs;
			maxFps = msg.maxFps ?? maxFps;
			maxRadius = msg.maxRadius ?? maxRadius;
			resize(msg.cssW, msg.cssH, msg.dpr);
			break;
		case "variant":
			setVariant(msg.variant);
			heatDirty = true;
			stillDirty = true;
			break;
		case "coin":
			if (msg.coin !== coin) {
				unsubscribeAll(coin);
				switchCoin(msg.coin);
				subscribeAll(coin);
			}
			break;
		case "pause":
			paused = msg.value;
			stillDirty = true;
			break;
		case "visibility":
			pageVisible = msg.page;
			rendering = msg.render;
			if (pageVisible) {
				hiddenSince = 0;
				if (suspended) resume();
			} else if (!hiddenSince) {
				hiddenSince = nowMs();
			}
			if (rendering) {
				heatDirty = true;
				stillDirty = true;
				announceRender = true;
			}
			break;
		case "reduced":
			reduced = msg.value;
			stillDirty = true;
			break;
		case "replay":
			runReplay(msg.recording, msg.configs);
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
	palette = PALETTES[v === "b" ? "b" : "a"];
	heatLut = { bid: [], ask: [] };
	for (let s = 0; s < 64; s++) {
		const i = s / 63;
		heatLut.bid.push(rgba(palette.heat("bid", i)));
		heatLut.ask.push(rgba(palette.heat("ask", i)));
	}
}

function startTick() {
	clearInterval(tickTimer);
	tickTimer = setInterval(onTick, tickMs);
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
	if (!replay) startTick();
	rebuildHeat();
	render(nowMs(), paused || reduced);
	stillDirty = true;
}

function resetScene() {
	depth = null;
	top = null;
	lastFrameTime = { l2Book: 0, bbo: 0 };
	invalidFrames = { l2Book: 0, bbo: 0 };
	step = 0;
	stepMagnitude = null;
	columns = [];
	firstColumnAt = 0;
	liveSince = 0;
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
	if (!replay) postUi(true);
}

// The silence clock restarts with every new stream, so a market switch or a page
// coming back into view is "waiting for data", not "unavailable".
function restartStream() {
	lastDataAt = nowMs();
	streamStartAt = lastDataAt;
	hadData = false;
}

function switchCoin(next) {
	session += 1;
	coin = next;
	szDecimals = SZ_DECIMALS[next] ?? 2;
	restartStream();
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
		if (bookRes && depth === null) acceptDepth(bookRes);
		if (Array.isArray(tradesRes)) acceptTrades(tradesRes, true);
	} catch {
		// Seeding is best effort; the WebSocket stream fills the scene either way.
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

function connect() {
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
		scheduleReconnect(my);
		return;
	}
	sock.ws = ws;
	ws.onopen = () => {
		if (my !== sock.connId) return;
		sock.lastMsgAt = performance.now();
		subscribeAll(coin);
		clearInterval(sock.pingTimer);
		sock.pingTimer = setInterval(() => send({ method: "ping" }), 50000);
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
		handle(msg);
	};
	ws.onclose = () => {
		clearInterval(sock.pingTimer);
		if (my !== sock.connId) return;
		scheduleReconnect(my);
		postUi(true);
	};
	ws.onerror = () => {
		try {
			ws.close();
		} catch {
			// Closing a failed socket can throw in some engines; the close handler reconnects.
		}
	};
}

function scheduleReconnect(my) {
	if (my !== sock.connId || suspended) return;
	clearTimeout(sock.reconnectTimer);
	sock.reconnectTimer = setTimeout(connect, Math.random() * sock.backoff);
	sock.backoff = Math.min(sock.backoff * 2, 30000);
}

function closeSocket() {
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
	closeSocket();
	clearTimeout(seedTimer);
	seedAbort?.abort();
}

function resume() {
	suspended = false;
	sock.failedClosed = false;
	sock.backoff = 1000;
	session += 1;
	restartStream();
	resetScene();
	scheduleSeed();
	connect();
}

function send(payload) {
	if (sock.ws && sock.ws.readyState === WebSocket.OPEN) sock.ws.send(JSON.stringify(payload));
}

function subscriptionsFor(c) {
	return [
		{ type: "l2Book", coin: c, nSigFigs: N_SIG_FIGS },
		{ type: "bbo", coin: c },
		{ type: "trades", coin: c },
		{ type: "activeAssetCtx", coin: c },
	];
}

function subscribeAll(c) {
	tradeSnapshotPending = true;
	for (const subscription of subscriptionsFor(c)) send({ method: "subscribe", subscription });
}

function unsubscribeAll(c) {
	for (const subscription of subscriptionsFor(c)) send({ method: "unsubscribe", subscription });
}

function handle(msg) {
	switch (msg.channel) {
		case "l2Book":
			acceptDepth(msg.data);
			break;
		case "bbo":
			acceptBbo(msg.data);
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

// Each channel keeps its own count: three bad frames in a row drop that channel's
// data even if the other channel keeps delivering good frames.
function rejectFrame(channel) {
	invalidFrames[channel] += 1;
	if (invalidFrames[channel] >= 3) {
		invalidFrames[channel] = 0;
		if (channel === "l2Book") depth = null;
		else top = null;
		if (!replay) sock.ws?.close();
	}
	return false;
}

function acceptFrame(channel) {
	invalidFrames[channel] = 0;
	sock.backoff = 1000;
	lastDataAt = nowMs();
	hadData = true;
	return lastDataAt;
}

function acceptDepth(data) {
	if (!data || data.coin !== coin) return false;
	if (!Array.isArray(data.levels) || data.levels.length !== 2) return rejectFrame("l2Book");
	const time = Number(data.time);
	if (!Number.isFinite(time)) return rejectFrame("l2Book");
	if (time < lastFrameTime.l2Book) return false;
	const bids = parseLevels(data.levels[0], true);
	const asks = parseLevels(data.levels[1], false);
	if (!bids || !asks || bids.length === 0 || asks.length === 0) return rejectFrame("l2Book");
	if (bids[0].px >= asks[0].px) return rejectFrame("l2Book");
	lastFrameTime.l2Book = time;
	const recvAt = acceptFrame("l2Book");
	depth = { bids, asks, recvAt, time };
	if (!top || time >= top.time) top = { bid: bids[0], ask: asks[0], recvAt, time };
	updateStep(bids[0].px);
	return true;
}

function acceptBbo(data) {
	if (!data || data.coin !== coin) return false;
	if (!Array.isArray(data.bbo) || data.bbo.length !== 2) return rejectFrame("bbo");
	// A one-sided book is valid protocol data but cannot give a mid price; skip it.
	if (!data.bbo[0] || !data.bbo[1]) return false;
	const time = Number(data.time);
	if (!Number.isFinite(time)) return rejectFrame("bbo");
	if (time < lastFrameTime.bbo) return false;
	const bid = parseLevels([data.bbo[0]], true);
	const ask = parseLevels([data.bbo[1]], false);
	if (!bid || !ask || bid[0].px >= ask[0].px) return rejectFrame("bbo");
	lastFrameTime.bbo = time;
	const recvAt = acceptFrame("bbo");
	if (top && time < top.time) return true;
	top = { bid: bid[0], ask: ask[0], recvAt, time };
	updateStep(bid[0].px);
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

// Best bid and ask come from the newer of bbo and l2Book; deeper levels come from
// l2Book, minus any level a newer best price has already crossed.
function mergedBook(now) {
	const bids = [top.bid];
	const asks = [top.ask];
	if (depth && now - depth.recvAt < DEPTH_STALE_MS) {
		for (const level of depth.bids) if (level.px < top.bid.px) bids.push(level);
		for (const level of depth.asks) if (level.px > top.ask.px) asks.push(level);
	}
	return { bids, asks };
}

function acceptTrades(list, isSeed) {
	const now = nowMs();
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
	// Fills with the same exchange time and aggressor side are merged for display into one
	// dot at the value-weighted price. A taker sweeping several levels lands in one dot, but
	// so do several same-side takers in the same block: this is not order identification.
	const orders = new Map();
	for (const trade of valid) {
		const id = `${trade.time}:${trade.side}`;
		const order = orders.get(id);
		if (order) {
			order.notional += trade.px * trade.sz;
			order.sz += trade.sz;
			order.keys.push(trade.key);
		} else {
			orders.set(id, { time: trade.time, buy: trade.side === "B", notional: trade.px * trade.sz, sz: trade.sz, keys: [trade.key] });
		}
		if (!lastTrade || trade.time >= lastTrade.time) lastTrade = trade;
	}
	const anchorTime = top?.time ?? newest;
	const anchorAt = top?.recvAt ?? now;
	let pulses = 0;
	for (const order of orders.values()) {
		const t = isSeed ? Math.min(now, anchorAt - (anchorTime - order.time)) : now;
		if (isSeed && now - t > windowMs) {
			for (const key of order.keys) seenTrades.delete(key);
			continue;
		}
		const px = order.notional / order.sz;
		trades.push({ t, px, notional: order.notional, buy: order.buy, keys: order.keys });
		if (!isSeed && pulses < MAX_PULSES_PER_BATCH) {
			pendingPulses.push({ t: now, px, notional: order.notional, buy: order.buy });
			pulses += 1;
		}
	}
	trades.sort((a, b) => a.t - b.t);
	if (trades.length > MAX_TRADES) {
		for (const old of trades.splice(0, trades.length - MAX_TRADES)) forgetTrade(old);
	}
}

function forgetTrade(trade) {
	for (const key of trade.keys) seenTrades.delete(key);
}

function acceptCtx(data) {
	if (!data || data.coin !== coin || !data.ctx) return;
	const { markPx, prevDayPx } = data.ctx;
	if (typeof markPx !== "string" || typeof prevDayPx !== "string" || !DECIMAL.test(markPx) || !DECIMAL.test(prevDayPx)) return;
	const mark = Number(markPx);
	const prev = Number(prevDayPx);
	if (mark <= 0 || prev <= 0) return;
	assetCtx = { pct: ((mark - prev) / prev) * 100, recvAt: nowMs() };
}

function isLive(now) {
	if (!replay && sock.ws?.readyState !== WebSocket.OPEN) return false;
	return top !== null && depth !== null && now - top.recvAt < TOP_STALE_MS && now - depth.recvAt < DEPTH_STALE_MS && step > 0;
}

function onTick() {
	const now = nowMs();
	if (!replay) {
		if (sock.ws?.readyState === WebSocket.OPEN && now - sock.lastMsgAt > SILENT_RECONNECT_MS) sock.ws.close();
		if (!pageVisible && !suspended && hiddenSince && now - hiddenSince > HIDDEN_SUSPEND_MS) suspend();
		resubscribeStalledDepth(now);
	}
	// One clock for both the scene reset here and the page's return to the poster:
	// 20 s after the last accepted l2Book or bbo frame. hadData stops a repeat reset.
	if (hadData && now - lastDataAt > DEAD_MS) {
		resetScene();
		hadData = false;
		if (!replay) scheduleSeed();
	}
	const live = isLive(now);
	if (top) pushColumn(now, live);
	if (!live) liveSince = 0;
	else if (!liveSince) liveSince = now;
	const cutoff = now - windowMs - tickMs;
	while (columns.length && columns[0].t < cutoff) columns.shift();
	while (trades.length && trades[0].t < cutoff) forgetTrade(trades.shift());
	pendingPulses = pendingPulses.filter((pulse) => now - pulse.t < PULSE_MS);
	effectiveWindowMs = firstColumnAt ? Math.min(windowMs, Math.max(MIN_WINDOW_MS, now - firstColumnAt)) : MIN_WINDOW_MS;
	if (rendering && !replay) rebuildHeat();
	else heatDirty = true;
	if (!replay && now - lastUiAt >= UI_INTERVAL_MS) postUi(false);
}

function pushColumn(now, live) {
	lastTickAt = now;
	if (!live) {
		columns.push({ t: now, mid: Number.NaN, bids: [], asks: [] });
		return;
	}
	const book = mergedBook(now);
	const mid = (top.bid.px + top.ask.px) / 2;
	columns.push({
		t: now,
		mid,
		bids: book.bids.map((level) => [level.px, level.sz]),
		asks: book.asks.map((level) => [level.px, level.sz]),
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
	const levels = Math.max(depth ? Math.max(depth.bids.length, depth.asks.length) : 20, 10);
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
			const topY = yOf(px + half);
			const bottomY = yOf(px - half);
			if (bottomY < 0 || topY > H) continue;
			const distance = Math.abs(px - column.mid) / step;
			const fade = distance <= 14 ? 1 : Math.max(0, 1 - (distance - 14) / 6);
			if (fade <= 0) continue;
			const intensity = Math.min(1, Math.log1p(sz) / denom);
			const h = bottomY - topY;
			g.globalAlpha = fade;
			g.fillStyle = lut[Math.round(intensity * 63)];
			g.fillRect(x, topY, cw + 0.5, h >= 6 * dpr ? h - 0.5 * dpr : Math.max(1, h));
		}
	};
	paint(column.bids, heatLut.bid);
	paint(column.asks, heatLut.ask);
	g.globalAlpha = 1;
}

function rebuildHeat() {
	heatDirty = false;
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
	if (!ctx || W === 0 || !pageVisible || !rendering) return;
	const now = nowMs();
	if (heatDirty) rebuildHeat();
	if (paused || reduced) {
		if (!stillDirty) return;
		render(now, true);
		stillDirty = false;
		if (columns.length) stillHasData = true;
		postUi(true);
		confirmRendered();
		return;
	}
	if (now - lastFrameAt < 1000 / maxFps - 2 && !announceRender) return;
	lastFrameAt = now;
	render(now, false);
	confirmRendered();
}

// Tells the page that the canvas holds a current frame, so a scene swap can wait for it.
function confirmRendered() {
	if (!announceRender) return;
	announceRender = false;
	self.postMessage({ type: "rendered" });
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
	ctx.strokeStyle = `rgba(255,255,255,${palette.grid})`;
	ctx.lineWidth = 1;
	ctx.beginPath();
	const epoch = epochOf(ref);
	for (let t = Math.floor(epoch / 15000) * 15000; t > epoch - effectiveWindowMs; t -= 15000) {
		const x = Math.round(W - ((epoch - t) / effectiveWindowMs) * W) + 0.5;
		ctx.moveTo(x, 0);
		ctx.lineTo(x, H);
	}
	if (step > 0 && view.half > 0) {
		const s = gridStep();
		const topPx = view.center + view.half;
		for (let px = Math.ceil((view.center - view.half) / s) * s; px <= topPx; px += s) {
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
	ctx.strokeStyle = p.core;
	ctx.lineWidth = p.width * dpr;
	ctx.stroke();
}

function radiusFor(notional) {
	return Math.max(2, Math.min(maxRadius, 2 + Math.sqrt(notional) / 55)) * dpr;
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
		ctx.strokeStyle = bg;
		ctx.lineWidth = (trade.buy ? 1.5 : 3) * dpr;
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
		const r = radiusFor(pulse.notional) + p.pulseGrow * dpr * k;
		ctx.strokeStyle = pulse.buy ? p.buy : p.sell;
		ctx.globalAlpha = 0.55 * (1 - k);
		ctx.lineWidth = 1.5 * dpr;
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
	ctx.fillStyle = "rgba(237,238,242,0.22)";
	ctx.beginPath();
	ctx.arc(W - 2 * dpr, y, 7 * dpr, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = "#edeef2";
	ctx.beginPath();
	ctx.arc(W - 2 * dpr, y, 3 * dpr, 0, Math.PI * 2);
	ctx.fill();
}

function uiState(force) {
	const now = nowMs();
	const live = isLive(now);
	// The table shows one complete l2Book snapshot with its exchange time; mixing the
	// faster best bid/ask into it would show gaps the book does not have.
	const snapshot = live && now - depth.recvAt < DEPTH_STALE_MS ? depth : null;
	let mid = null;
	let axis = null;
	if (live && view.half > 0) {
		const m = (top.bid.px + top.ask.px) / 2;
		mid = { text: formatPrice(m, 1), frac: yOf(m) / H };
		const s = gridStep();
		const topPx = Math.floor((view.center + view.half) / s) * s;
		const bottomPx = Math.ceil((view.center - view.half) / s) * s;
		axis = {
			top: { text: formatPrice(topPx, 0), frac: yOf(topPx) / H },
			bottom: { text: formatPrice(bottomPx, 0), frac: yOf(bottomPx) / H },
		};
	}
	return {
		type: "ui",
		session,
		coin,
		force,
		live,
		liveSeconds: live && liveSince ? (now - liveSince) / 1000 : 0,
		suspended,
		failed: sock.failedClosed,
		reason: live ? null : notLiveReason(now),
		silentMs: lastDataAt ? now - lastDataAt : 0,
		last: live && lastTrade && top.time - lastTrade.time < LAST_TRADE_MAX_AGE_MS ? { pxS: lastTrade.pxS, buy: lastTrade.side === "B", time: lastTrade.time } : null,
		pct: live && assetCtx && now - assetCtx.recvAt < 60000 ? assetCtx.pct : null,
		bids: snapshot ? snapshot.bids.slice(0, 5).map((l) => [l.pxS, l.szS, l.sz]) : null,
		asks: snapshot ? snapshot.asks.slice(0, 5).map((l) => [l.pxS, l.szS, l.sz]) : null,
		depthAt: snapshot ? snapshot.time : null,
		spreadS: snapshot ? formatPrice(snapshot.asks[0].px - snapshot.bids[0].px, 0) : null,
		bestBidS: live ? top.bid.pxS : null,
		bestAskS: live ? top.ask.pxS : null,
		tickS: step > 0 ? formatPrice(step, 0) : null,
		mid,
		axis,
		frozenAt: paused || reduced || replay ? epochOf(lastTickAt) : 0,
		windowSeconds: Math.round(effectiveWindowMs / 1000),
	};
}

function notLiveReason(now) {
	if (sock.failedClosed) return "failed";
	if (hadData || now - streamStartAt > TOP_STALE_MS) return "stale";
	return "waiting";
}

// When best bid/ask keeps arriving but the depth stream has stalled, renew only the
// l2Book subscription on the same connection; this spends no connection budget.
function resubscribeStalledDepth(now) {
	if (sock.ws?.readyState !== WebSocket.OPEN || !top || now - top.recvAt >= TOP_STALE_MS) return;
	const depthAge = now - (depth?.recvAt ?? streamStartAt);
	if (depthAge < DEAD_MS || now - lastDepthResubscribe < DEAD_MS) return;
	lastDepthResubscribe = now;
	const subscription = { type: "l2Book", coin, nSigFigs: N_SIG_FIGS };
	send({ method: "unsubscribe", subscription });
	send({ method: "subscribe", subscription });
}

function postUi(force) {
	lastUiAt = nowMs();
	self.postMessage(uiState(force));
}

// Poster generation: replays a recording through the live code path with a virtual
// clock, then encodes the final still frame. No sockets or timers are started.
async function runReplay(recording, configs) {
	for (const config of configs) {
		const ui = replayOnce(recording, config);
		const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: config.quality ?? 0.86 });
		self.postMessage({ type: "poster", key: config.key, blob, ui });
	}
	self.postMessage({ type: "replay-done" });
}

function replayOnce(recording, config) {
	replay = { epoch: recording.startedAt - REPLAY_CLOCK_OFFSET, now: REPLAY_CLOCK_OFFSET };
	canvas = new OffscreenCanvas(1, 1);
	ctx = canvas.getContext("2d", { alpha: false });
	windowMs = config.windowMs;
	maxRadius = config.maxRadius;
	paused = false;
	reduced = false;
	rendering = true;
	setVariant(config.variant);
	coin = recording.coin;
	szDecimals = SZ_DECIMALS[coin] ?? 2;
	session += 1;
	resetScene();
	resize(config.cssW, config.cssH, config.dpr);
	tradeSnapshotPending = true;
	const { messages } = recording;
	const end = messages[messages.length - 1][0];
	let i = 0;
	for (let t = 0; t <= end; t += tickMs) {
		while (i < messages.length && messages[i][0] <= t) {
			replay.now = REPLAY_CLOCK_OFFSET + messages[i][0];
			handle({ channel: messages[i][1], data: messages[i][2] });
			i += 1;
		}
		replay.now = REPLAY_CLOCK_OFFSET + t;
		onTick();
	}
	rebuildHeat();
	render(replay.now, true);
	const ui = { ...uiState(true), recordedFrom: recording.startedAt, recordedTo: epochOf(lastTickAt) };
	replay = null;
	return ui;
}
