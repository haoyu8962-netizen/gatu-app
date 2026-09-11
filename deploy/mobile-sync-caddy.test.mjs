import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { BLOCKED_PATHS } from "./mobile-sync-release.mjs";

function call(port, host, path, extraHeaders = {}) {
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
				response.resume();
				response.on("end", () => done(response));
			},
		);
		pending.on("error", reject);
		pending.setTimeout(2_000, () => pending.destroy(new Error("timeout")));
		pending.end('{"operation":"register","syncId":"AAAAAAAAAAAAAAAAAAAAAA"}');
	});
}

test(
	"canonical Caddy blocks ticket aliases ahead of a legacy upstream and overwrites forged client IPs",
	{ skip: !process.env.CADDY_BINARY },
	async () => {
		const directory = await mkdtemp(resolve(tmpdir(), "gatu-caddy-ticket-"));
		const forwarded = [];
		const upstream = createServer((req, res) => {
			forwarded.push(req.headers);
			res.end("legacy upstream");
		});
		upstream.listen(0, "127.0.0.1");
		await once(upstream, "listening");
		const reserve = createServer();
		reserve.listen(0, "127.0.0.1");
		await once(reserve, "listening");
		const port = reserve.address().port;
		await new Promise((done) => reserve.close(done));
		let caddy;
		try {
			const adapted = spawnSync(
				process.env.CADDY_BINARY,
				["adapt", "--config", resolve("deploy/Caddyfile"), "--adapter", "caddyfile"],
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
				if (value.handler === "reverse_proxy") value.upstreams = [{ dial: `127.0.0.1:${upstream.address().port}` }];
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
			const response = await call(port, "app.gatu.ai", "/trade", {
				"x-forwarded-for": "198.51.100.77",
				"x-real-ip": "198.51.100.88",
			});
			assert.equal(response.statusCode, 200);
			assert.equal(forwarded.at(-1)["x-forwarded-for"], "127.0.0.1");
			assert.equal(forwarded.at(-1)["x-real-ip"], "127.0.0.1");
		} finally {
			if (caddy && caddy.exitCode === null && caddy.signalCode === null) {
				const exited = once(caddy, "exit");
				caddy.kill();
				await exited;
			}
			upstream.closeAllConnections();
			await new Promise((done) => upstream.close(done));
			await rm(directory, { force: true, recursive: true });
		}
	},
);
