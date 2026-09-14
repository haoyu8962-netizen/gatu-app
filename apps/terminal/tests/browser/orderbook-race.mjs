// Order book first-frame race on a cold load: when the grid and the panel mount, when the pooled
// l2Book socket opens, when the subscription is sent and confirmed, when the first snapshot arrives
// and when the first priced rows are in the DOM. CDP monotonic timestamps are aligned to the page's
// time origin through the handshake event's wall time.
// Usage: node apps/terminal/tests/browser/orderbook-race.mjs <origin> [runs] [path]
import { chromium } from "@playwright/test";
const origin = (process.argv[2] ?? "https://d2i25dhfjwco8b.cloudfront.net").replace(/\/+$/, "");
const runs = Number(process.argv[3] ?? 3);
const path = process.argv[4] ?? "/trade/HYPE";
const INIT = `
window.__ob = { marks: {} };
const seen = {};
function mark(key) { if (!seen[key]) { seen[key] = true; window.__ob.marks[key] = Math.round(performance.now()); } }
function check() {
  if (!document.body) return;
  if (document.querySelector(".react-grid-item")) mark("grid");
  if (document.querySelector("[data-orderbook-side-container]")) mark("bookPanel");
  if (document.querySelector('[data-slot="orderbook-placeholder-row"]')) mark("bookPlaceholder");
  if (document.querySelector("[data-orderbook-price]")) mark("bookData");
  if (document.querySelectorAll("[data-orderbook-price]").length >= 20) mark("bookRows20");
  if (document.querySelector("[data-orderbook-hover]")) mark("bookInteractive");
  if (document.querySelector('[data-slot="trade-row"], [data-testid="trade-row"]')) mark("tradesData");
}
setInterval(check, 5);
window.__ob.longTasks = [];
try { new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__ob.longTasks.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask", buffered: true }); } catch {}
`;
function summarize(events, sockets, toPage, toPageWall) {
	const bySocket = new Map();
	for (const socket of sockets.values()) {
		bySocket.set(socket.id, {
			url: socket.url.replace(/^wss:\/\//, ""),
			frame: socket.frame ?? "page",
			created: toPageWall(socket.createdWall),
			handshake: toPage(socket.handshakeMono),
			open: toPage(socket.openMono),
			subscriptions: [],
			firstL2: undefined,
			l2Sent: undefined,
			l2Ack: undefined,
			closed: undefined,
			error: undefined,
		});
	}
	for (const event of events) {
		const socket = bySocket.get(event.id);
		if (!socket) continue;
		if (event.kind === "closed") socket.closed = toPage(event.mono);
		if (event.kind === "error") socket.error = `${toPage(event.mono)}:${event.text}`;
		if (event.kind === "sent") {
			const type = event.text.match(/"type":"([A-Za-z0-9]+)"/)?.[1];
			if (type && socket.subscriptions.length < 12) socket.subscriptions.push(`${type}@${toPage(event.mono)}`);
			if (event.text.includes('"type":"l2Book"') && socket.l2Sent === undefined) socket.l2Sent = toPage(event.mono);
		} else {
			if (event.text.includes("subscriptionResponse") && event.text.includes("l2Book") && socket.l2Ack === undefined) socket.l2Ack = toPage(event.mono);
			if (event.text.includes('"channel":"l2Book"') && socket.firstL2 === undefined) socket.firstL2 = { at: toPage(event.mono), bytes: event.bytes };
		}
	}
	return [...bySocket.values()];
}
const browser = await chromium.launch({ headless: true, args: process.env.NO_PROXY === "1" ? ["--no-proxy-server"] : [] });
const results = [];
for (let run = 1; run <= runs; run += 1) {
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await context.addInitScript(INIT);
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	await cdp.send("Network.enable");
	const sockets = new Map();
	const events = [];
	cdp.on("Network.webSocketCreated", (e) => sockets.set(e.requestId, { id: e.requestId, url: e.url, createdWall: Date.now() }));
	cdp.on("Network.webSocketWillSendHandshakeRequest", (e) => {
		const socket = sockets.get(e.requestId);
		if (socket) Object.assign(socket, { handshakeMono: e.timestamp, handshakeWall: e.wallTime });
	});
	cdp.on("Network.webSocketHandshakeResponseReceived", (e) => {
		const socket = sockets.get(e.requestId);
		if (socket) socket.openMono = e.timestamp;
	});
	cdp.on("Network.webSocketClosed", (e) => events.push({ mono: e.timestamp, kind: "closed", id: e.requestId, text: "" }));
	cdp.on("Network.webSocketFrameError", (e) => events.push({ mono: e.timestamp, kind: "error", id: e.requestId, text: String(e.errorMessage).slice(0, 120) }));
	cdp.on("Network.webSocketFrameSent", (e) => events.push({ mono: e.timestamp, kind: "sent", id: e.requestId, text: String(e.response.payloadData).slice(0, 200) }));
	cdp.on("Network.webSocketFrameReceived", (e) => events.push({ mono: e.timestamp, kind: "recv", id: e.requestId, text: String(e.response.payloadData).slice(0, 160), bytes: String(e.response.payloadData).length }));
	function hook(session, frameTag) {
		session.on("Network.webSocketCreated", (e) => sockets.set(e.requestId, { id: e.requestId, url: e.url, createdWall: Date.now(), frame: frameTag }));
		session.on("Network.webSocketWillSendHandshakeRequest", (e) => {
			const socket = sockets.get(e.requestId);
			if (socket) Object.assign(socket, { handshakeMono: e.timestamp, handshakeWall: e.wallTime });
		});
		session.on("Network.webSocketHandshakeResponseReceived", (e) => {
			const socket = sockets.get(e.requestId);
			if (socket) socket.openMono = e.timestamp;
		});
		session.on("Network.webSocketClosed", (e) => events.push({ mono: e.timestamp, kind: "closed", id: e.requestId, text: "" }));
		session.on("Network.webSocketFrameError", (e) => events.push({ mono: e.timestamp, kind: "error", id: e.requestId, text: String(e.errorMessage).slice(0, 120) }));
	}
	page.on("frameattached", async (frame) => {
		try {
			const session = await context.newCDPSession(frame);
			await session.send("Network.enable");
			hook(session, frame.url().slice(0, 40) || "oopif");
		} catch {}
	});
	await page.goto(`${origin}${path}`, { waitUntil: "load", timeout: 60000 });
	await page.waitForTimeout(8000);
	const extraSockets = await page.evaluate(async () => {
		const results = [];
		for (let i = 0; i < 3; i += 1) {
			const started = performance.now();
			const outcome = await new Promise((resolve) => {
				const socket = new WebSocket("wss://api.hyperliquid.xyz/ws");
				const timer = setTimeout(() => { socket.close(); resolve("timeout"); }, 4000);
				socket.onopen = () => { clearTimeout(timer); socket.close(); resolve("open"); };
				socket.onerror = () => { clearTimeout(timer); resolve("error"); };
			});
			results.push({ outcome, ms: Math.round(performance.now() - started), at: Math.round(started) });
		}
		return results;
	});
	const pageInfo = await page.evaluate(() => {
		const nav = performance.getEntriesByType("navigation")[0];
		return { timeOrigin: performance.timeOrigin, ttfb: Math.round(nav.responseStart), marks: window.__ob.marks, longTasks: window.__ob.longTasks.slice(0, 20) };
	});
	const anchor = [...sockets.values()].find((socket) => socket.handshakeMono !== undefined && socket.handshakeWall !== undefined);
	const offset = anchor ? anchor.handshakeWall * 1000 - anchor.handshakeMono * 1000 : undefined;
	const toPage = (mono) => (mono === undefined || offset === undefined ? undefined : Math.round(mono * 1000 + offset - pageInfo.timeOrigin));
	const toPageWall = (wall) => (wall === undefined ? undefined : Math.round(wall - pageInfo.timeOrigin));
	const socketSummary = summarize(events, sockets, toPage, toPageWall);
	await context.close();
	const l2Socket = socketSummary.find((socket) => socket.l2Sent !== undefined);
	const m = pageInfo.marks;
	const result = {
		run,
		ttfb: pageInfo.ttfb,
		marks: m,
		l2: l2Socket
			? { socketHandshake: l2Socket.handshake, socketOpen: l2Socket.open, subscribeSent: l2Socket.l2Sent, subscribeAck: l2Socket.l2Ack, firstSnapshot: l2Socket.firstL2 }
			: null,
		deltas: l2Socket
			? {
					gridToBookPanel: m.bookPanel - m.grid,
					bookPanelToSocketHandshake: l2Socket.handshake - m.bookPanel,
					handshakeToOpen: l2Socket.open - l2Socket.handshake,
					openToSubscribeSent: l2Socket.l2Sent - l2Socket.open,
					subscribeSentToFirstSnapshot: l2Socket.firstL2 ? l2Socket.firstL2.at - l2Socket.l2Sent : undefined,
					firstSnapshotToBookData: l2Socket.firstL2 ? m.bookData - l2Socket.firstL2.at : undefined,
					gridToBookData: m.bookData - m.grid,
				}
			: null,
		sockets: socketSummary,
		extraSockets,
		longTasks: pageInfo.longTasks,
	};
	results.push(result);
	console.log(JSON.stringify(result));
}
await browser.close();
