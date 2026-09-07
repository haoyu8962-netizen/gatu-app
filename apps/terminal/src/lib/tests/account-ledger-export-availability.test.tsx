/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileAccountTransfersTab } from "@/components/trade/mobile/mobile-account-transfers-tab";
import { AccountTransfersTab } from "@/components/trade/positions/account-transfers-tab";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	exportCsv: vi.fn(async () => undefined),
	retry: vi.fn(),
	status: "ready" as "ready" | "unavailable",
}));

vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ScrollBar: () => null,
}));

vi.mock("@/hooks/trade/use-account-ledger", () => ({
	useAccountLedger: () => ({
		error: null,
		isConnected: true,
		retry: mocks.retry,
		rows: [],
		status: mocks.status,
	}),
}));

vi.mock("@/hooks/trade/use-account-ledger-csv", () => ({
	useAccountLedgerCsv: () => ({ exportCsv: mocks.exportCsv, isExporting: false }),
}));

vi.mock("@/hooks/trade/use-account-ledger-labels", () => ({
	useAccountLedgerLabels: () => ({
		getActionLabel: (value: string) => value,
		getLocationLabel: (value: { kind: string }) => value.kind,
	}),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useIsTestnet: () => false,
}));

describe("account ledger export availability", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		mocks.exportCsv.mockClear();
		mocks.retry.mockClear();
		mocks.status = "ready";
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("keeps desktop full-history export enabled when the recent list is empty", () => {
		act(() => root.render(<AccountTransfersTab />));

		const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(candidate) => candidate.textContent === "Export CSV",
		);
		expect(container.textContent).toContain("No deposits or withdrawals found.");
		expect(button?.disabled).toBe(false);
		act(() => button?.click());
		expect(mocks.exportCsv).toHaveBeenCalledOnce();
	});

	it("keeps mobile full-history export enabled when the recent list is empty", () => {
		act(() => root.render(<MobileAccountTransfersTab scrollMode="page" />));

		const button = container.querySelector<HTMLButtonElement>('button[aria-label="Export CSV"]');
		expect(container.textContent).toContain("No deposits or withdrawals found.");
		expect(button?.disabled).toBe(false);
		act(() => button?.click());
		expect(mocks.exportCsv).toHaveBeenCalledOnce();
	});

	it.each([
		["desktop", () => <AccountTransfersTab />],
		["mobile", () => <MobileAccountTransfersTab scrollMode="page" />],
	] as const)("keeps export behavior independent of read failures on %s", (surface, renderSurface) => {
		mocks.status = "unavailable";
		act(() => root.render(renderSurface()));

		if (surface === "mobile") {
			expect(container.textContent).not.toContain("Failed to load deposits and withdrawals.");
			expect(container.querySelector('[data-slot="data-pending"]')).not.toBeNull();
		} else expect(container.textContent).toContain("Failed to load deposits and withdrawals.");
		expect(container.textContent).not.toContain("No deposits or withdrawals found.");
		const retry = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(candidate) => candidate.textContent === "Retry",
		);
		if (surface === "desktop") {
			act(() => retry?.click());
			expect(mocks.retry).toHaveBeenCalledOnce();
		} else expect(retry).toBeUndefined();
	});
});
