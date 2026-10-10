import type { ExtraAgentsResponse } from "@nktkas/hyperliquid";
import type { AgentApprovalEvidence, AgentKeyRole, AgentWallet } from "@sairn/hl-react";
import { createMobileAgentWalletRecord } from "@sairn/hl-react/signing/mobile-agent";
import {
	classifyAgentStatusError,
	deriveAgentMissingReason,
	deriveAgentRequirements,
	deriveAgentVerificationStatus,
	isAgentKeyApprovedForOwner,
} from "@sairn/hl-react/signing/use-agent-status";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const OTHER_OWNER = "0x4444444444444444444444444444444444444444" as Address;
const AGENT = "0x2222222222222222222222222222222222222222" as Address;
const OTHER_AGENT = "0x3333333333333333333333333333333333333333" as Address;
const LOCAL_AGENT: AgentWallet = {
	privateKey: `0x${"ab".repeat(32)}`,
	publicKey: AGENT,
	source: "local-registration",
};
const APPROVED_ROLE: AgentKeyRole = { agentAddress: AGENT, role: { role: "agent", data: { user: OWNER } } };
const MISSING_ROLE: AgentKeyRole = { agentAddress: AGENT, role: { role: "missing" } };

function evidence(overrides: Partial<AgentApprovalEvidence> = {}): AgentApprovalEvidence {
	return { owner: OWNER, localAgent: LOCAL_AGENT, keyRole: undefined, extraAgents: undefined, ...overrides };
}

function requirements(keyRole: AgentKeyRole | undefined, agentAddressOverride?: Address) {
	return deriveAgentRequirements(undefined, evidence({ keyRole }), undefined, Date.now(), agentAddressOverride);
}

describe("default Agent key role", () => {
	it("approves only the exact key reported as an Agent of the exact owner", () => {
		expect(isAgentKeyApprovedForOwner(APPROVED_ROLE, AGENT, OWNER)).toBe(true);
		expect(
			isAgentKeyApprovedForOwner(APPROVED_ROLE, AGENT.toUpperCase() as Address, OWNER.toUpperCase() as Address),
		).toBe(true);
		expect(isAgentKeyApprovedForOwner(APPROVED_ROLE, OTHER_AGENT, OWNER)).toBe(false);
		expect(isAgentKeyApprovedForOwner(APPROVED_ROLE, AGENT, OTHER_OWNER)).toBe(false);
		expect(isAgentKeyApprovedForOwner(MISSING_ROLE, AGENT, OWNER)).toBe(false);
		expect(isAgentKeyApprovedForOwner({ agentAddress: AGENT, role: { role: "user" } }, AGENT, OWNER)).toBe(false);
		expect(isAgentKeyApprovedForOwner(undefined, AGENT, OWNER)).toBe(false);
		expect(isAgentKeyApprovedForOwner(APPROVED_ROLE, undefined, OWNER)).toBe(false);
		expect(isAgentKeyApprovedForOwner(APPROVED_ROLE, AGENT, undefined)).toBe(false);
	});

	it("needs an Agent only after the exchange answered for the stored key", () => {
		expect(requirements(undefined)).toMatchObject({ needsAgent: false, isAgentReady: false, isReady: false });
		expect(requirements(MISSING_ROLE)).toMatchObject({ needsAgent: true, isAgentReady: false, signaturesRequired: 1 });
		expect(requirements(APPROVED_ROLE)).toMatchObject({ needsAgent: false, isAgentReady: true, isReady: true });
	});

	it("ignores an answer about another key", () => {
		expect(requirements({ agentAddress: OTHER_AGENT, role: { role: "agent", data: { user: OWNER } } })).toMatchObject({
			needsAgent: false,
			isAgentReady: false,
		});
		expect(requirements(APPROVED_ROLE, OTHER_AGENT)).toMatchObject({ needsAgent: false, isAgentReady: false });
		expect(
			requirements({ agentAddress: OTHER_AGENT, role: { role: "agent", data: { user: OWNER } } }, OTHER_AGENT),
		).toMatchObject({ needsAgent: false, isAgentReady: true });
	});

	it("keeps using a stored key the exchange still reports as this owner's Agent, including a legacy record", () => {
		const legacyAgent: AgentWallet = { privateKey: LOCAL_AGENT.privateKey, publicKey: AGENT };
		expect(
			deriveAgentRequirements(undefined, evidence({ localAgent: legacyAgent, keyRole: APPROVED_ROLE }), undefined),
		).toMatchObject({ needsAgent: false, isAgentReady: true, isReady: true });
		expect(
			deriveAgentRequirements(undefined, evidence({ localAgent: legacyAgent, keyRole: MISSING_ROLE }), undefined),
		).toMatchObject({ needsAgent: true, isAgentReady: false });
	});

	it("treats an Agent approved for another owner as not approved", () => {
		expect(requirements({ agentAddress: AGENT, role: { role: "agent", data: { user: OTHER_OWNER } } })).toMatchObject({
			needsAgent: true,
			isAgentReady: false,
		});
	});

	it("needs a new Agent for a connected owner without a local key, and knows nothing without an owner", () => {
		expect(deriveAgentRequirements(undefined, evidence({ localAgent: null }), undefined)).toMatchObject({
			needsAgent: true,
			isAgentReady: false,
			signaturesRequired: 1,
		});
		expect(
			deriveAgentRequirements(undefined, evidence({ owner: undefined, localAgent: null }), undefined),
		).toMatchObject({
			needsAgent: false,
			isAgentReady: false,
			signaturesRequired: 0,
		});
	});

	it("never counts an extraAgents entry as approval of a default key", () => {
		const extraAgents: ExtraAgentsResponse = [{ address: AGENT, name: "sairn", validUntil: null }];
		expect(deriveAgentRequirements(undefined, evidence({ extraAgents }), undefined)).toMatchObject({
			needsAgent: false,
			isAgentReady: false,
		});
	});

	it("adds the builder fee as a separate requirement", () => {
		const builderConfig = { b: "0x5555555555555555555555555555555555555555" as Address, f: 10 };
		expect(deriveAgentRequirements(0, evidence({ keyRole: APPROVED_ROLE }), builderConfig)).toMatchObject({
			needsAgent: false,
			needsBuilderFee: true,
			isAgentReady: true,
			isBuilderFeeReady: false,
			isReady: false,
			signaturesRequired: 1,
		});
		expect(deriveAgentRequirements(10, evidence({ keyRole: MISSING_ROLE }), builderConfig)).toMatchObject({
			needsAgent: true,
			needsBuilderFee: false,
			isReady: false,
			signaturesRequired: 1,
		});
	});
});

describe("Agent verification status", () => {
	it("does not turn a cached miss into a definitive missing state while refreshing", () => {
		expect(
			deriveAgentVerificationStatus(true, evidence({ keyRole: MISSING_ROLE }), null, true, requirements(MISSING_ROLE)),
		).toBe("loading");
	});

	it("keeps an exactly verified cached Agent ready during a background refresh", () => {
		expect(
			deriveAgentVerificationStatus(
				true,
				evidence({ keyRole: APPROVED_ROLE }),
				null,
				true,
				requirements(APPROVED_ROLE),
			),
		).toBe("ready");
	});

	it("fails closed when refresh returns an error even if cached data matched", () => {
		expect(
			deriveAgentVerificationStatus(
				true,
				evidence({ keyRole: APPROVED_ROLE }),
				new Error("network unavailable"),
				false,
				requirements(APPROVED_ROLE),
			),
		).toBe("error");
	});

	it("marks only a settled answer about the stored key as missing", () => {
		expect(
			deriveAgentVerificationStatus(true, evidence({ keyRole: MISSING_ROLE }), null, false, requirements(MISSING_ROLE)),
		).toBe("missing");
		expect(
			deriveAgentVerificationStatus(
				true,
				evidence({ keyRole: { agentAddress: OTHER_AGENT, role: { role: "missing" } } }),
				null,
				false,
				requirements({ agentAddress: OTHER_AGENT, role: { role: "missing" } }),
			),
		).toBe("unknown");
	});

	it("marks an exact approved key as ready", () => {
		expect(
			deriveAgentVerificationStatus(
				true,
				evidence({ keyRole: APPROVED_ROLE }),
				null,
				false,
				requirements(APPROVED_ROLE),
			),
		).toBe("ready");
	});

	it("is missing without a local key and unknown without an owner or an answer", () => {
		const noKey = evidence({ localAgent: null });
		expect(
			deriveAgentVerificationStatus(true, noKey, null, false, deriveAgentRequirements(undefined, noKey, undefined)),
		).toBe("missing");
		expect(deriveAgentVerificationStatus(false, evidence(), null, false, requirements(undefined))).toBe("unknown");
		expect(deriveAgentVerificationStatus(true, evidence(), null, false, requirements(undefined))).toBe("unknown");
	});

	it("verifies a Mobile Agent through extraAgents instead of userRole", () => {
		const privateKey = `0x${"11".repeat(32)}` as Hex;
		const publicKey = privateKeyToAccount(privateKey).address;
		const mobileAgent = createMobileAgentWalletRecord({
			privateKey,
			publicKey,
			agentName: "Mobile QR valid_until 10000",
			agentValidUntilMs: 10_000,
			importedAtMs: 100,
		});
		const approvedRemote: ExtraAgentsResponse = [{ address: publicKey, name: "Mobile QR", validUntil: 10_000 }];
		const roleForMobileKey: AgentKeyRole = { agentAddress: publicKey, role: { role: "agent", data: { user: OWNER } } };

		expect(
			deriveAgentRequirements(
				undefined,
				evidence({ localAgent: mobileAgent, extraAgents: approvedRemote }),
				undefined,
				1_000,
			),
		).toMatchObject({ needsAgent: false, isAgentReady: true });
		expect(
			deriveAgentRequirements(undefined, evidence({ localAgent: mobileAgent, extraAgents: [] }), undefined, 1_000),
		).toMatchObject({ needsAgent: true, isAgentReady: false });
		expect(
			deriveAgentRequirements(
				undefined,
				evidence({ localAgent: mobileAgent, keyRole: roleForMobileKey }),
				undefined,
				1_000,
			),
		).toMatchObject({ needsAgent: false, isAgentReady: false });
		expect(
			deriveAgentVerificationStatus(
				true,
				evidence({ localAgent: mobileAgent, keyRole: roleForMobileKey }),
				null,
				false,
				deriveAgentRequirements(
					undefined,
					evidence({ localAgent: mobileAgent, keyRole: roleForMobileKey }),
					undefined,
					1_000,
				),
				1_000,
			),
		).toBe("unknown");
	});
});

describe("Agent missing reason", () => {
	const baseOptions = {
		agentVerificationStatus: "missing" as const,
		extraAgentsData: undefined as ExtraAgentsResponse | undefined,
		localAgent: LOCAL_AGENT,
		hasInvalidStorageRecord: false,
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

	it("keeps an unconfirmed approval distinct from a stale local key", () => {
		expect(
			deriveAgentMissingReason({
				...baseOptions,
				localAgent: { ...LOCAL_AGENT, source: "local-registration", approvalPendingAtMs: 500 },
			}),
		).toBe("approval_unconfirmed");
	});

	it("uses the generic not-approved reason for a default key the exchange no longer knows", () => {
		expect(deriveAgentMissingReason(baseOptions)).toBe("local_key_not_approved");
		expect(
			deriveAgentMissingReason({
				...baseOptions,
				extraAgentsData: [{ address: OTHER_AGENT, name: "sairn", validUntil: null }],
			}),
		).toBe("local_key_not_approved");
	});

	it("explains a replaced or renamed Mobile Agent from extraAgents", () => {
		const privateKey = `0x${"11".repeat(32)}` as Hex;
		const publicKey = privateKeyToAccount(privateKey).address;
		const mobileAgent = createMobileAgentWalletRecord({
			privateKey,
			publicKey,
			agentName: "Mobile QR valid_until 10000",
			agentValidUntilMs: 10_000,
			importedAtMs: 100,
		});

		expect(
			deriveAgentMissingReason({
				...baseOptions,
				localAgent: mobileAgent,
				extraAgentsData: [{ address: OTHER_AGENT, name: "Mobile QR", validUntil: 10_000 }],
			}),
		).toBe("remote_key_replaced");
		expect(
			deriveAgentMissingReason({
				...baseOptions,
				localAgent: mobileAgent,
				extraAgentsData: [{ address: publicKey, name: "Other", validUntil: 10_000 }],
			}),
		).toBe("agent_name_mismatch");
		expect(
			deriveAgentMissingReason({
				...baseOptions,
				localAgent: mobileAgent,
				extraAgentsData: [{ address: OTHER_AGENT, name: "Mobile QR", validUntil: 999 }],
			}),
		).toBe("local_key_not_approved");
		expect(deriveAgentMissingReason({ ...baseOptions, localAgent: mobileAgent })).toBe("local_key_not_approved");
		expect(
			deriveAgentMissingReason({
				...baseOptions,
				localAgent: { ...mobileAgent, agentName: "Mobile QR valid_until 10001" },
			}),
		).toBe("invalid_local_record");
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
