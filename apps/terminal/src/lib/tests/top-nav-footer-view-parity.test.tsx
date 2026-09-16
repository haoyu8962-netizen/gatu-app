/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Button, ButtonIcon, Dropdown } from "@gatu/ui";
import { GlobeIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { act, createRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FooterBarView } from "@/components/trade/footer/footer-bar-view";
import { HeaderIconButtonView } from "@/components/trade/header/header-icon-button-view";
import { NavMenuTriggerView } from "@/components/trade/header/nav-menu-trigger-view";
import { TopNavView } from "@/components/trade/header/top-nav-view";
import { WalletCtaView } from "@/components/trade/header/wallet-cta-view";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { FOOTER_PLACEHOLDER, TOP_NAV_PLACEHOLDER } from "@/components/trade/layout/desktop-placeholders";
import { DesktopTerminalFrameView } from "@/components/trade/layout/desktop-terminal-frame-view";

// Only nav link spans may become anchors. Text, paint, clock visibility and the
// runtime spinner animation do not alter geometry. No trigger DOM exception.
const NON_GEOMETRIC = /^(?:invisible|animate-spin|text-(?:warning|success|error|market-close-(?:fg|muted)))$/;

function dom(node: ReactNode) {
	const root = document.createElement("div");
	root.innerHTML = renderToString(node);
	return root;
}

function geometry(root: Element) {
	return [...root.querySelectorAll("*")].map((element) => ({
		tag: element.tagName === "A" && element.closest("nav") ? "SPAN" : element.tagName,
		classes: [...element.classList].filter((token) => !NON_GEOMETRIC.test(token)).sort(),
	}));
}

const sampleNav = (
	<TopNavView
		{...TOP_NAV_PLACEHOLDER}
		items={TOP_NAV_PLACEHOLDER.items.map((item) => ({
			...item,
			active: item.id === "portfolio",
			label: `${item.label} translated`,
		}))}
		renderItem={(item, className) => (
			<a href={`/${item.id}`} className={className}>
				{item.label}
			</a>
		)}
		moreTrigger={
			<Dropdown
				triggerVariant="minimal"
				triggerAriaLabel="More"
				renderTrigger={<NavMenuTriggerView label="More" />}
				items={[]}
			/>
		}
		compactMoreTrigger={
			<Dropdown
				triggerVariant="minimal"
				triggerAriaLabel="More"
				renderTrigger={<NavMenuTriggerView label="More" />}
				items={[]}
			/>
		}
	/>
);

describe("desktop chrome single-source parity", () => {
	it("shares nav structure and geometry with real links and actual Dropdown triggers", () => {
		expect(geometry(dom(<TopNavView {...TOP_NAV_PLACEHOLDER} />))).toEqual(geometry(dom(sampleNav)));
	});

	it("keeps Soon screen-reader-only and collapses all compact entries in the view", () => {
		const root = dom(<TopNavView {...TOP_NAV_PLACEHOLDER} />);
		const upcoming = root.querySelector<HTMLButtonElement>("nav > button");
		expect(upcoming?.disabled).toBe(true);
		expect(upcoming?.querySelector(".sr-only")?.textContent).toBe(" — Soon");
		const nav = root.querySelector("nav");
		for (const label of ["Vaults", "Staking", "Referrals", "Leaderboard"]) {
			const item = [...(nav?.children ?? [])].find((node) => node.textContent === label);
			expect(item?.classList.contains("max-[1181px]:hidden")).toBe(true);
		}
		expect(nav?.lastElementChild?.className).toBe("hidden max-[1181px]:block");
		expect(nav?.lastElementChild?.previousElementSibling?.className).toBe("max-[1181px]:hidden");
		const language = [...root.querySelectorAll("span")].find((node) => node.textContent === "English");
		expect(language?.className).toContain("max-[1181px]:hidden");
		expect(root.innerHTML).toContain("max-[1181px]:me-8");
		expect(root.innerHTML).toContain("dark:block");
		expect(root.innerHTML).toContain("dark:hidden");
	});

	it("shares footer geometry, two divider rules, and the reserved clock slot", () => {
		const placeholder = dom(<FooterBarView {...FOOTER_PLACEHOLDER} />);
		const sample = dom(
			<FooterBarView
				{...FOOTER_PLACEHOLDER}
				clock="11:45 PM"
				commandDisabled={false}
				icon={<SpinnerGapIcon className="size-2.5 text-warning animate-spin" aria-hidden />}
				renderLink={(link, className) => (
					<a href={link.id} className={className}>
						{link.label}
					</a>
				)}
			/>,
		);
		expect(geometry(placeholder)).toEqual(geometry(sample));
		expect(placeholder.querySelector(".tabular-nums")?.textContent).toBe("00:00 AM");
		expect(placeholder.querySelector(".tabular-nums")?.classList.contains("invisible")).toBe(true);
		expect(sample.querySelector(".tabular-nums")?.classList.contains("invisible")).toBe(false);
		expect(placeholder.querySelectorAll(".border-l")).toHaveLength(2);
		expect(placeholder.querySelector("button")?.disabled).toBe(true);
		expect(sample.querySelector("button")?.disabled).toBe(false);
		expect(placeholder.querySelector('[class*="animate-"]')).toBeNull();
	});

	it("keeps anonymous and connecting desktop CTA width stable", () => {
		const placeholder = dom(TOP_NAV_PLACEHOLDER.wallet);
		const sample = dom(<WalletCtaView label="Connect Wallet" onClick={() => undefined} />);
		expect(geometry(placeholder)).toEqual(geometry(sample));
		for (const root of [placeholder, sample, dom(<WalletCtaView label="Connecting…" disabled />)]) {
			expect(root.querySelector("button")?.classList.contains("min-w-[9rem]")).toBe(true);
		}
	});

	it.each([false, true])("shares the desktop frame and preserves banner offsets (%s)", (bannerOffset) => {
		const props = { header: <header />, workspace: <main />, footer: <footer />, bannerOffset };
		const first = dom(<DesktopTerminalFrameView {...props} />);
		const second = dom(<DesktopTerminalFrameView {...props} data-testid="runtime" />);
		expect(geometry(first)).toEqual(geometry(second));
		const frame = first.firstElementChild;
		for (const token of ["min-h-dvh", "overflow-x-hidden", "pb-8", bannerOffset ? "pt-[5.5rem]" : "pt-14"])
			expect(frame?.classList.contains(token)).toBe(true);
		expect(frame?.classList.contains("h-screen")).toBe(false);
		expect(frame?.classList.contains("overflow-hidden")).toBe(false);
	});

	it("keeps shell chrome inert and shares the runtime scrolling frame", () => {
		const root = dom(<AppShellSkeleton />);
		const desktop = root.querySelector("[data-shell-desktop]");
		expect(desktop?.querySelector("header")?.classList.contains("fixed")).toBe(true);
		expect(desktop?.querySelector("footer")?.classList.contains("fixed")).toBe(true);
		expect(desktop?.querySelector("main")?.className).toBe("min-h-0 flex-1 bg-grid-container");
		expect(desktop?.classList.contains("pt-14")).toBe(true);
		for (const control of desktop?.querySelectorAll("nav, button") ?? [])
			expect(control.closest("[inert]")).not.toBeNull();
	});

	it("forwards button refs and events and lets Dropdown own keyboard and disabled behavior", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		const menuRef = createRef<HTMLButtonElement>();
		const iconRef = createRef<HTMLButtonElement>();
		const walletRef = createRef<HTMLButtonElement>();
		const selected = vi.fn();
		const clicked = vi.fn();
		function controls(disabled: boolean) {
			return (
				<>
					<Dropdown
						disabled={disabled}
						triggerVariant="minimal"
						triggerAriaLabel="Actions"
						renderTrigger={<NavMenuTriggerView ref={menuRef} label="More" />}
						items={[{ label: "Action", onSelect: selected }]}
					/>
					<HeaderIconButtonView ref={iconRef} aria-label="Settings" onClick={clicked} />
					<WalletCtaView ref={walletRef} label="Connect Wallet" onClick={clicked} />
				</>
			);
		}
		try {
			await act(async () => root.render(controls(false)));
			expect(menuRef.current?.tagName).toBe("BUTTON");
			act(() => {
				iconRef.current?.click();
				walletRef.current?.click();
			});
			expect(clicked).toHaveBeenCalledTimes(2);
			await act(async () =>
				menuRef.current?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
			);
			expect(menuRef.current?.getAttribute("aria-expanded")).toBe("true");
			await act(async () => document.querySelector<HTMLButtonElement>('[role="menuitem"]')?.click());
			expect(selected).toHaveBeenCalledOnce();
			await act(async () => root.render(controls(true)));
			expect(menuRef.current?.disabled).toBe(true);
			expect(container.querySelector("button button")).toBeNull();
		} finally {
			await act(async () => root.unmount());
			container.remove();
		}
	});

	it("uses the same language trigger geometry with and without the primitive", () => {
		const trigger = (
			<NavMenuTriggerView
				variant="language"
				label="English"
				compactLabel
				icon={<GlobeIcon className="size-[18px] shrink-0" />}
			/>
		);
		const plain = dom(trigger).firstElementChild;
		const wrapped = dom(
			<Dropdown triggerVariant="minimal" triggerAriaLabel="Language" renderTrigger={trigger} groups={[]} />,
		).querySelector("button");
		expect(wrapped?.className).toBe(plain?.className);
		expect(wrapped?.innerHTML).toBe(plain?.innerHTML);
	});

	it("retains resolved primitive button and minimal trigger geometry", () => {
		const icon = <GlobeIcon className="size-[18px]" />;
		const iconClass =
			"size-[34px] rounded-[10px] text-market-close-muted hover:bg-market-close-hover hover:text-market-close-fg";
		const oldIcon = dom(
			<ButtonIcon variant="ghost" intent="neutral" aria-label="Settings" className={iconClass}>
				{icon}
			</ButtonIcon>,
		);
		const newIcon = dom(
			<HeaderIconButtonView aria-label="Settings" className={iconClass}>
				{icon}
			</HeaderIconButtonView>,
		);
		expect(geometry(newIcon)).toEqual(geometry(oldIcon));
		const walletClass =
			"h-8 min-h-8 min-w-[9rem] shrink-0 px-3 transition-[color,background-color,border-color] duration-150 ease-out h-[34px] min-h-[34px] rounded-[10px] border-market-close-control bg-market-close-control px-4 font-market-close text-[13px] leading-[18px] font-bold text-market-close-on-control shadow-none hover:bg-market-close-control hover:opacity-90 active:bg-market-close-control";
		expect(geometry(dom(<WalletCtaView label="Connect Wallet" />))).toEqual(
			geometry(
				dom(
					<Button variant="filled" intent="neutral" size="sm" className={walletClass}>
						<span>Connect Wallet</span>
					</Button>,
				),
			),
		);
		const moreClass =
			"h-[34px] rounded-[8px] px-2.5 py-2 text-[13px] leading-[18px] font-semibold whitespace-nowrap text-market-close-muted transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg data-[popup-open]:bg-market-close-hover data-[popup-open]:text-market-close-fg [&>svg]:size-[10px]";
		const before = dom(
			<Dropdown
				triggerVariant="minimal"
				triggerAriaLabel="More"
				size="md"
				trigger="More"
				triggerClassName={moreClass}
			/>,
		);
		const after = dom(
			<Dropdown triggerVariant="minimal" triggerAriaLabel="More" renderTrigger={<NavMenuTriggerView label="More" />} />,
		);
		expect(geometry(after)).toEqual(geometry(before));
	});

	it("keeps every new view pure and both runtime containers wired to it", () => {
		for (const path of [
			"layout/desktop-terminal-frame-view",
			"header/top-nav-view",
			"footer/footer-bar-view",
			"header/nav-menu-trigger-view",
			"header/header-icon-button-view",
			"header/wallet-cta-view",
		]) {
			const source = readFileSync(resolve(__dirname, `../../components/trade/${path}.tsx`), "utf8");
			expect(source, path).toContain("interface Props");
			expect(source, path).not.toMatch(
				/\buse[A-Z]|@lingui|@gatu\/ui|\/stores\/|\bwindow\b|\bdocument\b|\bDate\b|Math\.random|\/\//,
			);
		}
		for (const [path, view] of [
			["header/top-nav", "TopNavView"],
			["footer/footer-bar", "FooterBarView"],
			["layout/desktop-terminal-surface", "DesktopTerminalFrameView"],
		]) {
			expect(readFileSync(resolve(__dirname, `../../components/trade/${path}.tsx`), "utf8")).toContain(`<${view}`);
		}
	});
});
