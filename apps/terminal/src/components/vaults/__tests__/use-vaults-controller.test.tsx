// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { useVaultDetailController, useVaultsController } from "../use-vaults-controller";

interface QueryState<T> {
	data: T | undefined;
	isLoading: boolean;
	isError: boolean;
	isFetching: boolean;
	dataUpdatedAt: number;
	refetch: ReturnType<typeof vi.fn>;
}

type PublicVaultFixture = ReturnType<typeof publicVault>;

const mocks = vi.hoisted(() => ({
	activeOwner: null as null | { env: "Mainnet" | "Testnet"; address: `0x${string}` },
	env: "Mainnet" as "Mainnet" | "Testnet",
	info: new Map<string, QueryState<unknown>>(),
	infoCalls: [] as Array<{ method: string; params: unknown; options: unknown }>,
	publicVaults: {} as QueryState<readonly PublicVaultFixture[]>,
	wallet: {
		address: undefined as `0x${string}` | undefined,
		sessionMode: "disconnected" as "wallet" | "agent-only" | "disconnected",
	},
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({ useWalletSession: () => mocks.wallet }));

vi.mock("@/lib/hyperliquid", () => ({
	useActiveAgentOwner: () => mocks.activeOwner,
	useHyperliquid: () => ({ env: mocks.env }),
	useInfo: (method: string, params: unknown, options: unknown) => {
		mocks.infoCalls.push({ method, params, options });
		const state = mocks.info.get(method);
		if (!state) throw new Error(`Missing query fixture for ${method}`);
		return state;
	},
	usePublicVaults: () => mocks.publicVaults,
}));

let controller: ReturnType<typeof useVaultsController> | null = null;
let detailController: ReturnType<typeof useVaultDetailController> | null = null;
let detailRenderCount = 0;

function Probe() {
	controller = useVaultsController();
	return null;
}

function DetailProbe() {
	detailRenderCount += 1;
	detailController = useVaultDetailController(VAULT_ADDRESS);
	return null;
}

const VAULT_ADDRESS = "0x0000000000000000000000000000000000000001";

describe("useVaultsController", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.activeOwner = null;
		mocks.env = "Mainnet";
		mocks.infoCalls = [];
		mocks.wallet = { address: undefined, sessionMode: "disconnected" };
		mocks.publicVaults = query([publicVault(), publicVault({ child: true }), publicVault({ closed: true })], {
			dataUpdatedAt: 1234,
		});
		mocks.info = new Map<string, QueryState<unknown>>([
			["userVaultEquities", query(undefined)],
			["leadingVaults", query(undefined)],
		]);
		controller = null;
		detailController = null;
		detailRenderCount = 0;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("derives a normal public list without inventing account facts", () => {
		render();
		expect(current()).toMatchObject({ state: "normal", fetchedAt: 1234, account: { status: "disconnected" } });
		expect(current().rows).toHaveLength(2);
		expect(current().rows[0]).toMatchObject({ name: "Sample Vault", classification: null });
	});

	it("distinguishes loading, error, and definitive empty and retries the public feed", () => {
		mocks.publicVaults = query<readonly PublicVaultFixture[]>(undefined, { isLoading: true });
		render();
		expect(current().state).toBe("loading");

		mocks.publicVaults = query<readonly PublicVaultFixture[]>(undefined, { isError: true });
		act(() => root.render(<Probe />));
		expect(current().state).toBe("error");

		mocks.publicVaults = query([]);
		act(() => root.render(<Probe />));
		expect(current().state).toBe("empty");

		act(() => current().onRetry());
		expect(mocks.publicVaults.refetch).toHaveBeenCalledOnce();
		expect(mocks.info.get("userVaultEquities")?.refetch).not.toHaveBeenCalled();
	});

	it("loads public Vault details while disconnected without passing an empty optional user", () => {
		mocks.info = new Map<string, QueryState<unknown>>([
			["vaultDetails", query(vaultDetail())],
			["userVaultEquities", query(undefined)],
		]);

		act(() => root.render(<DetailProbe />));

		expect(detailCurrent()).toMatchObject({ state: "normal", owner: { status: "disconnected" } });
		expect(mocks.infoCalls.find((call) => call.method === "vaultDetails")?.params).toEqual({
			vaultAddress: VAULT_ADDRESS,
		});
	});

	it("asks for a retry when a detail refresh answers malformed data, so an open action dialog can recover", () => {
		mocks.info = new Map<string, QueryState<unknown>>([
			["vaultDetails", query(vaultDetail(), { dataUpdatedAt: 1 })],
			["userVaultEquities", query(undefined)],
		]);
		act(() => root.render(<DetailProbe />));
		expect(detailCurrent()).toMatchObject({ state: "normal", detailCurrent: true, needsRetry: false });

		mocks.info.set("vaultDetails", query({ ...vaultDetail(), name: 7 }, { dataUpdatedAt: 2 }));
		act(() => root.render(<DetailProbe />));
		expect(detailCurrent()).toMatchObject({ state: "error", detailCurrent: false, needsRetry: true });
	});

	it("recomputes the owner withdrawal gate when the server lock timestamp passes", async () => {
		const now = Date.now();
		mocks.wallet = { address: "0x0000000000000000000000000000000000000004", sessionMode: "wallet" };
		mocks.info = new Map<string, QueryState<unknown>>([
			["vaultDetails", query({ ...vaultDetail(), maxWithdrawable: 100 })],
			["userVaultEquities", query([{ vaultAddress: VAULT_ADDRESS, equity: "10", lockedUntilTimestamp: now + 20 }])],
		]);

		act(() => root.render(<DetailProbe />));
		const initialRenderCount = detailRenderCount;
		expect(detailCurrent().owner).toMatchObject({
			status: "ready",
			lockedUntil: now + 20,
			isLocked: true,
			canWithdraw: false,
		});

		await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
		expect(Date.now()).toBeGreaterThan(now + 20);
		expect(detailRenderCount).toBeGreaterThan(initialRenderCount);
		expect(detailCurrent().owner).toMatchObject({ status: "ready", isLocked: false, canWithdraw: true });
	});

	function render() {
		act(() => root.render(<Probe />));
	}

	function current() {
		if (!controller) throw new Error("Controller was not captured");
		return controller;
	}

	function detailCurrent() {
		if (!detailController) throw new Error("Detail controller was not captured");
		return detailController;
	}
});

function query<T>(data: T | undefined, overrides: Partial<QueryState<T>> = {}): QueryState<T> {
	return {
		data,
		isLoading: false,
		isError: false,
		isFetching: false,
		dataUpdatedAt: 0,
		refetch: vi.fn(),
		...overrides,
	};
}

function publicVault({ child = false, closed = false }: { child?: boolean; closed?: boolean } = {}) {
	return {
		vaultAddress: (child
			? "0x0000000000000000000000000000000000000003"
			: closed
				? "0x0000000000000000000000000000000000000004"
				: "0x0000000000000000000000000000000000000001") as `0x${string}`,
		leader: "0x0000000000000000000000000000000000000002" as const,
		name: "Sample Vault",
		tvl: "1000000",
		apr: 0.1,
		createTimeMillis: 1_700_000_000_000,
		isClosed: closed,
		relationship: { type: child ? ("child" as const) : ("normal" as const) },
		pnlHistory: {
			day: ["0", "1"],
			week: ["0", "2"],
			month: ["0", "3"],
			allTime: ["0", "4"],
		},
	};
}

function vaultDetail() {
	const snapshot = {
		accountValueHistory: [[1_700_000_000_000, "100"]],
		pnlHistory: [[1_700_000_000_000, "0"]],
		vlm: "0",
	};
	return {
		name: "Sample Vault",
		vaultAddress: VAULT_ADDRESS,
		leader: "0x0000000000000000000000000000000000000002",
		description: "Verified public detail",
		portfolio: [
			["day", snapshot],
			["week", snapshot],
			["month", snapshot],
			["allTime", snapshot],
		],
		apr: 0.1,
		followerState: null,
		leaderFraction: 1,
		leaderCommission: 0.1,
		followers: [],
		maxDistributable: 100,
		maxWithdrawable: 0,
		isClosed: false,
		relationship: { type: "normal" },
		allowDeposits: true,
		alwaysCloseOnWithdraw: false,
	};
}
