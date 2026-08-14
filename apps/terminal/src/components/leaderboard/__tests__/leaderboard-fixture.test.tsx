// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { LeaderboardFixture, type LeaderboardFixtureState, resolveLeaderboardFixture } from "../leaderboard-fixture";

const mocks = vi.hoisted(() => ({ isMobile: false }));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mocks.isMobile }));

describe("LeaderboardFixture", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.isMobile = false;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("accepts only documented DEV fixture queries", () => {
		expect(resolveLeaderboardFixture("?fixture=normal", true)).toBe("normal");
		expect(resolveLeaderboardFixture("?fixture=no-results", true)).toBe("no-results");
		expect(resolveLeaderboardFixture("?fixture=unknown", true)).toBeNull();
		expect(resolveLeaderboardFixture("?fixture=normal", false)).toBeNull();
	});

	it.each([
		["normal", "normal"],
		["loading", "loading"],
		["error", "error"],
		["empty", "empty"],
		["no-results", "noResults"],
	] as const)("renders the %s fixture with a stable root state", (fixture, state) => {
		render(fixture);
		expect(container.querySelector("[data-state]")?.getAttribute("data-state")).toBe(state);
	});

	it("uses visibly different source values for every period", () => {
		render("normal");
		const periodButtons = ["24H", "7D", "30D", "All-time"];
		const snapshots = periodButtons.map((label) => {
			act(() => findButton(label).click());
			return container.querySelector("tbody tr")?.textContent;
		});

		expect(new Set(snapshots).size).toBe(periodButtons.length);
	});

	it.each([
		["desktop", false],
		["mobile", true],
	] as const)("renders complete monetary amounts without compact suffixes on %s", (_surface, isMobile) => {
		mocks.isMobile = isMobile;
		render("normal");

		expect(container.textContent).toContain("$2,450,000.00");
		expect(container.textContent).toContain("$185,000.00");
		expect(container.textContent).toContain("$18,000,000.00");
		expect(container.textContent).toContain("$100,000");
		expect(container.textContent).toContain("$10,000,000");
		expect(container.textContent).not.toMatch(/\$[\d.,]+[KMB]\b/);
	});

	function render(fixture: LeaderboardFixtureState) {
		act(() => root.render(<LeaderboardFixture key={fixture} fixture={fixture} />));
	}

	function findButton(label: string): HTMLButtonElement {
		const match = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === label);
		if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing button: ${label}`);
		return match;
	}
});
