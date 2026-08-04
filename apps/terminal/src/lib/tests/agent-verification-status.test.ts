import { deriveAgentRequirements, deriveAgentVerificationStatus } from "@gatu/hl-react/signing/use-agent-status";
import type { ExtraAgentsResponse } from "@nktkas/hyperliquid";
import type { Address } from "viem";
import { describe, expect, it } from "vitest";

const AGENT = "0x2222222222222222222222222222222222222222" as Address;
const APPROVED_AGENTS: ExtraAgentsResponse = [{ address: AGENT, name: "HypeTerminal", validUntil: null }];

function requirements(extraAgents: ExtraAgentsResponse | undefined) {
	return deriveAgentRequirements(undefined, extraAgents, null, undefined, Date.now(), AGENT);
}

describe("Agent verification status", () => {
	it("does not turn a cached miss into a definitive missing state while refreshing", () => {
		expect(deriveAgentVerificationStatus(true, [], null, true, requirements([]))).toBe("loading");
	});

	it("keeps an exactly verified cached Agent ready during a background refresh", () => {
		expect(deriveAgentVerificationStatus(true, APPROVED_AGENTS, null, true, requirements(APPROVED_AGENTS))).toBe(
			"ready",
		);
	});

	it("fails closed when refresh returns an error even if cached data matched", () => {
		expect(
			deriveAgentVerificationStatus(
				true,
				APPROVED_AGENTS,
				new Error("network unavailable"),
				false,
				requirements(APPROVED_AGENTS),
			),
		).toBe("error");
	});

	it("marks only a settled successful miss as missing", () => {
		expect(deriveAgentVerificationStatus(true, [], null, false, requirements([]))).toBe("missing");
	});

	it("marks an exact unexpired match as ready", () => {
		expect(deriveAgentVerificationStatus(true, APPROVED_AGENTS, null, false, requirements(APPROVED_AGENTS))).toBe(
			"ready",
		);
	});

	it("keeps absent owners and absent results unknown", () => {
		expect(deriveAgentVerificationStatus(false, undefined, null, false, requirements(undefined))).toBe("unknown");
		expect(deriveAgentVerificationStatus(true, undefined, null, false, requirements(undefined))).toBe("unknown");
	});
});
