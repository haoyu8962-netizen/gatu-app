#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_URL = "http://localhost:3001/";
const DEFAULT_WAIT_MS = 6000;
const OUTPUT_DIR = ".output/diagnostics";
const DIAGNOSTICS_QUERY_PARAM = "hl_diagnostics";
const RENDER_PROFILE_QUERY_PARAM = "terminal_perf";

function getArg(name, fallback) {
	const index = process.argv.indexOf(name);
	if (index === -1) return fallback;
	return process.argv[index + 1] ?? fallback;
}

function getBooleanArg(name, fallback) {
	const value = getArg(name, String(fallback));
	return value !== "0" && value !== "false";
}

function withDiagnosticsFlag(url) {
	const target = new URL(url);
	target.searchParams.set(DIAGNOSTICS_QUERY_PARAM, "1");
	target.searchParams.set(RENDER_PROFILE_QUERY_PARAM, "1");
	return target.toString();
}

function runAgentBrowser(args, options = {}) {
	return execFileSync("agent-browser", args, {
		encoding: "utf8",
		stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
	});
}

function parseEvalOutput(output) {
	const trimmed = output.trim();
	if (!trimmed) return null;
	const firstParse = JSON.parse(trimmed);
	return typeof firstParse === "string" ? JSON.parse(firstParse) : firstParse;
}

function getBrowserReport() {
	const expression = String.raw`
JSON.stringify((() => {
  const nav = performance.getEntriesByType("navigation").at(-1);
  const paints = performance.getEntriesByType("paint").map((entry) => ({
    name: entry.name,
    startTime: Math.round(entry.startTime),
  }));
  const resources = performance.getEntriesByType("resource").map((entry) => ({
    name: entry.name,
    initiatorType: entry.initiatorType,
    duration: Math.round(entry.duration),
    transferSize: entry.transferSize,
    encodedBodySize: entry.encodedBodySize,
    decodedBodySize: entry.decodedBodySize,
  }));
  const byDuration = [...resources]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 20);
  const byTransfer = [...resources]
    .sort((a, b) => b.transferSize - a.transferSize)
    .slice(0, 20);
  const storageSize = (storage, key) => {
    try {
      return (storage.getItem(key) || "").length;
    } catch {
      return 0;
    }
  };
  const knownLocalStorage = {
    "hl-rq-cache-v1": storageSize(localStorage, "hl-rq-cache-v1"),
    "hl-last-mark-v1": storageSize(localStorage, "hl-last-mark-v1"),
  };
  const knownSessionStorage = {
    "hl-mkt-stats-v1": storageSize(sessionStorage, "hl-mkt-stats-v1"),
  };
  const debug = typeof window.__hl_debug === "function" ? window.__hl_debug() : null;
  const health = typeof window.__hl_health === "function" ? window.__hl_health() : null;
  const renderProfile = typeof window.__terminal_render_profile === "function" ? window.__terminal_render_profile() : null;
  return {
    capturedAt: new Date().toISOString(),
    title: document.title,
    url: location.href,
    readyState: document.readyState,
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    navigation: nav
      ? {
          type: nav.type,
          duration: Math.round(nav.duration),
          responseStart: Math.round(nav.responseStart),
          responseEnd: Math.round(nav.responseEnd),
          domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
          load: Math.round(nav.loadEventEnd),
          transferSize: nav.transferSize,
          encodedBodySize: nav.encodedBodySize,
          responseStatus: nav.responseStatus,
        }
      : null,
    paints,
    resources: {
      count: resources.length,
      topByDuration: byDuration,
      topByTransfer: byTransfer,
    },
    storage: {
      localStorageKeys: Object.keys(localStorage),
      sessionStorageKeys: Object.keys(sessionStorage),
      knownLocalStorage,
      knownSessionStorage,
    },
    runtime: {
      hasDebug: typeof window.__hl_debug,
      hasHealth: typeof window.__hl_health,
      hasRenderProfile: typeof window.__terminal_render_profile,
      debug,
      health,
      renderProfile,
    },
  };
})())
`;
	return parseEvalOutput(runAgentBrowser(["eval", expression]));
}

function getProblems(report, consoleOutput, pageErrors) {
	const problems = [];
	const health = report?.runtime?.health;
	const debug = report?.runtime?.debug;
	const consoleErrorLines = consoleOutput
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("[error]"));

	if (pageErrors.trim()) {
		problems.push(`Browser page errors were reported:\n${pageErrors.trim()}`);
	}
	if (consoleErrorLines.length > 0) {
		problems.push(`Console errors were reported:\n${consoleErrorLines.join("\n")}`);
	}
	if (!health) {
		problems.push("window.__hl_health() is not available.");
	} else if (health.status !== "healthy") {
		problems.push(`Runtime health is ${health.status}: ${JSON.stringify(health.alerts)}`);
	}
	if (!debug) {
		problems.push("window.__hl_debug() is not available.");
	} else {
		const stale = Object.entries(debug.subscriptions ?? {}).filter(([, entry]) => entry.isStale);
		const reconnecting = Object.entries(debug.counters ?? {}).filter(([, entry]) => entry.reconnectAttempts > 0);
		if (stale.length > 0) {
			problems.push(`Stale websocket streams: ${stale.map(([key]) => key).join(", ")}`);
		}
		if (reconnecting.length > 0) {
			problems.push(`Reconnect attempts present: ${reconnecting.map(([key, entry]) => `${key}:${entry.reconnectAttempts}`).join(", ")}`);
		}
	}

	const knownLocal = report?.storage?.knownLocalStorage ?? {};
	const knownSession = report?.storage?.knownSessionStorage ?? {};
	for (const key of ["hl-rq-cache-v1", "hl-last-mark-v1"]) {
		if (!knownLocal[key]) problems.push(`${key} is missing or empty in localStorage.`);
	}
	if (!knownSession["hl-mkt-stats-v1"]) {
		problems.push("hl-mkt-stats-v1 is missing or empty in sessionStorage.");
	}

	return problems;
}

function main() {
	const url = getArg("--url", process.env.TERMINAL_URL ?? DEFAULT_URL);
	const waitMs = Number(getArg("--wait-ms", process.env.BROWSER_DIAGNOSTICS_WAIT_MS ?? String(DEFAULT_WAIT_MS)));
	const enableDiagnostics = getBooleanArg(
		"--enable-diagnostics",
		process.env.BROWSER_DIAGNOSTICS_ENABLE_RUNTIME ?? "true",
	);
	const targetUrl = enableDiagnostics ? withDiagnosticsFlag(url) : url;

	runAgentBrowser(["console", "--clear"]);
	runAgentBrowser(["errors", "--clear"]);
	runAgentBrowser(["network", "requests", "--clear"]);
	runAgentBrowser(["open", targetUrl]);
	runAgentBrowser(["wait", String(waitMs)]);
	const initialLoad = getBrowserReport();

	runAgentBrowser(["console", "--clear"]);
	runAgentBrowser(["errors", "--clear"]);
	runAgentBrowser(["network", "requests", "--clear"]);
	runAgentBrowser(["eval", "location.reload()"]);
	runAgentBrowser(["wait", String(waitMs)]);
	const report = getBrowserReport();
	const consoleOutput = runAgentBrowser(["console"]);
	const pageErrors = runAgentBrowser(["errors"]);
	const problems = getProblems(report, consoleOutput, pageErrors);

	const payload = {
		initialLoad,
		...report,
		gate: {
			ok: problems.length === 0,
			problems,
			diagnosticsEnabled: enableDiagnostics,
		},
		console: consoleOutput
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean),
		pageErrors: pageErrors
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean),
	};

	mkdirSync(OUTPUT_DIR, { recursive: true });
	const fileName = `browser-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
	const filePath = join(OUTPUT_DIR, fileName);
	writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);

	console.log(`Wrote browser diagnostics: ${filePath}`);
	console.log(`Health: ${payload.runtime?.health?.status ?? "missing"}`);
	console.log(`Active websocket streams: ${payload.runtime?.health?.metrics?.activeSubscriptions ?? "unknown"}`);
	console.log(`Warm navigation duration: ${payload.navigation?.duration ?? "unknown"}ms`);

	if (problems.length > 0) {
		console.error("\nDiagnostics gate failed:");
		for (const problem of problems) console.error(`- ${problem}`);
		process.exit(1);
	}
}

main();
