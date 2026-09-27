// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EarnView } from "@/components/earn/earn-view";
import { buildEarnSnapshot, type EarnTokenMeta, parseEarnReserves, parseEarnUserState } from "@/domain/earn";
import type { EarnData } from "@/hooks/earn/use-earn-data";
import { createI18nRoot } from "./harness/react";

function passthrough(tag: string) {
	return ({ children }: { children?: ReactNode }) => createElement(tag, null, children);
}

vi.mock("@gatu/ui", () => ({
	Button: ({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) =>
		createElement("button", { type: "button", disabled, onClick }, children),
	Table: passthrough("table"),
	TableBody: passthrough("tbody"),
	TableCell: passthrough("td"),
	TableHead: passthrough("th"),
	TableHeader: passthrough("thead"),
	TableRow: passthrough("tr"),
	Tabs: passthrough("div"),
	TabsContent: passthrough("div"),
	TabsList: passthrough("div"),
	TabsTrigger: passthrough("button"),
	Tooltip: ({ children, content }: { children: ReactNode; content: ReactNode }) =>
		createElement("span", null, children, createElement("span", { "data-testid": "tooltip" }, content)),
}));

const RESERVES = [
	[
		0,
		{
			borrowYearlyRate: "0.05",
			supplyYearlyRate: "0.0285",
			oraclePx: "1.0",
			ltv: "0.0",
			totalSupplied: "100",
			totalBorrowed: "50",
			balance: "50",
		},
	],
	[
		150,
		{
			borrowYearlyRate: "0.05",
			supplyYearlyRate: "0.0",
			oraclePx: "92.76",
			ltv: "0.65",
			totalSupplied: "10",
			totalBorrowed: "0",
			balance: "10",
		},
	],
];

const TOKENS = new Map<number, EarnTokenMeta>([
	[0, { index: 0, name: "USDC", displayName: "USDC", weiDecimals: 8, szDecimals: 8 }],
	[150, { index: 150, name: "HYPE", displayName: "HYPE", weiDecimals: 8, szDecimals: 2 }],
]);

function createData(accountStatus: EarnData["accountStatus"]): EarnData {
	const reserves = parseEarnReserves(RESERVES);
	const userState = parseEarnUserState({
		tokenToState: [[150, { borrow: { basis: "0", value: "0" }, supply: { basis: "1", value: "1" } }]],
		healthFactor: null,
	});
	if (!reserves || !userState) throw new Error("fixture must parse");
	const snapshotInputs = {
		tokens: TOKENS,
		portfolioMargin: false,
		spotBalances: new Map(),
		availableAfterMaintenance: new Map<number, string>(),
	};
	return {
		ownerAddress: "0x1111111111111111111111111111111111111111",
		isConnected: true,
		publicStatus: "ready",
		accountStatus,
		interestStatus: "loading",
		historyStatus: "loading",
		snapshot: buildEarnSnapshot({
			reserves,
			userState: accountStatus === "ready" ? userState : null,
			...snapshotInputs,
		}),
		snapshotInputs,
		accountAbstraction: "unifiedAccount",
		portfolioMargin: false,
		spotStateReceivedAt: Date.now(),
		interest: [],
		history: [],
		retryPublic: vi.fn(),
		retryAccount: vi.fn(),
		retryInterest: vi.fn(),
		retryHistory: vi.fn(),
		fetchFreshState: vi.fn(async () => null),
	};
}

const NO_BORROWS = "You have no borrows to repay.";

describe("earn view", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function render(data: EarnData, actionsAllowed = true) {
		act(() =>
			root.render(
				createElement(EarnView, { data, isMobile: false, actionsAllowed, notice: null, onOpenAction: vi.fn() }),
			),
		);
	}

	it("does not conclude there are no borrows before the account snapshot is ready", () => {
		render(createData("loading"));
		expect(container.textContent).not.toContain(NO_BORROWS);
		expect(container.textContent).toContain("$0.00");
		expect(container.textContent).toContain("0.00 HYPE");
		expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
		render(createData("error"));
		expect(container.textContent).not.toContain(NO_BORROWS);
	});

	it("explains a disabled repay only from a complete snapshot", () => {
		render(createData("ready"));
		expect(container.textContent).toContain(NO_BORROWS);
		const repay = [...container.querySelectorAll<HTMLButtonElement>("td button")].find(
			(button) => button.getAttribute("aria-describedby") && button.textContent?.startsWith("Repay"),
		);
		expect(repay?.hasAttribute("disabled")).toBe(false);
		expect(repay?.getAttribute("aria-disabled")).toBe("true");
		const description = repay ? container.querySelector(`[id="${repay.getAttribute("aria-describedby")}"]`) : null;
		expect(description?.textContent).toBe(NO_BORROWS);
	});
});
