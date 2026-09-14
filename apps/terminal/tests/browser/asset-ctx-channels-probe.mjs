// Captures the market-context subscriptions the official app sends on a cold load (full payloads and
// the first frame per channel), then replays the same subscriptions against the public and the
// official WebSocket hosts from Node to see which host answers, with what size and cadence.
// Usage: node apps/terminal/tests/browser/asset-ctx-channels-probe.mjs [seconds]
import { chromium } from "@playwright/test";
const seconds = Number(process.argv[2] ?? 12);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
const sent = [];
const firstByChannel = new Map();
const countByChannel = new Map();
cdp.on("Network.webSocketFrameSent", (e) => sent.push(String(e.response.payloadData)));
cdp.on("Network.webSocketFrameReceived", (e) => {
	const text = String(e.response.payloadData);
	const channel = text.match(/"channel":"([A-Za-z0-9]+)"/)?.[1] ?? text.slice(0, 20);
	const entry = countByChannel.get(channel) ?? { count: 0, bytes: 0 };
	entry.count += 1;
	entry.bytes += text.length;
	countByChannel.set(channel, entry);
	if (!firstByChannel.has(channel)) firstByChannel.set(channel, text);
});
await page.goto("https://app.hyperliquid.xyz/trade/HYPE", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(seconds * 1000);
await browser.close();
console.log(`=== official app: ${sent.length} frames sent in ${seconds}s`);
for (const frame of sent.slice(0, 20)) console.log("  sent", frame.slice(0, 220));
console.log("=== official app: received by channel (count, chars, first frame head)");
for (const [channel, entry] of [...countByChannel.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
	console.log(`  ${channel.padEnd(20)} count ${String(entry.count).padStart(4)} chars ${String(entry.bytes).padStart(8)}  ${firstByChannel.get(channel).slice(0, 320)}`);
}
const subscriptions = sent
	.map((frame) => { try { return JSON.parse(frame); } catch { return undefined; } })
	.filter((frame) => frame?.method === "subscribe" && ["pac", "sac", "fastAssetCtxs", "webData3", "outcomeMetaUpdates"].includes(frame.subscription?.type))
	.map((frame) => frame.subscription);
console.log("=== replaying", subscriptions.map((s) => JSON.stringify(s)).join(" "));
for (const host of ["wss://api.hyperliquid.xyz/ws", "wss://api-ui.hyperliquid.xyz/ws"]) {
	await new Promise((resolve) => {
		const socket = new WebSocket(host);
		const stats = new Map();
		const started = Date.now();
		const timer = setTimeout(() => { socket.close(); finish(); }, seconds * 1000);
		let done = false;
		function finish() {
			if (done) return;
			done = true;
			console.log(`=== ${host}`);
			for (const [key, entry] of stats.entries()) {
				const gaps = entry.times.slice(1).map((t, i) => t - entry.times[i]);
				console.log(`  ${key.padEnd(28)} count ${String(entry.count).padStart(4)} chars ${String(entry.bytes).padStart(8)} first@${entry.first}ms gap~${gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : "-"}ms  ${entry.head.slice(0, 260)}`);
			}
			resolve();
		}
		socket.onopen = () => { for (const subscription of subscriptions) socket.send(JSON.stringify({ method: "subscribe", subscription })); };
		socket.onerror = (event) => { console.log(`  error ${event.message ?? event.type}`); clearTimeout(timer); finish(); };
		socket.onclose = (event) => { if (!done) console.log(`  closed code ${event.code} ${event.reason}`); clearTimeout(timer); finish(); };
		socket.onmessage = (event) => {
			const text = String(event.data);
			const channel = text.match(/"channel":"([A-Za-z0-9]+)"/)?.[1] ?? text.slice(0, 30);
			const detail = channel === "subscriptionResponse" || channel === "error" ? `${channel}:${text.slice(0, 120)}` : channel;
			const entry = stats.get(detail) ?? { count: 0, bytes: 0, first: Date.now() - started, times: [], head: text };
			entry.count += 1;
			entry.bytes += text.length;
			entry.times.push(Date.now() - started);
			stats.set(detail, entry);
		};
	});
}
