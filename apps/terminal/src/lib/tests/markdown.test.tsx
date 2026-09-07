// @vitest-environment jsdom

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
});
