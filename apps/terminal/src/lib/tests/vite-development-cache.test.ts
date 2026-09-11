import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, loadConfigFromFile } from "vite";
import { expect, it } from "vitest";

it("revalidates optimized dependencies and rejects a second server on the same port", async () => {
	const terminalRoot = fileURLToPath(new URL("../../..", import.meta.url));
	const loaded = await loadConfigFromFile(
		{ command: "serve", mode: "development" },
		join(terminalRoot, "vite.config.ts"),
		terminalRoot,
		"silent",
	);
	expect(loaded).not.toBeNull();
	const root = await realpath(await mkdtemp(join(tmpdir(), "gatu-vite-cache-")));
	await mkdir(join(root, "node_modules/cache-fixture"), { recursive: true });
	await writeFile(join(root, "node_modules/cache-fixture/package.json"), JSON.stringify({ main: "index.js" }));
	await writeFile(join(root, "node_modules/cache-fixture/index.js"), "module.exports = 42;");
	await writeFile(join(root, "main.js"), 'import value from "cache-fixture"; export default value;');
	const config = {
		configFile: false as const,
		envFile: false as const,
		root,
		cacheDir: join(root, "node_modules/.vite"),
		logLevel: "silent" as const,
		server: { ...loaded?.config.server, host: "127.0.0.1", port: 0 },
		optimizeDeps: { noDiscovery: true, include: ["cache-fixture"] },
	};
	const server = await createServer(config);
	let second: Awaited<ReturnType<typeof createServer>> | undefined;
	try {
		await server.listen();
		const address = server.httpServer?.address();
		if (!address || typeof address === "string") throw new Error("Missing development server port");
		const origin = `http://127.0.0.1:${address.port}`;
		const headers = { "Sec-Fetch-Dest": "script" };
		const entry = await fetch(`${origin}/main.js`, { headers });
		const source = await entry.text();
		const dependency = source.match(/"([^"\n]*\/\.vite\/deps\/cache-fixture\.js\?v=[^"\n]+)"/)?.[1];
		expect(dependency, source).toBeDefined();
		const response = await fetch(new URL(dependency ?? "", origin), { headers });
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-cache");
		expect(await response.text()).toContain("42");
		const etag = response.headers.get("etag");
		expect(etag).toBeTruthy();
		const revalidated = await fetch(new URL(dependency ?? "", origin), {
			headers: { ...headers, "If-None-Match": etag ?? "" },
		});
		expect(revalidated.status).toBe(304);
		second = await createServer({
			...config,
			cacheDir: join(root, "node_modules/.vite-second"),
			server: { ...config.server, port: address.port },
		});
		await expect(second.listen()).rejects.toThrow(/already in use/);
	} finally {
		await second?.close();
		await server.close();
		await rm(root, { recursive: true, force: true });
	}
}, 30_000);
