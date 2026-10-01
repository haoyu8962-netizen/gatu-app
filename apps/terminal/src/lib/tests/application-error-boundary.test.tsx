// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
	captureExchangeRequestGeneration,
	ExchangeRequestInvalidatedError,
	ExchangeRequestScheduler,
} from "@sairn/hl-react/internal/exchange/request-scheduler";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationErrorBoundary } from "@/components/application-error-boundary";

const FAILURE = new Error("private runtime detail");

function BrokenProvider(): never {
	throw FAILURE;
}

describe("application error boundaries", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("renders a safe recovery page when a provider child throws", () => {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<ApplicationErrorBoundary>
						<BrokenProvider />
					</ApplicationErrorBoundary>
				</I18nProvider>,
			);
		});

		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Something went wrong");
		expect(container.querySelectorAll("main")).toHaveLength(1);
		expect(container.querySelector("main")?.getAttribute("role")).toBeNull();
		expect(container.querySelector("main")?.querySelector('[role="alert"]')).not.toBeNull();
		expect(container.textContent).not.toContain(FAILURE.message);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("rejects queued mutations when the application enters the fatal fallback", async () => {
		const scheduler = new ExchangeRequestScheduler();
		const generation = captureExchangeRequestGeneration(
			"Mainnet",
			"0x6666666666666666666666666666666666666666",
			"wallet",
		);
		let releaseStarted: (() => void) | undefined;
		const startedGate = new Promise<void>((resolve) => {
			releaseStarted = resolve;
		});
		const startedRun = vi.fn(async () => {
			await startedGate;
			return "started";
		});
		const queuedRun = vi.fn(async () => "queued");

		const started = scheduler.schedule("normal", startedRun, generation);
		await vi.waitFor(() => expect(startedRun).toHaveBeenCalledOnce());
		const queued = scheduler.schedule("normal", queuedRun, generation);
		const queuedRejection = expect(queued).rejects.toBeInstanceOf(ExchangeRequestInvalidatedError);

		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<ApplicationErrorBoundary>
						<BrokenProvider />
					</ApplicationErrorBoundary>
				</I18nProvider>,
			);
		});

		await queuedRejection;
		expect(queuedRun).not.toHaveBeenCalled();
		releaseStarted?.();
		await expect(started).resolves.toBe("started");
	});

	it("mounts the fatal boundary inside the document shell so <html>/<head> never unmount", () => {
		const routerSource = readFileSync(resolve(process.cwd(), "src/router.tsx"), "utf8");
		const rootRouteSource = readFileSync(resolve(process.cwd(), "src/routes/__root.tsx"), "utf8");

		expect(routerSource).not.toMatch(/\n\s*Wrap:/);
		expect(routerSource).not.toContain("ApplicationErrorBoundary");
		expect(routerSource).toContain("InnerWrap:");
		expect(routerSource).toContain("<RootProvider {...rqContext}>{props.children}</RootProvider>");

		const bodyStart = rootRouteSource.indexOf("<body>");
		const boundaryInRoot = rootRouteSource.indexOf("<ApplicationErrorBoundary>");
		expect(boundaryInRoot).toBeGreaterThanOrEqual(0);
		expect(rootRouteSource).toContain("<ApplicationErrorBoundary>\n\t\t\t<ClientRuntimeGate fallback={fallback}>");
		expect(rootRouteSource).toContain("errorComponent: RouterErrorPage");
		expect(bodyStart).toBeGreaterThan(boundaryInRoot);
	});
});
