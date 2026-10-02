import type { ExtraAgentsResponse } from "@nktkas/hyperliquid";
import type { AgentWallet } from "@sairn/hl-react";
import { createMobileAgentWalletRecord } from "@sairn/hl-react/signing/mobile-agent";
import {
	classifyAgentStatusError,
	deriveAgentMissingReason,
	deriveAgentRequirements,
	deriveAgentVerificationStatus,
} from "@sairn/hl-react/signing/use-agent-status";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

const AGENT = "0x2222222222222222222222222222222222222222" as Address;
const OTHER_AGENT = "0x3333333333333333333333333333333333333333" as Address;
const APPROVED_AGENTS: ExtraAgentsResponse = [{ address: AGENT, name: "sairn", validUntil: null }];
const LOCAL_AGENT: AgentWallet = {
	privateKey: `0x${"ab".repeat(32)}`,
	publicKey: AGENT,
	source: "local-registration",
};

function requirements(extraAgents: ExtraAgentsResponse | undefined, expectedAgentName?: string) {
	return deriveAgentRequirements(undefined, extraAgents, null, undefined, Date.now(), AGENT, expectedAgentName);
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

	it("requires the deployment Agent name as well as the local public key", () => {
		expect(requirements(APPROVED_AGENTS, "sairn-dev")).toMatchObject({
			isAgentReady: false,
			needsAgent: true,
		});
		expect(requirements(APPROVED_AGENTS, "sairn")).toMatchObject({
			isAgentReady: true,
			needsAgent: false,
		});
	});

	it("keeps absent owners and absent results unknown", () => {
		expect(deriveAgentVerificationStatus(false, undefined, null, false, requirements(undefined))).toBe("unknown");
		expect(deriveAgentVerificationStatus(true, undefined, null, false, requirements(undefined))).toBe("unknown");
	});
});

describe("Agent missing reason", () => {
	const baseOptions = {
		agentVerificationStatus: "missing" as const,
		extraAgentsData: [] as ExtraAgentsResponse,
		localAgent: LOCAL_AGENT,
		hasInvalidStorageRecord: false,
		expectedAgentName: "sairn-dev",
		nowMs: 1_000,
	};

	it.each(["unknown", "loading", "ready", "error"] as const)(
		"does not expose a missing reason while verification is %s",
		(agentVerificationStatus) => {
			expect(deriveAgentMissingReason({ ...baseOptions, agentVerificationStatus })).toBeNull();
		},
	);

	it("distinguishes an invalid local record from an absent local key", () => {
		expect(
			deriveAgentMissingReason({
				...baseOptions,
				localAgent: null,
				hasInvalidStorageRecord: true,
			}),
		).toBe("invalid_local_record");
		expect(deriveAgentMissingReason({ ...baseOptions, localAgent: null })).toBe("no_local_key");
	});

	it("warns when an absent local key would replace an existing deployment-named Agent", () => {
		expect(
			deriveAgentMissingReason({
				...baseOptions,
				localAgent: null,
				extraAgentsData: [{ address: OTHER_AGENT, name: "sairn-dev", validUntil: null }],
			}),
		).toBe("remote_named_agent_exists");
	});

	it("detects when the deployment-named remote key replaced the local key", () => {
		expect(
			deriveAgentMissingReason({
				...baseOptions,
				extraAgentsData: [{ address: OTHER_AGENT, name: "sairn-dev", validUntil: null }],
			}),
		).toBe("remote_key_replaced");
	});

	it("detects when the local key remains approved under a different name", () => {
		expect(
			deriveAgentMissingReason({
				...baseOptions,
				extraAgentsData: [{ address: AGENT, name: "sairn", validUntil: null }],
			}),
		).toBe("agent_name_mismatch");
	});

	it("keeps an unconfirmed approval distinct from a stale local key", () => {
		expect(
			deriveAgentMissingReason({
				...baseOptions,
				localAgent: { ...LOCAL_AGENT, source: "local-registration", approvalPendingAtMs: 500 },
			}),
		).toBe("approval_unconfirmed");
	});

	it("uses a generic not-approved reason for absent and expired approvals", () => {
		expect(deriveAgentMissingReason(baseOptions)).toBe("local_key_not_approved");
		expect(
			deriveAgentMissingReason({
				...baseOptions,
				extraAgentsData: [{ address: AGENT, name: "sairn-dev", validUntil: 999 }],
			}),
		).toBe("local_key_not_approved");
	});

	it("uses the stored Mobile Agent base name instead of the deployment name", () => {
		const privateKey = `0x${"11".repeat(32)}` as Hex;
		const mobileAgent = createMobileAgentWalletRecord({
			privateKey,
			publicKey: privateKeyToAccount(privateKey).address,
			agentName: "Mobile valid_until 10000",
			agentValidUntilMs: 10_000,
			importedAtMs: 100,
		});

		expect(
			deriveAgentMissingReason({
				...baseOptions,
				localAgent: mobileAgent,
				extraAgentsData: [{ address: OTHER_AGENT, name: "Mobile", validUntil: 10_000 }],
			}),
		).toBe("remote_key_replaced");
	});
});

describe("Agent status error classification", () => {
	it.each([
		[429, "rate_limited"],
		[408, "timeout"],
		[503, "service_unavailable"],
	] as const)("classifies HTTP %s as %s", (status, reason) => {
		expect(classifyAgentStatusError({ response: { status } })).toBe(reason);
	});

	it("classifies timeout and network failures without an HTTP response", () => {
		expect(classifyAgentStatusError(new DOMException("Request timed out", "TimeoutError"))).toBe("timeout");
		expect(classifyAgentStatusError(new TypeError("Failed to fetch"))).toBe("network");
	});

	it("walks nested causes and leaves unrecognized failures unknown", () => {
		expect(
			classifyAgentStatusError(
				Object.assign(new Error("Request failed"), {
					cause: Object.assign(new Error("Rate limited"), { response: { status: 429 } }),
				}),
			),
		).toBe("rate_limited");
		expect(classifyAgentStatusError(new Error("Invalid response"))).toBe("unknown");
	});
});
