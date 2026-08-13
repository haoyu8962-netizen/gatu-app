// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { resolveStakingFixture, StakingFixture, type StakingFixtureState } from "../staking-fixture";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

describe("StakingFixture", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("accepts only documented DEV fixture queries", () => {
		expect(resolveStakingFixture("?fixture=normal", true)).toBe("normal");
		expect(resolveStakingFixture("?fixture=unknown", true)).toBeNull();
		expect(resolveStakingFixture("?fixture=normal", false)).toBeNull();
	});

	it.each(["normal", "loading", "error", "empty"] as const)(
		"renders the %s fixture with a stable root state",
		(fixture) => {
			render(fixture);
			expect(container.querySelector("[data-state]")?.getAttribute("data-state")).toBe(fixture);
		},
	);

	it("uses placeholder-only normal data and a definitive empty view", () => {
		render("normal");
		expect(container.textContent).toContain("Sample Active Validator");
		expect(container.textContent).toContain("Placeholder validator data for visual review");

		render("empty");
		expect(container.textContent).toContain("No validators found");
	});

	function render(fixture: StakingFixtureState) {
		act(() => root.render(<StakingFixture key={fixture} fixture={fixture} />));
	}
});
