// @vitest-environment jsdom

import { act, Component, type ReactNode, useState } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	UserMenuModalErrorBoundary,
	UserMenuModalLoadingFallback,
} from "@/components/trade/header/user-menu-modal-boundary";
import { loadUserMenuModalModule, UserMenuModalLoadError } from "@/components/trade/header/user-menu-modal-load";
import { createI18nRoot } from "./harness/react";

const reporting = vi.hoisted(() => ({
	reportClientError: vi.fn(),
}));

vi.mock("@/lib/error-reporting/client", () => reporting);

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const CHUNK_FAILURE = new UserMenuModalLoadError(new Error("private chunk failure detail"));
const RUNTIME_FAILURE = new Error("wallet modal runtime failure");

function BrokenModalChunk({ shouldThrow }: { shouldThrow: boolean }) {
	if (shouldThrow) throw CHUNK_FAILURE;
	return <div data-testid="recovered-modal">Recovered modal</div>;
}

function BrokenModalRuntime(): never {
	throw RUNTIME_FAILURE;
}

class TestOuterBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
	override state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	override render() {
		return this.state.hasError ? <div data-testid="outer-error-boundary">Fatal error</div> : this.props.children;
	}
}

function RetryHarness() {
	const [attempt, setAttempt] = useState(0);

	return (
		<>
			<button data-testid="terminal-control" type="button">
				Terminal control
			</button>
			<UserMenuModalErrorBoundary
				key={attempt}
				onOpenChange={vi.fn()}
				onRetry={() => setAttempt((current) => current + 1)}
				open
				presentation="modal"
			>
				<BrokenModalChunk shouldThrow={attempt === 0} />
			</UserMenuModalErrorBoundary>
		</>
	);
}

function LoadingHarness({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
	const [open, setOpen] = useState(true);

	function handleOpenChange(nextOpen: boolean) {
		setOpen(nextOpen);
		onOpenChange(nextOpen);
	}

	return (
		<>
			<button data-testid="terminal-control" type="button">
				Terminal control
			</button>
			<UserMenuModalLoadingFallback onOpenChange={handleOpenChange} open={open} presentation="modal" />
		</>
	);
}

async function dispatchEscape() {
	await act(async () => {
		document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
		await Promise.resolve();
	});
}

describe("user menu lazy modal boundary", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockReturnValue({
				addEventListener: vi.fn(),
				matches: false,
				removeEventListener: vi.fn(),
			}),
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		reporting.reportClientError.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
	});

	it("uses a real modal boundary for pending chunks and restores Escape dismissal", async () => {
		const onOpenChange = vi.fn();
		await act(async () => {
			root.render(<LoadingHarness onOpenChange={onOpenChange} />);
		});

		const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
		const terminalControl = container.querySelector<HTMLElement>('[data-testid="terminal-control"]');
		expect(dialog).not.toBeNull();
		expect(document.querySelector('[data-testid="user-menu-modal-loading-fallback"]')).not.toBeNull();
		await act(async () => {
			await vi.waitFor(() => expect(dialog?.contains(document.activeElement)).toBe(true));
		});
		expect(terminalControl?.closest("[inert], [aria-hidden='true']")).not.toBeNull();

		await dispatchEscape();
		expect(onOpenChange).toHaveBeenCalledWith(false);
		await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
	});

	it("keeps the terminal mounted and recovers locally when retry resets the boundary key", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		await act(async () => {
			root.render(<RetryHarness />);
		});

		await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
		expect(container.querySelector('[data-testid="terminal-control"]')).not.toBeNull();
		expect(document.body.textContent).toContain("Something went wrong");
		expect(document.body.textContent).not.toContain(CHUNK_FAILURE.message);
		expect(reporting.reportClientError).toHaveBeenCalledWith(
			CHUNK_FAILURE,
			expect.objectContaining({ kind: "react_boundary" }),
		);

		const retryButton = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Try again",
		);
		expect(retryButton).toBeDefined();
		act(() => retryButton?.click());

		await vi.waitFor(() => expect(container.querySelector('[data-testid="recovered-modal"]')).not.toBeNull());
		expect(container.querySelector('[data-testid="terminal-control"]')).not.toBeNull();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it("rethrows loaded modal runtime errors to the application-level boundary", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		await act(async () => {
			root.render(
				<TestOuterBoundary>
					<UserMenuModalErrorBoundary onOpenChange={vi.fn()} onRetry={vi.fn()} open presentation="modal">
						<BrokenModalRuntime />
					</UserMenuModalErrorBoundary>
				</TestOuterBoundary>,
			);
		});

		expect(container.querySelector('[data-testid="outer-error-boundary"]')).not.toBeNull();
		expect(document.body.textContent).not.toContain("Something went wrong");
		expect(reporting.reportClientError).not.toHaveBeenCalled();
	});

	it("tags importer failures while preserving stale-chunk detection messages", async () => {
		const cause = new Error("Failed to fetch dynamically imported module: /assets/wallet-modal.js");
		let received: unknown;

		try {
			await loadUserMenuModalModule(() => Promise.reject(cause));
		} catch (error) {
			received = error;
		}

		expect(received).toBeInstanceOf(UserMenuModalLoadError);
		expect(received).toMatchObject({ cause, message: cause.message });
	});
});
