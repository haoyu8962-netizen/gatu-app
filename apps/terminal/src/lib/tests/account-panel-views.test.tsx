// @vitest-environment jsdom
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AccountTableHeaderView } from "@/components/trade/positions/account-table-header-view";
import { AccountActionButtonView } from "@/components/trade/tradebox/account-action-button-view";
import { AccountPanelFrameView } from "@/components/trade/tradebox/account-panel-frame-view";
import { DisconnectedAccountOverview } from "@/components/trade/tradebox/disconnected-account-overview";

function dom(node: ReactNode) {
	const host = document.createElement("div");
	host.innerHTML = renderToString(node);
	return host;
}
function required<T>(value: T | null | undefined): T {
	if (value == null) throw new Error("Missing element");
	return value;
}
function translated(node: ReactNode) {
	return <I18nProvider i18n={setupI18n({ locale: "en", messages: { en: {} } })}>{node}</I18nProvider>;
}

it("forwards refs and enabled events but prevents focusable disabled activation", () => {
	const host = document.createElement("div");
	const root = createRoot(host);
	const ref = createRef<HTMLButtonElement>();
	const onClick = vi.fn();
	try {
		act(() =>
			root.render(
				<AccountActionButtonView
					ref={ref}
					variant="filled"
					label="Deposit"
					onClick={onClick}
					disabled
					focusableWhenDisabled
				/>,
			),
		);
		const button = required(ref.current);
		act(() => button.click());
		expect(onClick).not.toHaveBeenCalled();
		const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
		button.dispatchEvent(enter);
		expect(enter.defaultPrevented).toBe(true);
		const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
		button.dispatchEvent(tab);
		expect(tab.defaultPrevented).toBe(false);
		act(() => root.render(<AccountActionButtonView ref={ref} variant="filled" label="Deposit" onClick={onClick} />));
		expect(ref.current).toBe(button);
		act(() => button.click());
		expect(onClick).toHaveBeenCalledOnce();
	} finally {
		act(() => root.unmount());
	}
});
it("preserves scroller and toolbar ref targets and optional action padding", () => {
	const host = document.createElement("div");
	const root = createRoot(host);
	const scrollRef = createRef<HTMLDivElement>();
	const actionsRef = createRef<HTMLDivElement>();
	try {
		act(() =>
			root.render(<AccountTableHeaderView scrollRef={scrollRef} actionsRef={actionsRef} tabs={<span>Tabs</span>} />),
		);
		expect(scrollRef.current).toBe(host.querySelector('[data-testid="positions-tabs-scroll"]'));
		expect(actionsRef.current?.className).toBe("flex shrink-0 items-center gap-2");
		act(() =>
			root.render(
				<AccountTableHeaderView
					scrollRef={scrollRef}
					actionsRef={actionsRef}
					tabs={<span>Tabs</span>}
					actions={<button type="button">Filter</button>}
				/>,
			),
		);
		expect(actionsRef.current?.className).toBe("flex shrink-0 items-center gap-2 pl-3");
	} finally {
		act(() => root.unmount());
	}
});
it("mirrors the real disconnected overview's five visible zero values", () => {
	const runtime = dom(
		translated(
			<AccountPanelFrameView title="Account">
				<DisconnectedAccountOverview depositEnabled={false} />
			</AccountPanelFrameView>,
		),
	);
	const values = (node: Element) =>
		[...node.querySelectorAll('[data-slot="info-row-value"]')].map((row) => row.textContent);
	expect(values(runtime)).toEqual(["0.00%", "$0.00", "$0.00", "$0.00", "0.00x"]);
	expect(runtime.querySelectorAll("[data-grid-content-part]")).toHaveLength(1);
	expect(runtime.querySelectorAll(".invisible")).toHaveLength(0);
	expect([...runtime.querySelectorAll('[data-slot="info-row-label"]')].map((row) => row.textContent)).toEqual([
		"Account Margin Ratio",
		"Portfolio Value",
		"Unrealized PNL",
		"Cross Maintenance Margin",
		"Cross Account Leverage",
	]);
	expect(runtime.querySelector("h3")?.textContent).toBe("Account Summary");
	expect(runtime.querySelectorAll("[data-disabled]")).toHaveLength(2);
});
it("passes the accessible description and preserves the sponsored deposit action", () => {
	const onDeposit = vi.fn();
	const host = document.createElement("div");
	const root = createRoot(host);
	try {
		act(() =>
			root.render(
				translated(
					<DisconnectedAccountOverview
						depositEnabled={false}
						depositDisabledReason="Unavailable"
						onDeposit={onDeposit}
					/>,
				),
			),
		);
		const button = required(host.querySelector("button"));
		expect(button.getAttribute("aria-disabled")).toBe("true");
		expect(host.querySelector(`[id="${button.getAttribute("aria-describedby")}"]`)?.textContent).toBe("Unavailable");
		act(() => button.click());
		expect(onDeposit).not.toHaveBeenCalled();
		act(() => root.render(translated(<DisconnectedAccountOverview depositEnabled onDeposit={onDeposit} />)));
		expect(host.querySelector("button")).toBe(button);
		expect(button.hasAttribute("aria-describedby")).toBe(false);
		act(() => button.click());
		expect(onDeposit).toHaveBeenCalledOnce();
		expect(host.querySelectorAll("button")[1].disabled).toBe(true);
	} finally {
		act(() => root.unmount());
	}
});
