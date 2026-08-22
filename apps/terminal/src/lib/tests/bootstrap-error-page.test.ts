// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderBootstrapErrorPage } from "@/lib/bootstrap-error-page";

describe("bootstrap error page", () => {
	beforeEach(() => {
		document.body.replaceChildren();
	});

	afterEach(() => {
		document.body.replaceChildren();
		vi.restoreAllMocks();
	});

	it("renders once and reloads only after one explicit button activation", () => {
		const onReload = vi.fn();

		renderBootstrapErrorPage({ onReload });
		const firstFallback = document.querySelector("[data-terminal-bootstrap-error]");
		renderBootstrapErrorPage({ onReload });

		expect(document.querySelectorAll("[data-terminal-bootstrap-error]")).toHaveLength(1);
		expect(document.querySelector("[data-terminal-bootstrap-error]")).toBe(firstFallback);
		expect(onReload).not.toHaveBeenCalled();

		const reloadButton = document.querySelector<HTMLButtonElement>("button");
		expect(reloadButton).not.toBeNull();
		expect(document.activeElement).toBe(reloadButton);
		reloadButton?.click();
		reloadButton?.click();

		expect(onReload).toHaveBeenCalledOnce();
	});
});
