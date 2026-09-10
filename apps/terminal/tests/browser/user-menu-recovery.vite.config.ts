import { fileURLToPath } from "node:url";
import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

const browserMock = fileURLToPath(new URL("./user-menu-recovery.browser.tsx", import.meta.url));

export default defineConfig({
	root: fileURLToPath(new URL(".", import.meta.url)),
	cacheDir: fileURLToPath(new URL("../../node_modules/.vite-user-menu-recovery", import.meta.url)),
	optimizeDeps: { entries: ["user-menu-recovery.html"] },
	plugins: [
		lingui(),
		viteTsConfigPaths({ projects: [fileURLToPath(new URL("../../tsconfig.json", import.meta.url))] }),
		viteReact({ babel: { plugins: ["@lingui/babel-plugin-lingui-macro", "babel-plugin-react-compiler"] } }),
		tailwindcss(),
	],
	resolve: {
		alias: [
			{ find: /^wagmi$/u, replacement: browserMock },
			{ find: /^@\/hooks\/wallet\/use-wallet-session$/u, replacement: browserMock },
			{ find: /^@\/lib\/wallet\/privy-wagmi$/u, replacement: browserMock },
			{ find: /^@\/lib\/error-reporting\/client$/u, replacement: browserMock },
			{ find: /^\.\.\/components\/(?:mobile-agent-sync-modal|wallet-modal)$/u, replacement: browserMock },
		],
	},
	server: { fs: { allow: [fileURLToPath(new URL("../../../..", import.meta.url))] } },
});
