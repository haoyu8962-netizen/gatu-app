/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "@/lib/tests/harness/react";

const mocks = vi.hoisted(() => ({ reportClientError: vi.fn() }));

vi.mock("@/lib/error-reporting/client", () => ({ reportClientError: mocks.reportClientError }));

vi.mock("@sairn/ui", () => ({
	AdaptiveModal: ({
		children,
		open,
		onOpenChange,
		closeLabel,
	}: {
		children: ReactNode;
		open: boolean;
		onOpenChange: (open: boolean) => void;
		closeLabel: string;
	}) =>
		open ? (
			<div role="dialog">
				<button type="button" onClick={() => onOpenChange(false)}>
					{closeLabel}
				</button>
				{children}
			</div>
		) : null,
	Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
	ModalContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	ModalFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	ModalHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	ModalTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

import { LazyDialogHost } from "@/components/ui/lazy-dialog-host";
import { createRetryableLazyComponent } from "@/lib/lazy";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

interface DialogProps {
	open: boolean;
}

function RealDialog({ open }: DialogProps) {
	return <p data-testid="real-dialog">{open ? "dialog open" : "dialog closed"}</p>;
}

type DialogModule = { RealDialog: typeof RealDialog };

function createDeferred<T>() {
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((onResolve) => {
		resolve = onResolve;
	});
	return { promise, resolve };
}

async function settle() {
	await act(async () => {
		await new Promise((resolve) => window.setTimeout(resolve, 0));
	});
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement | undefined {
	return [...container.querySelectorAll("button")].find((button) => button.textContent === label);
}

const CHUNK_ERROR = new Error("Failed to fetch dynamically imported module: /assets/margin-mode-modal.js");

describe("LazyDialogHost with a retryable lazy dialog", () => {
	let container: HTMLDivElement;
	let root: ReturnType<typeof createI18nRoot>;
	const onOpenChange = vi.fn<(open: boolean) => void>();

	async function render(Dialog: (props: DialogProps) => ReactNode, open: boolean) {
		await act(async () => {
			root.render(
				<LazyDialogHost open={open} onOpenChange={onOpenChange} presentation="modal">
					<Dialog open={open} />
				</LazyDialogHost>,
			);
		});
	}

	beforeEach(() => {
		mocks.reportClientError.mockClear();
		onOpenChange.mockClear();
		window.sessionStorage.clear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
	});

	it("loads the dialog on its first open, shows a cancellable busy shell meanwhile and keeps it mounted after closing", async () => {
		const deferred = createDeferred<DialogModule>();
		const importer = vi.fn(() => deferred.promise);
		const Dialog = createRetryableLazyComponent(importer, "RealDialog");

		await render(Dialog, false);
		expect(importer).not.toHaveBeenCalled();
		expect(container.innerHTML).toBe("");

		await render(Dialog, true);
		expect(importer).toHaveBeenCalledOnce();
		const busy = container.querySelector('[data-testid="lazy-dialog-loading-fallback"]');
		expect(busy?.getAttribute("aria-busy")).toBe("true");
		act(() => findButton(container, "Cancel")?.click());
		expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);

		deferred.resolve({ RealDialog });
		await settle();
		expect(container.querySelector('[data-testid="real-dialog"]')?.textContent).toBe("dialog open");
		expect(container.querySelector('[data-testid="lazy-dialog-loading-fallback"]')).toBeNull();

		await render(Dialog, false);
		expect(container.querySelector('[data-testid="real-dialog"]')?.textContent).toBe("dialog closed");
		expect(importer).toHaveBeenCalledOnce();
	});

	it("answers a failed import with a dismissible error shell instead of a page reload, and retries on demand", async () => {
		const importer = vi
			.fn<() => Promise<DialogModule>>()
			.mockRejectedValueOnce(CHUNK_ERROR)
			.mockResolvedValueOnce({ RealDialog });
		const Dialog = createRetryableLazyComponent(importer, "RealDialog");
		vi.spyOn(console, "error").mockImplementation(() => {});

		await render(Dialog, true);
		await settle();

		expect(container.textContent).toContain("Something went wrong");
		expect(container.textContent).toContain("Reloading clears an order you have not sent.");
		expect(findButton(container, "Reload page")).toBeDefined();
		expect(container.querySelector('[data-testid="real-dialog"]')).toBeNull();
		expect(mocks.reportClientError).toHaveBeenCalledOnce();
		expect(mocks.reportClientError.mock.calls[0]?.[0]).toMatchObject({ name: "LazyComponentLoadError" });
		expect(Object.keys(window.sessionStorage).some((key) => key.startsWith("tanstack_router_reload:"))).toBe(false);

		await act(async () => {
			findButton(container, "Try again")?.click();
		});
		await settle();

		expect(importer).toHaveBeenCalledTimes(2);
		expect(container.querySelector('[data-testid="real-dialog"]')?.textContent).toBe("dialog open");
	});

	it("does not start another import on its own while the load keeps failing", async () => {
		const importer = vi.fn<() => Promise<DialogModule>>().mockRejectedValue(CHUNK_ERROR);
		const Dialog = createRetryableLazyComponent(importer, "RealDialog");
		vi.spyOn(console, "error").mockImplementation(() => {});

		await render(Dialog, true);
		await settle();
		await settle();

		expect(importer).toHaveBeenCalledOnce();
		expect(container.textContent).toContain("Something went wrong");

		await act(async () => {
			findButton(container, "Try again")?.click();
		});
		await settle();
		await settle();

		expect(importer).toHaveBeenCalledTimes(2);
		expect(container.textContent).toContain("Something went wrong");
	});

	it("retries by itself when the dialog is opened again after a failed load", async () => {
		const importer = vi
			.fn<() => Promise<DialogModule>>()
			.mockRejectedValueOnce(CHUNK_ERROR)
			.mockResolvedValueOnce({ RealDialog });
		const Dialog = createRetryableLazyComponent(importer, "RealDialog");
		vi.spyOn(console, "error").mockImplementation(() => {});

		await render(Dialog, true);
		await settle();
		expect(container.textContent).toContain("Something went wrong");

		await render(Dialog, false);
		expect(container.querySelector('[role="dialog"]')).toBeNull();
		expect(importer).toHaveBeenCalledOnce();

		await render(Dialog, true);
		await settle();
		expect(importer).toHaveBeenCalledTimes(2);
		expect(container.querySelector('[data-testid="real-dialog"]')?.textContent).toBe("dialog open");
	});

	it("does not let a failed idle preload poison the first open", async () => {
		const importer = vi
			.fn<() => Promise<DialogModule>>()
			.mockRejectedValueOnce(CHUNK_ERROR)
			.mockResolvedValueOnce({ RealDialog });
		const Dialog = createRetryableLazyComponent(importer, "RealDialog");

		await expect(Dialog.preload()).resolves.toBeUndefined();
		expect(importer).toHaveBeenCalledOnce();

		await render(Dialog, true);
		await settle();

		expect(importer).toHaveBeenCalledTimes(2);
		expect(container.querySelector('[data-testid="real-dialog"]')?.textContent).toBe("dialog open");
		expect(container.textContent).not.toContain("Something went wrong");
		expect(mocks.reportClientError).not.toHaveBeenCalled();
	});

	it("renders a warmed dialog directly without the busy shell", async () => {
		const importer = vi.fn(() => Promise.resolve({ RealDialog }));
		const Dialog = createRetryableLazyComponent(importer, "RealDialog");
		await Dialog.preload();

		await render(Dialog, true);

		expect(container.querySelector('[data-testid="real-dialog"]')?.textContent).toBe("dialog open");
		expect(container.querySelector('[data-testid="lazy-dialog-loading-fallback"]')).toBeNull();
		expect(importer).toHaveBeenCalledOnce();
	});
});
