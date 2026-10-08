// Serves a built terminal (apps/terminal/.output/public) with the production Cache-Control, so
// WebKit's memory cache behaves as it does on CloudFront and chart-rebuild-webkit-probe.mjs can
// reproduce the loader handshake race on a local build. The immutable set mirrors
// deploy/cloudfront/deploy.mjs objectCacheControl: assets/, the 20-hex-hashed charting_library
// bundles and the 16-hex-hashed loader copy; everything else, including the _shell.html fallback for
// application routes, is no-cache. Diagnostic tool only: it binds loopback and has no TLS.
// node apps/terminal/tests/browser/serve-immutable-build.mjs apps/terminal/.output/public [port]
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "apps/terminal/.output/public");
const port = Number(process.argv[3] ?? 3031);
const IMMUTABLE = "public, max-age=31536000, immutable";
const HASHED_CHART_BUNDLE = /^charting_library\/bundles\/[^/]+\.[0-9a-f]{20}(\.rtl)?\.[a-z0-9]+$/;
const HASHED_CHART_ENTRY = /^charting_library\/charting_library\.[0-9a-f]{16}\.js$/;
/** The deploy never uploads precompressed siblings (deploy.mjs returns null for them), so they are not served either. */
const PRECOMPRESSED = new Set([".br", ".gz", ".zst"]);
const CONTENT_TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript",
	".css": "text/css",
	".json": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".woff2": "font/woff2",
	".ico": "image/x-icon",
	".webmanifest": "application/manifest+json",
};

function cacheControlFor(relativePath) {
	const key = relativePath.split(sep).join("/");
	if (key.startsWith("assets/") || HASHED_CHART_BUNDLE.test(key) || HASHED_CHART_ENTRY.test(key)) return IMMUTABLE;
	return "no-cache";
}

function resolveRequest(rawPath) {
	const pathname = decodeURIComponent(new URL(rawPath, "http://localhost").pathname);
	const file = resolve(root, `.${pathname}`);
	const relativePath = relative(root, file);
	if (relativePath.startsWith("..") || relativePath === "") return { file: resolve(root, "_shell.html"), relativePath: "_shell.html" };
	if (!existsSync(file) || statSync(file).isDirectory()) return { file: resolve(root, "_shell.html"), relativePath: "_shell.html" };
	return { file, relativePath };
}

createServer((request, response) => {
	let target;
	try {
		target = resolveRequest(request.url ?? "/");
	} catch {
		response.writeHead(400, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
		response.end("bad request");
		return;
	}
	if (!existsSync(target.file) || PRECOMPRESSED.has(extname(target.file))) {
		response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
		response.end("not found");
		return;
	}
	const stream = createReadStream(target.file);
	stream.once("error", () => {
		if (!response.headersSent) response.writeHead(500, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
		response.end();
	});
	stream.once("open", () => {
		response.writeHead(200, {
			"content-type": CONTENT_TYPES[extname(target.file)] ?? "application/octet-stream",
			"cache-control": cacheControlFor(target.relativePath),
		});
		stream.pipe(response);
	});
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
