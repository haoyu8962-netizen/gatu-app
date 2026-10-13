// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

describe("renderMarkdown links", () => {
	it("keeps links identifiable without relying on hover or color alone", () => {
		const container = document.createElement("div");
		container.innerHTML = renderToStaticMarkup(
			<div>
				{renderMarkdown(
					"Read the [guide](/docs) or [official source](https://hyperliquid.gitbook.io/hyperliquid-docs).",
				)}
			</div>,
		);
		const [internalLink, externalLink] = [...container.querySelectorAll("a")];

		for (const link of [internalLink, externalLink]) {
			expect(link.classList).toContain("underline");
			expect(link.classList).toContain("underline-offset-2");
			expect(link.classList).toContain("focus-visible:outline-2");
			expect(link.classList).not.toContain("hover:underline");
		}
		expect(internalLink.getAttribute("target")).toBeNull();
		expect(externalLink.getAttribute("target")).toBe("_blank");
		expect(externalLink.getAttribute("rel")).toBe("noopener noreferrer");
	});

	it("renders links with a scheme other than http, https or mailto as plain text", () => {
		const container = document.createElement("div");
		container.innerHTML = renderToStaticMarkup(
			<div>
				{renderMarkdown(
					"[run](javascript:alert(1)) [data](data:text/html,x) [split](java\tscript:alert(1)) [mail](mailto:support@example.com) [page](/docs) [anchor](#top)",
				)}
			</div>,
		);
		const links = [...container.querySelectorAll("a")].map((link) => link.getAttribute("href"));

		expect(links).toEqual(["mailto:support@example.com", "/docs", "#top"]);
		expect(container.textContent).toContain("run");
		expect(container.textContent).toContain("data");
		expect(container.textContent).toContain("split");
	});
});

function renderDocument(markdown: string) {
	const container = document.createElement("div");
	container.innerHTML = renderToStaticMarkup(<div>{renderMarkdown(markdown)}</div>);
	return container;
}

describe("renderMarkdown document structure", () => {
	it("renders emphasis while preserving identifiers and multiplication", () => {
		const container = renderDocument("_x_ and *x* snake_case_identifier a*b a*b*c **strong** `code`");
		expect([...container.querySelectorAll("em")].map((node) => node.textContent)).toEqual(["x", "x"]);
		expect(container.textContent).toBe("x and x snake_case_identifier a*b a*b*c strong code");
		expect(container.querySelector("strong")?.textContent).toBe("strong");
		expect(container.querySelector("code")?.textContent).toBe("code");
	});
	it("keeps ordered items together with their nested bullets", () => {
		const container = renderDocument("1. First\n   - A\n   - B\n2. Second\n   - C\n3. Third\n   - D");
		expect(container.querySelectorAll("ol")).toHaveLength(1);
		const list = container.querySelector("ol");
		expect(list?.children).toHaveLength(3);
		for (const item of list?.children ?? []) {
			expect(item.tagName).toBe("LI");
			expect(item.querySelector(":scope > ul")).not.toBeNull();
		}
	});
	it("slugs headings from inline text and retains Unicode letters", () => {
		const container = renderDocument(
			"## Reporting Bugs & Feedback\n## **Frequently** _Asked_ *Questions*\n### [Guide](/docs) `Code` 中文 snake_case",
		);
		expect([...container.querySelectorAll("h2, h3")].map((node) => node.id)).toEqual([
			"reporting-bugs--feedback",
			"frequently-asked-questions",
			"guide-code-中文-snake_case",
		]);
		for (const heading of container.querySelectorAll("h2, h3")) {
			expect(heading.classList).toContain("scroll-mt-[calc(var(--markdown-anchor-offset,0rem)+1rem)]");
		}
	});
	it("resolves every published support in-page link to a heading", () => {
		const support = readFileSync(resolve(__dirname, "../../../../../legal/support.md"), "utf8");
		const container = renderDocument(support);
		const links = [...container.querySelectorAll('a[href^="#"]')];
		expect(links.length).toBeGreaterThan(0);
		const ids = [...container.querySelectorAll("[id]")].map((node) => node.id);
		for (const link of links) expect(ids).toContain(link.getAttribute("href")?.slice(1));
	});
});
