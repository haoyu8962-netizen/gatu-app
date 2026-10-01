import { fileURLToPath } from "node:url";
import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

const FIXTURE_PATH = "/brand-surfaces.html";

// Served from memory: the shared browser optimizer scans `**/*.html` (tests/browser/vite.config.ts).
const FIXTURE_HTML = `<!doctype html>
<html lang="en" class="dark">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Brand surfaces</title>
	</head>
	<body>
		<div id="root"></div>
		<script type="module" src="/brand-surfaces.fixture.tsx"></script>
	</body>
</html>
`;

function fixtureDocument(): Plugin {
	return {
		name: "brand-surfaces-document",
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				const url = request.url ?? "";
				if (url.split("?")[0] !== FIXTURE_PATH) {
					next();
					return;
				}
				server
					.transformIndexHtml(url, FIXTURE_HTML)
					.then((html) => {
						response.setHeader("Content-Type", "text/html; charset=utf-8");
						response.setHeader("Cache-Control", "no-cache");
						response.end(html);
					})
					.catch(next);
			});
		},
	};
}

export default defineConfig({
	root: fileURLToPath(new URL(".", import.meta.url)),
	cacheDir: fileURLToPath(new URL("../../node_modules/.vite-brand-surfaces", import.meta.url)),
	optimizeDeps: { entries: ["brand-surfaces.fixture.tsx"] },
	plugins: [
		fixtureDocument(),
		lingui(),
		viteTsConfigPaths({ projects: [fileURLToPath(new URL("../../tsconfig.json", import.meta.url))] }),
		viteReact({ babel: { plugins: ["@lingui/babel-plugin-lingui-macro", "babel-plugin-react-compiler"] } }),
		tailwindcss(),
	],
	server: { fs: { allow: [fileURLToPath(new URL("../../../..", import.meta.url))] } },
});
