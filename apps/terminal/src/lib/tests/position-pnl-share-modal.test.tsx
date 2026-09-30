// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PositionPnlShareData } from "@/components/trade/positions/position-dialog-types";
import { PositionPnlShareModal } from "@/components/trade/positions/position-pnl-share-modal";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	buildUrl: vi.fn(() => "https://trade.example.com/trade/xyz:CXMT?scope=all"),
	copy: vi.fn(),
	createQr: vi.fn(async () => "data:image/png;base64,QR"),
	download: vi.fn(),
	isMobile: false,
	readPalette: vi.fn(() => ({
		card: "#1a2330",
		foreground: "#fff",
		muted: "#8fa0b0",
		profit: "#2fc482",
		loss: "#f0665e",
		long: "#1f8a5a",
		short: "#d6453d",
		divider: "#ffffff1f",
	})),
	renderPng: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
	sharePng: vi.fn(async () => false),
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
}));

vi.mock("@gatu/ui", () => ({
	Modal: ({ children, open }: { children: ReactNode; open: boolean }) =>
		createElement("div", { "data-testid": "modal", "data-open": String(open) }, open ? children : null),
	ModalPopup: ({
		children,
		showClose: _showClose,
		size: _size,
		overlayClassName: _overlayClassName,
		...props
	}: { children: ReactNode } & Record<string, unknown>) => (
		<div role="dialog" {...props}>
			{children}
		</div>
	),
	ModalTitle: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
		<h2 {...props}>{children}</h2>
	),
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mocks.isMobile }));
vi.mock("@/hooks/ui/use-copy-to-clipboard", () => ({
	useCopyToClipboard: () => ({ copied: false, copy: mocks.copy }),
}));
vi.mock("@/lib/trade/position-pnl-share", () => ({
	buildPositionPnlShareUrl: mocks.buildUrl,
	createPositionPnlShareQrDataUrl: mocks.createQr,
	downloadPositionPnlSharePng: mocks.download,
	readPositionPnlSharePalette: mocks.readPalette,
	renderPositionPnlSharePng: mocks.renderPng,
	sharePositionPnlPng: mocks.sharePng,
}));
vi.mock("sonner", () => ({
	toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

const position: PositionPnlShareData = {
	coin: "xyz:CXMT",
	dex: "xyz",
	env: "Mainnet",
	symbol: "CXMT-USDE",
	quoteSymbol: "USDE",
	signedPositionSize: "2.5",
	entryPx: "7.5",
	markPx: "8",
	unrealizedPnl: "1.25",
	returnOnEquity: "0.125",
	leverage: "10",
	szDecimals: 1,
	capturedAtMs: Date.UTC(2026, 7, 5, 12, 0),
};

describe("PositionPnlShareModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.buildUrl.mockReset();
		mocks.copy.mockReset();
		mocks.createQr.mockReset();
		mocks.download.mockReset();
		mocks.readPalette.mockReset();
		mocks.renderPng.mockReset();
		mocks.sharePng.mockReset();
		mocks.toastError.mockReset();
		mocks.toastSuccess.mockReset();
		mocks.isMobile = false;
		mocks.buildUrl.mockReturnValue("https://trade.example.com/trade/xyz:CXMT?scope=all");
		mocks.createQr.mockResolvedValue("data:image/png;base64,QR");
		mocks.readPalette.mockReturnValue({
			card: "#1a2330",
			foreground: "#fff",
			muted: "#8fa0b0",
			profit: "#2fc482",
			loss: "#f0665e",
			long: "#1f8a5a",
			short: "#d6453d",
			divider: "#ffffff1f",
		});
		mocks.renderPng.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
		mocks.sharePng.mockResolvedValue(false);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("renders the DEX and quote identity and wires QR, copy, save, and close", async () => {
		const onOpenChange = vi.fn();
		await act(async () => {
			root.render(<PositionPnlShareModal position={position} onOpenChange={onOpenChange} />);
			await Promise.resolve();
		});

		expect(container.textContent).toContain("CXMT-USDE");
		expect(container.textContent).toContain("xyz");
		expect(container.textContent).toContain("USDE");
		expect(mocks.createQr).toHaveBeenCalledWith(
			"https://trade.example.com/trade/xyz:CXMT?scope=all",
			expect.any(Object),
		);

		act(() => getButton(container, "Copy link").click());
		expect(mocks.copy).toHaveBeenCalledWith("https://trade.example.com/trade/xyz:CXMT?scope=all");

		await act(async () => getButton(container, "Save image").click());
		expect(mocks.renderPng).toHaveBeenCalledWith(
			expect.objectContaining({ symbol: "CXMT-USDE · xyz", pnlValue: expect.stringContaining("USDE") }),
			expect.any(Object),
			"data:image/png;base64,QR",
		);
		expect(mocks.download).toHaveBeenCalledOnce();
		expect(mocks.toastSuccess).toHaveBeenCalledExactlyOnceWith("Image saved");

		act(() => getButton(container, "Close").click());
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("marks Testnet explicitly and never creates or copies an ambiguous market link", async () => {
		await act(async () => {
			root.render(<PositionPnlShareModal position={{ ...position, env: "Testnet" }} onOpenChange={vi.fn()} />);
			await Promise.resolve();
		});

		expect(container.textContent).toContain("Testnet");
		expect(mocks.buildUrl).not.toHaveBeenCalled();
		expect(mocks.createQr).not.toHaveBeenCalled();
		expect(getButton(container, "Copy link").disabled).toBe(true);

		await act(async () => getButton(container, "Save image").click());
		expect(mocks.renderPng).toHaveBeenCalledWith(
			expect.objectContaining({ networkLabel: "Testnet" }),
			expect.any(Object),
			null,
		);
		expect(mocks.download).toHaveBeenCalledOnce();
	});

	it("reports a QR failure without rendering an unsafe fallback link", async () => {
		mocks.createQr.mockRejectedValue(new Error("QR unavailable"));
		await act(async () => {
			root.render(<PositionPnlShareModal position={position} onOpenChange={vi.fn()} />);
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(container.querySelector('[aria-label="QR unavailable"]')).not.toBeNull();
		await act(async () => getButton(container, "Save image").click());
		expect(mocks.renderPng).not.toHaveBeenCalled();
		expect(mocks.download).not.toHaveBeenCalled();
		expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith("Failed to save image");
	});

	it("uses file sharing on mobile without a save notification", async () => {
		mocks.isMobile = true;
		mocks.sharePng.mockResolvedValue(true);
		await act(async () => {
			root.render(<PositionPnlShareModal position={position} onOpenChange={vi.fn()} />);
			await Promise.resolve();
		});

		await act(async () => getButton(container, "Save image").click());
		expect(mocks.sharePng).toHaveBeenCalledOnce();
		expect(mocks.download).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	it("downloads and confirms the save on mobile when file sharing is unavailable", async () => {
		mocks.isMobile = true;
		mocks.sharePng.mockResolvedValue(false);
		await act(async () => {
			root.render(<PositionPnlShareModal position={position} onOpenChange={vi.fn()} />);
			await Promise.resolve();
		});

		await act(async () => getButton(container, "Save image").click());
		expect(mocks.sharePng).toHaveBeenCalledOnce();
		expect(mocks.download).toHaveBeenCalledOnce();
		expect(mocks.toastSuccess).toHaveBeenCalledExactlyOnceWith("Image saved");
	});

	it("suppresses download and toast when the dialog unmounts during rendering", async () => {
		let resolveRender: ((blob: Blob) => void) | undefined;
		mocks.renderPng.mockReturnValueOnce(
			new Promise<Blob>((resolve) => {
				resolveRender = resolve;
			}),
		);
		await act(async () => {
			root.render(<PositionPnlShareModal position={position} onOpenChange={vi.fn()} />);
			await Promise.resolve();
		});

		act(() => getButton(container, "Save image").click());
		act(() => root.render(<PositionPnlShareModal position={null} onOpenChange={vi.fn()} />));
		const completeRender = resolveRender;
		if (!completeRender) throw new Error("Expected a pending image render");
		await act(async () => completeRender(new Blob(["png"], { type: "image/png" })));

		expect(mocks.download).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});
});

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
		(element) => element.textContent?.trim() === label,
	);
	if (!button) throw new Error(`${label} button was not rendered`);
	return button;
}

describe("PositionPnlShareModal exit", () => {
	it("keeps the dialog mounted closed for its exit transition and then unmounts it", () => {
		vi.useFakeTimers();
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createI18nRoot(container);
		try {
			act(() => root.render(<PositionPnlShareModal position={position} onOpenChange={vi.fn()} />));
			expect(
				container.querySelector('[role="dialog"], [data-testid="modal"]') ?? container.firstElementChild,
			).not.toBeNull();

			act(() => root.render(<PositionPnlShareModal position={null} onOpenChange={vi.fn()} />));
			expect(container.firstElementChild).not.toBeNull();

			act(() => {
				vi.advanceTimersByTime(250);
			});
			expect(container.firstElementChild).toBeNull();
		} finally {
			act(() => root.unmount());
			container.remove();
			vi.useRealTimers();
		}
	});
});
