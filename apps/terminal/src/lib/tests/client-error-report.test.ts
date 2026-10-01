import { createHash } from "node:crypto";
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	CLIENT_ERROR_KINDS,
	CLIENT_ERROR_REPORT_ENDPOINT,
	CLIENT_ERROR_REPORT_MAX_BYTES,
	createClientErrorReport,
	LEGAL_STATUS_CHECK_REASONS,
	parseClientErrorReport,
} from "@/lib/error-reporting/report";

const WALLET_ADDRESS = `0x${"a".repeat(40)}`;
const PRIVATE_KEY = `0x${"b".repeat(64)}`;

describe("client error report privacy", () => {
	it("only emits allowlisted diagnostics without URLs, messages, wallet addresses, or secrets", () => {
		const error = new Error(
			`wallet=${WALLET_ADDRESS} privateKey=${PRIVATE_KEY} https://sairn.ai/trade?token=secret#fragment`,
		);
		error.stack = [
			`Error: wallet=${WALLET_ADDRESS}`,
			`    at submit (https://sairn.ai/assets/app-safe.js?token=${PRIVATE_KEY}#fragment:12:3)`,
			"    at extension (https://evil.example/assets/steal.js:7:9)",
			`    at unsafe (https://sairn.ai/src/${WALLET_ADDRESS}.ts:1:2)`,
		].join("\n");

		const report = createClientErrorReport(error, {
			kind: "window_error",
			pathname: `/trade/${WALLET_ADDRESS}`,
			origin: "https://sairn.ai",
			componentStack: `at Secret (https://sairn.ai/src/private.tsx?seed=${PRIVATE_KEY}#fragment:8:4)`,
		});
		const serialized = JSON.stringify(report);

		expect(report).toEqual({
			schema: 1,
			kind: "window_error",
			category: "runtime",
			errorName: "Error",
			route: "trade",
			frames: ["asset:12:3", "source:1:2"],
			componentFrames: ["source:8:4"],
		});
		expect(serialized).not.toContain(WALLET_ADDRESS);
		expect(serialized).not.toContain(PRIVATE_KEY);
		expect(serialized).not.toContain("token=");
		expect(serialized).not.toContain("#fragment");
		expect(serialized).not.toContain("evil.example");
	});

	it("rejects unknown fields and unsafe frames at the server validation boundary", () => {
		const valid = createClientErrorReport(new TypeError("safe"), {
			kind: "router_boundary",
			pathname: "/portfolio",
			origin: "https://sairn.ai",
		});

		expect(parseClientErrorReport(valid)).toEqual(valid);
		expect(parseClientErrorReport({ ...valid, message: PRIVATE_KEY })).toBeNull();
		expect(parseClientErrorReport({ ...valid, frames: [`asset:${WALLET_ADDRESS}:1`] })).toBeNull();
	});

	it("accepts only allowlisted reasons on incremental orderbook fallback reports", () => {
		const report = createClientErrorReport(new Error("private protocol failure"), {
			kind: "orderbook_l2_fallback",
			fallbackReason: "snapshot_timeout",
			pathname: "/trade/BTC",
			origin: "https://sairn.ai",
		});

		expect(parseClientErrorReport(report)).toEqual(report);
		expect(parseClientErrorReport({ ...report, fallbackReason: "raw_private_payload" })).toBeNull();
		expect(parseClientErrorReport({ ...report, kind: "window_error" })).toBeNull();
	});

	it("accepts only allowlisted reasons on legal status reports", () => {
		const report = createClientErrorReport(new Error(`wallet=${WALLET_ADDRESS} privateKey=${PRIVATE_KEY}`), {
			kind: "legal_status_check",
			legalReason: "timeout",
			pathname: "/trade/BTC",
			origin: "https://sairn.ai",
		});
		const serialized = JSON.stringify(report);

		expect(report.legalReason).toBe("timeout");
		expect(parseClientErrorReport(report)).toEqual(report);
		expect(parseClientErrorReport({ ...report, legalReason: "aborted" })).toBeNull();
		expect(parseClientErrorReport({ ...report, legalReason: "private_upstream_message" })).toBeNull();
		expect(parseClientErrorReport({ ...report, kind: "window_error" })).toBeNull();
		expect(parseClientErrorReport({ ...report, fallbackReason: "snapshot_timeout" })).toBeNull();
		expect(serialized).not.toContain(WALLET_ADDRESS);
		expect(serialized).not.toContain(PRIVATE_KEY);
	});

	it("keeps the legal status reason vocabulary explicit and bounded", () => {
		expect(LEGAL_STATUS_CHECK_REASONS).toEqual([
			"invalid_response",
			"network",
			"rate_limited",
			"request_rejected",
			"service_unavailable",
			"timeout",
			"unknown",
		]);
	});
});

describe("client error transport", () => {
	let removeListeners: (() => void) | undefined;

	beforeEach(() => {
		vi.resetModules();
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
		window.history.replaceState(null, "", `/trade?privateKey=${PRIVATE_KEY}#${WALLET_ADDRESS}`);
	});

	afterEach(() => {
		removeListeners?.();
		removeListeners = undefined;
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		window.history.replaceState(null, "", "/");
	});

	it("installs global error reporting after bootstrap and sends a same-origin, credential-free request", async () => {
		const { installGlobalErrorReporting } = await import("@/lib/error-reporting/client");
		removeListeners = installGlobalErrorReporting();

		const error = new Error(`privateKey=${PRIVATE_KEY}`);
		error.stack = `Error: secret\n    at submit (${window.location.origin}/assets/app.js?token=secret#fragment:4:2)`;
		window.dispatchEvent(new ErrorEvent("error", { error }));

		expect(fetch).toHaveBeenCalledTimes(1);
		const [endpoint, init] = vi.mocked(fetch).mock.calls[0] ?? [];
		expect(endpoint).toBe(CLIENT_ERROR_REPORT_ENDPOINT);
		expect(init).toMatchObject({
			method: "POST",
			credentials: "omit",
			mode: "same-origin",
			redirect: "error",
			referrerPolicy: "no-referrer",
		});

		const body = String(init?.body);
		expect(init?.headers).toEqual({
			"content-type": "application/json",
			"x-amz-content-sha256": createHash("sha256").update(body, "utf8").digest("hex"),
		});
		expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(CLIENT_ERROR_REPORT_MAX_BYTES);
		expect(JSON.parse(body)).toMatchObject({
			kind: "window_error",
			route: "trade",
			frames: ["asset:4:2"],
		});
		expect(body).not.toContain(PRIVATE_KEY);
		expect(body).not.toContain(WALLET_ADDRESS);
		expect(body).not.toContain("token=");
		expect(body).not.toContain("#fragment");
	});

	it("captures unhandled rejections without serializing the rejection reason", async () => {
		const { installGlobalErrorReporting } = await import("@/lib/error-reporting/client");
		removeListeners = installGlobalErrorReporting();
		const rejection = new Event("unhandledrejection") as PromiseRejectionEvent;
		Object.defineProperty(rejection, "reason", { value: `seed=${PRIVATE_KEY}` });

		window.dispatchEvent(rejection);

		const body = String(vi.mocked(fetch).mock.calls[0]?.[1]?.body);
		expect(JSON.parse(body)).toMatchObject({
			kind: "unhandled_rejection",
			errorName: "NonError",
		});
		expect(body).not.toContain(PRIVATE_KEY);
	});

	it("sends only the allowlisted legal status reason", async () => {
		const { reportClientError } = await import("@/lib/error-reporting/client");

		reportClientError(new Error(`wallet=${WALLET_ADDRESS} privateKey=${PRIVATE_KEY}`), {
			kind: "legal_status_check",
			legalReason: "service_unavailable",
		});

		const body = String(vi.mocked(fetch).mock.calls[0]?.[1]?.body);
		expect(JSON.parse(body)).toMatchObject({
			kind: "legal_status_check",
			legalReason: "service_unavailable",
		});
		expect(body).not.toContain(WALLET_ADDRESS);
		expect(body).not.toContain(PRIVATE_KEY);
	});

	it("limits client reports to five per minute", async () => {
		const { reportClientError } = await import("@/lib/error-reporting/client");

		for (const [index, kind] of CLIENT_ERROR_KINDS.entries()) {
			const error = new Error("failure");
			error.stack = `Error\n    at task (${window.location.origin}/assets/app.js:${index + 1}:1)`;
			if (kind === "orderbook_l2_fallback") {
				reportClientError(error, { kind, fallbackReason: "snapshot_timeout" });
			} else if (kind === "legal_status_check") {
				reportClientError(error, { kind, legalReason: "network" });
			} else {
				reportClientError(error, { kind });
			}
		}

		expect(fetch).toHaveBeenCalledTimes(5);
	});
});
