import { fileURLToPath } from "node:url";
import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

const browserMock = fileURLToPath(new URL("./top-nav-connected.browser.tsx", import.meta.url));
const FIXTURE_PATH = "/top-nav-connected.html";

// The page is served from memory instead of a tracked `.html` file: the shared browser optimizer scans
// `**/*.html` (tests/browser/vite.config.ts), and this fixture's TopNav graph must not reach it.
const FIXTURE_HTML = `<!doctype html>
<html lang="en" class="dark">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Connected desktop TopNav measurement</title>
	</head>
	<body>
		<div id="root"></div>
		<script type="module" src="/top-nav-connected.fixture.tsx"></script>
	</body>
</html>
`;

function fixtureDocument(): Plugin {
	return {
		name: "top-nav-connected-document",
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
	cacheDir: fileURLToPath(new URL("../../node_modules/.vite-top-nav-connected", import.meta.url)),
	optimizeDeps: { entries: ["top-nav-connected.fixture.tsx"] },
	// Production builds enable sponsored email-wallet deposits; the pairing flag is chosen per page
	// through `?pairing=on|off` by the mock of `@/config/mobile-pairing`.
	define: { "import.meta.env.VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED": JSON.stringify("true") },
	plugins: [
		fixtureDocument(),
		lingui(),
		viteTsConfigPaths({ projects: [fileURLToPath(new URL("../../tsconfig.json", import.meta.url))] }),
		viteReact({ babel: { plugins: ["@lingui/babel-plugin-lingui-macro", "babel-plugin-react-compiler"] } }),
		tailwindcss(),
	],
	resolve: {
		alias: [
			{ find: /^wagmi$/u, replacement: browserMock },
			{ find: /^@\/config\/mobile-pairing$/u, replacement: browserMock },
			{ find: /^@\/hooks\/wallet\/use-wallet-session$/u, replacement: browserMock },
			{ find: /^@\/hooks\/wallet\/use-email-wallet-export$/u, replacement: browserMock },
			{ find: /^@\/hooks\/use-geo-restriction$/u, replacement: browserMock },
			{ find: /^@\/hooks\/trade\/use-trade-home-path$/u, replacement: browserMock },
			{ find: /^@\/lib\/wallet\/privy-wagmi$/u, replacement: browserMock },
			{ find: /^@\/lib\/error-reporting\/client$/u, replacement: browserMock },
			{ find: /^@\/stores\/use-global-modal-store$/u, replacement: browserMock },
			{ find: /^\.\.\/components\/(?:mobile-agent-sync-modal|wallet-modal)$/u, replacement: browserMock },
		],
	},
	server: { fs: { allow: [fileURLToPath(new URL("../../../..", import.meta.url))] } },
});
