import { describe, expect, it } from "vitest";
import { DOCUMENT_ROUTE_PATHS } from "@/config/document-routes";
import {
	classifyStaticPageRequest,
	decorateStaticPage,
	REFERRAL_JOIN_ROUTE_MARKER,
	STATIC_SHELL_FILE,
} from "@/lib/static-pages/static-pages";

describe("static page classification", () => {
	it("serves the shell for application navigations and the prerendered file for document routes", () => {
		expect(classifyStaticPageRequest("GET", "/trade/BTC")).toEqual({
			kind: "page",
			candidates: [STATIC_SHELL_FILE],
			marker: null,
		});
		expect(classifyStaticPageRequest("GET", "/trade/xyz:CXMT/")).toMatchObject({ kind: "page" });
		expect(classifyStaticPageRequest("HEAD", "/portfolio")).toMatchObject({
			kind: "page",
			candidates: [STATIC_SHELL_FILE],
		});
		expect(classifyStaticPageRequest("GET", "/")).toEqual({
			kind: "page",
			candidates: [STATIC_SHELL_FILE],
			marker: null,
		});
		for (const path of DOCUMENT_ROUTE_PATHS) {
			expect(classifyStaticPageRequest("GET", path)).toEqual({
				kind: "page",
				candidates: [`${path.slice(1)}/index.html`, STATIC_SHELL_FILE],
				marker: null,
			});
			expect(classifyStaticPageRequest("GET", `${path}/`)).toMatchObject({
				candidates: [`${path.slice(1)}/index.html`, STATIC_SHELL_FILE],
			});
		}
	});

	it("stamps the referral route marker only on join paths", () => {
		expect(classifyStaticPageRequest("GET", "/join/__gatu_healthcheck__")).toEqual({
			kind: "page",
			candidates: [STATIC_SHELL_FILE],
			marker: REFERRAL_JOIN_ROUTE_MARKER,
		});
		expect(classifyStaticPageRequest("GET", "/join")).toMatchObject({ marker: REFERRAL_JOIN_ROUTE_MARKER });
		expect(classifyStaticPageRequest("GET", "/joiner")).toMatchObject({ marker: null });
	});

	it("passes GET-able API routes, non-navigation methods and unsafe paths to the server handlers", () => {
		for (const path of ["/api/geo", "/api/leaderboard", "/join/%", "/../etc/passwd", "/trade/..", "/trade\\BTC"]) {
			expect(classifyStaticPageRequest("GET", path), path).toEqual({ kind: "pass" });
		}
		for (const path of ["/trade/BTC", "/api/referral-geo", "/api/client-error-report", "/mobile-agent-sync-ticket"]) {
			expect(classifyStaticPageRequest("POST", path), path).toEqual({ kind: "pass" });
		}
		expect(classifyStaticPageRequest("OPTIONS", "/docs")).toEqual({ kind: "pass" });
	});

	it("never renders a page for server paths that are requested with the wrong method", () => {
		for (const path of [
			"/api/referral-geo",
			"/api/client-error-report",
			"/client-error-report",
			"/mobile-agent-sync-ticket",
			"/mobile-agent-sync-ticket/",
			"/mobile-agent-sync-ticket/consume",
		]) {
			expect(classifyStaticPageRequest("GET", path), path).toEqual({ kind: "method-not-allowed", allow: "POST" });
			expect(classifyStaticPageRequest("HEAD", path), path).toEqual({ kind: "method-not-allowed", allow: "POST" });
		}
		for (const path of ["/api", "/api/", "/api/unknown", "/api/geo/extra"]) {
			expect(classifyStaticPageRequest("GET", path), path).toEqual({ kind: "not-found" });
		}
	});

	it("refuses HTML for file-like paths and reports the server-function transport as gone", () => {
		expect(classifyStaticPageRequest("GET", "/assets/missing.js")).toEqual({ kind: "not-found" });
		expect(classifyStaticPageRequest("GET", "/favicon.ico")).toEqual({ kind: "not-found" });
		expect(classifyStaticPageRequest("GET", "/_serverFn/abc")).toEqual({ kind: "gone" });
	});
});

describe("static page decoration", () => {
	it("inserts the marker right after the head tag and leaves other pages untouched", () => {
		const html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/></head><body></body></html>';
		expect(decorateStaticPage(html, REFERRAL_JOIN_ROUTE_MARKER)).toBe(
			`<!DOCTYPE html><html lang="en"><head>${REFERRAL_JOIN_ROUTE_MARKER}<meta charset="utf-8"/></head><body></body></html>`,
		);
		expect(decorateStaticPage(html, null)).toBe(html);
		expect(decorateStaticPage("<body></body>", REFERRAL_JOIN_ROUTE_MARKER)).toBe("<body></body>");
	});
});
