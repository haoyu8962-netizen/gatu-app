import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import shared from "./vite.config";
export default mergeConfig(
	{ ...shared, resolve: undefined, optimizeDeps: undefined },
	{
		cacheDir: fileURLToPath(new URL("../../node_modules/.vite-notifications", import.meta.url)),
		optimizeDeps: { entries: ["notifications.html"] },
		resolve: {
			dedupe: ["react", "react-dom"],
			alias: [
				{
					find: /^@\/lib\/hyperliquid$/u,
					replacement: fileURLToPath(new URL("./notifications.browser.tsx", import.meta.url)),
				},
			],
		},
		server: { host: "127.0.0.1", port: 4189, strictPort: true },
	},
);
