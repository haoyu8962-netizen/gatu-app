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

function visibleText(element: Element | null | undefined): string {
	const clone = element?.cloneNode(true) as Element | undefined;
	for (const hidden of clone?.querySelectorAll('[aria-hidden="true"]') ?? []) hidden.remove();
	return clone?.textContent ?? "";
}

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
			expect.objectContaining({ errorCorrectionLevel: "H", margin: 1 }),
		);
		expect(container.textContent).toContain(address);
		const qrCanvas = container.querySelector('canvas[aria-label="Deposit address QR code"]');
		expect(qrCanvas?.closest('[class*="size-[140px]"]')).not.toBeNull();
		const logo = qrCanvas?.parentElement?.querySelector<HTMLImageElement>('img[data-slot="qr-token-logo"]');
		expect(logo?.getAttribute("src")).toBe("/coins/USDC.svg");
		expect(logo?.getAttribute("aria-hidden")).toBe("true");
		expect(logo?.className).toContain("size-7");
		const addressText = Array.from(container.querySelectorAll("span")).find(
			(element) => element.textContent === address,
		);
		expect(addressText?.className).toContain("break-all");
		expect(addressText?.className).not.toContain("whitespace-nowrap");
		expect(addressText?.className).not.toContain("truncate");
		const copyButton = container.querySelector<HTMLButtonElement>('button[aria-label="Copy deposit address"]');
		expect(copyButton?.className).toContain("size-8");
		expect(copyButton?.textContent).toBe("");
		expect(copyButton?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
	});

	it.each(["loading", "pending", "unavailable"] as const)(
		"does not expose an address while the card is %s",
		async (state) => {
			await act(async () => {
				root.render(
					<I18nProvider i18n={i18n}>
						{state === "unavailable" ? (
							<FundingAddressCard message="Confirmed restriction" state={state} />
						) : (
							<FundingAddressCard state={state} />
						)}
					</I18nProvider>,
				);
			});

			expect(mocks.toCanvas).not.toHaveBeenCalled();
			expect(container.querySelector("canvas")).toBeNull();
			expect(container.querySelector("button")).toBeNull();
			const stateContainer = container.querySelector(`[data-address-state="${state}"]`);
			expect(stateContainer).not.toBeNull();
			if (state === "unavailable") {
				expect(stateContainer?.querySelector('[role="alert"]')?.textContent).toContain("Confirmed restriction");
			} else {
				expect(stateContainer?.querySelector('[role="alert"], [role="status"]')).toBeNull();
				expect(visibleText(stateContainer)).toBe("Deposit address");
			}
		},
	);

	it("gives the placeholder the same QR frame and address field classes as the ready card", async () => {
		function shared(className: string | undefined, extras: string[]) {
			return (className ?? "")
				.split(" ")
				.filter((token) => !extras.includes(token))
				.sort()
				.join(" ");
		}
		function geometry() {
			const frame = container.querySelector<HTMLElement>('[class*="size-[140px]"]');
			const field = container.querySelector<HTMLElement>('[class*="min-h-11"]');
			return {
				frame: shared(frame?.className, ["flex-col", "gap-2", "px-4", "text-center"]),
				field: field?.className,
				text: shared(field?.firstElementChild?.className, ["invisible"]),
				textLength: field?.firstElementChild?.textContent?.length,
				action: [...(field?.children ?? [])].some((child) => child.className.split(" ").includes("size-8")),
				card: container.querySelector<HTMLElement>("[data-address-state]")?.className,
			};
		}

		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<FundingAddressCard state="loading" />
				</I18nProvider>,
			);
		});
		const loading = geometry();

		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<FundingAddressCard address="0x1111111111111111111111111111111111111111" state="ready" />
				</I18nProvider>,
			);
		});
		const ready = geometry();

		expect(loading.frame).not.toBe("");
		expect(loading.field).toContain("min-h-11");
		expect(loading.textLength).toBe(42);
		expect(loading.action).toBe(true);
		expect(loading).toEqual(ready);
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
		expect(visibleText(stateContainer)).toBe("Deposit address");
	});
});
