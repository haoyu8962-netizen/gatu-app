// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiWalletCopyButton } from "@/components/api-wallet/api-wallet-copy-button";
import { ApiWalletForm } from "@/components/api-wallet/api-wallet-form";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({ isMobile: true }));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => testState.isMobile }));

describe("API wallet form accessibility", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.isMobile = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("exposes mobile validity as a labelled single-selection radio group", () => {
		const onValidityChange = vi.fn();
		act(() =>
			root.render(
				<ApiWalletForm
					pageState="normal"
					name="grid-bot"
					validityDays={90}
					canGenerate
					canAuthorize
					onNameChange={vi.fn()}
					onValidityChange={onValidityChange}
					onGenerate={vi.fn()}
					onAuthorize={vi.fn()}
					onConnect={vi.fn()}
				/>,
			),
		);

		const group = container.querySelector<HTMLElement>('[role="radiogroup"]');
		const radios = [...container.querySelectorAll<HTMLElement>('[role="radio"]')];
		const groupLabel = group?.getAttribute("aria-labelledby");

		expect(group).not.toBeNull();
		expect(groupLabel).toBeTruthy();
		expect(document.getElementById(groupLabel ?? "")?.textContent).toBe("Validity");
		expect(radios).toHaveLength(3);
		expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);

		act(() => radios[2]?.click());
		expect(onValidityChange).toHaveBeenCalledExactlyOnceWith(180);
	});

	it("keeps mobile generate and text-copy controls on the 44px touch-target contract", () => {
		act(() =>
			root.render(
				<ApiWalletForm
					pageState="normal"
					name=""
					validityDays={90}
					canGenerate
					canAuthorize={false}
					onNameChange={vi.fn()}
					onValidityChange={vi.fn()}
					onGenerate={vi.fn()}
					onAuthorize={vi.fn()}
					onConnect={vi.fn()}
				/>,
			),
		);

		const generate = [...container.querySelectorAll("button")].find((button) => button.textContent === "Generate");
		expect(generate?.className).toContain("touch-target");

		act(() => root.render(<ApiWalletCopyButton value="0x1111111111111111111111111111111111111111" />));
		const copy = container.querySelector("button");
		expect(copy?.className).toContain("touch-target");
	});

	it("retains the compact desktop select and two-column narrow-desktop grid", () => {
		testState.isMobile = false;
		act(() =>
			root.render(
				<ApiWalletForm
					pageState="normal"
					name=""
					validityDays={90}
					canGenerate
					canAuthorize={false}
					onNameChange={vi.fn()}
					onValidityChange={vi.fn()}
					onGenerate={vi.fn()}
					onAuthorize={vi.fn()}
					onConnect={vi.fn()}
				/>,
			),
		);

		expect(container.querySelector('[role="radiogroup"]')).toBeNull();
		const formGrid = [...container.querySelectorAll("div")].find((element) =>
			element.className.includes("min-[1200px]:[grid-template-columns:var(--api-wallet-form-columns)]"),
		);
		expect(formGrid?.className).toContain("grid-cols-2");
	});
});
