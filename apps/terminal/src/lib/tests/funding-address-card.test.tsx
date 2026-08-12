// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FundingAddressCard } from "@/components/trade/tradebox/deposit/funding-address-card";

const mocks = vi.hoisted(() => ({
	toCanvas: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("qrcode", () => ({
	toCanvas: mocks.toCanvas,
}));

describe("FundingAddressCard", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mocks.toCanvas.mockClear();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("encodes the exact funding address in the displayed QR code", async () => {
		const address = "0x1111111111111111111111111111111111111111" as const;

		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<FundingAddressCard address={address} />
				</I18nProvider>,
			);
		});

		await vi.waitFor(() => expect(mocks.toCanvas).toHaveBeenCalledOnce());
		expect(mocks.toCanvas).toHaveBeenCalledWith(
			expect.any(HTMLCanvasElement),
			address,
			expect.objectContaining({ errorCorrectionLevel: "M", margin: 1 }),
		);
		expect(container.textContent).toContain(address);
		const qrCanvas = container.querySelector('canvas[aria-label="Deposit address QR code"]');
		expect(qrCanvas?.parentElement?.className).toContain("size-[140px]");
		const copyButton = container.querySelector<HTMLButtonElement>('button[aria-label="Copy deposit address"]');
		expect(copyButton?.className).toContain("min-h-11");
		expect(copyButton?.textContent).toBe("Copy Address");
	});
});
