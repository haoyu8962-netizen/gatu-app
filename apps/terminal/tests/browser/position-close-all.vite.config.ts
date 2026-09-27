import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import shared from "./vite.config";

const mock = fileURLToPath(new URL("./position-close-all.browser.tsx", import.meta.url));
export default mergeConfig(
	{ ...shared, resolve: undefined, optimizeDeps: undefined },
	{
		cacheDir: fileURLToPath(new URL("../../node_modules/.vite-position-close-all", import.meta.url)),
		optimizeDeps: { entries: ["position-close-all.html"] },
		resolve: {
			dedupe: ["react", "react-dom"],
			alias: [
				{ find: /^@\/lib\/hyperliquid$/u, replacement: mock },
				{ find: /^@\/lib\/hyperliquid\/markets\/use-markets$/u, replacement: mock },
				{ find: /^@\/hooks\/wallet\/use-wallet-session$/u, replacement: mock },
				{
					find: /^@\/hooks\/trade\/(?:use-market-navigation|use-position-market-close-action|use-hip3-disclaimer)$/u,
					replacement: mock,
				},
				{ find: /^@\/stores\/use-hip3-disclaimer-store$/u, replacement: mock },
				{
					find: /^(?:\.\/|\.\.\/positions\/)position-(?:pnl-share-modal|limit-close-modal|reverse-confirmation-controller|tpsl-modal|isolated-margin-modal)$/u,
					replacement: mock,
				},
			],
		},
	},
);
