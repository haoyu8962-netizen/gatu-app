import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

const root = fileURLToPath(new URL(".", import.meta.url));
const mobileOrderbookBrowserMock = fileURLToPath(new URL("./mobile-orderbook-cls.browser.ts", import.meta.url));

export default defineConfig({
	root,
	cacheDir: fileURLToPath(new URL("../../node_modules/.vite-browser", import.meta.url)),
	define: { "process.env.DRAGGABLE_DEBUG": "false" },
	plugins: [
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
			{ find: /^@\/hooks\/trade\/use-orderbook-mid-price$/u, replacement: mobileOrderbookBrowserMock },
			{ find: /^@\/lib\/hyperliquid$/u, replacement: mobileOrderbookBrowserMock },
		],
	},
	server: {
		fs: {
			allow: [fileURLToPath(new URL("../../../..", import.meta.url))],
		},
	},
});
