import { type ExtraAgent, isApiWalletExtraAgentSnapshot } from "@/lib/hyperliquid/extra-agent-snapshot";

export { type ExtraAgent, isApiWalletExtraAgentSnapshot };

export const API_WALLET_EXPIRY_DAYS = [30, 90, 180] as const;
export const API_WALLET_ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const API_WALLET_NAME_PATTERN = /^[A-Za-z0-9_-]{2,16}$/u;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export type ApiWalletExpiryDays = (typeof API_WALLET_EXPIRY_DAYS)[number];
export type ApiWalletPageState = "normal" | "empty" | "loading" | "error" | "disconnected" | "nonMaster";
export type ApiWalletAgentStatus = "active" | "expiring" | "today" | "expired" | "noExpiry";
export type ApiWalletNameValidationError = "required" | "format" | "duplicate";

export type ApiWalletExtraAgent = ExtraAgent;
export type ApiWalletAgentTuple = ExtraAgent;

export interface ApiWalletPageStateInput {
	isConnected: boolean;
	accountAddress: string | null | undefined;
	signingAddress: string | null | undefined;
	isLoading: boolean;
	isError: boolean;
	agents: readonly ExtraAgent[] | undefined;
}

export type ApiWalletNameValidation =
	| { valid: true; name: string; error: null }
	| { valid: false; name: string; error: ApiWalletNameValidationError };

export interface ApproveAgentInput {
	agentAddress: string;
	agentName: string;
}

export interface ApiWalletApproval {
	baseName: string;
	address: string;
	validUntil: number;
	approveAgent: ApproveAgentInput;
}

export interface ApiWalletRemoval {
	target: ApiWalletAgentTuple;
	approveAgent: ApproveAgentInput;
}

export function hasMatchingApiWalletIdentity(
	accountAddress: string | null | undefined,
	signingAddress: string | null | undefined,
): boolean {
	return (
		typeof accountAddress === "string" &&
		accountAddress.length > 0 &&
		typeof signingAddress === "string" &&
		signingAddress.length > 0 &&
		accountAddress.toLowerCase() === signingAddress.toLowerCase()
	);
}

export function deriveApiWalletPageState(input: ApiWalletPageStateInput): ApiWalletPageState {
	if (!input.isConnected) return "disconnected";
	if (!hasMatchingApiWalletIdentity(input.accountAddress, input.signingAddress)) return "nonMaster";
	if (input.isError) return "error";
	if (input.isLoading) return "loading";
	if (!input.agents) return "error";
	return input.agents.length === 0 ? "empty" : "normal";
}

export function isApiWalletPageOperable(state: ApiWalletPageState): boolean {
	return state === "normal" || state === "empty";
}

export function validateApiWalletName(
	name: string,
	agents: readonly Pick<ExtraAgent, "name">[] = [],
): ApiWalletNameValidation {
	const normalizedName = name.trim();
	if (normalizedName.length === 0) return { valid: false, name: normalizedName, error: "required" };
	if (!API_WALLET_NAME_PATTERN.test(normalizedName)) {
		return { valid: false, name: normalizedName, error: "format" };
	}
	const normalizedCandidate = normalizedName.toLowerCase();
	if (agents.some((agent) => agent.name.toLowerCase() === normalizedCandidate)) {
		return { valid: false, name: normalizedName, error: "duplicate" };
	}
	return { valid: true, name: normalizedName, error: null };
}

export function createApiWalletApproval(
	baseName: string,
	address: string,
	expiryDays: ApiWalletExpiryDays,
	nowMs = Date.now(),
): ApiWalletApproval {
	const nameValidation = validateApiWalletName(baseName);
	if (!nameValidation.valid) throw new Error("Invalid API wallet name");
	if (!address || address.trim() !== address) throw new Error("Invalid API wallet address");
	if (!API_WALLET_EXPIRY_DAYS.includes(expiryDays)) throw new Error("Invalid API wallet expiry");
	if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error("Invalid current time");

	const validUntil = nowMs + expiryDays * MILLISECONDS_PER_DAY;
	if (!Number.isSafeInteger(validUntil)) throw new Error("Invalid API wallet expiry");

	return {
		baseName: nameValidation.name,
		address,
		validUntil,
		approveAgent: {
			agentAddress: address,
			agentName: `${nameValidation.name} valid_until ${validUntil}`,
		},
	};
}

export function matchesApiWalletApproval(agent: ExtraAgent, approval: ApiWalletApproval): boolean {
	return (
		agent.name === approval.baseName &&
		hasSameApiWalletAddress(agent.address, approval.address) &&
		agent.validUntil === approval.validUntil
	);
}

export function createApiWalletRemoval(agent: ExtraAgent): ApiWalletRemoval {
	return {
		target: {
			name: agent.name,
			address: agent.address,
			validUntil: agent.validUntil,
		},
		approveAgent: {
			agentAddress: API_WALLET_ZERO_ADDRESS,
			agentName: agent.name,
		},
	};
}

export function isApiWalletRemovalReconciled(
	agents: readonly ExtraAgent[] | undefined,
	removal: ApiWalletRemoval,
): boolean {
	if (!agents) return false;
	return !agents.some(
		(agent) => agent.name === removal.target.name || hasSameApiWalletAddress(agent.address, removal.target.address),
	);
}

export function deriveApiWalletAgentStatus(validUntil: number | null, nowMs = Date.now()): ApiWalletAgentStatus {
	if (validUntil === null) return "noExpiry";
	if (!Number.isFinite(validUntil) || !Number.isFinite(nowMs) || validUntil <= nowMs) return "expired";

	const remainingFullDays = Math.floor((validUntil - nowMs) / MILLISECONDS_PER_DAY);
	if (remainingFullDays === 0) return "today";
	if (remainingFullDays <= 7) return "expiring";
	return "active";
}

function hasSameApiWalletAddress(left: string, right: string): boolean {
	return left.length > 0 && right.length > 0 && left.toLowerCase() === right.toLowerCase();
}
