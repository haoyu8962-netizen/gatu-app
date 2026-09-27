/** @vitest-environment jsdom */

import { act, Component, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "@/lib/tests/harness/react";

const mocks = vi.hoisted(() => ({ reportClientError: vi.fn() }));

vi.mock("@/lib/error-reporting/client", () => ({ reportClientError: mocks.reportClientError }));

vi.mock("@gatu/ui", () => ({
	Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
}));

import { FundingHistoryLoadBoundary } from "@/components/trade/chart/funding-history-load-boundary";
import { createRetryableLazyComponent } from "@/lib/lazy";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function RealPanel() {
	return <p data-testid="real-panel">funding panel</p>;
}

function ThrowingPanel(): ReactNode {
	throw new Error("render failure");
}

type PanelModule = { RealPanel: typeof RealPanel };

const CHUNK_ERROR = new Error("Failed to fetch dynamically imported module: /assets/funding-history-panel.js");

class OuterBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
	override state = { error: null as unknown };

	static getDerivedStateFromError(error: unknown) {
		return { error };
	}

	override render(): ReactNode {
		if (this.state.error) return <p data-testid="outer-boundary">outer</p>;
		return this.props.children;
	}
}

async function settle() {
	await act(async () => {
		await new Promise((resolve) => window.setTimeout(resolve, 0));
	});
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement | undefined {
	return [...container.querySelectorAll("button")].find((button) => button.textContent === label);
}

describe("FundingHistoryLoadBoundary", () => {
	let container: HTMLDivElement;
	let root: ReturnType<typeof createI18nRoot>;

	beforeEach(() => {
		mocks.reportClientError.mockClear();
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

	it("shows only a neutral Retry for a failed chunk, never reloads, and loads the panel on retry", async () => {
		const importer = vi
			.fn<() => Promise<PanelModule>>()
			.mockRejectedValueOnce(CHUNK_ERROR)
			.mockResolvedValueOnce({ RealPanel });
		const Panel = createRetryableLazyComponent(importer, "RealPanel");
		vi.spyOn(console, "error").mockImplementation(() => {});

		await act(async () => {
			root.render(
				<FundingHistoryLoadBoundary>
					<Panel />
				</FundingHistoryLoadBoundary>,
			);
		});
		await settle();

		const errorShell = container.querySelector("[data-funding-history-load-error]");
		expect(errorShell).not.toBeNull();
		expect(errorShell?.textContent).toBe("Retry");
		expect(container.querySelector('[data-testid="real-panel"]')).toBeNull();
		expect(mocks.reportClientError).toHaveBeenCalledOnce();
		expect(mocks.reportClientError.mock.calls[0]?.[0]).toMatchObject({ name: "LazyComponentLoadError" });
		expect(Object.keys(window.sessionStorage).some((key) => key.startsWith("tanstack_router_reload:"))).toBe(false);

		await act(async () => {
			findButton(container, "Retry")?.click();
		});
		await settle();

		expect(importer).toHaveBeenCalledTimes(2);
		expect(container.querySelector("[data-funding-history-load-error]")).toBeNull();
		expect(container.querySelector('[data-testid="real-panel"]')?.textContent).toBe("funding panel");
	});

	it("keeps a blank busy fallback while the chunk loads", async () => {
		let resolve: (module: PanelModule) => void = () => {};
		const importer = vi.fn(
			() =>
				new Promise<PanelModule>((onResolve) => {
					resolve = onResolve;
				}),
		);
		const Panel = createRetryableLazyComponent(importer, "RealPanel");

		await act(async () => {
			root.render(
				<FundingHistoryLoadBoundary>
					<Panel />
				</FundingHistoryLoadBoundary>,
			);
		});

		const busy = container.querySelector("[data-funding-history-loading]");
		expect(busy?.getAttribute("aria-busy")).toBe("true");
		expect(busy?.textContent).toBe("Loading...");
		expect(busy?.querySelector(".sr-only")).not.toBeNull();

		resolve({ RealPanel });
		await settle();
		expect(container.querySelector('[data-testid="real-panel"]')).not.toBeNull();
	});

	it("rethrows ordinary render errors to the parent boundary", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});

		await act(async () => {
			root.render(
				<OuterBoundary>
					<FundingHistoryLoadBoundary>
						<ThrowingPanel />
					</FundingHistoryLoadBoundary>
				</OuterBoundary>,
			);
		});

		expect(container.querySelector('[data-testid="outer-boundary"]')).not.toBeNull();
		expect(container.querySelector("[data-funding-history-load-error]")).toBeNull();
	});
});
