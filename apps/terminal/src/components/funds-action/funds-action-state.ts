export type FundsActionStage = "input" | "review" | "awaiting" | "submitted" | "reconciling" | "done";
export type FundsActionResult = "success" | "rejected" | "apiError" | "unknown";

export interface FundsActionState {
	stage: FundsActionStage;
	result: FundsActionResult | null;
}

export type FundsActionEvent =
	| { type: "review" }
	| { type: "back" }
	| { type: "requestAuthorization" }
	| { type: "submissionAccepted" }
	| { type: "reconcile" }
	| { type: "resolve"; result: FundsActionResult }
	| { type: "retry" }
	| { type: "verify" }
	| { type: "reset" };

export function createFundsActionState(): FundsActionState {
	return { stage: "input", result: null };
}

export function isFundsActionLocked(state: FundsActionState): boolean {
	return state.stage === "awaiting" || state.stage === "submitted" || state.stage === "reconciling";
}

export function transitionFundsAction(state: FundsActionState, event: FundsActionEvent): FundsActionState {
	if (event.type === "reset") return createFundsActionState();

	if (state.stage === "input" && event.type === "review") return { stage: "review", result: null };
	if (state.stage === "review" && event.type === "back") return { stage: "input", result: null };
	if (state.stage === "review" && event.type === "requestAuthorization") {
		return { stage: "awaiting", result: null };
	}
	if (state.stage === "awaiting" && event.type === "submissionAccepted") {
		return { stage: "submitted", result: null };
	}
	if (state.stage === "submitted" && event.type === "reconcile") {
		return { stage: "reconciling", result: null };
	}
	if (
		(state.stage === "awaiting" || state.stage === "submitted" || state.stage === "reconciling") &&
		event.type === "resolve" &&
		isResolutionAllowed(state.stage, event.result)
	) {
		return { stage: "done", result: event.result };
	}
	if (
		state.stage === "done" &&
		event.type === "retry" &&
		(state.result === "rejected" || state.result === "apiError")
	) {
		return { stage: "review", result: null };
	}
	if (state.stage === "done" && (event.type === "verify" || event.type === "retry") && state.result === "unknown") {
		return { stage: "reconciling", result: null };
	}

	return state;
}

function isResolutionAllowed(stage: FundsActionStage, result: FundsActionResult): boolean {
	if (stage === "awaiting") return result === "rejected" || result === "apiError";
	if (stage === "submitted" || stage === "reconciling") {
		return result === "success" || result === "apiError" || result === "unknown";
	}
	return false;
}

export function getFundsActionSteps(state: FundsActionState): readonly FundsActionStage[] {
	const steps: readonly FundsActionStage[] = ["review", "awaiting", "submitted", "reconciling", "done"];
	return steps.filter((stage) => {
		if (state.stage !== "done" || state.result === "success") return true;
		if (state.result === "rejected") return stage === "review" || stage === "awaiting" || stage === "done";
		if (state.result === "apiError") return stage !== "reconciling";
		return true;
	});
}
