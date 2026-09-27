// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("client root fatal fallback", () => {
	beforeEach(() => {
		vi.resetModules();
		window.localStorage.clear();
		document.body.innerHTML = "<main>Server shell</main>";
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.doUnmock("@gatu/hl-react/internal/exchange/request-scheduler");
		vi.doUnmock("@tanstack/react-start/client");
		vi.doUnmock("react-dom/client");
		vi.doUnmock("../error-reporting/client");
		vi.restoreAllMocks();
		window.localStorage.clear();
		document.body.replaceChildren();
	});

	it("replaces a root-level uncaught hydration failure after invalidating and reporting it", async () => {
		const privateFailure = new Error("private root failure detail");
		const invalidateAllExchangeRequestIdentities = vi.fn();
		const reportClientError = vi.fn();
		vi.doMock("@gatu/hl-react/internal/exchange/request-scheduler", () => ({
			invalidateAllExchangeRequestIdentities,
		}));
		vi.doMock("@tanstack/react-start/client", () => ({
			StartClient: () => {
				throw privateFailure;
			},
		}));
		vi.doMock("../error-reporting/client", () => ({ reportClientError }));

		await import("../../client-hydrate");
		await vi.waitFor(() => expect(document.querySelector("[data-terminal-bootstrap-error]")).not.toBeNull());

		expect(invalidateAllExchangeRequestIdentities).toHaveBeenCalledOnce();
		expect(reportClientError).toHaveBeenCalledWith(privateFailure, {
			kind: "react_uncaught",
			componentStack: expect.any(String),
		});
		expect(document.body.textContent).toContain("The terminal could not start safely.");
		expect(document.body.textContent).not.toContain(privateFailure.message);
	});

	it("invalidates, reports, unmounts, and renders only once when React repeats the root callback", async () => {
		const invalidateAllExchangeRequestIdentities = vi.fn();
		const reportClientError = vi.fn();
		const unmount = vi.fn();
		let onUncaughtError: ((error: unknown, info: { componentStack: string }) => void) | undefined;
		vi.doMock("@gatu/hl-react/internal/exchange/request-scheduler", () => ({
			invalidateAllExchangeRequestIdentities,
		}));
		vi.doMock("@tanstack/react-start/client", () => ({ StartClient: () => null }));
		vi.doMock("react-dom/client", () => ({
			hydrateRoot: vi.fn((...args: unknown[]) => {
				const options = args[2] as { onUncaughtError: typeof onUncaughtError };
				onUncaughtError = options.onUncaughtError;
				return { unmount };
			}),
		}));
		vi.doMock("../error-reporting/client", () => ({ reportClientError }));

		await import("../../client-hydrate");
		const privateFailure = new Error("private repeated root detail");
		onUncaughtError?.(privateFailure, { componentStack: "root stack" });
		onUncaughtError?.(privateFailure, { componentStack: "root stack" });
		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(invalidateAllExchangeRequestIdentities).toHaveBeenCalledOnce();
		expect(reportClientError).toHaveBeenCalledOnce();
		expect(unmount).toHaveBeenCalledOnce();
		expect(document.querySelectorAll("[data-terminal-bootstrap-error]")).toHaveLength(1);
		expect(document.body.textContent).not.toContain(privateFailure.message);
	});
});
