// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DepositMethodChooser } from "@/components/trade/tradebox/deposit/deposit-method-chooser";
import { createI18nRoot } from "./harness/react";

describe("DepositMethodChooser", () => {
	let container: HTMLDivElement;
	let root: Root;
	const onTransfer = vi.fn();
	const onBuy = vi.fn();

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function render(fiat: { walletKind: "embedded" | "external"; disabled: boolean }, notice: string | null = null) {
		act(() => root.render(createElement(DepositMethodChooser, { fiat, notice, onTransfer, onBuy })));
	}

	function option(method: "fiat" | "transfer") {
		const element = container.querySelector<HTMLButtonElement>(`[data-deposit-method="${method}"]`);
		if (!element) throw new Error(`Missing ${method} option`);
		return element;
	}

	it("offers transferring USDC and buying it as two separate entries", () => {
		render({ walletKind: "embedded", disabled: false });

		expect(container.querySelector("h3")?.textContent).toBe("Deposit");
		expect(option("transfer").textContent).toContain("Transfer USDC");
		expect(option("transfer").textContent).toContain("Send native USDC on Arbitrum from an exchange or wallet.");
		expect(option("fiat").textContent).toContain("Buy USDC with a card");
		expect(option("fiat").textContent).not.toContain("ETH on Arbitrum");

		act(() => option("transfer").click());
		act(() => option("fiat").click());

		expect(onTransfer).toHaveBeenCalledTimes(1);
		expect(onBuy).toHaveBeenCalledTimes(1);
	});

	it("describes the external wallet's own transfer path and the Arbitrum gas it needs after a purchase", () => {
		render({ walletKind: "external", disabled: false });

		expect(option("fiat").textContent).toContain("Depositing it needs a little ETH on Arbitrum for network fees.");
		expect(option("transfer").textContent).toContain("Deposit native USDC on Arbitrum from your connected wallet.");
		expect(option("transfer").textContent).not.toContain("exchange");
	});

	it("keeps the purchase entry disabled from the availability flag and shows the shared notice", () => {
		render({ walletKind: "embedded", disabled: true }, "Funds actions are not available in your region.");

		expect(option("fiat").disabled).toBe(true);
		expect(option("transfer").disabled).toBe(false);
		act(() => option("fiat").click());
		expect(onBuy).not.toHaveBeenCalled();
		const notice = container.querySelector('[data-deposit-slot="methods-notice"]');
		expect(notice?.textContent).toBe("Funds actions are not available in your region.");
		expect(notice?.getAttribute("role")).toBe("alert");
	});
});
