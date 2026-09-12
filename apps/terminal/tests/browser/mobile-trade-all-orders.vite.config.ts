import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import shared from "./vite.config";

const mock = fileURLToPath(new URL("./mobile-trade-all-orders.browser.tsx", import.meta.url));
export default mergeConfig(
	{ ...shared, resolve: undefined, optimizeDeps: undefined },
	{
		cacheDir: fileURLToPath(new URL("../../node_modules/.vite-mobile-trade-all-orders", import.meta.url)),
		optimizeDeps: { entries: ["mobile-trade-all-orders.html"] },
		resolve: {
			dedupe: ["react", "react-dom"],
			alias: [
				{ find: /^wagmi$/u, replacement: mock },
				{ find: /^@\/lib\/hyperliquid$/u, replacement: mock },
				{ find: /^@\/hooks\/wallet\/use-wallet-session$/u, replacement: mock },
				{
					find: /^@\/hooks\/trade\/(?:use-account-abstraction-control|use-builder-fee-config|use-deposit-availability|use-fee-rates|use-market-navigation|use-order-submit|use-orderbook-mid-price|use-prospective-cross-margin-account)$/u,
					replacement: mock,
				},
				{ find: /^\.\/use-(?:account-balances|asset-leverage)$/u, replacement: mock },
				{ find: /^@\/hooks\/use-geo-restriction$/u, replacement: mock },
				{ find: /^\.\.\/chart\/token-selector$/u, replacement: mock },
				{ find: /^\.\.\/components\/wallet-modal$/u, replacement: mock },
			],
		},
	},
);
