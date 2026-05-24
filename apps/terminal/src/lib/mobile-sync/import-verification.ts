import type { AgentWallet } from "@hypeterminal/hl-react";
import { createMobileAgentWalletRecord, verifyMobileAgent } from "@hypeterminal/hl-react/signing/mobile-agent";
import type { ExtraAgentsResponse } from "@nktkas/hyperliquid";
import { type HyperliquidEnvName, type ImportedMobileAgent, MobileSyncError } from "./sync-core";

export type MobileSyncImportErrorCode = "unapproved_agent";

export class MobileSyncImportError extends Error {
	readonly code: MobileSyncImportErrorCode;

	constructor(code: MobileSyncImportErrorCode) {
		super(code === "unapproved_agent" ? "Phone link is not approved" : "Phone access import failed");
		this.name = "MobileSyncImportError";
		this.code = code;
	}
}

export interface VerifyImportedMobileAgentInput {
	imported: ImportedMobileAgent;
	extraAgents: ExtraAgentsResponse;
	expectedUserAddress: string;
	expectedEnv?: HyperliquidEnvName;
	nowMs?: number;
}

export function verifyImportedMobileAgent({
	imported,
	extraAgents,
	expectedUserAddress,
	expectedEnv,
	nowMs = Date.now(),
}: VerifyImportedMobileAgentInput): AgentWallet {
	if (expectedEnv && imported.env !== expectedEnv) {
		throw new MobileSyncError("env_mismatch");
	}
	if (!expectedUserAddress || imported.userAddress.toLowerCase() !== expectedUserAddress.toLowerCase()) {
		throw new MobileSyncError("account_mismatch");
	}

	const localAgent = createMobileAgentWalletRecord({
		privateKey: imported.agentPrivateKey,
		publicKey: imported.agentAddress,
		agentName: imported.agentName,
		agentValidUntilMs: imported.agentValidUntilMs,
		importedAtMs: imported.importedAtMs,
		syncId: imported.syncId,
	});
	const verification = verifyMobileAgent(localAgent, extraAgents, nowMs);

	if (
		verification.status !== "approved" ||
		verification.remoteAgent.name !== imported.agentName ||
		verification.remoteAgent.validUntil !== imported.agentValidUntilMs
	) {
		throw new MobileSyncImportError("unapproved_agent");
	}

	return localAgent;
}

export function isMobileSyncImportError(error: unknown): error is MobileSyncImportError {
	return error instanceof MobileSyncImportError;
}
