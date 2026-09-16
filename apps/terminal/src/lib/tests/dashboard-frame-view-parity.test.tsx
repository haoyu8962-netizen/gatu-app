/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { DashboardShellSkeleton } from "@/components/dashboard/dashboard-shell-skeleton";
import { FooterBarView } from "@/components/trade/footer/footer-bar-view";
import { TopNavView } from "@/components/trade/header/top-nav-view";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { FOOTER_PLACEHOLDER, TOP_NAV_PLACEHOLDER } from "@/components/trade/layout/desktop-placeholders";
import { MOBILE_HEADER_PLACEHOLDER } from "@/components/trade/layout/mobile-placeholders";
import { MobileHeaderView } from "@/components/trade/mobile/mobile-header-view";
import { DASHBOARD_FRAMES, getDashboardFrame } from "@/config/dashboard-frames";
import { DESKTOP_NAV_ITEMS } from "@/config/desktop-nav";

function dom(node: ReactNode) {
	const host = document.createElement("div");
	host.innerHTML = renderToString(node);
	return host;
}

function required<T>(value: T | null | undefined): T {
	if (value == null) throw new Error("Expected rendered element");
	return value;
}

function geometry(element: Element): unknown {
	return {
		tag: element.tagName,
		classes: [...element.classList]
			.filter(
				(name) =>
					!["text-market-close-fg", "text-market-close-muted", "invisible", "min-[1001px]:hidden"].includes(name),
			)
			.sort(),
		children: [...element.children].map(geometry),
	};
}

function frameClasses(element: Element, mobile: boolean) {
	return [...element.classList]
		.flatMap((name) => {
			if (!name.startsWith("min-[1001px]:")) return [name];
			return mobile ? [] : [name.replace("min-[1001px]:", "")];
		})
		.sort();
}

const routes = Object.keys(DASHBOARD_FRAMES) as (keyof typeof DASHBOARD_FRAMES)[];

describe("dashboard frame single-source parity", () => {
	it.each(routes)("shares %s frame, main and chrome geometry with a sample page", (route) => {
		const preset = DASHBOARD_FRAMES[route];
		const shell = dom(<DashboardShellSkeleton frame={preset} pathname={route} />);
		const shellMain = required(shell.querySelector("main"));
		for (const mobile of [false, true]) {
			const sample = dom(
				<DashboardFrameView
					{...preset}
					isMobile={mobile}
					header={
						mobile ? (
							<MobileHeaderView {...MOBILE_HEADER_PLACEHOLDER} />
						) : (
							<TopNavView
								{...TOP_NAV_PLACEHOLDER}
								items={TOP_NAV_PLACEHOLDER.items.map((item) => ({ ...item, active: item.id === route.slice(1) }))}
							/>
						)
					}
					main={
						<section>
							<h1>Sample page</h1>
							<input defaultValue="preserved" />
						</section>
					}
					footer={mobile ? null : <FooterBarView {...FOOTER_PLACEHOLDER} clock="10:15 AM" />}
				/>,
			);
			const sampleMain = required(sample.querySelector("main"));
			expect(shellMain.tagName).toBe(sampleMain.tagName);
			expect(shellMain.className).toBe(preset.mainClassName);
			expect(shellMain.className).toBe(sampleMain.className);
			expect(frameClasses(required(shellMain.parentElement), mobile)).toEqual(
				frameClasses(required(sampleMain.parentElement), mobile),
			);
			expect(geometry(required(shell.querySelectorAll("header")[mobile ? 0 : 1]))).toEqual(
				geometry(required(sample.querySelector("header"))),
			);
			if (!mobile)
				expect(geometry(required(shell.querySelector("footer")))).toEqual(
					geometry(required(sample.querySelector("footer"))),
				);
		}
	});

	it("uses the terminal shell's exact header markup when the active item matches", () => {
		const dashboard = dom(<DashboardShellSkeleton pathname="/" />);
		const terminal = dom(<AppShellSkeleton />);
		expect(dashboard.querySelectorAll("header")[1].outerHTML).toBe(
			terminal.querySelector("[data-shell-desktop] header")?.outerHTML,
		);
		const mobile = dashboard.querySelectorAll("header")[0].cloneNode(true) as Element;
		mobile.classList.remove("min-[1001px]:hidden");
		expect(mobile.outerHTML).toBe(terminal.querySelector("[data-shell-mobile] header")?.outerHTML);
		expect(dashboard.querySelector("footer")?.outerHTML).toBe(terminal.querySelector("footer")?.outerHTML);
		expect(dashboard.querySelectorAll("header")[1].parentElement?.className).toBe("hidden min-[1001px]:block");
		expect(dashboard.querySelector("footer")?.parentElement?.className).toBe("hidden min-[1001px]:block");
	});

	it.each([
		"/portfolio",
		"/vaults",
		"/vaults/example",
		"/staking",
		"/referrals",
		"/leaderboard",
		"/api-wallet",
		"/fundingHistory/example",
	])("marks only the route's nav item active for %s", (pathname) => {
		const host = dom(<DashboardShellSkeleton pathname={pathname} frame={getDashboardFrame(pathname)} />);
		const nav = required(host.querySelectorAll("header")[1].querySelector("nav"));
		const active = [...nav.children]
			.filter((node) => node.classList.contains("text-market-close-fg"))
			.map((node) => node.textContent);
		const expected = DESKTOP_NAV_ITEMS.filter(
			(item) => item.path === pathname || (item.id === "vaults" && pathname.startsWith("/vaults/")),
		).map((item) => item.label.message);
		expect(active).toEqual(expected);
		const menus = nav.querySelectorAll("button");
		expect(menus[menus.length - 2].classList.contains("text-market-close-fg")).toBe(pathname === "/api-wallet");
		expect(menus[menus.length - 1].classList.contains("text-market-close-fg")).toBe(
			pathname === "/api-wallet" || ["Vaults", "Staking", "Referrals", "Leaderboard"].includes(expected[0] ?? ""),
		);
	});

	it.each([false, true])("preserves desktop offsets and mobile flow for testnet=%s", (testnet) => {
		for (const mobile of [false, true]) {
			const host = dom(
				<DashboardFrameView
					{...DASHBOARD_FRAMES["/portfolio"]}
					isMobile={mobile}
					testnet={testnet}
					bannerOffset={testnet}
					header={<header />}
					main={null}
				/>,
			);
			const frame = required(host.firstElementChild);
			expect(frame.className).toBe(
				`${DASHBOARD_FRAMES["/portfolio"].canvasClassName}${mobile ? "" : ` pb-8 ${testnet ? "pt-[5.5rem]" : "pt-14"}`}${testnet ? " testnet-bg" : ""}`,
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

	it.each([
		["/vaults/example", "/vaults"],
		["/vaults/", "/vaults"],
		["/join/code", "/referrals"],
		["/fundingHistory/example", "/funding-history"],
		["/historicalOrders/example", "/historical-orders"],
		["/tradeHistory/example", "/trade-history"],
		["/unknown", "/funding-history"],
		["/vaults-other", "/funding-history"],
	] as const)("resolves %s to %s", (path, preset) => expect(getDashboardFrame(path)).toBe(DASHBOARD_FRAMES[preset]));

	it.each(routes)("wires the %s page to its preset and preserves real chrome", (route) => {
		const name = route.slice(1);
		const source = readFileSync(resolve(__dirname, `../../components/${name}/${name}-page.tsx`), "utf8");
		expect(source).toContain("<DashboardFrameView");
		expect(source).toContain(`{...DASHBOARD_FRAMES["${route}"]}`);
		for (const chrome of ["MobileHeader", "TopNav", "FooterBar", "TestnetBanner"])
			expect(source).toContain(`<${chrome} />`);
		expect(source).toContain("isMobile={isMobile}");
		expect(source).toContain("bannerOffset={isTestnet}");
		expect(source).toContain("testnet={isTestnet}");
		expect(source).not.toMatch(/<main\b|min-h-dvh|APP_HEADER_OFFSET_CLASS|APP_HEADER_PLUS_BANNER_OFFSET_CLASS/);
	});

	it.each(["dashboard-frame-view.tsx", "dashboard-content-placeholder-view.tsx"])("keeps %s pure", (file) => {
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
