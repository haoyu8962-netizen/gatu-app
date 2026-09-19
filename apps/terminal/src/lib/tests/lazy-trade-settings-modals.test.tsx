/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	preloadLazyComponents: vi.fn<(components: { exportName: string }[]) => Promise<void>>(() => Promise.resolve()),
}));

vi.mock("@/lib/lazy", () => ({
	createRetryableLazyComponent: (_importer: unknown, exportName: string) => ({ exportName }),
	preloadLazyComponents: mocks.preloadLazyComponents,
}));

import { MobileTradeFrameView } from "@/components/trade/mobile/mobile-trade-frame-view";
import { TradePanelBodyView } from "@/components/trade/tradebox/trade-panel-body-view";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const SOURCE_ROOT = resolve(__dirname, "../..");
const TRADE_PANEL = readFileSync(resolve(SOURCE_ROOT, "components/trade/tradebox/trade-panel.tsx"), "utf8");
const MOBILE_TRADE_VIEW = readFileSync(resolve(SOURCE_ROOT, "components/trade/mobile/mobile-trade-view.tsx"), "utf8");

function preloadedNames(call: number): string[] | undefined {
	return mocks.preloadLazyComponents.mock.calls[call]?.[0].map((component) => component.exportName);
}

describe("lazy trade settings modals", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.resetModules();
		mocks.preloadLazyComponents.mockClear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("warms each surface once, with the dialogs that surface can open", async () => {
		const { warmTradeSettingsModals } = await import("@/components/trade/tradebox/lazy-trade-settings-modals");

		warmTradeSettingsModals("desktop");
		warmTradeSettingsModals("desktop");
		warmTradeSettingsModals("mobile");
		warmTradeSettingsModals("mobile");

		expect(mocks.preloadLazyComponents).toHaveBeenCalledTimes(2);
		expect(preloadedNames(0)).toEqual(["MarginModeModal", "LeverageModal", "AccountModeModal"]);
		expect(preloadedNames(1)).toEqual(["MarginModeModal"]);
	});

	it("does not download the dialogs on its own: nothing is warmed until the user reaches the order form", async () => {
		await import("@/components/trade/tradebox/lazy-trade-settings-modals");
		const onIntent = vi.fn();

		act(() =>
			root.render(
				<TradePanelBodyView header={null} fields={<input aria-label="size" />} footer={null} onIntent={onIntent} />,
			),
		);
		expect(mocks.preloadLazyComponents).not.toHaveBeenCalled();
		expect(onIntent).not.toHaveBeenCalled();

		const panel = container.firstElementChild as HTMLElement;
		act(() => {
			panel.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
		});
		act(() => container.querySelector("input")?.focus());
		act(() => {
			container.querySelector("input")?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
		});
		expect(onIntent.mock.calls.length).toBeGreaterThanOrEqual(2);
	});

	it("reports intent from the mobile order form shell on touch and focus", () => {
		const onIntent = vi.fn();
		act(() =>
			root.render(
				<MobileTradeFrameView onIntent={onIntent}>
					<button type="button">Cross</button>
				</MobileTradeFrameView>,
			),
		);

		act(() => {
			container.querySelector("button")?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
		});
		expect(onIntent).toHaveBeenCalledOnce();
		act(() => container.querySelector("button")?.focus());
		expect(onIntent).toHaveBeenCalledTimes(2);
	});

	it("keeps the three dialogs behind the lazy host instead of importing them into the order-entry surfaces", () => {
		const runtimeImport =
			/^import (?!type\b)[^;]*?from "[^"]*\/(?:margin-mode-modal|leverage-modal|account-mode-modal)";/gm;

		for (const source of [TRADE_PANEL, MOBILE_TRADE_VIEW]) {
			expect(source.match(runtimeImport) ?? []).toEqual([]);
			expect(source).toContain('from "@/components/ui/lazy-dialog-host"');
			expect(source).not.toMatch(/useEffect\([^)]*warmTradeSettingsModals/);
		}
		expect(TRADE_PANEL.match(/<LazyDialogHost\b/g)).toHaveLength(3);
		expect(MOBILE_TRADE_VIEW.match(/<LazyDialogHost\b/g)).toHaveLength(1);
		expect(TRADE_PANEL).toContain("onIntent={warmDesktopTradeSettingsModals}");
		expect(MOBILE_TRADE_VIEW).toContain("onIntent={warmMobileTradeSettingsModals}");
	});
});
