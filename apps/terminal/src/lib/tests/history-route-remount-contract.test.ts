import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

function readRoute(file: string): string {
	return readFileSync(resolve(TEST_DIR, "../..", `routes/${file}`), "utf8");
}

describe("account history route identity", () => {
	it.each(["fundingHistory.$address.tsx", "historicalOrders.$address.tsx", "tradeHistory.$address.tsx"])(
		"remounts %s when the normalized account address changes",
		(file) => {
			expect(readRoute(file)).toContain("remountDeps: ({ params }) => ({ address: params.address.toLowerCase() })");
		},
	);
});
