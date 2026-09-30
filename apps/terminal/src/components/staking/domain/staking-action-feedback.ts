import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { StakingActionKind } from "./staking";

const PREFLIGHT_FAILED = msg`Fresh eligibility or account data could not be verified. Review and try again.`;

const STAKING_ACTION_ERROR_MESSAGES: Record<string, MessageDescriptor> = {
	rejected: msg`The master wallet rejected the authorization.`,
	preflightFailed: PREFLIGHT_FAILED,
	apiError: msg`Hyperliquid rejected the verified public request.`,
	statusUnknown: msg`Hyperliquid history has not confirmed this operation. Do not submit it again.`,
};

export function formatStakingActionError(
	code: string | null | undefined,
	translate: (descriptor: MessageDescriptor) => string,
): string | undefined {
	if (!code || !Object.hasOwn(STAKING_ACTION_ERROR_MESSAGES, code)) return undefined;
	const descriptor = STAKING_ACTION_ERROR_MESSAGES[code];
	return descriptor ? translate(descriptor) : undefined;
}

export function getStakingActionSuccessMessage(kind: StakingActionKind, amount: string): MessageDescriptor {
	switch (kind) {
		case "cDeposit":
			return msg`Moved ${amount} HYPE to staking`;
		case "cWithdraw":
			return msg`Started moving ${amount} HYPE to Spot`;
		case "delegate":
			return msg`Delegated ${amount} HYPE`;
		case "undelegate":
			return msg`Undelegated ${amount} HYPE`;
	}
}

export function getStakingActionFailureNotice(
	result: "rejected" | "apiError",
	code: string | null | undefined,
): { title: MessageDescriptor; description: MessageDescriptor } {
	if (result === "rejected")
		return { title: msg`Authorization rejected`, description: msg`No operation was submitted.` };
	if (code === "preflightFailed") return { title: msg`Request not submitted`, description: PREFLIGHT_FAILED };
	return { title: msg`Request rejected`, description: msg`No changes were made.` };
}
