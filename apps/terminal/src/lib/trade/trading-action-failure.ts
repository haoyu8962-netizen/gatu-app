import { type ActionFailure, classifyActionError } from "@/lib/errors/action-error";

/**
 * Classifies a failed trading action for storage. Keeps every exchange rejection text of a rejected
 * order batch, including texts the dictionary does not know, and returns null when nothing specific
 * is known so the caller stores its own message instead of an untranslated one.
 */
export function classifyTradingActionError(error: unknown): ActionFailure | null {
	const failure = classifyActionError(error);
	return "kind" in failure && failure.kind === "action-error" && failure.code === "unknown" ? null : failure;
}
