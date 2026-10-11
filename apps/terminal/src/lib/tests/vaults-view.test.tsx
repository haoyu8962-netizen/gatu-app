// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultActionsAvailability, VaultDetail, VaultListItem } from "@/components/vaults/domain/vaults";
import { VaultDetailView } from "@/components/vaults/vault-detail-view";
import { VaultPerformanceChart } from "@/components/vaults/vault-performance-chart";
import { VaultsList } from "@/components/vaults/vaults-list";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";

const VAULT = "0x0000000000000000000000000000000000000001" as const;
const LEADER = "0x0000000000000000000000000000000000000002" as const;
const FOLLOWER = "0x0000000000000000000000000000000000000003" as const;
const AVAILABLE_ACTIONS = {
	deposit: { available: true, reason: null },
	withdraw: { available: true, reason: null },
} satisfies VaultActionsAvailability;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const numberFormatSetting = vi.hoisted(() => ({ locale: "en-US" }));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => numberFormatSetting.locale,
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
		<a href="/vaults/mock" className={className}>
			{children}
		</a>
	),
}));

describe("Vault views", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		numberFormatSetting.locale = "en-US";
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("does not expose classification filters without a reviewed address policy", () => {
		render(
			<VaultsList state="normal" rows={[createListRow()]} account={{ status: "disconnected" }} onRetry={vi.fn()} />,
		);
		expect(container.textContent).toContain("Alpha Vault");
		expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Official")).toBe(false);
		expect([...container.querySelectorAll("button")].some((button) => button.textContent === "User")).toBe(false);
	});

	it("does not repeat the page title as the heading of a single unclassified Vault group", () => {
		render(
			<VaultsList state="normal" rows={[createListRow()]} account={{ status: "disconnected" }} onRetry={vi.fn()} />,
		);
		expect([...container.querySelectorAll("h1, h2")].map((heading) => heading.textContent)).toEqual(["Vaults"]);
		expect(container.textContent).toContain("Alpha Vault");
	});

	it("names each Vault group when every row is classified", () => {
		render(
			<VaultsList
				state="normal"
				rows={[
					{ ...createListRow(), classification: "official" },
					{ ...createListRow(), vaultAddress: `0x${"2".repeat(40)}`, name: "Beta Vault", classification: "user" },
				]}
				account={{ status: "disconnected" }}
				onRetry={vi.fn()}
			/>,
		);
		expect([...container.querySelectorAll("h2")].map((heading) => heading.textContent)).toEqual([
			"Official Vaults",
			"User Vaults",
		]);
	});

	it("renders distinct loading, feed-error, and definitive-empty states", () => {
		for (const [state, expected] of [
			["loading", "Loading Vaults"],
			["error", "Vault data is unavailable"],
			["empty", "No Vaults were returned"],
		] as const) {
			render(<VaultsList state={state} rows={[]} account={{ status: "disconnected" }} onRetry={vi.fn()} />);
			if (state === "loading") expect(container.querySelector(`[aria-label="${expected}"]`)).not.toBeNull();
			else expect(container.textContent).toContain(expected);
			const totalValue = container.querySelector("header [class*='tabular-nums']")?.textContent;
			expect(totalValue).toBe(state === "empty" ? "$0.00" : "—");
		}
	});

	it("shows every required Vault risk without inventing a minimum deposit or fixed lock", () => {
		render(
			<VaultDetailView
				detail={createDetail()}
				owner={{ status: "disconnected" }}
				actionAvailability={AVAILABLE_ACTIONS}
				isTestnet={false}
			/>,
		);
		const text = container.textContent ?? "";
		expect(text).toContain("lose all deposited principal");
		expect(text).toContain("Historical APR does not predict future performance");
		expect(text).toContain("Leader commission10.00%");
		expect(text).toContain("server-returned lock timestamp");
		expect(text).toContain("cancel orders, close positions, incur slippage");
		expect(text).not.toContain("20 USDC");
		expect(text).not.toContain("4 days");
		const description = [...container.querySelectorAll("p")].find(
			(paragraph) => paragraph.textContent === "Market-making Vault",
		);
		expect(description?.className).toContain("break-words");
		const leaderLink = container.querySelector<HTMLAnchorElement>('a[target="_blank"]');
		expect(leaderLink?.rel).toBe("noopener");
	});

	it("lets an account-specific detail error retry its authoritative snapshots", () => {
		const onRetryOwner = vi.fn();
		render(
			<VaultDetailView
				detail={createDetail()}
				owner={{ status: "error" }}
				actionAvailability={AVAILABLE_ACTIONS}
				isTestnet={false}
				onRetryOwner={onRetryOwner}
			/>,
		);
		const retry = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Retry account data",
		);
		expect(retry).toBeDefined();
		act(() => retry?.click());
		expect(onRetryOwner).toHaveBeenCalledOnce();
	});

	it("uses Vault-specific deposit status copy and visibly explains disabled actions", () => {
		const onRequestAction = vi.fn();
		render(
			<VaultDetailView
				detail={createDetail()}
				owner={{
					status: "ready",
					equity: "10",
					pnl: "1",
					allTimePnl: "2",
					entryTime: 1,
					lockedUntil: 3,
					isLocked: true,
					lockProgress: "0.5",
					maxWithdrawable: "0",
					canWithdraw: false,
				}}
				actionAvailability={{
					deposit: { available: true, reason: null },
					withdraw: { available: false, reason: "withdrawal-locked" },
				}}
				isTestnet={false}
				onRequestAction={onRequestAction}
			/>,
		);

		const depositsTerm = [...container.querySelectorAll("dt")].find((term) => term.textContent === "Deposits");
		expect(depositsTerm?.nextElementSibling?.textContent).toBe("Deposits open");
		const deposit = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent === "Deposit",
		);
		const withdraw = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent === "Withdraw",
		);
		expect(deposit?.disabled).toBe(false);
		expect(withdraw?.disabled).toBe(true);
		const reasonId = withdraw?.getAttribute("aria-describedby");
		expect(reasonId).not.toBeNull();
		expect(reasonId ? document.getElementById(reasonId)?.textContent : null).toContain("server-reported unlock time");
		act(() => deposit?.click());
		expect(onRequestAction).toHaveBeenCalledWith("deposit");
	});

	it("disables both Vault actions with the one desktop-required reason in an Agent-only session", () => {
		const onRequestAction = vi.fn();
		render(
			<VaultDetailView
				detail={createDetail()}
				owner={{ status: "disconnected" }}
				actionAvailability={{
					deposit: { available: false, reason: "agent-only-session" },
					withdraw: { available: false, reason: "agent-only-session" },
				}}
				isTestnet={false}
				onRequestAction={onRequestAction}
			/>,
		);

		const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")].filter(
			(button) => button.textContent === "Deposit" || button.textContent === "Withdraw",
		);
		expect(buttons).toHaveLength(2);
		for (const button of buttons) {
			expect(button.disabled).toBe(true);
			const reasonId = button.getAttribute("aria-describedby");
			expect(reasonId ? document.getElementById(reasonId)?.textContent : null).toBe(
				"This phone uses a desktop-approved trading key. This action needs the master wallet on desktop.",
			);
			act(() => button.click());
		}
		expect(onRequestAction).not.toHaveBeenCalled();
		expect(container.textContent).not.toContain("Connect");
	});

	it("labels every mobile depositor amount and includes a signed all-time PNL", () => {
		render(
			<VaultDetailView
				detail={createDetail({
					followers: [
						{
							user: FOLLOWER,
							vaultEquity: "100",
							pnl: "5",
							allTimePnl: "-2",
							daysFollowing: 4,
							vaultEntryTime: 1,
							lockupUntil: 2,
						},
					],
				})}
				owner={{ status: "disconnected" }}
				actionAvailability={AVAILABLE_ACTIONS}
				isTestnet={false}
			/>,
		);

		const mobileTerms = [...container.querySelectorAll("dt")].map((term) => term.textContent);
		expect(mobileTerms).toEqual(expect.arrayContaining(["Equity", "Current PNL", "All-time PNL"]));
		expect(container.textContent).toContain("+$5.00");
		expect(container.textContent).toContain("-$2.00");
	});

	it("provides one text summary while keeping each compact sparkline decorative", () => {
		render(
			<VaultsList state="normal" rows={[createListRow()]} account={{ status: "disconnected" }} onRetry={vi.fn()} />,
		);
		const charts = [...container.querySelectorAll<HTMLElement>("[data-vault-compact-chart]")];
		expect(charts).toHaveLength(2);
		for (const chart of charts) {
			expect(chart.getAttribute("aria-hidden")).toBe("true");
			expect(chart.hasAttribute("role")).toBe(false);
			expect(chart.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
			expect(chart.querySelector('svg[role="img"]')).toBeNull();
		}
		const summaries = [...container.querySelectorAll("[data-vault-chart-summary]")].map(
			(summary) => summary.textContent,
		);
		expect(summaries).toEqual([
			"PNL over 30 days. Latest value +$1.00. Positive PNL.",
			"PNL over 30 days. Latest value +$1.00. Positive PNL.",
		]);
		expect(container.querySelectorAll('[data-vault-chart-summary] bdi[dir="ltr"]')).toHaveLength(2);
	});

	it("describes a zero latest PNL without inferring that the history was flat", () => {
		render(
			<VaultPerformanceChart
				snapshot={{
					accountValueHistory: [],
					pnlHistory: [
						{ timestamp: 1, value: "-5" },
						{ timestamp: 2, value: "5" },
						{ timestamp: 3, value: "0" },
					],
					volume: "0",
				}}
				kind="pnl"
				period="month"
				compact
			/>,
		);

		expect(container.querySelector("[data-vault-chart-summary]")?.textContent).toBe(
			"PNL over 30 days. Latest value $0.00. PNL is zero.",
		);
		expect(container.querySelector('[role="img"]')).toBeNull();
	});

	it("gives the detail chart a concise name and a trend description with extrema", () => {
		render(
			<VaultPerformanceChart
				snapshot={{
					accountValueHistory: [],
					pnlHistory: [
						{ timestamp: 1, value: "0" },
						{ timestamp: 2, value: "5" },
						{ timestamp: 3, value: "0" },
					],
					volume: "0",
				}}
				kind="pnl"
				period="month"
			/>,
		);

		const chart = container.querySelector<HTMLElement>('[data-vault-performance-chart][role="img"]');
		const nameId = chart?.getAttribute("aria-labelledby");
		const descriptionId = chart?.getAttribute("aria-describedby");
		expect(nameId ? document.getElementById(nameId)?.textContent : null).toBe("PNL 30 days");
		expect(descriptionId ? document.getElementById(descriptionId)?.textContent : null).toBe(
			"Starts at $0.00 and ends at $0.00. The start and end values are unchanged. Minimum $0.00; maximum +$5.00.",
		);
		expect(
			descriptionId ? document.getElementById(descriptionId)?.querySelectorAll('bdi[dir="ltr"]') : [],
		).toHaveLength(4);
	});

	it("limits desktop row hover feedback to its actual Vault link", () => {
		render(
			<VaultsList state="normal" rows={[createListRow()]} account={{ status: "disconnected" }} onRetry={vi.fn()} />,
		);
		const row = container.querySelector("tbody tr");
		const link = row?.querySelector("a");
		expect(row?.className).not.toContain("hover:bg-fill-hover");
		expect(link?.className).toContain("hover:bg-fill-hover");
	});

	it("derives Vault age from the fetched snapshot time", () => {
		const fetchedAt = 1_800_000_000_000;
		render(
			<VaultsList
				state="normal"
				rows={[{ ...createListRow(), createdAt: fetchedAt - 2 * 86_400_000 }]}
				account={{ status: "disconnected" }}
				fetchedAt={fetchedAt}
				onRetry={vi.fn()}
			/>,
		);
		expect(container.querySelector("tbody tr td:last-child")?.textContent).toBe("2 days");
	});

	it("paginates the officially sorted discovery rows with localized navigation labels", () => {
		const rows = Array.from({ length: 21 }, (_, index) => ({
			...createListRow(),
			vaultAddress: `0x${(index + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
			name: `Vault ${index + 1}`,
			tvl: String(21 - index),
		}));
		render(<VaultsList state="normal" rows={rows} account={{ status: "disconnected" }} onRetry={vi.fn()} />);
		const pagination = container.querySelector('nav[aria-label="Vault pagination"]');
		expect(pagination?.textContent).toContain("1 of 2");
		const next = container.querySelector<HTMLButtonElement>('button[aria-label="Next Vault page"]');
		expect(next).not.toBeNull();
		act(() => next?.click());
		expect(pagination?.textContent).toContain("2 of 2");
		expect(container.textContent).toContain("Vault 21");
		expect(container.textContent).not.toContain("Vault 1");
	});

	it("names the Vault search clear button in the active language", () => {
		render(
			<VaultsList state="normal" rows={[createListRow()]} account={{ status: "disconnected" }} onRetry={vi.fn()} />,
		);
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Search vaults"]');
		if (!input) throw new Error("Missing Vault search");
		act(() => {
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "alpha");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		const clearButton = container.querySelector('button[aria-label="Clear search"]');
		expect(clearButton).not.toBeNull();

		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: { [catalogId("Clear search")]: "清除搜索" },
			}),
		);

		expect(container.querySelector('button[aria-label="清除搜索"]')).toBe(clearButton);
		expect(input.value).toBe("alpha");
	});

	it("reformats the fetched time in the active language without remounting it", () => {
		const zhCatalog = readFileSync(resolve(__dirname, "../../locales/zh/messages.po"), "utf8");
		expect(zhCatalog).toContain('msgid "Fetched {fetchedLabel}"\nmsgstr "获取时间：{fetchedLabel}"');
		render(
			<VaultsList
				state="normal"
				rows={[createListRow()]}
				account={{ status: "disconnected" }}
				fetchedAt={new Date(2026, 9, 2, 14, 31).getTime()}
				onRetry={vi.fn()}
			/>,
		);
		const label = readFetchedLabel();
		expect(label.textContent?.replace(/\s+/g, " ")).toBe("Fetched 02:31 PM");

		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: { [catalogId("Fetched {fetchedLabel}")]: "获取时间：{fetchedLabel}" },
			}),
		);
		expect(readFetchedLabel()).toBe(label);
		expect(label.textContent).toBe("获取时间：14:31");

		act(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
		expect(readFetchedLabel()).toBe(label);
		expect(label.textContent?.replace(/\s+/g, " ")).toBe("Fetched 02:31 PM");
	});

	it("writes list TVL, APR and PNL with the number-format separators, keeping exact rounding", () => {
		const row = {
			...createListRow(),
			tvl: "1234567.89",
			apr: "0.12345",
			pnlByPeriod: { day: ["0", "1"], week: ["0", "1"], month: ["0", "1234.5"], allTime: ["0", "1"] },
		} satisfies VaultListItem;
		render(<VaultsList state="normal" rows={[row]} account={{ status: "disconnected" }} onRetry={vi.fn()} />);
		const table = container.querySelector("table");
		expect(container.textContent).toContain("$1.23M");
		expect(container.textContent).toContain("+12.35%");
		expect(container.querySelector("[data-vault-chart-summary]")?.textContent).toContain("+$1,234.50");

		numberFormatSetting.locale = "de-DE";
		act(() => notifyNumberFormatChange());

		expect(container.querySelector("table")).toBe(table);
		expect(container.textContent).toContain("$1,23M");
		expect(container.textContent).toContain("+12,35%");
		expect(container.textContent).not.toContain("+12.35%");
		expect(container.querySelector("[data-vault-chart-summary]")?.textContent).toContain("+$1.234,50");
	});

	it("writes detail equity, commission, depositor amounts and chart extrema with the number-format separators", () => {
		const detail = createDetail({
			apr: "0.12345",
			followers: [
				{
					user: FOLLOWER,
					vaultEquity: "1234.5",
					pnl: "5",
					allTimePnl: "-2000.25",
					daysFollowing: 4,
					vaultEntryTime: 1,
					lockupUntil: 2,
				},
			],
		});
		render(
			<VaultDetailView
				detail={detail}
				owner={{
					status: "ready",
					equity: "12345.678",
					pnl: "1",
					allTimePnl: "2",
					entryTime: 1,
					lockedUntil: 3,
					isLocked: false,
					lockProgress: "1",
					maxWithdrawable: "12345.678",
					canWithdraw: true,
				}}
				actionAvailability={AVAILABLE_ACTIONS}
				isTestnet={false}
			/>,
		);
		expect(container.textContent).toContain("Leader commission10.00%");
		expect(container.textContent).toContain("$12,345.68");
		expect(container.textContent).toContain("$1,234.50");
		expect(container.textContent).toContain("-$2,000.25");

		numberFormatSetting.locale = "fr-FR";
		act(() => notifyNumberFormatChange());

		expect(container.textContent).toContain("Leader commission10,00%");
		expect(container.textContent).toContain("+12,35%");
		expect(container.textContent).toContain("$12 345,68");
		expect(container.textContent).toContain("$1 234,50");
		expect(container.textContent).toContain("+$5,00");
		expect(container.textContent).toContain("-$2 000,25");
		expect(container.textContent).not.toContain("$12,345.68");

		render(
			<VaultPerformanceChart
				snapshot={{
					accountValueHistory: [],
					pnlHistory: [
						{ timestamp: 1, value: "0" },
						{ timestamp: 2, value: "1234.5" },
						{ timestamp: 3, value: "0" },
					],
					volume: "0",
				}}
				kind="pnl"
				period="month"
			/>,
		);
		const chart = container.querySelector<HTMLElement>('[data-vault-performance-chart][role="img"]');
		const descriptionId = chart?.getAttribute("aria-describedby");
		expect(descriptionId ? document.getElementById(descriptionId)?.textContent : null).toBe(
			"Starts at $0,00 and ends at $0,00. The start and end values are unchanged. Minimum $0,00; maximum +$1 234,50.",
		);
	});

	function render(element: React.ReactNode) {
		act(() => root.render(<I18nProvider i18n={i18n}>{element}</I18nProvider>));
	}

	function readFetchedLabel(): HTMLElement {
		const labels = container.querySelectorAll<HTMLElement>("header span.tabular-nums");
		expect(labels).toHaveLength(1);
		return labels[0];
	}
});

function catalogId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

function createListRow(): VaultListItem {
	return {
		vaultAddress: VAULT,
		leader: LEADER,
		name: "Alpha Vault",
		tvl: "1000",
		apr: "0.1",
		createdAt: 1_786_000_000_000,
		isClosed: false,
		relationship: "normal",
		pnlByPeriod: { day: ["0", "1"], week: ["0", "1"], month: ["0", "1"], allTime: ["0", "1"] },
		classification: null,
	};
}

function createDetail(overrides: Partial<VaultDetail> = {}): VaultDetail {
	const snapshot = {
		accountValueHistory: [
			{ timestamp: 1, value: "100" },
			{ timestamp: 2, value: "110" },
		],
		pnlHistory: [
			{ timestamp: 1, value: "0" },
			{ timestamp: 2, value: "10" },
		],
		volume: "1000",
	};
	return {
		name: "Alpha Vault",
		vaultAddress: VAULT,
		leader: LEADER,
		description: "Market-making Vault",
		portfolio: { day: snapshot, week: snapshot, month: snapshot, allTime: snapshot },
		apr: "0.1",
		followerState: null,
		leaderFraction: "0.1",
		leaderCommission: "0.1",
		followers: [],
		maxDistributable: "0",
		maxWithdrawable: "0",
		isClosed: false,
		relationship: "normal",
		allowDeposits: true,
		alwaysCloseOnWithdraw: false,
		...overrides,
	};
}
