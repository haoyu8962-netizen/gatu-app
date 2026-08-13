// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createI18nRoot } from "@/lib/tests/harness/react";
import {
	resolveVaultDetailFixture,
	resolveVaultsFixture,
	VaultDetailFixture,
	VaultsFixture,
	type VaultsFixtureState,
} from "../vaults-fixture";

describe("Vault fixtures", () => {
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
		expect(resolveVaultsFixture("?fixture=normal", true)).toBe("normal");
		expect(resolveVaultsFixture("?fixture=unknown", true)).toBeNull();
		expect(resolveVaultsFixture("?fixture=normal", false)).toBeNull();
		expect(resolveVaultDetailFixture("?fixture=normal", true)).toBe("normal");
		expect(resolveVaultDetailFixture("?fixture=loading", true)).toBeNull();
		expect(resolveVaultDetailFixture("?fixture=normal", false)).toBeNull();
	});

	it.each(["normal", "loading", "error", "empty"] as const)(
		"renders the %s list fixture with a stable root state",
		(fixture) => {
			renderList(fixture);
			expect(container.querySelector("[data-state]")?.getAttribute("data-state")).toBe(fixture);
		},
	);

	it("keeps fixture classification fail-closed", () => {
		renderList("normal");
		expect(container.textContent).toContain("Rows remain unclassified instead of being guessed");
		expect(container.textContent).not.toContain("Official Vaults");
	});

	it("renders a placeholder-only normal detail fixture", () => {
		act(() => root.render(<VaultDetailFixture />));
		expect(container.querySelector("[data-state='normal']")).not.toBeNull();
		expect(container.textContent).toContain("Sample Core Vault");
		expect(container.textContent).toContain("Placeholder Vault data for visual review");
	});

	function renderList(fixture: VaultsFixtureState) {
		act(() => root.render(<VaultsFixture key={fixture} fixture={fixture} />));
	}
});
