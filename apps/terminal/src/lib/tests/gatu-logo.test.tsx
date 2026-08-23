import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GatuLogo } from "@/components/brand/gatu-logo";

describe("GatuLogo", () => {
	it("renders the approved centered micro mark geometry", () => {
		const markup = renderToStaticMarkup(<GatuLogo variant="mark" micro />);

		expect(markup).toContain('viewBox="0 0 48 48"');
		expect(markup).toContain('stroke-width="6.5"');
		expect(markup).toContain('stroke-linecap="butt"');
		expect(markup).toContain('x="17.5"');
		expect(markup).toContain('fill="var(--logo-node, currentColor)"');
	});

	it("renders the approved 225.95 by 49.95 horizontal lockup", () => {
		const markup = renderToStaticMarkup(<GatuLogo />);

		expect(markup).toContain('viewBox="0 0 225.95 49.95"');
		expect(markup).toContain('transform="scale(1.35) translate(-5.5,-5.5)"');
		expect(markup).not.toContain('viewBox="0 0 120 120"');
	});
});
