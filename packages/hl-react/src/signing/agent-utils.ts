import type { ExtraAgentsResponse, MaxBuilderFeeResponse } from "@nktkas/hyperliquid";

export function isAgentApproved(
	extraAgents: ExtraAgentsResponse | undefined,
	publicKey: string | undefined,
	expectedName?: string,
): boolean {
	if (!extraAgents || !publicKey) return false;
	const normalizedKey = publicKey.toLowerCase();
	const now = Date.now();
	return extraAgents.some(
		(agent) =>
			agent.address.toLowerCase() === normalizedKey &&
			(expectedName === undefined || agent.name === expectedName) &&
			(agent.validUntil ?? Number.POSITIVE_INFINITY) > now,
	);
}

export function isBuilderFeeApproved(
	maxBuilderFee: MaxBuilderFeeResponse | undefined,
	requiredFee: number | string | undefined,
): boolean {
	if (maxBuilderFee === undefined || requiredFee === undefined) return false;
	const requiredFeeNum = typeof requiredFee === "string" ? Number(requiredFee) : requiredFee;
	return maxBuilderFee >= requiredFeeNum;
}

export function convertFeeToPercentageString(fee: number | string): string {
	const feeNum = typeof fee === "string" ? Number(fee) : fee;
	const percentage = feeNum / 1000;
	return `${percentage}%`;
}
