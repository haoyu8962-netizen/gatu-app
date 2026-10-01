// WebSocket timing on a cold load via CDP for the sairn terminal and the official app: when sockets
// open, what the first subscriptions are and when the first data frames arrive.
// Usage: node apps/terminal/tests/browser/ws-race.mjs
import { chromium } from "@playwright/test";
const targets = [
	{ name: "sairn", url: "https://d2i25dhfjwco8b.cloudfront.net/trade/HYPE" },
	{ name: "official", url: "https://app.hyperliquid.xyz/trade/HYPE" },
];
const browser = await chromium.launch({ headless: true });
for (const target of targets) {
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	await cdp.send("Network.enable");
	const t0 = Date.now();
	const sockets = new Map();
	const sent = [];
	const received = [];
	cdp.on("Network.webSocketCreated", (e) => sockets.set(e.requestId, { url: e.url, createdAt: Date.now() - t0 }));
	cdp.on("Network.webSocketFrameSent", (e) => sent.push({ at: Date.now() - t0, socket: sockets.get(e.requestId)?.url ?? "?", data: String(e.response.payloadData).slice(0, 140) }));
	cdp.on("Network.webSocketFrameReceived", (e) => received.push({ at: Date.now() - t0, socket: sockets.get(e.requestId)?.url ?? "?", bytes: String(e.response.payloadData).length, head: String(e.response.payloadData).slice(0, 60) }));
	await page.goto(target.url, { waitUntil: "commit", timeout: 60000 }).catch(() => {});
	await page.waitForTimeout(6000);
	await context.close();
	console.log(`\n=== ${target.name}: sockets ${sockets.size}, frames sent ${sent.length}, received ${received.length} (${received.reduce((s, f) => s + f.bytes, 0)} chars in 6 s) ===`);
	for (const s of sockets.values()) console.log(`  socket opened @${s.createdAt} ms ${s.url.slice(0, 60)}`);
	console.log("  first 12 sent:");
	for (const f of sent.slice(0, 12)) console.log(`    @${f.at} ${f.data}`);
	const byType = new Map();
	for (const f of received) {
		const key = (f.head.match(/"channel":"([a-zA-Z0-9]+)"/) || f.head.match(/"type":"([a-zA-Z0-9]+)"/) || [, f.head.slice(0, 20)])[1];
		const entry = byType.get(key) ?? { count: 0, bytes: 0, first: f.at };
		entry.count += 1; entry.bytes += f.bytes; byType.set(key, entry);
	}
	console.log("  received by channel (first-at ms, count, chars):");
	for (const [k, v] of [...byType.entries()].sort((a, b) => a[1].first - b[1].first).slice(0, 14)) console.log(`    ${k.padEnd(22)} first @${v.first} count ${v.count} chars ${v.bytes}`);
}
await browser.close();
