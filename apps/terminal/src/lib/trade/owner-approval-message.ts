import { msg } from "@lingui/core/macro";

/**
 * An Agent-only phone session cannot sign Agent or builder-fee approvals, which belong to the
 * master wallet, so every surface that needs one shows this single desktop-required reason.
 */
export const AGENT_ONLY_OWNER_APPROVAL_MESSAGE = msg`This phone uses a desktop-approved trading key. Finish trading authorization on desktop first by placing a first order there.`;
