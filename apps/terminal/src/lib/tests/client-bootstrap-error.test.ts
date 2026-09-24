// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("client bootstrap error handling", () => {
	beforeEach(() => {
		vi.resetModules();
		document.body.replaceChildren();
		window.history.replaceState(null, "", "/");
	});

	afterEach(() => {
		vi.doUnmock("../error-reporting/client");
		vi.doUnmock("../../client-hydrate");
		vi.restoreAllMocks();
		window.history.replaceState(null, "", "/");
		document.body.replaceChildren();
	});

	it("reports a hydration import failure and renders a dependency-free safe fallback", async () => {
		const installGlobalErrorReporting = vi.fn(() => () => {});
		const reportClientError = vi.fn();
		vi.doMock("../error-reporting/client", () => ({
			installGlobalErrorReporting,
			reportClientError,
		}));
		vi.doMock("../../client-hydrate", () => {
			throw new Error("private bootstrap detail");
		});

		await import("../../client");
		await vi.waitFor(() => expect(document.querySelector('[role="alert"]')).not.toBeNull());

		expect(installGlobalErrorReporting).toHaveBeenCalledOnce();
		expect(reportClientError).toHaveBeenCalledWith(expect.any(Error), { kind: "react_uncaught" });
		expect(document.body.textContent).toContain("The terminal could not start safely.");
		expect(document.body.textContent).not.toContain("private bootstrap detail");
	});

	it("still renders the safe fallback if the minimal telemetry module cannot load", async () => {
		vi.doMock("../error-reporting/client", () => {
			throw new Error("private telemetry detail");
		});
		vi.doMock("../../client-hydrate", () => ({}));

		await import("../../client");
		await vi.waitFor(() => expect(document.querySelector('[role="alert"]')).not.toBeNull());

		expect(document.body.textContent).toContain("The terminal could not start safely.");
		expect(document.body.textContent).not.toContain("private telemetry detail");
	});
});
