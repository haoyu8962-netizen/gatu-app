// @vitest-environment jsdom
import { Dropdown } from "@sairn/ui";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { TokenSelectorTriggerView } from "@/components/trade/chart/token-selector-trigger-view";
import { FavoritesStripView } from "@/components/trade/header/favorites-strip-view";
import { HeaderIconButtonView } from "@/components/trade/header/header-icon-button-view";
import { NavMenuTriggerView } from "@/components/trade/header/nav-menu-trigger-view";
import { WalletCtaView } from "@/components/trade/header/wallet-cta-view";

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

it("forwards native button events and refs for market and favorite controls", () => {
	const container = document.createElement("div");
	const root = createRoot(container);
	const selected: string[] = [];
	const removed: string[] = [];
	const triggerRef = createRef<HTMLButtonElement>();
	try {
		act(() =>
			root.render(
				<>
					<FavoritesStripView
						items={[{ name: "BTC", label: "BTC", active: true }]}
						emptyLabel="Select favorite markets"
						onSelect={(name) => selected.push(name)}
						onRemove={(name) => removed.push(name)}
						selectLabel={(name) => `Select ${name}`}
						removeLabel={(name) => `Remove ${name}`}
					/>
					<TokenSelectorTriggerView
						pairName="BTC-USDC"
						isSpot={false}
						open={false}
						showAssetIcon={false}
						ref={triggerRef}
						onClick={() => selected.push("trigger")}
					/>
				</>,
			),
		);
		act(() => container.querySelector<HTMLButtonElement>('[aria-label="Select BTC"]')?.click());
		act(() => container.querySelector<HTMLButtonElement>('[aria-label="Remove BTC"]')?.click());
		act(() => triggerRef.current?.click());
		expect(selected).toEqual(["BTC", "trigger"]);
		expect(removed).toEqual(["BTC"]);
		expect(triggerRef.current?.tagName).toBe("BUTTON");
		expect(container.querySelector("button button")).toBeNull();
	} finally {
		act(() => root.unmount());
	}
});
