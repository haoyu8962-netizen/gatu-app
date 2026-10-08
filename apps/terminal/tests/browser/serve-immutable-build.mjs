// Serves a built terminal (apps/terminal/.output/public) with the production Cache-Control: the
// charting_library bundles, the hashed loader copy and assets/ are immutable, everything else is
// no-cache, unknown paths fall back to _shell.html. WebKit's memory cache then behaves as it does on
// CloudFront, which chart-rebuild-webkit-probe.mjs needs to reproduce the loader handshake race.
// node apps/terminal/tests/browser/serve-immutable-build.mjs apps/terminal/.output/public [port]
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
const root = process.argv[2];
const port = Number(process.argv[3] ?? 3031);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
createServer((req, res) => {
	const url = new URL(req.url, "http://x");
	let file = join(root, normalize(decodeURIComponent(url.pathname)));
	if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, "_shell.html");
	const ext = extname(file);
	const immutable = /\/charting_library\/bundles\/|\/charting_library\/charting_library\.[0-9a-f]{16}\.js$|\/assets\//.test(file);
	res.writeHead(200, { "content-type": types[ext] ?? "application/octet-stream", "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache" });
	createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
