/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

const onlineState = vi.hoisted(() => ({ value: false }));

vi.mock("@/hooks/use-mobile", () => ({
	useOnlineStatus: () => onlineState.value,
}));

import { OfflineBanner } from "@/components/trade/mobile/offline-banner";

describe("OfflineBanner touch targets", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		onlineState.value = false;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("keeps retry and dismiss on the 44px mobile target contract", () => {
		act(() => root.render(<OfflineBanner />));

		const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
		expect(buttons).toHaveLength(2);
		for (const button of buttons) expect(button.className).toContain("touch-target");
	});
});
