/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileAccountTransfersTab } from "@/components/trade/mobile/mobile-account-transfers-tab";
import { AccountTransfersTab } from "@/components/trade/positions/account-transfers-tab";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	exportCsv: vi.fn(async () => undefined),
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
		retry: vi.fn(),
		rows: [],
		status: "ready",
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
});
