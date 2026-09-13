#!/usr/bin/env node
// Serves the terminal's client build the way a static host (S3 + CloudFront, Cloudflare Pages)
// would: existing files win, application routes fall back to the prerendered SPA shell, and the
// paths that only the Nitro server can answer return a JSON 404 instead of the shell so a client
// never parses HTML as an API response.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const SHELL_FILE = "_shell.html";
export const SERVER_ONLY_PREFIXES = ["/_serverFn/", "/api/"];
export const SERVER_ONLY_PATHS = ["/build-meta.json", "/client-error-report", "/mobile-agent-sync-ticket"];

const CONTENT_TYPES = new Map([
	[".html", "text/html; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".mjs", "text/javascript; charset=utf-8"],
	[".css", "text/css; charset=utf-8"],
	[".json", "application/json; charset=utf-8"],
	[".svg", "image/svg+xml"],
	[".png", "image/png"],
	[".ico", "image/x-icon"],
	[".webp", "image/webp"],
	[".woff2", "font/woff2"],
	[".woff", "font/woff"],
	[".txt", "text/plain; charset=utf-8"],
	[".xml", "application/xml; charset=utf-8"],
	[".webmanifest", "application/manifest+json"],
	[".wasm", "application/wasm"],
]);

function isServerOnlyPath(pathname) {
	if (SERVER_ONLY_PATHS.includes(pathname)) return true;
	return SERVER_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * A CDN rewrites every unmatched path to the shell regardless of the Accept header. Only an
 * explicit non-HTML request (a JSON fetch) is refused, so a client never parses HTML as data.
 */
export function acceptsHtmlNavigation(acceptHeader) {
	const accept = (acceptHeader ?? "").trim();
	if (accept === "") return true;
	return accept.includes("text/html") || accept.includes("*/*");
}

function decodePathname(pathname) {
	try {
		return decodeURIComponent(pathname);
	} catch {
		return null;
	}
}

/**
 * Pure request classifier so the hosting rules can be unit-tested without sockets.
 * `fs.isFile(relativePath)` answers whether a file exists inside the public directory.
 */
export function resolveStaticRequest(rawPathname, { acceptsHtml, isFile }) {
	const decoded = decodePathname(rawPathname);
	if (decoded === null || decoded.includes("\0")) return { kind: "not-found" };
	const pathname = normalize(decoded).replaceAll("\\", "/");
	if (!pathname.startsWith("/") || pathname.split("/").includes("..")) return { kind: "not-found" };
	if (isServerOnlyPath(pathname)) return { kind: "server-only", pathname };

	const candidates = pathname.endsWith("/")
		? [`${pathname}index.html`]
		: [pathname, `${pathname}/index.html`, `${pathname}.html`];
	for (const candidate of candidates) {
		const relative = candidate.replace(/^\/+/, "");
		if (relative && isFile(relative)) return { kind: "file", file: relative };
	}

	if (acceptsHtml && !extname(pathname)) return { kind: "shell", file: SHELL_FILE };
	return { kind: "not-found" };
}

function cacheControlFor(file) {
	if (file === "sw.js") return "no-store";
	if (file.startsWith("assets/")) return "public, max-age=31536000, immutable";
	if (file.endsWith(".html")) return "no-cache";
	return "public, max-age=0, must-revalidate";
}

export function createStaticHandler(publicDir) {
	const root = resolve(publicDir);
	const isFile = (relative) => {
		const target = resolve(root, relative);
		if (target !== root && !target.startsWith(root + sep)) return false;
		return existsSync(target) && statSync(target).isFile();
	};

	return (request, response) => {
		const url = new URL(request.url ?? "/", "http://localhost");
		const acceptsHtml = acceptsHtmlNavigation(request.headers.accept);
		const result = resolveStaticRequest(url.pathname, { acceptsHtml, isFile });

		if (result.kind === "server-only") {
			response.writeHead(404, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
			response.end(JSON.stringify({ error: "server route unavailable on static hosting", path: result.pathname }));
			return;
		}
		if (result.kind === "not-found" || (result.kind === "shell" && !isFile(result.file))) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
			response.end(result.kind === "shell" ? `Missing ${SHELL_FILE}; run the SPA build first.` : "Not Found");
			return;
		}

		const file = result.file;
		const contentType = CONTENT_TYPES.get(extname(file)) ?? "application/octet-stream";
		response.writeHead(200, { "content-type": contentType, "cache-control": cacheControlFor(file) });
		if (request.method === "HEAD") {
			response.end();
			return;
		}
		createReadStream(join(root, normalize(file))).pipe(response);
	};
}

function readArgs(argv) {
	const options = { publicDir: "apps/terminal/.output/public", port: Number(process.env.PORT) || 3030, host: "127.0.0.1" };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--port") options.port = Number(argv[++index]);
		else if (argument.startsWith("--port=")) options.port = Number(argument.slice("--port=".length));
		else if (argument === "--host") options.host = argv[++index];
		else if (argument.startsWith("--host=")) options.host = argument.slice("--host=".length);
		else if (!argument.startsWith("-")) options.publicDir = argument;
	}
	return options;
}

function main() {
	const options = readArgs(process.argv.slice(2));
	const publicDir = resolve(process.cwd(), options.publicDir);
	if (!existsSync(join(publicDir, SHELL_FILE))) {
		console.error(`SPA shell not found: ${join(publicDir, SHELL_FILE)}`);
		console.error("Run `pnpm build` before `pnpm serve:spa`.");
		process.exit(1);
	}
	const server = createServer(createStaticHandler(publicDir));
	server.listen(options.port, options.host, () => {
		console.log(`Static SPA build served from ${publicDir} at http://${options.host}:${options.port}/`);
	});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
