// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccountLedgerCsv } from "@/hooks/trade/use-account-ledger-csv";
import { createI18nRoot } from "./harness/react";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const SUB_ACCOUNT = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

const mocks = vi.hoisted(() => ({
	downloadCsv: vi.fn(),
	subAccounts: vi.fn(),
	userNonFundingLedgerUpdates: vi.fn(),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: "0x1111111111111111111111111111111111111111", isConnected: true }),
}));

vi.mock("@/lib/csv", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/csv")>()),
	downloadCsv: mocks.downloadCsv,
}));

vi.mock("@/lib/hyperliquid", () => ({
	getInfoClient: () => ({
		subAccounts: mocks.subAccounts,
		userNonFundingLedgerUpdates: mocks.userNonFundingLedgerUpdates,
	}),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => "en-US",
	useIsTestnet: () => false,
}));

vi.mock("sonner", () => ({
	toast: { dismiss: vi.fn(), error: vi.fn(), loading: vi.fn(() => "toast-id"), success: vi.fn(), warning: vi.fn() },
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let exportCsv: (() => Promise<void>) | undefined;

function Probe() {
	exportCsv = useAccountLedgerCsv().exportCsv;
	return null;
}

function exportedActions(): string[] {
	const rows = mocks.downloadCsv.mock.calls.at(-1)?.[1] as string[][] | undefined;
	return (rows ?? []).slice(1).map((row) => row[1] ?? "");
}

describe("account ledger CSV export", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.downloadCsv.mockReset();
		mocks.subAccounts.mockReset();
		mocks.userNonFundingLedgerUpdates.mockReset().mockResolvedValue([
			{
				delta: { type: "internalTransfer", usdc: "2", user: OWNER, destination: SUB_ACCOUNT, fee: "0" },
				hash: `0x${"c".repeat(64)}`,
				time: 1_000,
			},
		]);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(createElement(Probe)));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("labels transfers with the owner's sub-accounts from the sub-account list", async () => {
		mocks.subAccounts.mockResolvedValue([{ name: "alpha", subAccountUser: SUB_ACCOUNT, master: OWNER }]);

		await act(async () => {
			await exportCsv?.();
		});

		expect(mocks.subAccounts).toHaveBeenCalledWith({ user: OWNER }, expect.any(AbortSignal));
		expect(exportedActions()).toEqual(["Sub-account Transfer"]);
	});

	it("still exports with ordinary labels when the sub-account list cannot be read", async () => {
		mocks.subAccounts.mockRejectedValue(new Error("Sub-accounts unavailable"));

		await act(async () => {
			await exportCsv?.();
		});

		expect(exportedActions()).toEqual(["Send"]);
	});
});
