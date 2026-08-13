import { describe, expect, it } from "vitest";
import {
	type ApiWalletActionEvent,
	type ApiWalletActionResult,
	type ApiWalletActionState,
	createApiWalletActionState,
	getApiWalletActionSteps,
	isApiWalletActionLocked,
	transitionApiWalletAction,
} from "@/components/api-wallet/api-wallet-action-state";

const ALL_EVENTS: readonly ApiWalletActionEvent[] = [
	{ type: "review" },
	{ type: "back" },
	{ type: "requestSignature" },
	{ type: "signatureAccepted" },
	{ type: "submissionAccepted" },
	{ type: "reconcile" },
	{ type: "resolve", result: "success" },
	{ type: "resolve", result: "rejected" },
	{ type: "resolve", result: "apiError" },
	{ type: "resolve", result: "unknown" },
	{ type: "acknowledgeCredentials" },
	{ type: "retry" },
];

describe("API wallet action state", () => {
	it.each(["authorize", "remove"] as const)("runs the complete %s path through reconciliation", (action) => {
		let state = createApiWalletActionState(action);
		expect(state).toEqual({ action, stage: "input", result: null, credentialsSaved: false });

		state = transitionApiWalletAction(state, { type: "review" });
		expect(state.stage).toBe("review");
		state = transitionApiWalletAction(state, { type: "requestSignature" });
		expect(state.stage).toBe("awaiting");
		state = transitionApiWalletAction(state, { type: "signatureAccepted" });
		expect(state.stage).toBe("submitted");
		state = transitionApiWalletAction(state, { type: "submissionAccepted" });
		expect(state.stage).toBe("reconciling");
		state = transitionApiWalletAction(state, { type: "resolve", result: "success" });
		expect(state).toEqual({ action, stage: "done", result: "success", credentialsSaved: false });
	});

	it("allows review to return to input before signing", () => {
		const input = createApiWalletActionState("authorize");
		const review = transitionApiWalletAction(input, { type: "review" });
		expect(transitionApiWalletAction(review, { type: "back" })).toEqual(input);
	});

	it("records a wallet rejection at awaiting and retries from review", () => {
		const awaiting = stateAt("awaiting");
		const done = transitionApiWalletAction(awaiting, { type: "resolve", result: "rejected" });

		expect(done).toMatchObject({ stage: "done", result: "rejected" });
		expect(transitionApiWalletAction(done, { type: "retry" })).toMatchObject({
			stage: "review",
			result: null,
		});
	});

	it("records an API rejection at submitted and retries from review", () => {
		const submitted = stateAt("submitted");
		const done = transitionApiWalletAction(submitted, { type: "resolve", result: "apiError" });

		expect(done).toMatchObject({ stage: "done", result: "apiError" });
		expect(transitionApiWalletAction(done, { type: "retry" })).toMatchObject({
			stage: "review",
			result: null,
		});
	});

	it("retries an unknown submission only by returning to read-only reconciliation", () => {
		const submitted = stateAt("submitted");
		const unknown = transitionApiWalletAction(submitted, { type: "resolve", result: "unknown" });
		const retrying = transitionApiWalletAction(unknown, { type: "retry" });

		expect(retrying).toMatchObject({ stage: "reconciling", result: null });
		expect(transitionApiWalletAction(unknown, { type: "requestSignature" })).toBe(unknown);
		expect(transitionApiWalletAction(retrying, { type: "resolve", result: "unknown" })).toMatchObject({
			stage: "done",
			result: "unknown",
		});
		expect(transitionApiWalletAction(retrying, { type: "resolve", result: "success" })).toMatchObject({
			stage: "done",
			result: "success",
		});
	});

	it("accepts the explicit reconcile event for submission and unknown-result reads", () => {
		const reconciling = transitionApiWalletAction(stateAt("submitted"), { type: "reconcile" });
		expect(reconciling.stage).toBe("reconciling");

		const unknown = doneState("unknown");
		expect(transitionApiWalletAction(unknown, { type: "reconcile" }).stage).toBe("reconciling");
	});

	it("requires an explicit credential-saved acknowledgement only after authorize success", () => {
		const authorizeSuccess = doneState("success", "authorize");
		const acknowledged = transitionApiWalletAction(authorizeSuccess, { type: "acknowledgeCredentials" });

		expect(acknowledged.credentialsSaved).toBe(true);
		expect(transitionApiWalletAction(acknowledged, { type: "acknowledgeCredentials" })).toBe(acknowledged);

		const removeSuccess = doneState("success", "remove");
		expect(transitionApiWalletAction(removeSuccess, { type: "acknowledgeCredentials" })).toBe(removeSuccess);
	});

	it.each([
		["input", false],
		["review", false],
		["awaiting", true],
		["submitted", true],
		["reconciling", true],
		["done", false],
	] as const)("reports the %s stage lock as %s", (stage, expected) => {
		const state = stage === "done" ? doneState("success") : stateAt(stage);
		expect(isApiWalletActionLocked(state)).toBe(expected);
	});
});

describe("API wallet action transitions", () => {
	it.each([
		[stateAt("input"), ["review"]],
		[stateAt("review"), ["back", "requestSignature"]],
		[stateAt("awaiting"), ["signatureAccepted", "resolve:rejected"]],
		[stateAt("submitted"), ["submissionAccepted", "reconcile", "resolve:apiError", "resolve:unknown"]],
		[stateAt("reconciling"), ["resolve:success", "resolve:unknown"]],
		[doneState("success", "authorize"), ["acknowledgeCredentials"]],
		[doneState("success", "remove"), []],
		[doneState("rejected"), ["retry"]],
		[doneState("apiError"), ["retry"]],
		[doneState("unknown"), ["reconcile", "retry"]],
	] as const)("changes only for the legal events from $stage/$result", (state, legalKeys) => {
		for (const event of ALL_EVENTS) {
			const next = transitionApiWalletAction(state, event);
			if (legalKeys.includes(eventKey(event) as never)) expect(next).not.toBe(state);
			else expect(next).toBe(state);
		}
	});
});

describe("API wallet action step status", () => {
	it("tracks each active stage along the success path", () => {
		expect(stepStatuses(stateAt("input"))).toEqual(["pending", "pending", "pending", "pending"]);
		expect(stepStatuses(stateAt("review"))).toEqual(["active", "pending", "pending", "pending"]);
		expect(stepStatuses(stateAt("awaiting"))).toEqual(["complete", "active", "pending", "pending"]);
		expect(stepStatuses(stateAt("submitted"))).toEqual(["complete", "complete", "active", "pending"]);
		expect(stepStatuses(stateAt("reconciling"))).toEqual(["complete", "complete", "complete", "active"]);
		expect(stepStatuses(doneState("success"))).toEqual(["complete", "complete", "complete", "complete"]);
	});

	it.each([
		["rejected", ["complete", "failed", "pending", "pending"]],
		["apiError", ["complete", "complete", "failed", "pending"]],
		["unknown", ["complete", "complete", "active", "pending"]],
	] as const)("renders the %s result at the correct failure step", (result, expected) => {
		expect(stepStatuses(doneState(result))).toEqual(expected);
	});
});

function stateAt(stage: Exclude<ApiWalletActionState["stage"], "done">): ApiWalletActionState {
	return { action: "authorize", stage, result: null, credentialsSaved: false };
}

function doneState(
	result: ApiWalletActionResult,
	action: ApiWalletActionState["action"] = "authorize",
): ApiWalletActionState {
	return { action, stage: "done", result, credentialsSaved: false };
}

function eventKey(event: ApiWalletActionEvent): string {
	return event.type === "resolve" ? `${event.type}:${event.result}` : event.type;
}

function stepStatuses(state: ApiWalletActionState): string[] {
	return getApiWalletActionSteps(state).map((step) => step.status);
}
