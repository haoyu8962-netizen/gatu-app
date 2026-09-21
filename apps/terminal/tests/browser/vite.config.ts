import { fileURLToPath } from "node:url";
import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

const root = fileURLToPath(new URL(".", import.meta.url));
const mobileOrderbookBrowserMock = fileURLToPath(new URL("./mobile-orderbook-cls.browser.ts", import.meta.url));
const tradePanelBrowserMock = fileURLToPath(new URL("./trade-panel-all-orders.browser.ts", import.meta.url));

export default defineConfig({
	root,
	cacheDir: fileURLToPath(new URL("../../node_modules/.vite-browser", import.meta.url)),
	optimizeDeps: {
		entries: [
			"**/*.html",
			"!user-menu-recovery.html",
			"!mobile-trade-all-orders.html",
			"!account-actions.html",
			"!position-close-all.html",
			"!notifications.html",
		],
	},
	define: { "process.env.DRAGGABLE_DEBUG": "false" },
	plugins: [
		lingui(),
		viteTsConfigPaths({ projects: [fileURLToPath(new URL("../../tsconfig.json", import.meta.url))] }),
		viteReact({
			babel: {
				plugins: ["@lingui/babel-plugin-lingui-macro", "babel-plugin-react-compiler"],
			},
		}),
		tailwindcss(),
	],
	resolve: {
		alias: [
			{ find: /^@\/hooks\/trade\/use-orderbook-feed$/u, replacement: mobileOrderbookBrowserMock },
			{ find: /^@\/hooks\/trade\/use-orderbook-mid-price$/u, replacement: tradePanelBrowserMock },
			{ find: /^@\/lib\/hyperliquid$/u, replacement: tradePanelBrowserMock },
			{ find: /^@\/hooks\/wallet\/use-wallet-session$/u, replacement: tradePanelBrowserMock },
		],
	},
	server: {
		fs: {
			allow: [fileURLToPath(new URL("../../../..", import.meta.url))],
		},
	},
});
