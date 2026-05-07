export type OrderOutcome = "filled" | "resting" | "triggerSet" | "twapStarted";

export function extractStatusErrors(statuses: unknown[]): string[] {
	const errors: string[] = [];
	for (const status of statuses) {
		if (status && typeof status === "object" && "error" in status && typeof status.error === "string") {
			errors.push(status.error);
		}
	}
	return errors;
}

export function deriveOrderOutcome(statuses: unknown[]): OrderOutcome {
	const primary = statuses[0];
	if (primary === "waitingForTrigger") return "triggerSet";
	if (primary === "waitingForFill") return "resting";
	if (primary && typeof primary === "object") {
		if ("resting" in primary) return "resting";
		if ("filled" in primary) return "filled";
	}
	return "filled";
}
