import { describe, expect, it, vi } from "vitest";
import { REFERRAL_JOIN_ROUTE_MARKER } from "@/lib/static-pages/static-pages";
import { createStaticPagesResponder } from "@/lib/static-pages/static-pages-responder";

const ORIGIN = "https://sairn.ai";
const SHELL = "<html><head><title>shell</title></head><body>shell</body></html>";
const RETIRED_DOCS = "<html><head><title>docs</title></head><body>docs</body></html>";

function createFakeFileSystem(files: Record<string, string>) {
	const readFile = vi.fn(async (file: string) => {
		const html = files[file];
		if (html === undefined) throw new Error(`ENOENT: ${file}`);
		return html;
	});
	return readFile;
}

function request(path: string, method = "GET"): Request {
	return new Request(`${ORIGIN}${path}`, { method });
}

describe("static pages responder", () => {
	it("serves the shell for every application route, ignores retired document pages and caches file reads", async () => {
		const readFile = createFakeFileSystem({
			"/srv/public/_shell.html": SHELL,
			"/srv/public/docs/index.html": RETIRED_DOCS,
		});
		const respond = createStaticPagesResponder({ publicDir: "/srv/public", readFile, allowRuntimeSsr: false });

		const docs = await respond(request("/docs"));
		expect(docs?.status).toBe(200);
		expect(docs?.headers.get("content-type")).toBe("text/html; charset=utf-8");
		expect(docs?.headers.get("cache-control")).toBe("no-cache");
		await expect(docs?.text()).resolves.toBe(SHELL);

		const trade = await respond(request("/trade/BTC"));
		await expect(trade?.text()).resolves.toBe(SHELL);
		const portfolio = await respond(request("/portfolio"));
		await expect(portfolio?.text()).resolves.toBe(SHELL);
		expect(readFile).toHaveBeenCalledTimes(1);

		const head = await respond(request("/trade/ETH", "HEAD"));
		expect(head?.status).toBe(200);
		await expect(head?.text()).resolves.toBe("");
	});

	it("serves the shell for legal pages and stamps referral markers", async () => {
		const readFile = createFakeFileSystem({ "/srv/public/_shell.html": SHELL });
		const respond = createStaticPagesResponder({ publicDir: "/srv/public", readFile, allowRuntimeSsr: false });

		await expect(respond(request("/terms")).then((response) => response?.text())).resolves.toBe(SHELL);
		await expect(respond(request("/join/abc")).then((response) => response?.text())).resolves.toBe(
			SHELL.replace("<head>", `<head>${REFERRAL_JOIN_ROUTE_MARKER}`),
		);
	});

	it("passes server-only requests through and refuses HTML for files and server functions", async () => {
		const readFile = createFakeFileSystem({ "/srv/public/_shell.html": SHELL });
		const respond = createStaticPagesResponder({ publicDir: "/srv/public", readFile, allowRuntimeSsr: false });

		await expect(respond(request("/api/geo"))).resolves.toBeUndefined();
		await expect(respond(request("/client-error-report", "POST"))).resolves.toBeUndefined();
		await expect(respond(request("/trade/BTC", "POST"))).resolves.toBeUndefined();
		expect((await respond(request("/assets/missing.js")))?.status).toBe(404);
		const gone = await respond(request("/_serverFn/abc"));
		expect(gone?.status).toBe(404);
		expect(gone?.headers.get("content-type")).toContain("application/json");
		const wrongMethod = await respond(request("/client-error-report"));
		expect(wrongMethod?.status).toBe(405);
		expect(wrongMethod?.headers.get("allow")).toBe("POST");
		expect(wrongMethod?.headers.get("cache-control")).toBe("no-store");
		expect((await respond(request("/api/unknown")))?.status).toBe(404);
		expect((await respond(request("/mobile-agent-sync-ticket")))?.status).toBe(404);
		expect(readFile).not.toHaveBeenCalled();
	});

	it("fails closed without a shell unless runtime server rendering is explicitly allowed", async () => {
		const warn = vi.fn();
		const strict = createStaticPagesResponder({
			publicDir: null,
			readFile: createFakeFileSystem({}),
			allowRuntimeSsr: false,
			warn,
		});
		const response = await strict(request("/trade/BTC"));
		expect(response?.status).toBe(503);
		expect(response?.headers.get("retry-after")).toBe("60");
		expect(warn).not.toHaveBeenCalled();

		const permissive = createStaticPagesResponder({
			publicDir: "/srv/public",
			readFile: createFakeFileSystem({}),
			allowRuntimeSsr: true,
			warn,
		});
		await expect(permissive(request("/trade/BTC"))).resolves.toBeUndefined();
		await expect(permissive(request("/docs"))).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalledTimes(1);
	});
});
