// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MOBILE_AGENT_SYNC_ROUTE_PATH = "/mobile-agent-sync";

describe("mobile Agent pre-bootstrap fragment scrub", () => {
	beforeEach(() => {
		vi.resetModules();
		window.history.replaceState(null, "", "/");
	});

	afterEach(() => {
		vi.restoreAllMocks();
		window.history.replaceState(null, "", "/");
	});

	it("synchronously scrubs a direct-load fragment and exposes it once", async () => {
		window.history.replaceState(null, "", `${MOBILE_AGENT_SYNC_ROUTE_PATH}?from=qr#bearer-secret`);
		const bearerUrl = window.location.href;

		const bootstrap = await import("../mobile-sync/bootstrap-fragment");

		expect(window.location.pathname).toBe(MOBILE_AGENT_SYNC_ROUTE_PATH);
		expect(window.location.search).toBe("?from=qr");
		expect(window.location.hash).toBe("");
		expect(bootstrap.mobileAgentSyncBootstrapScrubStatus).toBe("scrubbed");
		expect(bootstrap.canHydrateAfterMobileAgentSyncScrub).toBe(true);
		expect(bootstrap.consumeBootstrappedMobileAgentSyncUrl()).toBe(bearerUrl);
		expect(bootstrap.consumeBootstrappedMobileAgentSyncUrl()).toBeNull();
		expect(bootstrap.consumeInvalidBootstrappedMobileAgentSyncLocation()).toBe(false);
	});

	it("also scrubs a trailing-slash route before hydration", async () => {
		window.history.replaceState(null, "", `${MOBILE_AGENT_SYNC_ROUTE_PATH}/#bearer-secret`);
		const bearerUrl = window.location.href;

		const bootstrap = await import("../mobile-sync/bootstrap-fragment");

		expect(window.location.pathname).toBe(`${MOBILE_AGENT_SYNC_ROUTE_PATH}/`);
		expect(window.location.hash).toBe("");
		expect(bootstrap.mobileAgentSyncBootstrapScrubStatus).toBe("scrubbed");
		expect(bootstrap.consumeBootstrappedMobileAgentSyncUrl()).toBe(bearerUrl);
	});

	it.each([
		[
			"query credentials",
			`${MOBILE_AGENT_SYNC_ROUTE_PATH}?from=camera&ht-mobile-sync=secret-envelope&k=secret-key#also-secret`,
			`${MOBILE_AGENT_SYNC_ROUTE_PATH}?from=camera`,
		],
		[
			"unexpected nested credential path",
			`${MOBILE_AGENT_SYNC_ROUTE_PATH}/ht-mobile-sync=secret-envelope/k=secret-key#also-secret`,
			MOBILE_AGENT_SYNC_ROUTE_PATH,
		],
		[
			"encoded nested credential path",
			`${MOBILE_AGENT_SYNC_ROUTE_PATH}%2Fht-mobile-sync%3Dsecret-envelope#also-secret`,
			MOBILE_AGENT_SYNC_ROUTE_PATH,
		],
	])("scrubs %s without retaining the credential", async (_caseName, unsafeUrl, expectedUrl) => {
		window.history.replaceState(null, "", unsafeUrl);

		const bootstrap = await import("../mobile-sync/bootstrap-fragment");

		expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(expectedUrl);
		expect(bootstrap.mobileAgentSyncBootstrapScrubStatus).toBe("scrubbed");
		expect(bootstrap.consumeBootstrappedMobileAgentSyncUrl()).toBeNull();
		expect(bootstrap.consumeInvalidBootstrappedMobileAgentSyncLocation()).toBe(true);
		expect(bootstrap.consumeInvalidBootstrappedMobileAgentSyncLocation()).toBe(false);
	});

	it.each([
		["another path", "/trade#bearer-secret"],
		["no fragment", MOBILE_AGENT_SYNC_ROUTE_PATH],
	])("does not capture %s", async (_caseName, url) => {
		window.history.replaceState(null, "", url);

		const bootstrap = await import("../mobile-sync/bootstrap-fragment");

		expect(bootstrap.mobileAgentSyncBootstrapScrubStatus).toBe("not_applicable");
		expect(bootstrap.canHydrateAfterMobileAgentSyncScrub).toBe(true);
		expect(bootstrap.consumeBootstrappedMobileAgentSyncUrl()).toBeNull();
	});

	it("fails closed when the fragment cannot be removed", async () => {
		window.history.replaceState(null, "", `${MOBILE_AGENT_SYNC_ROUTE_PATH}#bearer-secret`);
		const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {
			throw new DOMException("blocked", "SecurityError");
		});

		const bootstrap = await import("../mobile-sync/bootstrap-fragment");

		expect(window.location.hash).toBe("#bearer-secret");
		expect(bootstrap.mobileAgentSyncBootstrapScrubStatus).toBe("blocked");
		expect(bootstrap.canHydrateAfterMobileAgentSyncScrub).toBe(false);
		expect(bootstrap.consumeBootstrappedMobileAgentSyncUrl()).toBeNull();
		expect(bootstrap.consumeInvalidBootstrappedMobileAgentSyncLocation()).toBe(false);
		replaceState.mockRestore();
	});

	it("keeps the client entry dependency-free until the scrub runs", () => {
		const clientSource = readFileSync(resolve(process.cwd(), "src/client.ts"), "utf8");
		const hydrationSource = readFileSync(resolve(process.cwd(), "src/client-hydrate.tsx"), "utf8");
		const staticImports = clientSource.match(/^import\s+(?!\()[^\n]+$/gm) ?? [];

		expect(staticImports).toEqual([
			'import { renderBootstrapErrorPage } from "./lib/bootstrap-error-page";',
			'import { canHydrateAfterMobileAgentSyncScrub } from "./lib/mobile-sync/bootstrap-fragment";',
		]);
		expect(clientSource.indexOf('import("./lib/error-reporting/client")')).toBeLessThan(
			clientSource.indexOf('import("./client-hydrate")'),
		);
		expect(clientSource).toContain("installGlobalErrorReporting();");
		expect(clientSource).toContain("renderBootstrapErrorPage();");
		expect(hydrationSource).toContain('import { StartClient } from "@tanstack/react-start/client";');
		expect(hydrationSource).toContain("hydrateRoot(");
	});
});
