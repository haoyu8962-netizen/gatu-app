import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import shared from "./vite.config";

const mock = fileURLToPath(new URL("./account-actions.browser.ts", import.meta.url));
export default mergeConfig(
	{ ...shared, resolve: undefined, optimizeDeps: undefined },
	{
		publicDir: fileURLToPath(new URL("../../public", import.meta.url)),
		cacheDir: fileURLToPath(new URL("../../node_modules/.vite-account-actions", import.meta.url)),
		optimizeDeps: { entries: ["account-actions.html"] },
		resolve: {
			dedupe: ["react", "react-dom"],
			alias: [
				{ find: /^@\/hooks\/trade\/(?:use-account-overview|use-deposit-availability)$/u, replacement: mock },
				{ find: /^@\/hooks\/wallet\/use-wallet-session$/u, replacement: mock },
				{ find: /^@\/hooks\/use-geo-restriction$/u, replacement: mock },
				{ find: /^@\/lib\/lifi\/bridge-execution-state$/u, replacement: mock },
				{ find: /^@\/stores\/use-global-modal-store$/u, replacement: mock },
			],
		},
	},
);
