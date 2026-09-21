import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

const STAKING_ACTION_ERROR_MESSAGES: Record<string, MessageDescriptor> = {
	rejected: msg`The master wallet rejected the authorization.`,
	preflightFailed: msg`Fresh eligibility or account data could not be verified. Review and try again.`,
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
