/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileAccountTransfersTab } from "@/components/trade/mobile/mobile-account-transfers-tab";
import { AccountTransfersTab } from "@/components/trade/positions/account-transfers-tab";
import { formatDateTime, formatDateTimeShort } from "@/lib/format";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import type { AccountLedgerRow } from "@/lib/trade/account-ledger";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({ formatLocale: "en-US" }));

const ROWS: AccountLedgerRow[] = [
	{
		action: "withdrawal",
		amount: "-1234.5",
		destination: { kind: "arbitrum" },
		explorer: "hyperliquid",
		fee: { amount: "1.25", token: "USDC" },
		hash: "0xabc",
		id: "withdrawal-1",
		rawType: "withdraw",
		source: { kind: "perps" },
		time: Date.UTC(2026, 9, 2, 8, 30),
		token: "USDC",
	},
];

vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ScrollBar: () => null,
}));

vi.mock("@/hooks/trade/use-account-ledger", () => ({
	useAccountLedger: () => ({ error: null, isConnected: true, retry: vi.fn(), rows: ROWS, status: "ready" }),
}));

vi.mock("@/lib/hyperliquid", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/hyperliquid")>()),
	useMarkets: () => ({ getTokenDisplayName: (name: string) => (name === "UBTC" ? "BTC" : name) }),
}));

vi.mock("@/hooks/trade/use-account-ledger-csv", () => ({
	useAccountLedgerCsv: () => ({ exportCsv: vi.fn(), isExporting: false }),
}));

vi.mock("@/hooks/trade/use-account-ledger-labels", () => ({
	useAccountLedgerLabels: () => ({
		getActionLabel: (value: string) => value,
		getLocationLabel: (value: { kind: string }) => value.kind,
	}),
}));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => mocks.formatLocale,
	useIsTestnet: () => false,
}));

describe("account ledger number format", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.formatLocale = "en-US";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it.each([
		["desktop", () => <AccountTransfersTab />],
		["mobile", () => <MobileAccountTransfersTab scrollMode="page" />],
	] as const)("rewrites the %s amount and fee in place when the number format changes", (_surface, renderSurface) => {
		act(() => root.render(renderSurface()));
		expect(container.textContent).toContain("-1,234.5 USDC");
		expect(container.textContent).toContain("1.25 USDC");
		const firstChild = container.firstElementChild;

		mocks.formatLocale = "de-DE";
		act(() => notifyNumberFormatChange());

		expect(container.firstElementChild).toBe(firstChild);
		expect(container.textContent).toContain("-1.234,5 USDC");
		expect(container.textContent).toContain("1,25 USDC");
		expect(container.textContent).not.toContain("1,234.5");
	});

	it.each([
		["desktop", () => <AccountTransfersTab />],
		["mobile", () => <MobileAccountTransfersTab scrollMode="page" />],
	] as const)("names a renamed spot token by its display name on %s", (_surface, renderSurface) => {
		ROWS.push({
			action: "send",
			amount: "-0.5",
			destination: { kind: "spot" },
			explorer: "hyperliquid",
			fee: { amount: "0.0001", token: "UBTC" },
			hash: "0xdef",
			id: "send-1",
			rawType: "spotSend",
			source: { kind: "spot" },
			time: Date.UTC(2026, 9, 2, 9, 30),
			token: "UBTC",
		});
		try {
			act(() => root.render(renderSurface()));
			expect(container.textContent).toContain("-0.5 BTC");
			expect(container.textContent).toContain("0.0001 BTC");
			expect(container.textContent).not.toContain("UBTC");
		} finally {
			ROWS.pop();
		}
	});

	it("dates desktop transfers with the year and keeps the compact date on phone cards", () => {
		const time = Date.UTC(2026, 9, 2, 8, 30);
		act(() => root.render(<AccountTransfersTab />));
		expect(container.textContent).toContain(formatDateTime(time, { dateStyle: "short", timeStyle: "short" }));

		act(() => root.render(<MobileAccountTransfersTab scrollMode="page" />));
		expect(container.textContent).toContain(formatDateTimeShort(time));
		expect(container.textContent).not.toContain(formatDateTime(time, { dateStyle: "short", timeStyle: "short" }));
	});
});
