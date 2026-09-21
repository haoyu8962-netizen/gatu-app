// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shortenAddress } from "@/lib/format";
import { createI18nRoot } from "@/lib/tests/harness/react";
import type { StakingValidatorView } from "../domain/staking";
import { StakingView, type StakingViewProps } from "../staking-view";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const ACTIVE = "0x2222222222222222222222222222222222222222" as const;
const JAILED = "0x3333333333333333333333333333333333333333" as const;
const INACTIVE = "0x4444444444444444444444444444444444444444" as const;
const HASH = `0x${"ab".repeat(32)}` as const;
const SYSTEM_FINALIZATION_HASH = `0x${"0".repeat(64)}` as const;

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

function validator(
	address: `0x${string}`,
	name: string,
	status: "active" | "jailed" | "inactive",
): StakingValidatorView {
	const isJailed = status === "jailed";
	const isActive = status === "active";
	const stats = { uptimeFraction: "0.99", predictedApr: "0.03", nSamples: 70 };
	return {
		validator: address,
		signer: OWNER,
		name,
		description: `${name} description`,
		nRecentBlocks: 10,
		stakeRaw: 100_000_000,
		stakeApproximateHype: "1",
		isJailed,
		unjailableAfter: isJailed ? 1_800_000_000_000 : null,
		isActive,
		commission: "0.03",
		status,
		stats: { day: stats, week: stats, month: stats },
		delegatedAmount: status === "active" ? "4" : "0",
		lockedUntilTimestamp: status === "active" ? 1_700_000_000_000 : null,
		selectedStats: stats,
	};
}

function props(overrides: Partial<StakingViewProps> = {}): StakingViewProps {
	const validators = [
		validator(ACTIVE, "Active Validator", "active"),
		validator(JAILED, "Jailed Validator", "jailed"),
		validator(INACTIVE, "Inactive Validator", "inactive"),
	];
	return {
		env: "Mainnet",
		pageState: "normal",
		publicState: "ready",
		accountState: "ready",
		ownerAddress: OWNER,
		hasExactMasterSigner: true,
		validators,
		validatorViews: validators,
		period: "week",
		setPeriod: vi.fn(),
		networkStakeApproximate: "3",
		weightedApr: "0.03",
		account: {
			summary: {
				delegated: "4",
				undelegated: "2",
				totalPendingWithdrawal: "1.5",
				nPendingWithdrawals: 2,
			},
			delegations: [{ validator: ACTIVE, amount: "4", lockedUntilTimestamp: 1_700_000_000_000 }],
			rewards: [{ time: 1_700_000_000_000, source: "delegation", totalAmount: "0.1" }],
			history: [
				{
					time: 1_700_000_000_000,
					hash: HASH,
					action: { type: "undelegate", validator: ACTIVE, amount: "1" },
				},
				{
					time: 1_700_000_000_001,
					hash: HASH,
					action: { type: "withdrawalInitiated", amount: "1" },
				},
				{
					time: 1_700_000_000_002,
					hash: SYSTEM_FINALIZATION_HASH,
					action: { type: "withdrawalFinalized", amount: "0.5" },
				},
			],
			spotHypeAvailable: "8",
			stakingLink: null,
		},
		isRefreshing: false,
		isReconnecting: false,
		retryPublic: vi.fn(),
		retryAccount: vi.fn(),
		connectMasterWallet: vi.fn(),
		onActionSubmit: vi.fn(),
		...overrides,
	};
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
	const match = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === label);
	if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing button: ${label}`);
	return match;
}

function activeTableScrollRegion(container: HTMLElement): HTMLElement | null {
	const activeTab = container.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
	const panelId = activeTab?.getAttribute("aria-controls");
	if (!panelId) return null;
	return (
		container.ownerDocument
			.getElementById(panelId)
			?.querySelector<HTMLElement>('[data-slot="table-scroll-container"]') ?? null
	);
}

function ltrValues(container: HTMLElement): string[] {
	return [...container.querySelectorAll('bdi[dir="ltr"]')].map((element) => element.textContent?.trim() ?? "");
}

describe("StakingView", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockReturnValue({
				addEventListener: vi.fn(),
				matches: false,
				removeEventListener: vi.fn(),
			}),
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
		toastMocks.error.mockReset();
		toastMocks.success.mockReset();
	});

	function settledSession(result: "success" | "rejected" | "apiError" | "unknown"): StakingViewProps["actionSession"] {
		return {
			submission: { request: { kind: "cDeposit" }, amount: "1", wei: 100_000_000 },
			identityKey: "mainnet:owner",
			state: { stage: "done", result },
			errorMessage: result === "success" || result === "unknown" ? null : result,
			match: result === "success" ? { hash: HASH, time: 1 } : null,
			reference: null,
			recoveredFromMarker: false,
		} as StakingViewProps["actionSession"];
	}

	it("reports a verified staking operation once through a notification and closes the dialog", () => {
		const onActionClose = vi.fn();
		const onActionRetry = vi.fn();
		const viewProps = props({ actionSession: settledSession("success"), onActionClose, onActionRetry });
		act(() => root.render(<StakingView {...viewProps} />));
		act(() => root.render(<StakingView {...viewProps} />));

		expect(toastMocks.success).toHaveBeenCalledExactlyOnceWith("Operation verified", expect.anything());
		expect(onActionClose).toHaveBeenCalledOnce();
		expect(onActionRetry).not.toHaveBeenCalled();
		expect(document.body.textContent).not.toContain("Operation in progress");
	});

	it.each([
		["rejected", "Authorization rejected", "The master wallet rejected the authorization."],
		["apiError", "Request rejected", "Hyperliquid rejected the verified public request."],
	] as const)("reports a %s staking request and returns to the review step", (result, title, description) => {
		const onActionClose = vi.fn();
		const onActionRetry = vi.fn();
		act(() =>
			root.render(<StakingView {...props({ actionSession: settledSession(result), onActionClose, onActionRetry })} />),
		);

		expect(toastMocks.error).toHaveBeenCalledExactlyOnceWith(title, expect.objectContaining({ description }));
		expect(onActionRetry).toHaveBeenCalledOnce();
		expect(onActionClose).not.toHaveBeenCalled();
	});

	it("leaves an unconfirmed staking operation to the in-dialog verification path", () => {
		const onActionClose = vi.fn();
		const onActionRetry = vi.fn();
		act(() =>
			root.render(
				<StakingView {...props({ actionSession: settledSession("unknown"), onActionClose, onActionRetry })} />,
			),
		);

		expect(toastMocks.success).not.toHaveBeenCalled();
		expect(toastMocks.error).not.toHaveBeenCalled();
		expect(onActionClose).not.toHaveBeenCalled();
		expect(onActionRetry).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain("Status not confirmed");
		expect(document.body.textContent).toContain("Verify again");
	});

	it("renders official validator states, aggregate pending data, and four distinct action entry points", () => {
		act(() => root.render(<StakingView {...props()} />));

		expect(container.textContent).toContain("Active Validator");
		expect(container.textContent).toContain("Jailed Validator");
		expect(container.textContent).toContain("Inactive Validator");
		expect(container.textContent).toContain("1.5 HYPE · 2/5");
		expect(container.textContent).toContain("Transfers to Spot use a seven-day queue");
		expect(container.textContent).toContain("no individual unlock time or progress is inferred");
		expect(button(container, "Spot to staking").disabled).toBe(false);
		expect(button(container, "Staking to Spot").disabled).toBe(false);
		expect(button(container, "Delegate").disabled).toBe(false);
		expect(button(container, "Undelegate").disabled).toBe(false);

		const allDelegateButtons = [...container.querySelectorAll("button")].filter(
			(candidate) => candidate.textContent?.trim() === "Delegate",
		) as HTMLButtonElement[];
		expect(allDelegateButtons).toHaveLength(3);
		expect(allDelegateButtons.slice(1).every((candidate) => candidate.disabled)).toBe(true);
		expect(container.querySelector("table")?.className).toContain("min-w-[var(--staking-validator-table-min)]");
		expect(container.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe("Staking detail views");
	});

	it("isolates account, validator, HYPE, ratio, reward, and transaction values from RTL copy", () => {
		act(() => root.render(<StakingView {...props()} />));

		expect(ltrValues(container)).toEqual(
			expect.arrayContaining([shortenAddress(OWNER, 6, 6), "≈ 3 HYPE", "4 HYPE", "1.5 HYPE · 2/5", "≈ 1 HYPE", "99%"]),
		);

		act(() => button(container, "Staking rewards").click());
		expect(ltrValues(container)).toContain("+0.1 HYPE");

		act(() => button(container, "Staking actions").click());
		expect(ltrValues(container)).toEqual(expect.arrayContaining(["1 HYPE", shortenAddress(HASH, 6, 6)]));
	});

	it("names and makes the validator table scroll region keyboard reachable only when it overflows", () => {
		mockValidatorTableWidths({ clientWidth: 320, scrollWidth: 960 });
		act(() => root.render(<StakingView {...props()} />));

		let scrollRegion = activeTableScrollRegion(container);
		expect(scrollRegion?.getAttribute("role")).toBe("region");
		expect(scrollRegion?.getAttribute("aria-label")).toBe("Validator performance table");
		expect(scrollRegion?.tabIndex).toBe(0);

		act(() => button(container, "Staking rewards").click());
		scrollRegion = activeTableScrollRegion(container);
		expect(scrollRegion?.getAttribute("aria-label")).toBe("Staking rewards table");
		expect(scrollRegion?.tabIndex).toBe(0);

		act(() => button(container, "Staking actions").click());
		scrollRegion = activeTableScrollRegion(container);
		expect(scrollRegion?.getAttribute("aria-label")).toBe("Staking action history table");
		expect(scrollRegion?.tabIndex).toBe(0);
	});

	it("does not add a keyboard stop when the validator table fits", () => {
		mockValidatorTableWidths({ clientWidth: 960, scrollWidth: 960 });
		act(() => root.render(<StakingView {...props()} />));

		const scrollRegion = container.querySelector<HTMLElement>('[data-slot="table-scroll-container"]');
		expect(scrollRegion?.hasAttribute("role")).toBe(false);
		expect(scrollRegion?.hasAttribute("aria-label")).toBe(false);
		expect(scrollRegion?.tabIndex).toBe(-1);
	});

	it("describes automatic compounding without offering a reward collection control", () => {
		act(() => root.render(<StakingView {...props()} />));
		expect(container.textContent).toContain("Rewards compound automatically");
		expect(container.textContent).toContain("automatically redelegated");
		expect(container.textContent).not.toMatch(/\bclaim\b/iu);

		act(() => button(container, "Staking rewards").click());
		expect(container.textContent).toContain("Reward source");
		expect(container.textContent).toContain("Delegation");
		expect(container.textContent).not.toContain(ACTIVE);
	});

	it("keeps undelegation and the Mainnet Spot transfer as separate history semantics", () => {
		act(() => root.render(<StakingView {...props()} />));
		act(() => button(container, "Staking actions").click());

		expect(container.textContent).toContain("Undelegated from Active Validator");
		expect(container.textContent).toContain("Staking to Spot · initiated");
		expect(container.textContent).toContain("Staking to Spot · finalized");
		expect(container.textContent).toContain("System finalization · hash unavailable");
		const explorerLink = container.querySelector(`a[href*="${HASH}"]`) as HTMLAnchorElement | null;
		expect(explorerLink?.target).toBe("_blank");
		expect(explorerLink?.rel).toBe("noopener");
		expect(container.querySelector(`a[href*="${SYSTEM_FINALIZATION_HASH}"]`)).toBeNull();
	});

	it("shows the approximately five-minute queue throughout the Testnet view and modal", () => {
		act(() => root.render(<StakingView {...props({ env: "Testnet" })} />));

		expect(container.textContent).toContain("Testnet queue, which takes approximately five minutes");
		expect(container.textContent).toContain("approximately five-minute queue on Testnet");
		expect(container.textContent).not.toContain("seven-day queue");

		act(() => button(container, "Staking to Spot").click());
		expect(document.body.textContent).toContain(
			"Starts the approximately five-minute Testnet transfer queue from staking balance to Spot.",
		);
		expect(document.body.textContent).toContain("Testnet queue: approximately five minutes");
		expect(document.body.textContent).toContain(
			"Only this transfer starts the Testnet queue, which takes approximately five minutes.",
		);
	});

	it("shows an Agent-only owner as read-only and disables every funding action", () => {
		act(() =>
			root.render(
				<StakingView
					{...props({
						pageState: "nonSigning",
						hasExactMasterSigner: false,
					})}
				/>,
			),
		);

		expect(container.textContent).toContain("Agent/API wallet is never used as the staking owner or signer");
		expect(button(container, "Spot to staking").disabled).toBe(true);
		expect(button(container, "Staking to Spot").disabled).toBe(true);
		expect(
			[...container.querySelectorAll("button")]
				.filter((candidate) => ["Delegate", "Undelegate"].includes(candidate.textContent?.trim() ?? ""))
				.every((candidate) => candidate.disabled),
		).toBe(true);
	});

	it("fails closed on account errors while preserving verified public validators", () => {
		const retryAccount = vi.fn();
		act(() =>
			root.render(
				<StakingView
					{...props({
						pageState: "error",
						accountState: "error",
						account: null,
						retryAccount,
					})}
				/>,
			),
		);

		expect(container.textContent).toContain("Active Validator");
		expect(container.textContent).toContain("Balances remain unknown");
		expect(button(container, "Spot to staking").disabled).toBe(true);
		const retry = [...container.querySelectorAll("button")].find((candidate) =>
			candidate.textContent?.includes("Retry"),
		);
		act(() => (retry as HTMLButtonElement | undefined)?.click());
		expect(retryAccount).toHaveBeenCalledOnce();
	});
});

function mockValidatorTableWidths({ clientWidth, scrollWidth }: { clientWidth: number; scrollWidth: number }) {
	vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
		return this.dataset.slot === "table-scroll-container" ? clientWidth : 0;
	});
	vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
		return this.dataset.slot === "table-scroll-container" ? scrollWidth : 0;
	});
}
