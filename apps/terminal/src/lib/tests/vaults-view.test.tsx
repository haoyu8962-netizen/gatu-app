// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultDetail, VaultListItem } from "@/components/vaults/domain/vaults";
import { VaultDetailView } from "@/components/vaults/vault-detail-view";
import { VaultsList } from "@/components/vaults/vaults-list";

const VAULT = "0x0000000000000000000000000000000000000001" as const;
const LEADER = "0x0000000000000000000000000000000000000002" as const;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("Vault views", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("keeps unreviewed classification explicit and fails the Official filter closed", () => {
		render(
			<VaultsList state="normal" rows={[createListRow()]} account={{ status: "disconnected" }} onRetry={vi.fn()} />,
		);
		expect(container.textContent).toContain("Rows remain unclassified instead of being guessed");
		expect(container.textContent).toContain("Alpha Vault");

		const official = [...container.querySelectorAll("button")].find((button) => button.textContent === "Official");
		act(() => official?.click());
		expect(container.textContent).toContain("Classification unavailable");
		expect(container.textContent).not.toContain("Alpha Vault");
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
		render(<VaultDetailView detail={createDetail()} owner={{ status: "disconnected" }} isTestnet={false} />);
		const text = container.textContent ?? "";
		expect(text).toContain("lose all deposited principal");
		expect(text).toContain("Historical APR does not predict future performance");
		expect(text).toContain("Leader commission10.00%");
		expect(text).toContain("server-returned lock timestamp");
		expect(text).toContain("cancel orders, close positions, incur slippage");
		expect(text).not.toContain("20 USDC");
		expect(text).not.toContain("4 days");
		const leaderLink = container.querySelector<HTMLAnchorElement>('a[target="_blank"]');
		expect(leaderLink?.rel).toBe("noopener");
	});

	function render(element: React.ReactNode) {
		act(() => root.render(<I18nProvider i18n={i18n}>{element}</I18nProvider>));
	}
});

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

function createDetail(): VaultDetail {
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
	};
}
