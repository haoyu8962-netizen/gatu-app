/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";

function dom(node: ReactNode) {
	const host = document.createElement("div");
	host.innerHTML = renderToString(node);
	return host;
}

function required<T>(value: T | null | undefined): T {
	if (value == null) throw new Error("Expected rendered element");
	return value;
}

const routes = Object.keys(DASHBOARD_FRAMES) as (keyof typeof DASHBOARD_FRAMES)[];

describe("dashboard frame runtime layout", () => {
	it.each([false, true])("preserves desktop offsets and mobile flow for testnet=%s", (testnet) => {
		for (const preset of Object.values(DASHBOARD_FRAMES))
			for (const mobile of [false, true]) {
				const host = dom(
					<DashboardFrameView
						{...preset}
						isMobile={mobile}
						testnet={testnet}
						bannerOffset={testnet}
						header={<header />}
						main={null}
					/>,
				);
				const frame = required(host.firstElementChild);
				expect(frame.className).toBe(
					`${preset.canvasClassName}${mobile ? "" : ` pb-8 ${testnet ? "pt-[5.5rem]" : "pt-14"}`}${testnet ? " testnet-bg" : ""}`,
				);
			}
	});

	it("preserves headerless fixtures and optional footer without header padding", () => {
		const fixture = dom(
			<DashboardFrameView {...DASHBOARD_FRAMES["/vaults"]} headerOffset={false} header={null} main={<section />} />,
		);
		expect(fixture.firstElementChild?.className).toBe(
			"min-h-dvh bg-dashboard-canvas font-sans text-fg min-[1001px]:pb-8",
		);
		expect(fixture.querySelector("header, footer")).toBeNull();
		const apiFixture = dom(
			<DashboardFrameView
				{...DASHBOARD_FRAMES["/api-wallet"]}
				headerOffset={false}
				isMobile={false}
				testnet
				bannerOffset
				header={null}
				main={null}
			/>,
		);
		expect(apiFixture.firstElementChild?.className).toBe(
			"min-h-dvh bg-dashboard-canvas font-sans text-fg pb-8 testnet-bg",
		);
	});

	it.each(routes)("wires the %s page to its preset and preserves real chrome", (route) => {
		const name = route.slice(1);
		const source = readFileSync(resolve(__dirname, `../../components/${name}/${name}-page.tsx`), "utf8");
		expect(source).toContain("<DashboardFrameView");
		expect(source).toContain(`{...DASHBOARD_FRAMES["${route}"]}`);
		expect(source).toContain("<DashboardHeader isMobile={isMobile} />");
		expect(source).toContain("<FooterBar />");
		expect(source).toContain("<GlobalModals");
		expect(source).toContain("isMobile={isMobile}");
		expect(source).toContain("bannerOffset={isTestnet}");
		expect(source).toContain("testnet={isTestnet}");
		expect(source).not.toMatch(/<main\b|min-h-dvh|APP_HEADER_OFFSET_CLASS|APP_HEADER_PLUS_BANNER_OFFSET_CLASS/);
	});

	it("renders the real header chrome from the shared dashboard header", () => {
		const source = readFileSync(resolve(__dirname, "../../components/dashboard/dashboard-chrome.tsx"), "utf8");
		for (const chrome of ["MobileHeader", "TopNav", "TestnetBanner"]) expect(source).toContain(`<${chrome} />`);
	});

	it.each(["dashboard-frame-view.tsx"])("keeps %s pure", (file) => {
		const source = readFileSync(resolve(__dirname, "../../components/dashboard", file), "utf8");
		expect(source).toContain("interface Props");
		expect(source).not.toMatch(/\buse[A-Z]|@lingui|@gatu\/ui|\/stores\/|\bwindow\b|\bdocument\b|\bDate\b|Math\.random/);
	});
});

it("pins all preset classes to the pre-migration page sources", () => {
	expect(DASHBOARD_FRAMES["/portfolio"]).toEqual({
		canvasClassName: "min-h-dvh bg-portfolio-canvas text-fg font-sans",
		mainClassName: "mx-auto w-full max-w-[1440px] px-4 py-6 min-[1001px]:px-8 min-[1200px]:px-16 min-[1001px]:py-8",
	});
	expect(DASHBOARD_FRAMES["/vaults"]).toEqual({
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-[var(--earn-frame-wide-max)] py-4 min-[1001px]:px-10 min-[1001px]:py-6",
	});
	expect(DASHBOARD_FRAMES["/staking"]).toEqual({
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName:
			"mx-auto w-full max-w-[var(--staking-frame-max)] px-4 py-4 min-[1001px]:px-8 min-[1001px]:py-6 min-[1200px]:px-16",
	});
	expect(DASHBOARD_FRAMES["/referrals"]).toEqual({
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-[1440px] py-5 min-[1001px]:px-10 min-[1001px]:py-6",
	});
	expect(DASHBOARD_FRAMES["/leaderboard"]).toEqual({
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-[var(--earn-frame-max)] py-4 min-[1001px]:px-10 min-[1001px]:py-6",
	});
	expect(DASHBOARD_FRAMES["/funding-history"]).toEqual({
		canvasClassName: "min-h-dvh bg-grid-container font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-[1440px] px-4 py-5 min-[1001px]:px-10 min-[1001px]:py-6",
	});
	expect(DASHBOARD_FRAMES["/historical-orders"]).toEqual({
		canvasClassName: "min-h-dvh bg-grid-container font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-[1440px] px-4 py-5 min-[1001px]:px-10 min-[1001px]:py-6",
	});
	expect(DASHBOARD_FRAMES["/api-wallet"]).toEqual({
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-[var(--api-wallet-frame-max)] py-4 min-[1001px]:px-10 min-[1001px]:py-6",
	});
	expect(DASHBOARD_FRAMES["/trade-history"]).toEqual({
		canvasClassName: "min-h-dvh bg-grid-container font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-[1440px] px-4 py-5 min-[1001px]:px-10 min-[1001px]:py-6",
	});
});
