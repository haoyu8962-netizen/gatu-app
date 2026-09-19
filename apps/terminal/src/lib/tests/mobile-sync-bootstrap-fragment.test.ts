// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	installPairingBootstrap,
	PAIRING_BOOTSTRAP_GLOBAL,
	type PairingBootstrapHandoff,
} from "../mobile-sync/pairing-location";

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

	it("scrubs a differently cased route the router would still match", async () => {
		window.history.replaceState(null, "", "/Mobile-Agent-Sync?from=qr#bearer-secret");
		const bearerUrl = window.location.href;

		const bootstrap = await import("../mobile-sync/bootstrap-fragment");

		expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
			`${MOBILE_AGENT_SYNC_ROUTE_PATH}?from=qr`,
		);
		expect(bootstrap.mobileAgentSyncBootstrapScrubStatus).toBe("scrubbed");
		expect(bootstrap.consumeBootstrappedMobileAgentSyncUrl()).toBe(bearerUrl);
	});

	describe("after the shell's head script already ran", () => {
		afterEach(() => {
			Reflect.deleteProperty(window, PAIRING_BOOTSTRAP_GLOBAL);
		});

		function leaveHandoff(handoff: unknown) {
			Object.defineProperty(window, PAIRING_BOOTSTRAP_GLOBAL, { configurable: true, value: handoff });
		}

		it("takes the url the head script captured", async () => {
			window.history.replaceState(null, "", `${MOBILE_AGENT_SYNC_ROUTE_PATH}#bearer-secret`);
			const bearerUrl = window.location.href;
			const headWindow = { history: window.history, location: window.location };
			installPairingBootstrap(headWindow);
			expect(window.location.hash).toBe("");
			const handoff = Reflect.get(headWindow, PAIRING_BOOTSTRAP_GLOBAL) as PairingBootstrapHandoff;
			leaveHandoff(handoff);

			const bootstrap = await import("../mobile-sync/bootstrap-fragment");

			expect(bootstrap.mobileAgentSyncBootstrapScrubStatus).toBe("scrubbed");
			expect(bootstrap.consumeBootstrappedMobileAgentSyncUrl()).toBe(bearerUrl);
			expect(handoff.take()).toBeNull();
		});

		it("blocks hydration when the captured url was already taken by something else", async () => {
			leaveHandoff({ v: 1, status: "captured", take: () => null });

			const bootstrap = await import("../mobile-sync/bootstrap-fragment");

			expect(bootstrap.mobileAgentSyncBootstrapScrubStatus).toBe("blocked");
			expect(bootstrap.canHydrateAfterMobileAgentSyncScrub).toBe(false);
			expect(bootstrap.consumeBootstrappedMobileAgentSyncUrl()).toBeNull();
		});

		it.each([
			["another version", { v: 2, status: "none", take: () => null }],
			["an unknown status", { v: 1, status: "ready", take: () => null }],
			["no take function", { v: 1, status: "none" }],
			[
				"a throwing take",
				{
					v: 1,
					status: "captured",
					take: () => {
						throw new Error("taken apart");
					},
				},
			],
			["a take that returns something other than a url", { v: 1, status: "captured", take: () => ({ url: "x" }) }],
			["a primitive", "captured"],
			["null", null],
		])("blocks hydration when the handoff is %s", async (_name, handoff) => {
			leaveHandoff(handoff);

			const bootstrap = await import("../mobile-sync/bootstrap-fragment");

			expect(bootstrap.mobileAgentSyncBootstrapScrubStatus).toBe("blocked");
			expect(bootstrap.consumeBootstrappedMobileAgentSyncUrl()).toBeNull();
		});

		it("passes on a blocked or invalid head result", async () => {
			leaveHandoff({ v: 1, status: "invalid", take: () => null });
			const invalid = await import("../mobile-sync/bootstrap-fragment");
			expect(invalid.mobileAgentSyncBootstrapScrubStatus).toBe("scrubbed");
			expect(invalid.consumeInvalidBootstrappedMobileAgentSyncLocation()).toBe(true);

			vi.resetModules();
			Reflect.deleteProperty(window, PAIRING_BOOTSTRAP_GLOBAL);
			leaveHandoff({ v: 1, status: "blocked", take: () => null });
			const blocked = await import("../mobile-sync/bootstrap-fragment");
			expect(blocked.canHydrateAfterMobileAgentSyncScrub).toBe(false);
		});

		it("still scrubs by itself when the head script saw nothing to do", async () => {
			leaveHandoff({ v: 1, status: "none", take: () => null });
			window.history.replaceState(null, "", `${MOBILE_AGENT_SYNC_ROUTE_PATH}#bearer-secret`);
			const bearerUrl = window.location.href;

			const bootstrap = await import("../mobile-sync/bootstrap-fragment");

			expect(window.location.hash).toBe("");
			expect(bootstrap.consumeBootstrappedMobileAgentSyncUrl()).toBe(bearerUrl);
		});
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
