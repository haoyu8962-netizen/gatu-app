/** @vitest-environment jsdom */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandMotion } from "@/components/brand/brand-motion";
import { ButtonLoading } from "@/components/brand/button-loading";
import { StatusGlyph } from "@/components/brand/status-glyph";
import {
	BRAND_MOTION_SUCCESS,
	BRAND_MOTION_WALLET_AWAITING,
	STATUS_GLYPH_PENDING,
	STATUS_GLYPH_SUCCESS,
	STATUS_GLYPH_UNKNOWN,
} from "@/lib/brand/status-motion.gen";

function render(element: React.ReactElement) {
	const container = document.createElement("div");
	container.innerHTML = renderToStaticMarkup(element);
	const svg = container.querySelector("svg");
	if (!svg) throw new Error("Missing svg");
	return svg;
}

describe("StatusGlyph", () => {
	it("is decorative by default and named only when a label is given", () => {
		const decorative = render(<StatusGlyph glyph={STATUS_GLYPH_SUCCESS} />);
		expect(decorative.getAttribute("aria-hidden")).toBe("true");
		expect(decorative.getAttribute("role")).toBeNull();
		expect(decorative.getAttribute("aria-label")).toBeNull();

		const named = render(<StatusGlyph glyph={STATUS_GLYPH_UNKNOWN} label="Status unconfirmed" />);
		expect(named.getAttribute("aria-hidden")).toBeNull();
		expect(named.getAttribute("role")).toBe("img");
		expect(named.getAttribute("aria-label")).toBe("Status unconfirmed");
		expect(named.querySelector("title")).toBeNull();
	});

	it("uses the 16 grid up to 18px and the 24 grid above it", () => {
		expect(render(<StatusGlyph glyph={STATUS_GLYPH_SUCCESS} />).getAttribute("viewBox")).toBe("0 0 16 16");
		expect(render(<StatusGlyph glyph={STATUS_GLYPH_SUCCESS} size={18} />).getAttribute("viewBox")).toBe("0 0 16 16");
		const large = render(<StatusGlyph glyph={STATUS_GLYPH_SUCCESS} size={20} />);
		expect(large.getAttribute("viewBox")).toBe("0 0 24 24");
		expect(large.getAttribute("width")).toBe("20");
	});

	it("paints through the tone and cut-out variables and marks only looping glyphs as in progress", () => {
		const success = render(<StatusGlyph glyph={STATUS_GLYPH_SUCCESS} />);
		expect(success.getAttribute("data-status-glyph")).toBe("success");
		expect(success.getAttribute("data-tone")).toBe("success");
		expect(success.getAttribute("class")).toContain("srm-g-success");
		expect(success.hasAttribute("data-loading-indicator")).toBe(false);
		expect(success.querySelector("circle")?.getAttribute("fill")).toBe("var(--status-tone, currentColor)");
		expect(success.querySelector("path")?.getAttribute("stroke")).toBe("var(--status-on, Canvas)");
		expect(success.querySelector("path")?.getAttribute("class")).toContain("srm-anim");

		const pending = render(<StatusGlyph glyph={STATUS_GLYPH_PENDING} />);
		expect(pending.getAttribute("data-tone")).toBe("attention");
		expect(pending.hasAttribute("data-loading-indicator")).toBe(true);
	});
});

describe("BrandMotion", () => {
	it("draws the brand mark above the status badge with logo and tone variables", () => {
		const svg = render(<BrandMotion motion={BRAND_MOTION_SUCCESS} size={48} />);
		expect(svg.getAttribute("data-brand-motion")).toBe("success");
		expect(svg.getAttribute("viewBox")).toBe("0 0 1024 1024");
		expect(svg.getAttribute("aria-hidden")).toBe("true");
		expect([...svg.querySelectorAll("g > path")].map((path) => path.getAttribute("fill"))).toEqual([
			"var(--logo-signal, currentColor)",
			"var(--logo-choice, currentColor)",
		]);
		expect(svg.querySelector(":scope > circle")?.getAttribute("fill")).toBe("var(--status-tone, currentColor)");
		expect(svg.hasAttribute("data-loading-indicator")).toBe(false);
		expect(
			render(<BrandMotion motion={BRAND_MOTION_WALLET_AWAITING} size={64} />).hasAttribute("data-loading-indicator"),
		).toBe(true);
	});

	it("renders the button indicator in the current text color", () => {
		const svg = render(<ButtonLoading />);
		expect(svg.getAttribute("data-appearance")).toBe("mono");
		expect(svg.getAttribute("data-tone")).toBeNull();
		expect(svg.getAttribute("width")).toBe("16");
		expect(svg.hasAttribute("data-loading-indicator")).toBe(true);
		expect([...svg.querySelectorAll("path")].map((path) => path.getAttribute("fill"))).toEqual([
			"currentColor",
			"currentColor",
		]);
	});
});
