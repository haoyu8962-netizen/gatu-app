// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
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
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	it("names the search clear button in the active language", () => {
		render("no-results");
		const clearButton = container.querySelector('button[aria-label="Clear search"]');
		expect(clearButton).not.toBeNull();

		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: { [createHash("sha256").update("Clear search\x1f").digest("base64").slice(0, 6)]: "清除搜索" },
			}),
		);

		expect(container.querySelector('button[aria-label="清除搜索"]')).toBe(clearButton);
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
		["paused", "paused"],
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
