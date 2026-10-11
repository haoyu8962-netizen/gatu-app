const AGENT_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/u;

export interface ExtraAgent {
	address: string;
	name: string;
	validUntil: number | null;
}

export function isApiWalletExtraAgentSnapshot(value: unknown): value is readonly ExtraAgent[] {
	return Array.isArray(value) && value.every(isExtraAgent);
}

function isExtraAgent(value: unknown): value is ExtraAgent {
	if (typeof value !== "object" || value === null) return false;
	const agent = value as Record<string, unknown>;
	if (typeof agent.name !== "string") return false;
	if (typeof agent.address !== "string" || !AGENT_ADDRESS_PATTERN.test(agent.address)) return false;
	if (agent.validUntil === null) return true;
	return (
		typeof agent.validUntil === "number" &&
		Number.isSafeInteger(agent.validUntil) &&
		agent.validUntil >= 0 &&
		Number.isFinite(new Date(agent.validUntil).getTime())
	);
}
