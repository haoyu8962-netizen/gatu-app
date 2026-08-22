import { describe, expect, it } from "vitest";
import { resolveTradingAgentName } from "@/config/trading-agent";

describe("trading Agent configuration", () => {
	it("isolates local development from the production Agent slot", () => {
		expect(resolveTradingAgentName(undefined, true)).toBe("gatu-dev");
		expect(resolveTradingAgentName(undefined, false)).toBe("gatu");
	});

	it("uses an explicit stable deployment slot", () => {
		expect(resolveTradingAgentName("  gatu-stage  ", false)).toBe("gatu-stage");
	});

	it("rejects names beyond the SDK base-name limit", () => {
		expect(() => resolveTradingAgentName("12345678901234567", false)).toThrow(
			"Hyperliquid Agent name must not exceed 16 characters.",
		);
	});
});
