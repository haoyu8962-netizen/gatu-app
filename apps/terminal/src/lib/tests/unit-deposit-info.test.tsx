// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UnitDepositInfo } from "@/components/trade/tradebox/deposit/unit-deposit-info";

describe("UnitDepositInfo", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("renders the email funding summary with the live fee and destination asset", async () => {
		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<UnitDepositInfo cctpFee="0.2" />
				</I18nProvider>,
			);
		});

		const card = container.querySelector('[data-presentation="funding"]');
		expect(card?.textContent).toContain("You receive");
		expect(card?.textContent).toContain("USDC on HyperCore");
		expect(card?.textContent).toContain("Fee");
		expect(card?.textContent).toContain("$0.20");
		expect(card?.textContent).toContain("Processing time");
		expect(card?.textContent).toContain("~2 minutes");
		expect(card?.textContent).not.toContain("Estimated net credit");
		expect(card?.querySelector('img[src="/coins/USDC.svg"]')).not.toBeNull();
	});

	it.each([
		{ expected: "Checking...", props: { cctpFeeLoading: true } },
		{ expected: "Unavailable", props: { cctpFeeError: true } },
		{ expected: "Calculated after funding", props: {} },
	])("renders $expected when an exact funding fee is not available", async ({ expected, props }) => {
		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<UnitDepositInfo {...props} />
				</I18nProvider>,
			);
		});

		expect(container.textContent).toContain(expected);
	});
});
