/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	cancelTwap: vi.fn(),
	navigateToMarket: vi.fn(),
	setActiveTab: vi.fn(),
	side: "B" as "A" | "B",
}));

vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/ui/time-ticker", () => ({
	TimeTicker: () => <>18:24</>,
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => mocks.navigateToMarket,
}));

vi.mock("@/hooks/trade/use-twap-cancel", () => ({
	useTwapCancel: () => ({
		cancelTwap: mocks.cancelTwap,
		cancellingTwapId: null,
		feedback: null,
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: "0x1111111111111111111111111111111111111111",
		isConnected: true,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarkets: () => ({
		getMarket: () => ({ kind: "builderPerp", shortName: "GOOGL" }),
		getSzDecimals: () => 3,
	}),
	useSubscription: () => ({
		data: {
			dex: "",
			user: "0x1111111111111111111111111111111111111111",
			states: [
				[
					42,
					{
						coin: "GOOGL",
						executedNtl: "2298.76416",
						executedSz: "6.132",
						minutes: 30,
						randomize: false,
						reduceOnly: false,
						side: mocks.side,
						stopPx: null,
						sz: "15.33",
						timestamp: Date.now() - 696_000,
						trigger: null,
						user: "0x1111111111111111111111111111111111111111",
					},
				],
			],
		},
		status: "active",
		error: null,
		isStale: false,
	}),
}));

vi.mock("@/components/trade/mobile/use-mobile-terminal-tab", () => ({
	useMobileTerminalTab: () => ({ setActiveTab: mocks.setActiveTab }),
}));

import { MobileTwapTab } from "@/components/trade/mobile/mobile-twap-tab";

describe("MobileTwapTab card", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.side = "B";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function render() {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileTwapTab scrollMode="page" />
				</I18nProvider>,
			);
		});
	}

	it("renders real TWAP progress metrics and the supported terminate action", () => {
		render();

		expect(container.textContent).toContain("GOOGL");
		expect(container.textContent).toContain("Buy");
		expect(container.textContent).toContain("Remaining 18:24");
		expect(container.textContent).toContain("6.132 / 15.330 GOOGL");
		expect(container.textContent).toContain("Avg Price $374.88");
		expect(container.textContent).toContain("40%");
		expect(container.textContent).toContain("Suborder Frequency");
		expect(container.textContent).toContain("30 seconds");
		expect(container.textContent).not.toContain("Pause");

		const progress = container.querySelector<HTMLElement>('[data-testid="mobile-twap-progress"]');
		expect(progress?.style.transform).toBe("scaleX(0.4)");
		expect(progress?.className).toContain("bg-market-close-success");
		expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("0.4");
		expect(
			container.querySelector<HTMLButtonElement>('button[aria-label="Switch to GOOGL market"]')?.className,
		).toContain("min-h-11");

		const terminate = container.querySelector<HTMLButtonElement>('button[aria-label="Terminate TWAP order"]');
		expect(terminate?.className).toContain("min-h-11");
		act(() => terminate?.click());
		expect(mocks.cancelTwap).toHaveBeenCalledWith("GOOGL", 42);
	});

	it("switches the direction badge and progress color for sell TWAPs", () => {
		mocks.side = "A";
		render();

		expect(container.textContent).toContain("Sell");
		expect(container.querySelector('[data-testid="mobile-twap-progress"]')?.className).toContain(
			"bg-market-close-danger",
		);
	});
});
