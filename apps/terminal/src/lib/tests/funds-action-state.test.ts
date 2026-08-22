import { describe, expect, it } from "vitest";
import {
	createFundsActionState,
	type FundsActionEvent,
	type FundsActionState,
	getFundsActionSteps,
	isFundsActionLocked,
	transitionFundsAction,
} from "@/components/funds-action/funds-action-state";

const STATES: readonly FundsActionState[] = [
	{ stage: "input", result: null },
	{ stage: "review", result: null },
	{ stage: "awaiting", result: null },
	{ stage: "submitted", result: null },
	{ stage: "reconciling", result: null },
	{ stage: "done", result: "success" },
	{ stage: "done", result: "rejected" },
	{ stage: "done", result: "apiError" },
	{ stage: "done", result: "unknown" },
];

const EVENTS: readonly FundsActionEvent[] = [
	{ type: "review" },
	{ type: "back" },
	{ type: "requestAuthorization" },
	{ type: "submissionAccepted" },
	{ type: "reconcile" },
	{ type: "resolve", result: "success" },
	{ type: "resolve", result: "rejected" },
	{ type: "resolve", result: "apiError" },
	{ type: "resolve", result: "unknown" },
	{ type: "retry" },
	{ type: "verify" },
	{ type: "reset" },
];

describe("funds action state", () => {
	it("covers the complete successful path", () => {
		let state = createFundsActionState();
		for (const event of [
			{ type: "review" } as const,
			{ type: "requestAuthorization" } as const,
			{ type: "submissionAccepted" } as const,
			{ type: "reconcile" } as const,
			{ type: "resolve", result: "success" } as const,
		]) {
			state = transitionFundsAction(state, event);
		}
		expect(state).toEqual({ stage: "done", result: "success" });
	});

	it("locks only signing, submitted, and reconciliation phases", () => {
		expect(isFundsActionLocked({ stage: "input", result: null })).toBe(false);
		expect(isFundsActionLocked({ stage: "review", result: null })).toBe(false);
		expect(isFundsActionLocked({ stage: "awaiting", result: null })).toBe(true);
		expect(isFundsActionLocked({ stage: "submitted", result: null })).toBe(true);
		expect(isFundsActionLocked({ stage: "reconciling", result: null })).toBe(true);
		expect(isFundsActionLocked({ stage: "done", result: "unknown" })).toBe(false);
	});

	it("allows explicit rejection only before submission", () => {
		expect(transitionFundsAction({ stage: "awaiting", result: null }, { type: "resolve", result: "rejected" })).toEqual(
			{
				stage: "done",
				result: "rejected",
			},
		);
		const submitted = { stage: "submitted", result: null } as const;
		expect(transitionFundsAction(submitted, { type: "resolve", result: "rejected" })).toBe(submitted);
	});

	it("routes deterministic failures back through review and unknown through read-only reconciliation", () => {
		expect(transitionFundsAction({ stage: "done", result: "apiError" }, { type: "retry" })).toEqual({
			stage: "review",
			result: null,
		});
		expect(transitionFundsAction({ stage: "done", result: "unknown" }, { type: "retry" })).toEqual({
			stage: "reconciling",
			result: null,
		});
	});

	it("keeps illegal transitions referentially unchanged", () => {
		const state = { stage: "input", result: null } as const;
		expect(transitionFundsAction(state, { type: "submissionAccepted" })).toBe(state);
		expect(transitionFundsAction(state, { type: "resolve", result: "success" })).toBe(state);
	});

	it("exhaustively covers every stage, result, and event pair", () => {
		const legalTransitions = new Map<string, FundsActionState>([
			["input:null|review", { stage: "review", result: null }],
			["review:null|back", { stage: "input", result: null }],
			["review:null|requestAuthorization", { stage: "awaiting", result: null }],
			["awaiting:null|submissionAccepted", { stage: "submitted", result: null }],
			["submitted:null|reconcile", { stage: "reconciling", result: null }],
			["awaiting:null|resolve:rejected", { stage: "done", result: "rejected" }],
			["awaiting:null|resolve:apiError", { stage: "done", result: "apiError" }],
			["submitted:null|resolve:success", { stage: "done", result: "success" }],
			["submitted:null|resolve:apiError", { stage: "done", result: "apiError" }],
			["submitted:null|resolve:unknown", { stage: "done", result: "unknown" }],
			["reconciling:null|resolve:success", { stage: "done", result: "success" }],
			["reconciling:null|resolve:apiError", { stage: "done", result: "apiError" }],
			["reconciling:null|resolve:unknown", { stage: "done", result: "unknown" }],
			["done:rejected|retry", { stage: "review", result: null }],
			["done:apiError|retry", { stage: "review", result: null }],
			["done:unknown|retry", { stage: "reconciling", result: null }],
			["done:unknown|verify", { stage: "reconciling", result: null }],
		]);

		for (const state of STATES) {
			for (const event of EVENTS) {
				const eventKey = event.type === "resolve" ? `${event.type}:${event.result}` : event.type;
				const key = `${state.stage}:${state.result ?? "null"}|${eventKey}`;
				const next = transitionFundsAction(state, event);
				if (event.type === "reset") {
					expect(next, key).toEqual({ stage: "input", result: null });
				} else if (legalTransitions.has(key)) {
					expect(next, key).toEqual(legalTransitions.get(key));
				} else {
					expect(next, key).toBe(state);
				}
			}
		}
	});

	it("reports the reviewed step sequence for every terminal result", () => {
		expect(getFundsActionSteps({ stage: "done", result: "success" })).toEqual([
			"review",
			"awaiting",
			"submitted",
			"reconciling",
			"done",
		]);
		expect(getFundsActionSteps({ stage: "done", result: "rejected" })).toEqual(["review", "awaiting", "done"]);
		expect(getFundsActionSteps({ stage: "done", result: "apiError" })).toEqual([
			"review",
			"awaiting",
			"submitted",
			"done",
		]);
		expect(getFundsActionSteps({ stage: "done", result: "unknown" })).toEqual([
			"review",
			"awaiting",
			"submitted",
			"reconciling",
			"done",
		]);
	});
});
