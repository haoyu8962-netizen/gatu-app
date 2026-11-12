// Measures, in real browser engines, what a half-open WebSocket costs: a connection whose peer has
// gone silent while TCP still looks healthy, which is what a phone is left with after the page was
// suspended in the background. Two readings per engine:
//   nativeClose — how long `close()` on such a socket takes to fire the `close` event;
//   reconnect   — how long the installed, patched `@nktkas/rews` takes to open a replacement after
//                 `reconnect()` (ADR 0050 D4, `patches/@nktkas__rews@4.1.0.patch`).
// Without the patch the second reading equals the first: 60 s in Chromium, tens of milliseconds in
// WebKit (2026-11-12). Pass a path to another rews build as the third argument to compare.
//
// node apps/terminal/tests/browser/websocket-half-open-probe.mjs [chromium,webkit] [waitMs] [rews mod.js]
//
// It prints the readings as JSON; it is a diagnostic, not a pass/fail gate. The local server stops
// answering instead of dropping packets, so it shows the browser's closing-handshake wait, not a
// carrier's NAT timeout. It listens on loopback ports and launches browsers, which the Claude
// sandbox blocks; run it from a normal shell.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createRequire } from "node:module";
import { createServer as createTcpServer } from "node:net";
import * as playwright from "@playwright/test";

const engines = (process.argv[2] ?? "chromium,webkit").split(",");
const waitMs = Number(process.argv[3] ?? 75_000);
const require = createRequire(import.meta.url);
const sdkRequire = createRequire(require.resolve("@nktkas/hyperliquid"));
const rewsPath = process.argv[4] ?? sdkRequire.resolve("@nktkas/rews");
const rewsSource = readFileSync(rewsPath, "utf8");

let silent = false;
const sockets = new Set();

function textFrame(text) {
	const payload = Buffer.from(text);
	return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
}

const socketServer = createTcpServer((socket) => {
	const acceptedWhileSilent = silent;
	sockets.add(socket);
	let upgraded = false;
	let request = Buffer.alloc(0);
	const ticker = setInterval(() => {
		if (!upgraded || socket.destroyed) return;
		if (silent && !acceptedWhileSilent) return;
		socket.write(textFrame("tick"));
	}, 250);
	socket.on("data", (chunk) => {
		if (upgraded) return;
		request = Buffer.concat([request, chunk]);
		const text = request.toString("latin1");
		if (!text.includes("\r\n\r\n")) return;
		const key = /sec-websocket-key:\s*(.+)\r\n/i.exec(text)?.[1]?.trim();
		const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
		socket.write(
			`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
		);
		upgraded = true;
	});
	socket.on("close", () => {
		clearInterval(ticker);
		sockets.delete(socket);
	});
	socket.on("error", () => {});
});

const page = `<!doctype html><meta charset="utf-8"><title>half-open probe</title><script type="module">
import { ReconnectingWebSocket } from "/rews.js";

function untilThirdFrame(socket) {
	return new Promise((resolve) => {
		let frames = 0;
		socket.addEventListener("message", () => {
			frames += 1;
			if (frames === 3) resolve();
		});
	});
}

window.measureNativeClose = async (url, waitMs) => {
	const socket = new WebSocket(url);
	await untilThirdFrame(socket);
	await fetch("/silence");
	await new Promise((resolve) => setTimeout(resolve, 1000));
	const startedAt = performance.now();
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve({ closed: false, waitedMs: Math.round(performance.now() - startedAt) }), waitMs);
		socket.addEventListener("close", (event) => {
			clearTimeout(timer);
			resolve({ closed: true, elapsedMs: Math.round(performance.now() - startedAt), code: event.code });
		});
		socket.close();
	});
};

window.measureReconnect = async (url, waitMs) => {
	const socket = new ReconnectingWebSocket(url, { maxRetries: Infinity, reconnectionDelay: 500 });
	let opens = 0;
	socket.addEventListener("open", () => {
		opens += 1;
	});
	await untilThirdFrame(socket);
	await fetch("/silence");
	await new Promise((resolve) => setTimeout(resolve, 1000));
	const startedAt = performance.now();
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve({ reopened: false, waitedMs: Math.round(performance.now() - startedAt) }), waitMs);
		socket.addEventListener("open", () => {
			if (opens < 2) return;
			clearTimeout(timer);
			resolve({ reopened: true, elapsedMs: Math.round(performance.now() - startedAt) });
		});
		socket.reconnect();
	});
};
window.ready = true;
</script>`;

const httpServer = createHttpServer((request, response) => {
	if (request.url === "/silence") {
		silent = true;
		response.end("silent");
		return;
	}
	if (request.url === "/rews.js") {
		response.setHeader("content-type", "text/javascript");
		response.end(rewsSource);
		return;
	}
	response.setHeader("content-type", "text/html");
	response.end(page);
});

await new Promise((resolve) => socketServer.listen(0, "127.0.0.1", resolve));
await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
const socketUrl = `ws://127.0.0.1:${socketServer.address().port}/`;
const pageUrl = `http://127.0.0.1:${httpServer.address().port}/`;

async function measure(browser, name) {
	silent = false;
	const tab = await (await browser.newContext()).newPage();
	await tab.goto(pageUrl);
	await tab.waitForFunction(() => window.ready === true);
	return tab.evaluate(([method, url, ms]) => window[method](url, ms), [name, socketUrl, waitMs]);
}

const results = { rews: rewsPath, patched: rewsSource.includes("PATCH (sairn)") };
for (const engine of engines) {
	const browser = await playwright[engine].launch();
	try {
		results[engine] = {
			version: browser.version(),
			nativeClose: await measure(browser, "measureNativeClose"),
			reconnect: await measure(browser, "measureReconnect"),
		};
	} catch (error) {
		results[engine] = { error: String(error) };
	} finally {
		await browser.close();
	}
}

console.log(JSON.stringify(results, null, 2));
for (const socket of sockets) socket.destroy();
socketServer.close();
httpServer.close();
