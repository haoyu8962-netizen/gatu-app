/** @vitest-environment jsdom */

import { act, type ReactNode, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MobilePositionsDisclosureStates } from "@/components/trade/mobile/use-mobile-disclosure-set";

const terminalState = vi.hoisted(() => ({
	activeTab: "trade" as "markets" | "trade" | "account",
	address: "0x1234",
	env: "Mainnet" as "Mainnet" | "Testnet",
	isConnected: true,
	accountEffectMounts: 0,
	accountEffectCleanups: 0,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: terminalState.isConnected ? terminalState.address : null,
		isConnected: terminalState.isConnected,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ env: terminalState.env }),
}));

vi.mock("@/components/trade/mobile/use-mobile-terminal-tab", () => ({
	useMobileTerminalTab: () => ({ activeTab: terminalState.activeTab, setActiveTab: vi.fn() }),
}));

vi.mock("@/components/trade/mobile/mobile-trade-layout", () => ({
	MobileTradeLayout: ({
		active,
		disclosureStates,
		showOrderForm = true,
	}: {
		active: boolean;
		disclosureStates: MobilePositionsDisclosureStates;
		showOrderForm?: boolean;
	}) => {
		if (!active) return null;
		const surface = showOrderForm ? "trade" : "markets";
		const { expandedKeys, setExpanded } = disclosureStates.positions.createController(["position-one"]);
		const expanded = expandedKeys.has("position-one");
		return (
			<div data-testid={`${surface}-surface`} data-expanded={expanded}>
				<button type="button" onClick={() => setExpanded("position-one", !expanded)}>
					Toggle position
				</button>
			</div>
		);
	},
}));

vi.mock("@/components/trade/mobile/mobile-market-bar-provider", () => ({
	MobileMarketBarProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/trade/mobile/mobile-account-view", () => ({
	MobileAccountView: () => {
		const [revision, setRevision] = useState(0);
		useEffect(() => {
			terminalState.accountEffectMounts += 1;
			return () => {
				terminalState.accountEffectCleanups += 1;
			};
		}, []);
		return (
			<div data-testid="account-surface" data-revision={revision}>
				<button type="button" onClick={() => setRevision((value) => value + 1)}>
					Update account state
				</button>
			</div>
		);
	},
}));

vi.mock("@/components/trade/mobile/mobile-bottom-nav", () => ({
	MobileBottomNav: () => null,
}));

vi.mock("@/components/trade/mobile/mobile-header", () => ({
	MobileHeader: () => null,
}));

vi.mock("@/components/trade/geo/geo-restriction-banner", () => ({
	GeoRestrictionBanner: () => null,
}));

vi.mock("@/components/trade/mobile/offline-banner", () => ({
	OfflineBanner: () => null,
}));

import { MobileTerminal } from "@/components/trade/mobile/mobile-terminal";

describe("MobileTerminal disclosure state", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		terminalState.activeTab = "trade";
		terminalState.address = "0x1234";
		terminalState.env = "Mainnet";
		terminalState.isConnected = true;
		terminalState.accountEffectMounts = 0;
		terminalState.accountEffectCleanups = 0;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function render() {
		act(() => root.render(<MobileTerminal />));
	}

	it("pins the terminal shell without a duplicate bottom-navigation inset", () => {
		render();

		const terminal = container.querySelector<HTMLElement>(".mobile-terminal");
		const main = terminal?.querySelector("main");
		expect(terminal?.className).toContain("fixed");
		expect(terminal?.className).toContain("inset-0");
		expect(terminal?.className).toContain("overflow-hidden");
		expect(terminal?.className).toContain("overscroll-none");
		expect(terminal?.className).not.toContain("h-dvh");
		expect(terminal?.className).not.toContain("pl-[var(--sal)]");
		expect(terminal?.className).not.toContain("pr-[var(--sar)]");
		expect(main?.className).toContain("pl-[var(--sal)]");
		expect(main?.className).toContain("pr-[var(--sar)]");
		expect(main?.style.paddingBottom).toBe("");
	});

	it("shares disclosure state across bottom navigation and resets it for a new identity", () => {
		render();
		const tradeSurface = container.querySelector<HTMLElement>('[data-testid="trade-surface"]');
		expect(tradeSurface?.dataset.expanded).toBe("false");
		act(() => tradeSurface?.querySelector("button")?.click());
		expect(container.querySelector<HTMLElement>('[data-testid="trade-surface"]')?.dataset.expanded).toBe("true");

		terminalState.activeTab = "markets";
		render();
		expect(container.querySelector<HTMLElement>('[data-testid="markets-surface"]')?.dataset.expanded).toBe("true");

		terminalState.activeTab = "account";
		render();
		expect(container.querySelector('[data-testid="account-surface"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="trade-surface"]')).toBeNull();
		expect(container.querySelector('[data-testid="markets-surface"]')).toBeNull();

		terminalState.activeTab = "trade";
		render();
		expect(container.querySelector<HTMLElement>('[data-testid="trade-surface"]')?.dataset.expanded).toBe("true");

		terminalState.address = "0xABCD";
		render();
		expect(container.querySelector<HTMLElement>('[data-testid="trade-surface"]')?.dataset.expanded).toBe("false");

		act(() => container.querySelector<HTMLButtonElement>('[data-testid="trade-surface"] button')?.click());
		terminalState.env = "Testnet";
		render();
		expect(container.querySelector<HTMLElement>('[data-testid="trade-surface"]')?.dataset.expanded).toBe("false");

		terminalState.isConnected = false;
		render();
		expect(container.querySelector<HTMLElement>('[data-testid="trade-surface"]')?.dataset.expanded).toBe("false");
	});

	it("preserves Account DOM state while hidden and resets it for a new identity", () => {
		terminalState.activeTab = "account";
		render();
		const accountSurface = container.querySelector<HTMLElement>('[data-testid="account-surface"]');
		expect(accountSurface).not.toBeNull();
		if (!accountSurface) throw new Error("Account surface did not render");
		expect(terminalState.accountEffectMounts).toBe(1);
		expect(terminalState.accountEffectCleanups).toBe(0);

		accountSurface.scrollTop = 120;
		act(() => accountSurface.querySelector("button")?.click());
		expect(accountSurface.dataset.revision).toBe("1");

		terminalState.activeTab = "trade";
		render();
		expect(container.querySelector('[data-testid="account-surface"]')).toBe(accountSurface);
		expect(accountSurface.parentElement?.style.display).toBe("none");
		expect(terminalState.accountEffectCleanups).toBe(1);

		terminalState.activeTab = "account";
		render();
		expect(container.querySelector('[data-testid="account-surface"]')).toBe(accountSurface);
		expect(accountSurface.dataset.revision).toBe("1");
		expect(accountSurface.scrollTop).toBe(120);
		expect(terminalState.accountEffectMounts).toBe(2);

		terminalState.address = "0xABCD";
		render();
		const nextAccountSurface = container.querySelector<HTMLElement>('[data-testid="account-surface"]');
		expect(nextAccountSurface).not.toBe(accountSurface);
		expect(nextAccountSurface?.dataset.revision).toBe("0");
		expect(nextAccountSurface?.scrollTop).toBe(0);
	});
});
