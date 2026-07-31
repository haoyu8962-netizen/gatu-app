import type { HyperliquidEnv } from "@gatu/hl-react";
import type { MobileAgentApproval } from "@gatu/hl-react/signing/mobile-agent";

export type DesktopApprovalRecoveryPhase = "submitting" | "pending-verification" | "approved-unrevealed";

export interface DesktopApprovalRecovery {
	approval: MobileAgentApproval;
	phase: DesktopApprovalRecoveryPhase;
	submissionErrorMessage?: string;
}

interface ReservedDesktopApprovalRecovery {
	approval: null;
	phase: "submitting";
}

type InternalDesktopApprovalRecovery = DesktopApprovalRecovery | ReservedDesktopApprovalRecovery;

type BeginDesktopApprovalSubmissionResult =
	| { status: "started"; recovery: DesktopApprovalRecovery }
	| { status: "blocked"; recovery: DesktopApprovalRecovery | null }
	| { status: "capacity" };

const recoveries = new Map<string, InternalDesktopApprovalRecovery>();
const MAX_RECOVERIES = 4;

function getRecoveryKey(env: HyperliquidEnv, ownerAddress: string): string {
	return `${env}:${ownerAddress.toLowerCase()}`;
}

export function getDesktopApprovalRecovery(
	env: HyperliquidEnv,
	ownerAddress: string,
	nowMs = Date.now(),
): DesktopApprovalRecovery | null {
	const key = getRecoveryKey(env, ownerAddress);
	const recovery = recoveries.get(key);
	if (!recovery?.approval) return null;
	if (recovery.approval.agentValidUntilMs <= nowMs) {
		recoveries.delete(key);
		return null;
	}
	return recovery;
}

export function hasDesktopApprovalRecovery(env: HyperliquidEnv, ownerAddress: string): boolean {
	return recoveries.has(getRecoveryKey(env, ownerAddress));
}

export function beginDesktopApprovalSubmission(input: {
	env: HyperliquidEnv;
	ownerAddress: string;
	createApproval: () => MobileAgentApproval;
}): BeginDesktopApprovalSubmissionResult {
	const key = getRecoveryKey(input.env, input.ownerAddress);
	if (recoveries.has(key)) {
		return {
			status: "blocked",
			recovery: getDesktopApprovalRecovery(input.env, input.ownerAddress),
		};
	}
	for (const [recoveryKey, recovery] of recoveries) {
		if (recovery.approval && recovery.approval.agentValidUntilMs <= Date.now()) recoveries.delete(recoveryKey);
	}
	if (recoveries.size >= MAX_RECOVERIES) return { status: "capacity" };

	recoveries.set(key, { phase: "submitting", approval: null });
	try {
		const recovery: DesktopApprovalRecovery = {
			phase: "submitting",
			approval: input.createApproval(),
		};
		recoveries.set(key, recovery);
		return { status: "started", recovery };
	} catch (error) {
		recoveries.delete(key);
		throw error;
	}
}

export function updateDesktopApprovalRecovery(input: {
	env: HyperliquidEnv;
	ownerAddress: string;
	expectedAgentAddress: string;
	phase: DesktopApprovalRecoveryPhase;
	submissionErrorMessage?: string;
}): boolean {
	const key = getRecoveryKey(input.env, input.ownerAddress);
	const current = recoveries.get(key);
	if (!current?.approval || current.approval.publicKey.toLowerCase() !== input.expectedAgentAddress.toLowerCase()) {
		return false;
	}

	recoveries.set(key, {
		approval: current.approval,
		phase: input.phase,
		...(input.submissionErrorMessage ? { submissionErrorMessage: input.submissionErrorMessage } : {}),
	});
	return true;
}

export function clearDesktopApprovalRecovery(
	env: HyperliquidEnv,
	ownerAddress: string,
	expectedAgentAddress?: string,
): boolean {
	const key = getRecoveryKey(env, ownerAddress);
	const current = recoveries.get(key);
	if (!current) return false;
	if (
		expectedAgentAddress &&
		(!current.approval || current.approval.publicKey.toLowerCase() !== expectedAgentAddress.toLowerCase())
	) {
		return false;
	}
	return recoveries.delete(key);
}
