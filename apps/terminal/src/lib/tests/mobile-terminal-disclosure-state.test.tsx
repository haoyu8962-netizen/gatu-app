/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MobilePositionsDisclosureStates } from "@/components/trade/mobile/use-mobile-disclosure-set";

const terminalState = vi.hoisted(() => ({
	activeTab: "trade" as "markets" | "trade" | "account",
	address: "0x1234",
	env: "Mainnet" as "Mainnet" | "Testnet",
	isConnected: true,
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

vi.mock("@/components/trade/mobile/mobile-account-view", () => ({
	MobileAccountView: () => <div data-testid="account-surface" />,
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
});
