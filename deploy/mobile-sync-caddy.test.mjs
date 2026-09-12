import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { handleMobileSyncTicket } from "./fixtures/mobile-sync-legacy-server.mjs";

const BLOCKED_PATHS = [
	"/mobile-agent-sync-ticket",
	"/mobile-agent-sync-ticket/",
	"//mobile-agent-sync-ticket",
	"/%6dobile-agent-sync-ticket",
	"/MOBILE-AGENT-SYNC-TICKET",
	"/mobile-agent-sync-ticket\\",
	"/mobile-agent-sync-ticket%5c",
	"/mobile-agent-sync-ticket%5C",
	"/%6dobile-agent-sync-ticket%5c",
	"/mobile-agent-sync-ticket%2f%5c",
];

function call(port, host, path, extraHeaders = {}, body = { operation: "register", syncId: "A".repeat(22) }) {
	return new Promise((done, reject) => {
		const pending = request(
			{
				hostname: "127.0.0.1",
				port,
				path,
				method: "POST",
				headers: { host, origin: `http://${host}`, "content-type": "application/json", ...extraHeaders },
			},
			(response) => {
				let text = "";
				response.on("data", (chunk) => {
					text += chunk;
				});
				response.on("end", () => done(Object.assign(response, { body: text })));
			},
		);
		pending.on("error", reject);
		pending.setTimeout(2_000, () => pending.destroy(new Error("timeout")));
		pending.end(JSON.stringify(body));
	});
}

for (const mode of ["legacy", ...(process.env.MOBILE_SYNC_OUTPUT ? ["nitro"] : [])])
	test(
		`canonical Caddy opens verified ${mode} traffic and reseals before rollback`,
		{ skip: !process.env.CADDY_BINARY },
		async () => {
			const directory = await mkdtemp(resolve(tmpdir(), "gatu-caddy-ticket-"));
			const forwarded = [];
			const upstream = createServer(async (req, res) => {
				forwarded.push(req.headers);
				if (req.url.includes("mobile-agent-sync-ticket")) {
					const chunks = [];
					for await (const chunk of req) chunks.push(chunk);
					const result = await handleMobileSyncTicket(
						new Request(`http://${req.headers.host}${req.url}`, {
							method: req.method,
							headers: req.headers,
							body: Buffer.concat(chunks),
						}),
						{ sourceKey: req.socket.remoteAddress },
					);
					res.writeHead(result.status, Object.fromEntries(result.headers));
					res.end(Buffer.from(await result.arrayBuffer()));
				} else res.end("legacy upstream");
			});
			upstream.listen(0, "127.0.0.1");
			await once(upstream, "listening");
			const reserve = createServer();
			reserve.listen(0, "127.0.0.1");
			await once(reserve, "listening");
			const port = reserve.address().port;
			await new Promise((done) => reserve.close(done));
			let caddy;
			let nitro;
			let upstreamPort = upstream.address().port;
			try {
				if (mode === "nitro") {
					const reserveNode = createServer();
					reserveNode.listen(0, "127.0.0.1");
					await once(reserveNode, "listening");
					upstreamPort = reserveNode.address().port;
					await new Promise((done) => reserveNode.close(done));
					nitro = spawn(process.execPath, [resolve(process.env.MOBILE_SYNC_OUTPUT, "server/index.mjs")], {
						env: {
							...process.env,
							HOST: "127.0.0.1",
							NITRO_HOST: "127.0.0.1",
							PORT: String(upstreamPort),
							NITRO_PORT: String(upstreamPort),
						},
						stdio: "ignore",
					});
					let ready = false;
					for (let i = 0; i < 60; i++) {
						try {
							const result = await call(
								upstreamPort,
								"app.gatu.ai",
								"/mobile-agent-sync-ticket",
								{},
								{ version: 2, operation: "issue" },
							);
							assert.ok([200, 503].includes(result.statusCode));
							if (result.statusCode === 200) {
								assert.match(result.headers["content-type"], /application\/json/);
								const ticket = JSON.parse(result.body);
								assert.equal(ticket.version, 2);
								const consumed = await call(
									upstreamPort,
									"app.gatu.ai",
									"/mobile-agent-sync-ticket%5c",
									{},
									{ version: 2, operation: "consume", syncId: ticket.syncId, consumerId: "11".repeat(16) },
								);
								assert.equal(consumed.statusCode, 204, "real Nitro alias must reproduce before edge protection");
							}
							ready = true;
							break;
						} catch (error) {
							if (error.code !== "ECONNREFUSED") throw error;
							await delay(100);
						}
					}
					assert.ok(ready, "Nitro readiness");
				}
				const configPath = resolve("deploy/Caddyfile");
				const adapted = spawnSync(
					process.env.CADDY_BINARY,
					["adapt", "--config", configPath, "--adapter", "caddyfile"],
					{ encoding: "utf8" },
				);
				assert.equal(adapted.status, 0, adapted.stderr);
				const config = JSON.parse(adapted.stdout);
				config.admin = { disabled: true };
				config.logging = { logs: { default: { level: "ERROR" } } };
				for (const server of Object.values(config.apps.http.servers)) {
					server.listen = [`127.0.0.1:${port}`];
					server.automatic_https = { disable: true };
					delete server.logs;
					delete server.tls_connection_policies;
				}
				function rewrite(value) {
					if (!value || typeof value !== "object") return;
					if (value.file?.try_files?.includes("mobile-sync-edge-ready")) value.file.root = directory;
					if (value.handler === "reverse_proxy") value.upstreams = [{ dial: `127.0.0.1:${upstreamPort}` }];
					for (const nested of Object.values(value)) rewrite(nested);
				}
				rewrite(config);
				const file = resolve(directory, "caddy.json");
				await writeFile(file, JSON.stringify(config));
				caddy = spawn(process.env.CADDY_BINARY, ["run", "--config", file], { stdio: "ignore" });
				let ready = false;
				for (let attempt = 0; attempt < 50; attempt += 1) {
					try {
						await call(port, "app.gatu.ai", "/trade");
						ready = true;
						break;
					} catch {
						await delay(100);
					}
				}
				assert.ok(ready, "Caddy readiness");
				forwarded.length = 0;
				for (const host of ["app.gatu.ai", "testnet.gatu.ai"]) {
					for (const path of [...BLOCKED_PATHS, "/mobile-agent-sync-ticket%2f", "/mobile-agent-sync-ticket?test=1"]) {
						const response = await call(port, host, path);
						assert.equal(response.statusCode, 503, path);
						assert.equal(response.headers["cache-control"], "no-store");
						assert.equal(response.headers["referrer-policy"], "no-referrer");
						assert.equal(response.headers["retry-after"], "60");
					}
				}
				assert.equal(forwarded.length, 0, "blocked requests reached legacy upstream");
				assert.equal((await call(port, "app.gatu.ai", "/trade%5c")).statusCode, 400);
				const marker = resolve(directory, "mobile-sync-edge-ready");
				await writeFile(marker, "verified fixture release\n");
				for (const host of ["app.gatu.ai", "testnet.gatu.ai"]) {
					for (const path of BLOCKED_PATHS.filter((path) => /\\|%5c/i.test(path))) {
						const rejected = await call(port, host, path);
						assert.equal(rejected.statusCode, 400, path);
						assert.equal(rejected.headers["cache-control"], "no-store");
					}
					assert.equal((await call(port, host, "/mobile-agent-sync-ticket")).statusCode, mode === "nitro" ? 400 : 200);
					if (mode === "nitro") {
						const issued = await call(port, host, "/mobile-agent-sync-ticket", {}, { version: 2, operation: "issue" });
						const manifest = JSON.parse(
							await readFile(resolve(process.env.MOBILE_SYNC_OUTPUT, ".gatu-mobile-sync.json"), "utf8"),
						);
						assert.equal(issued.statusCode, manifest.mobileSync.createAndReveal ? 200 : 503);
						if (issued.statusCode === 200) {
							const syncId = JSON.parse(issued.body).syncId;
							for (const [consumerId, expected] of [
								["11".repeat(16), 204],
								["11".repeat(16), 204],
								["22".repeat(16), 409],
							]) {
								assert.equal(
									(
										await call(
											port,
											host,
											"/mobile-agent-sync-ticket",
											{},
											{ version: 2, operation: "consume", syncId, consumerId },
										)
									).statusCode,
									expected,
								);
							}
						}
					}
				}
				await rm(marker);
				for (const host of ["app.gatu.ai", "testnet.gatu.ai"])
					for (const path of BLOCKED_PATHS)
						assert.equal(
							(await call(port, host, path)).statusCode,
							503,
							"rollback gate must close without a Caddy reload",
						);
				const response = await call(port, "app.gatu.ai", "/trade", {
					"x-forwarded-for": "198.51.100.77",
					"x-real-ip": "198.51.100.88",
				});
				if (mode !== "nitro") assert.equal(response.statusCode, 200);
				if (mode !== "nitro") {
					assert.equal(forwarded.at(-1)["x-forwarded-for"], "127.0.0.1");
					assert.equal(forwarded.at(-1)["x-real-ip"], "127.0.0.1");
				}
			} finally {
				for (const child of [caddy, nitro])
					if (child && child.exitCode === null && child.signalCode === null) {
						const exited = once(child, "exit");
						child.kill();
						await exited;
					}
				upstream.closeAllConnections();
				await new Promise((done) => upstream.close(done));
				await rm(directory, { force: true, recursive: true });
			}
		},
	);
