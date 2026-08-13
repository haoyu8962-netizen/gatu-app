export type ApiWalletAction = "authorize" | "remove";
export type ApiWalletActionStage = "input" | "review" | "awaiting" | "submitted" | "reconciling" | "done";
export type ApiWalletActionResult = "success" | "rejected" | "apiError" | "unknown";
export type ApiWalletActionStepStage = "review" | "awaiting" | "submitted" | "reconciling";
export type ApiWalletActionStepStatus = "complete" | "active" | "pending" | "failed";

export interface ApiWalletActionState {
	action: ApiWalletAction;
	stage: ApiWalletActionStage;
	result: ApiWalletActionResult | null;
	credentialsSaved: boolean;
}

export type ApiWalletActionEvent =
	| { type: "review" }
	| { type: "back" }
	| { type: "requestSignature" }
	| { type: "signatureAccepted" }
	| { type: "submissionAccepted" }
	| { type: "reconcile" }
	| { type: "resolve"; result: ApiWalletActionResult }
	| { type: "acknowledgeCredentials" }
	| { type: "retry" };

export interface ApiWalletActionStep {
	stage: ApiWalletActionStepStage;
	status: ApiWalletActionStepStatus;
}

const PROGRESS_STAGES: readonly ApiWalletActionStepStage[] = ["review", "awaiting", "submitted", "reconciling"];

export function createApiWalletActionState(action: ApiWalletAction): ApiWalletActionState {
	return { action, stage: "input", result: null, credentialsSaved: false };
}

export function transitionApiWalletAction(
	state: ApiWalletActionState,
	event: ApiWalletActionEvent,
): ApiWalletActionState {
	if (state.stage === "input" && event.type === "review") return moveToStage(state, "review");

	if (state.stage === "review") {
		if (event.type === "back") return moveToStage(state, "input");
		if (event.type === "requestSignature") return moveToStage(state, "awaiting");
		return state;
	}

	if (state.stage === "awaiting") {
		if (event.type === "signatureAccepted") return moveToStage(state, "submitted");
		if (event.type === "resolve" && event.result === "rejected") return finishWithResult(state, event.result);
		return state;
	}

	if (state.stage === "submitted") {
		if (event.type === "submissionAccepted" || event.type === "reconcile") {
			return moveToStage(state, "reconciling");
		}
		if (event.type === "resolve" && (event.result === "apiError" || event.result === "unknown")) {
			return finishWithResult(state, event.result);
		}
		return state;
	}

	if (state.stage === "reconciling") {
		if (event.type === "resolve" && (event.result === "success" || event.result === "unknown")) {
			return finishWithResult(state, event.result);
		}
		return state;
	}

	if (state.stage === "done") {
		if (
			event.type === "acknowledgeCredentials" &&
			state.action === "authorize" &&
			state.result === "success" &&
			!state.credentialsSaved
		) {
			return { ...state, credentialsSaved: true };
		}
		if (state.result === "unknown" && (event.type === "retry" || event.type === "reconcile")) {
			return moveToStage(state, "reconciling");
		}
		if ((state.result === "rejected" || state.result === "apiError") && event.type === "retry") {
			return moveToStage(state, "review");
		}
	}

	return state;
}

export function isApiWalletActionLocked(state: ApiWalletActionState): boolean {
	return state.stage === "awaiting" || state.stage === "submitted" || state.stage === "reconciling";
}

export function getApiWalletActionSteps(state: ApiWalletActionState): readonly ApiWalletActionStep[] {
	if (state.stage === "done") return getCompletedActionSteps(state.result);

	const currentIndex = PROGRESS_STAGES.indexOf(state.stage as ApiWalletActionStepStage);
	return PROGRESS_STAGES.map((stage, index) => ({
		stage,
		status: index < currentIndex ? "complete" : index === currentIndex ? "active" : "pending",
	}));
}

function moveToStage(state: ApiWalletActionState, stage: ApiWalletActionStage): ApiWalletActionState {
	return { ...state, stage, result: null, credentialsSaved: false };
}

function finishWithResult(state: ApiWalletActionState, result: ApiWalletActionResult): ApiWalletActionState {
	return { ...state, stage: "done", result, credentialsSaved: false };
}

function getCompletedActionSteps(result: ApiWalletActionResult | null): readonly ApiWalletActionStep[] {
	if (result === "success") return PROGRESS_STAGES.map((stage) => ({ stage, status: "complete" }));
	if (result === "rejected") return failureSteps("awaiting", "failed");
	if (result === "apiError") return failureSteps("submitted", "failed");
	if (result === "unknown") return failureSteps("submitted", "active");
	return PROGRESS_STAGES.map((stage) => ({ stage, status: "pending" }));
}

function failureSteps(
	failureStage: ApiWalletActionStepStage,
	failureStatus: Extract<ApiWalletActionStepStatus, "failed" | "active">,
): readonly ApiWalletActionStep[] {
	const failureIndex = PROGRESS_STAGES.indexOf(failureStage);
	return PROGRESS_STAGES.map((stage, index) => ({
		stage,
		status: index < failureIndex ? "complete" : index === failureIndex ? failureStatus : "pending",
	}));
}
