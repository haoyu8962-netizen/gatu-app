// Records public Hyperliquid market data for the cold-start poster.
// Usage: node tools/record-sample.mjs [coin] [seconds]
// Uses the same single-connection subscriptions as the live view and keeps only the
// fields the renderer reads: trade counterparties (users) and hashes are never written.
import { writeFileSync } from "node:fs";

const coin = process.argv[2] ?? "BTC";
const seconds = Number(process.argv[3] ?? 135);
const WS_URL = "wss://api.hyperliquid.xyz/ws";
const INFO_URL = "https://api.hyperliquid.xyz/info";
const subscriptions = [
	{ type: "l2Book", coin, nSigFigs: 5 },
	{ type: "bbo", coin },
	{ type: "trades", coin },
	{ type: "activeAssetCtx", coin },
];

const level = (l) => (l ? { px: l.px, sz: l.sz } : null);
const startedAt = Date.now();
const t0 = performance.now();
const messages = [];
let closing = false;

function keep(msg) {
	const t = Math.round(performance.now() - t0);
	const d = msg.data;
	switch (msg.channel) {
		case "l2Book":
			if (d?.coin === coin) messages.push([t, "l2Book", { coin, time: d.time, levels: d.levels.map((side) => side.map(level)) }]);
			break;
		case "bbo":
			if (d?.coin === coin) messages.push([t, "bbo", { coin, time: d.time, bbo: d.bbo.map(level) }]);
			break;
		case "trades":
			if (Array.isArray(d) && d[0]?.coin === coin) {
				messages.push([t, "trades", d.map((x) => ({ coin, side: x.side, px: x.px, sz: x.sz, time: x.time, tid: x.tid }))]);
			}
			break;
		case "activeAssetCtx":
			if (d?.coin === coin) messages.push([t, "activeAssetCtx", { coin, ctx: { markPx: d.ctx.markPx, prevDayPx: d.ctx.prevDayPx } }]);
			break;
	}
}

const ws = new WebSocket(WS_URL);
ws.onopen = () => {
	for (const subscription of subscriptions) ws.send(JSON.stringify({ method: "subscribe", subscription }));
};
ws.onmessage = (event) => keep(JSON.parse(event.data));
ws.onerror = (error) => {
	if (closing) return;
	console.error("socket error", error.message ?? error);
	process.exit(1);
};

setTimeout(async () => {
	closing = true;
	ws.close();
	const endedAt = Date.now();
	const res = await fetch(INFO_URL, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ type: "candleSnapshot", req: { coin, interval: "15m", startTime: endedAt - 86_400_000, endTime: endedAt } }),
	});
	const candles = await res.json();
	const stamp = new Date(startedAt).toISOString().replace(/[-:]/g, "").slice(0, 13);
	const out = {
		source: WS_URL,
		coin,
		subscriptions,
		startedAt,
		endedAt,
		stripped: "trades keep side, px, sz, time and tid only (no users, no hash); book levels keep px and sz; activeAssetCtx keeps markPx and prevDayPx",
		closes24h: candles.map((c) => c.c),
		messages,
	};
	const file = new URL(`../recorded/${coin.toLowerCase()}-${stamp}Z.json`, import.meta.url);
	writeFileSync(file, `${JSON.stringify(out)}\n`);
	const counts = messages.reduce((acc, [, ch]) => ((acc[ch] = (acc[ch] ?? 0) + 1), acc), {});
	console.log(file.pathname, JSON.stringify(counts));
}, seconds * 1000);
