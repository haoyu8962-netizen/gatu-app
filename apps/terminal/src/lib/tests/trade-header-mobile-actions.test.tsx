/** @vitest-environment jsdom */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { i18n, type Messages } from "@lingui/core";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeHeader } from "@/components/trade/tradebox/trade-header";
import type { OrderType } from "@/config/trade";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function readCatalogTranslation(locale: string, message: string, context = ""): string {
	const catalog = readFileSync(resolve(process.cwd(), `src/locales/${locale}/messages.po`), "utf8");
	const entry = context
		? `msgctxt ${JSON.stringify(context)}\\nmsgid ${JSON.stringify(message)}`
		: `\\n(?:#[^\\n]*\\n)*msgid ${JSON.stringify(message)}`;
	const match = catalog.match(new RegExp(`${entry}\\nmsgstr (".*")\\n`));
	return match ? (JSON.parse(match[1]) as string) : "";
}

function getMessageId(message: string, context = ""): string {
	return createHash("sha256").update(`${message}\x1f${context}`).digest("base64").slice(0, 6);
}

function loadCatalogMessages(locale: string, entries: ReadonlyArray<readonly [string, string]>): Messages {
	const messages: Messages = {};
	for (const [message, context] of entries) {
		const translation = readCatalogTranslation(locale, message, context);
		expect(translation, `${context}:${message}`).not.toBe("");
		messages[getMessageId(message, context)] = translation;
	}
	return messages;
}

describe("TradeHeader mobile margin actions", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	function renderHeader(callbacks: {
		accountMode?: "disabled" | "unifiedAccount" | "portfolioMargin" | "default" | "dexAbstraction" | null;
		isAccountModeAutomatic?: boolean;
		isLeveraged?: boolean;
		layout?: "desktop" | "mobile";
		marketKind?: "perp" | "spot";
		onAccountModeClick?: () => void;
		onLeverageClick?: () => void;
		onMarginLeverageClick?: () => void;
		onMarginModeClick?: () => void;
		onOrderTypeChange?: (type: OrderType) => void;
	}) {
		act(() => {
			root.render(
				<TradeHeader
					accountMode={callbacks.accountMode ?? "unifiedAccount"}
					isLeveraged={callbacks.isLeveraged ?? true}
					layout={callbacks.layout ?? "mobile"}
					leverage={10}
					marginMode="cross"
					marketKind={callbacks.marketKind ?? "perp"}
					onOrderTypeChange={callbacks.onOrderTypeChange ?? vi.fn()}
					onAccountModeClick={callbacks.onAccountModeClick ?? vi.fn()}
					onSideChange={vi.fn()}
					orderType="market"
					side="buy"
					sideLabels={{ buy: "Buy", sell: "Sell", buyAria: "Buy", sellAria: "Sell" }}
					{...callbacks}
				/>,
			);
		});
	}

	it("renders only the three leveraged mobile controls and routes their independent actions", () => {
		const onMarginModeClick = vi.fn();
		const onLeverageClick = vi.fn();
		const onMarginLeverageClick = vi.fn();
		renderHeader({ onMarginModeClick, onLeverageClick, onMarginLeverageClick });
		const controlGrid = container.querySelector(".grid");
		expect(controlGrid?.querySelectorAll("button")).toHaveLength(3);
		expect(container.querySelector('button[aria-label="Account mode"]')).toBeNull();
		expect(container.querySelector(".trade-card-label-compact")).toBeNull();

		act(() => getButton(container, "Cross").click());
		expect(onMarginModeClick).toHaveBeenCalledOnce();
		expect(onLeverageClick).not.toHaveBeenCalled();
		expect(onMarginLeverageClick).not.toHaveBeenCalled();

		act(() => getButton(container, "10x").click());
		expect(onMarginModeClick).toHaveBeenCalledOnce();
		expect(onLeverageClick).toHaveBeenCalledOnce();
		expect(onMarginLeverageClick).not.toHaveBeenCalled();
	});

	it("falls both mobile entries back to the legacy combined callback", () => {
		const onMarginLeverageClick = vi.fn();
		renderHeader({ onMarginLeverageClick });

		act(() => getButton(container, "Cross").click());
		act(() => getButton(container, "10x").click());

		expect(onMarginLeverageClick).toHaveBeenCalledTimes(2);
	});

	it("keeps all supported spot order types without leaving an account-mode column", async () => {
		const onAccountModeClick = vi.fn();
		const onOrderTypeChange = vi.fn();
		renderHeader({
			accountMode: "default",
			isLeveraged: false,
			marketKind: "spot",
			onAccountModeClick,
			onOrderTypeChange,
		});

		const controlGrid = container.querySelector(".grid");
		expect(controlGrid?.className).toContain("grid-cols-1");
		expect(controlGrid?.querySelectorAll("button")).toHaveLength(1);
		expect(container.querySelector('button[aria-label="Account mode"]')).toBeNull();
		expect(container.querySelector(".trade-card-label-compact")).toBeNull();
		expect(onAccountModeClick).not.toHaveBeenCalled();

		const orderTypeButton = controlGrid?.querySelector<HTMLButtonElement>('button[aria-label="Order type"]');
		if (!orderTypeButton) throw new Error("Expected the mobile spot order-type control");
		await act(async () => orderTypeButton.click());
		expect([...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim())).toEqual([
			"Market",
			"Limit",
			"TWAP",
			"Scale",
		]);
		const twapItem = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
			(item) => item.textContent?.trim() === "TWAP",
		);
		if (!twapItem) throw new Error("Expected the mobile spot TWAP entry");
		act(() => twapItem.click());
		expect(onOrderTypeChange).toHaveBeenCalledWith("twap");
	});

	it("preserves all three leveraged desktop cards and their independent actions", () => {
		const onMarginModeClick = vi.fn();
		const onLeverageClick = vi.fn();
		const onAccountModeClick = vi.fn();
		renderHeader({ layout: "desktop", onMarginModeClick, onLeverageClick, onAccountModeClick });

		const controlGrid = container.querySelector(".trade-control-grid");
		expect(controlGrid?.className).toContain("grid-cols-3");
		expect(controlGrid?.querySelectorAll("button")).toHaveLength(3);
		const marginModeButton = controlGrid?.querySelector<HTMLButtonElement>('button[title="Cross"]');
		const leverageButton = controlGrid?.querySelector<HTMLButtonElement>('button[title="10x"]');
		const accountModeButton = controlGrid?.querySelector<HTMLButtonElement>('button[aria-label="Account mode"]');
		if (!marginModeButton || !leverageButton || !accountModeButton) {
			throw new Error("Expected all three leveraged desktop cards");
		}

		act(() => marginModeButton.click());
		act(() => leverageButton.click());
		act(() => accountModeButton.click());

		expect(onMarginModeClick).toHaveBeenCalledOnce();
		expect(onLeverageClick).toHaveBeenCalledOnce();
		expect(onAccountModeClick).toHaveBeenCalledOnce();
	});

	it("keeps account mode reachable on desktop spot markets", () => {
		const onAccountModeClick = vi.fn();
		renderHeader({
			accountMode: "default",
			isLeveraged: false,
			layout: "desktop",
			marketKind: "spot",
			onAccountModeClick,
		});

		const accountModeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Account mode"]');
		if (!accountModeButton) throw new Error("Expected desktop account mode button");
		act(() => accountModeButton.click());
		expect(onAccountModeClick).toHaveBeenCalledOnce();
	});

	it("provides a short account value for narrow desktop panels without losing the full label", () => {
		renderHeader({
			accountMode: "default",
			layout: "desktop",
		});

		const accountModeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Account mode"]');
		if (!accountModeButton) throw new Error("Expected desktop account mode button");

		expect(accountModeButton.title).toBe("Select mode");
		expect(accountModeButton.querySelector(".trade-account-value-full")?.textContent).toBe("Select mode");
		expect(accountModeButton.querySelector(".trade-account-value-compact")?.textContent).toBe("Account");
	});

	it("labels the market order type and the account placeholder with their own Japanese messages", async () => {
		const jaMessages = loadCatalogMessages("ja", [
			["Market", "Order type"],
			["Market", ""],
			["Account", "Account mode placeholder"],
			["Account", ""],
			["Account mode", ""],
			["Order type", ""],
		]);
		expect(jaMessages[getMessageId("Market", "Order type")]).not.toBe(jaMessages[getMessageId("Market")]);
		expect(jaMessages[getMessageId("Account", "Account mode placeholder")]).not.toBe(
			jaMessages[getMessageId("Account")],
		);
		act(() => i18n.loadAndActivate({ locale: "ja", messages: jaMessages }));

		renderHeader({ accountMode: null, layout: "desktop" });
		expect(getButton(container, "成行")).toBeTruthy();
		expect(container.textContent).not.toContain("市場");
		const accountModeButton = container.querySelector<HTMLButtonElement>('button[aria-label="アカウントモード"]');
		if (!accountModeButton) throw new Error("Expected the Japanese account mode button");
		expect(accountModeButton.title).toBe("アカウント");
		expect(accountModeButton.querySelector(".trade-account-value-full")?.textContent).toBe("アカウント");
		expect(accountModeButton.querySelector(".trade-account-value-compact")?.textContent).toBe("口座");
		expect(accountModeButton.querySelector(".trade-card-label-compact")?.textContent).toBe("アカウント");

		const onOrderTypeChange = vi.fn();
		renderHeader({ accountMode: null, layout: "mobile", onOrderTypeChange });
		expect(container.textContent).toContain("成行");
		expect(container.textContent).not.toContain("市場");
		const orderTypeButton = container.querySelector<HTMLButtonElement>('button[aria-label="注文タイプ"]');
		if (!orderTypeButton) throw new Error("Expected the Japanese mobile order-type control");
		await act(async () => orderTypeButton.click());
		const menuItems = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
		expect(menuItems[0]?.textContent?.trim()).toBe("成行");
		expect(menuItems.map((item) => item.textContent?.trim())).not.toContain("市場");
		act(() => menuItems[0]?.click());
		expect(onOrderTypeChange).toHaveBeenCalledWith("market");
	});

	it("shows the mode a new account is being set to while the automatic setup applies", () => {
		renderHeader({ accountMode: "default", isAccountModeAutomatic: true, layout: "desktop" });

		const accountModeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Account mode"]');
		if (!accountModeButton) throw new Error("Expected desktop account mode button");
		expect(accountModeButton.title).toBe("Unified");
		expect(accountModeButton.querySelector(".trade-account-value-full")?.textContent).toBe("Unified");
		expect(accountModeButton.querySelector(".trade-account-value-compact")?.textContent).toBe("Unified");
	});

	it("never presents another mode as Unified because of the automatic setup flag", () => {
		renderHeader({ accountMode: "dexAbstraction", isAccountModeAutomatic: true, layout: "desktop" });
		const legacyButton = container.querySelector<HTMLButtonElement>('button[aria-label="Account mode"]');
		expect(legacyButton?.title).toBe("Legacy DEX");

		renderHeader({ accountMode: "disabled", isAccountModeAutomatic: true, layout: "desktop" });
		const manualButton = container.querySelector<HTMLButtonElement>('button[aria-label="Account mode"]');
		expect(manualButton?.title).not.toBe("Unified");
	});
});

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
		(candidate) => candidate.textContent?.trim() === label,
	);
	if (!button) throw new Error(`Expected ${label} button`);
	return button;
}
