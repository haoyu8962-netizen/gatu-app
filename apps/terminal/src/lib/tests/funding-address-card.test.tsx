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
					<FundingAddressCard address={address} state="ready" />
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
		const addressText = Array.from(container.querySelectorAll("span")).find(
			(element) => element.textContent === address,
		);
		expect(addressText?.className).toContain("min-[1001px]:whitespace-nowrap");
		expect(addressText?.className).toContain("min-[1001px]:break-normal");
		expect(addressText?.className).not.toContain("truncate");
		const copyButton = container.querySelector<HTMLButtonElement>('button[aria-label="Copy deposit address"]');
		expect(copyButton?.className).toContain("size-8");
		expect(copyButton?.textContent).toBe("");
		expect(copyButton?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
	});

	it.each(["loading", "unavailable"] as const)("does not expose an address while the card is %s", async (state) => {
		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<FundingAddressCard message="Address unavailable" state={state} />
				</I18nProvider>,
			);
		});

		expect(mocks.toCanvas).not.toHaveBeenCalled();
		expect(container.querySelector("canvas")).toBeNull();
		expect(container.querySelector("button")).toBeNull();
		const stateContainer = container.querySelector(`[data-address-state="${state}"]`);
		expect(stateContainer).not.toBeNull();
		const statusRole = state === "loading" ? "status" : "alert";
		expect(stateContainer?.querySelector(`[role="${statusRole}"]`)?.className).toContain("size-[140px]");
	});

	it("renders a silent loading skeleton when no readiness message is provided", async () => {
		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<FundingAddressCard state="loading" />
				</I18nProvider>,
			);
		});

		const stateContainer = container.querySelector('[data-address-state="loading"]');
		expect(stateContainer).not.toBeNull();
		expect(stateContainer?.querySelector('[role="status"]')).toBeNull();
		expect(stateContainer?.firstElementChild?.querySelector("p")).toBeNull();
		expect(stateContainer?.querySelector('[data-address-placeholder="skeleton"]')).not.toBeNull();
		expect(stateContainer?.textContent).toBe("Deposit address");
	});
});
