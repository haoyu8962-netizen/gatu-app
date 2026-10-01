import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const bootstrapSource = readFileSync(
	resolve(process.cwd(), "src/lib/hyperliquid/markets/market-catalog-bootstrap.ts"),
	"utf8",
);
const querySource = readFileSync(resolve(process.cwd(), "src/lib/hyperliquid/markets/market-catalog-query.ts"), "utf8");
const clientSource = readFileSync(
	resolve(process.cwd(), "src/lib/hyperliquid/markets/market-catalog-info-client.ts"),
	"utf8",
);

describe("market catalog bootstrap dependency boundary", () => {
	it("keeps signing, websocket, provider, and persistence runtimes off the static route path", () => {
		expect(bootstrapSource).toContain('await import("./market-catalog-info-client")');
		expect(bootstrapSource).not.toContain("@sairn/hl-react/clients");
		expect(bootstrapSource).not.toContain("query-sync-storage-persister");
		expect(bootstrapSource).not.toContain("react-query-persist-client");
		expect(querySource).toContain("@sairn/hl-react/query/info");
		expect(querySource).not.toContain("@sairn/hl-react/hooks/useInfo");
	});

	it("limits the deferred SDK client to tree-shakeable read-only HTTP methods", () => {
		expect(clientSource).toContain("HttpTransport");
		expect(clientSource).toContain('from "@nktkas/hyperliquid/api/info"');
		expect(clientSource).toContain("allPerpMetas({ transport }, signal)");
		expect(clientSource).not.toContain("new InfoClient");
		expect(clientSource).not.toContain("ExchangeClient");
		expect(clientSource).not.toContain("WebSocketTransport");
		expect(clientSource).not.toContain("viem");
	});
});
