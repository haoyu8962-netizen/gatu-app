import assert from "node:assert/strict";
import test from "node:test";
import { resolveReachableClientAsset } from "./resolve-client-asset.mjs";

const BASE_URL = "http://127.0.0.1:3000";

function moduleHtml(...paths) {
	return paths.map((path) => `<link rel="modulepreload" href="${path}">`).join("");
}

function createFetch(records) {
	const requests = [];
	const fetchImpl = async (input, options) => {
		const path = new URL(input).pathname;
		requests.push({ options, path });
		const record = records[path];
		if (!record) return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain" } });
		if (typeof record === "string") {
			return new Response(record, { headers: { "content-type": "text/javascript; charset=utf-8" } });
		}
		return new Response(record.body ?? "", {
			status: record.status ?? 200,
			headers: { "content-type": record.contentType ?? "text/javascript; charset=utf-8" },
		});
	};
	return { fetchImpl, requests };
}

function resolve(records, html, options = {}) {
	const { fetchImpl, requests } = createFetch(records);
	return {
		promise: resolveReachableClientAsset({
			baseUrl: BASE_URL,
			fetchImpl,
			html,
			targetName: "trade-terminal-page",
			...options,
		}),
		requests,
	};
}

test("resolves a lazy client asset through the live ESM import graph", async () => {
	const records = {
		"/assets/index-a.js": 'import "./_-router-b.js";',
		"/assets/_-router-b.js":
			'const deps = ["assets/trade-terminal-page-old.js"]; import("./trade-terminal-page-current.js");',
		"/assets/trade-terminal-page-current.js": "export const terminal = true;",
		"/assets/trade-terminal-page-old.js": "throw new Error('stale');",
	};
	const { promise, requests } = resolve(records, moduleHtml("/assets/index-a.js"));

	await assert.doesNotReject(async () => {
		assert.equal(await promise, "/assets/trade-terminal-page-current.js");
	});
	assert.deepEqual(
		requests.map(({ path }) => path),
		["/assets/index-a.js", "/assets/_-router-b.js", "/assets/trade-terminal-page-current.js"],
	);
	assert.ok(requests.every(({ options }) => options.redirect === "error"));
});

test("accepts a target directly referenced by the HTML", async () => {
	const target = "/assets/trade-terminal-page-direct.js";
	const { promise } = resolve({ [target]: "export {};" }, `<script async type="module" src="${target}"></script>`);
	assert.equal(await promise, target);
});

test("fails when a reachable intermediate asset is missing", async () => {
	const { promise } = resolve(
		{ "/assets/index-a.js": 'import "./missing-b.js";' },
		moduleHtml("/assets/index-a.js"),
	);
	await assert.rejects(promise, /missing-b\.js returned HTTP 404/);
});

test("fails when the target returns an HTML fallback", async () => {
	const target = "/assets/trade-terminal-page-html.js";
	const { promise } = resolve(
		{
			"/assets/index-a.js": `import "./${target.split("/").at(-1)}";`,
			[target]: { body: "<!doctype html>", contentType: "text/html" },
		},
		moduleHtml("/assets/index-a.js"),
	);
	await assert.rejects(promise, /unexpected Content-Type "text\/html"/);
});

test("terminates a cyclic graph and reports a missing target", async () => {
	const { promise, requests } = resolve(
		{
			"/assets/index-a.js": 'import "./router-b.js";',
			"/assets/router-b.js": 'export * from "./index-a.js";',
		},
		moduleHtml("/assets/index-a.js"),
	);
	await assert.rejects(promise, /did not reference trade-terminal-page-\*\.js/);
	assert.equal(requests.length, 2);
});

test("rejects multiple target generations in the first discovery layer", async () => {
	const { promise } = resolve(
		{
			"/assets/index-a.js": 'import "./trade-terminal-page-one.js";',
			"/assets/router-b.js": 'import("./trade-terminal-page-two.js");',
			"/assets/trade-terminal-page-one.js": "export {};",
			"/assets/trade-terminal-page-two.js": "export {};",
		},
		moduleHtml("/assets/index-a.js", "/assets/router-b.js"),
	);
	await assert.rejects(promise, /discovery layer references multiple trade-terminal-page assets/);
});

test("does not treat Vite dependency-map strings as imports", async () => {
	const { promise, requests } = resolve(
		{
			"/assets/index-a.js": 'const deps = ["assets/trade-terminal-page-map-only.js"];',
			"/assets/trade-terminal-page-map-only.js": "export {};",
		},
		moduleHtml("/assets/index-a.js"),
	);
	await assert.rejects(promise, /did not reference trade-terminal-page-\*\.js/);
	assert.deepEqual(
		requests.map(({ path }) => path),
		["/assets/index-a.js"],
	);
});

test("rejects external, query-string, and parent-directory imports without requesting them", async (context) => {
	for (const [name, specifier, expected] of [
		["external", "https://evil.example/trade-terminal-page-x.js", /non-local import specifier/],
		["query", "./trade-terminal-page-x.js?cache=1", /unsafe import specifier/],
		["parent", "../assets/trade-terminal-page-x.js", /parent-directory import/],
	]) {
		await context.test(name, async () => {
			const { promise, requests } = resolve(
				{ "/assets/index-a.js": `import(${JSON.stringify(specifier)});` },
				moduleHtml("/assets/index-a.js"),
			);
			await assert.rejects(promise, expected);
			assert.deepEqual(
				requests.map(({ path }) => path),
				["/assets/index-a.js"],
			);
		});
	}
});

test("fails closed when a graph safety limit is exceeded", async (context) => {
	await context.test("depth", async () => {
		const { promise } = resolve(
			{
				"/assets/index-a.js": 'import "./layer-b.js";',
				"/assets/layer-b.js": 'import "./layer-c.js";',
				"/assets/layer-c.js": 'import "./trade-terminal-page-d.js";',
				"/assets/trade-terminal-page-d.js": "export {};",
			},
			moduleHtml("/assets/index-a.js"),
			{ maxDepth: 1 },
		);
		await assert.rejects(promise, /exceeds the maximum depth of 1/);
	});

	await context.test("file size", async () => {
		const { promise } = resolve(
			{ "/assets/index-a.js": "export const value = 123;" },
			moduleHtml("/assets/index-a.js"),
			{ maxFileBytes: 8 },
		);
		await assert.rejects(promise, /exceeds the 8-byte per-file limit/);
	});

	await context.test("node count", async () => {
		const { promise } = resolve(
			{
				"/assets/index-a.js": "export {};",
				"/assets/router-b.js": "export {};",
			},
			moduleHtml("/assets/index-a.js", "/assets/router-b.js"),
			{ maxNodes: 1 },
		);
		await assert.rejects(promise, /exceeds the maximum node count of 1/);
	});

	await context.test("target node count", async () => {
		const { promise, requests } = resolve(
			{
				"/assets/index-a.js": 'import "./trade-terminal-page-b.js";',
				"/assets/trade-terminal-page-b.js": "export {};",
			},
			moduleHtml("/assets/index-a.js"),
			{ maxNodes: 1 },
		);
		await assert.rejects(promise, /exceeds the maximum node count of 1/);
		assert.deepEqual(
			requests.map(({ path }) => path),
			["/assets/index-a.js"],
		);
	});

	await context.test("target depth", async () => {
		const { promise, requests } = resolve(
			{
				"/assets/index-a.js": 'import "./branch-b.js";',
				"/assets/branch-b.js": 'import "./trade-terminal-page-c.js";',
				"/assets/trade-terminal-page-c.js": "export {};",
			},
			moduleHtml("/assets/index-a.js"),
			{ maxDepth: 1 },
		);
		await assert.rejects(promise, /exceeds the maximum depth of 1/);
		assert.deepEqual(
			requests.map(({ path }) => path),
			["/assets/index-a.js", "/assets/branch-b.js"],
		);
	});

	await context.test("aggregate size", async () => {
		const target = "/assets/trade-terminal-page-direct.js";
		const { promise } = resolve(
			{ [target]: "export const terminal = true;" },
			moduleHtml(target),
			{ maxFileBytes: 100, maxTotalBytes: 8 },
		);
		await assert.rejects(promise, /exceeds the 8-byte aggregate limit/);
	});
});

test("rejects non-asset module URLs in the HTML", async () => {
	const { promise, requests } = resolve({}, '<script type="module" src="https://evil.example/client.js"></script>');
	await assert.rejects(promise, /HTML module asset must be a root-relative, flat JavaScript asset path/);
	assert.equal(requests.length, 0);
});

test("applies one overall deadline across the graph", async () => {
	const fetchImpl = (_input, { signal }) =>
		new Promise((_resolve, reject) => {
			if (signal.aborted) {
				reject(signal.reason);
				return;
			}
			signal.addEventListener("abort", () => reject(signal.reason), { once: true });
		});

	await assert.rejects(
		resolveReachableClientAsset({
			baseUrl: BASE_URL,
			fetchImpl,
			html: moduleHtml("/assets/index-a.js"),
			overallTimeoutMs: 20,
			requestTimeoutMs: 1_000,
			targetName: "trade-terminal-page",
		}),
		/graph exceeded its overall timeout while fetching \/assets\/index-a\.js/,
	);
});
