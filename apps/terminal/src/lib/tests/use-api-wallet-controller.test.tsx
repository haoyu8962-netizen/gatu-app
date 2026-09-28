// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_WALLET_ZERO_ADDRESS } from "@/components/api-wallet/api-wallet-state";
import {
	type ApiWalletControllerOptions,
	useApiWalletController,
} from "@/components/api-wallet/use-api-wallet-controller";
import { createI18nRoot } from "./harness/react";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OTHER_OWNER = "0x9999999999999999999999999999999999999999" as const;
const AGENT_ADDRESS = "0x2222222222222222222222222222222222222222" as const;
const PRIVATE_KEY = `0x${"11".repeat(32)}` as const;
const DAY_MS = 86_400_000;
const DUPLICATE_NAME = "This name already exists. A duplicate would replace the existing API wallet.";
const CHANGED_BEFORE_SIGNING =
	"API wallet data changed before signing. Close this request and review the refreshed list.";
const ZH_TRANSLATIONS: Record<string, string> = {
	"{days} days left": "剩余 {days} 天",
	"Expires today": "今日到期",
	"{days} days": "{days} 天",
	"Not reported": "未报告",
	[DUPLICATE_NAME]: "该名称已存在。重复的名称会替换现有的 API 钱包。",
	[CHANGED_BEFORE_SIGNING]: "签名前 API 钱包数据已发生变化。请关闭本次请求并查看刷新后的列表。",
};

function activateChinese() {
	i18n.loadAndActivate({
		locale: "zh",
		messages: Object.fromEntries(
			Object.entries(ZH_TRANSLATIONS).map(([message, translation]) => [
				createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6),
				translation,
			]),
		),
	});
}

const testState = vi.hoisted(() => ({
	activeOwner: null as null | { env: "Mainnet" | "Testnet"; address: `0x${string}` },
	agents: [] as unknown,
	approveAgent: vi.fn(),
	downloadCredential: vi.fn(),
	env: "Mainnet" as "Mainnet" | "Testnet",
	isError: false,
	isFetching: false,
	isLoading: false,
	infoEnabled: false,
	infoUser: "",
	reconnectWallet: vi.fn(),
	refetch: vi.fn(),
	wallet: {
		address: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
		hasWalletAccess: true,
		isConnected: true,
		sessionMode: "wallet" as "wallet" | "agent-only" | "disconnected",
		walletAddress: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
	},
}));

vi.mock("@gatu/hl-react", () => ({ useActiveAgentOwner: () => testState.activeOwner }));

vi.mock("@/hooks/wallet/use-explicit-agent-approval", () => ({
	useExplicitAgentApproval: () => ({ isPending: false, mutateAsync: testState.approveAgent }),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useReconnectWallet: () => ({ reconnectWallet: testState.reconnectWallet }),
	useWalletSession: () => testState.wallet,
}));

vi.mock("@/components/api-wallet/api-wallet-credentials", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/components/api-wallet/api-wallet-credentials")>();
	return { ...actual, downloadApiWalletCredential: testState.downloadCredential };
});

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ env: testState.env }),
	useInfo: (_method: string, params: { user: string }, options: { enabled: boolean }) => {
		testState.infoUser = params.user;
		testState.infoEnabled = options.enabled;
		return {
			data: testState.agents,
			isError: testState.isError,
			isFetching: testState.isFetching,
			isLoading: testState.isLoading,
			refetch: testState.refetch,
		};
	},
}));

let controller: ReturnType<typeof useApiWalletController> | null = null;
let controllerOptions: ApiWalletControllerOptions;

function Probe() {
	controller = useApiWalletController(controllerOptions);
	return null;
}

function createQueryResult(data: unknown = testState.agents, error: unknown = null) {
	return { data, error };
}

describe("useApiWalletController", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.clearAllMocks();
		testState.activeOwner = null;
		testState.agents = [];
		testState.env = "Mainnet";
		testState.isError = false;
		testState.isFetching = false;
		testState.isLoading = false;
		testState.infoEnabled = false;
		testState.infoUser = "";
		testState.wallet = {
			address: OWNER,
			hasWalletAccess: true,
			isConnected: true,
			sessionMode: "wallet",
			walletAddress: OWNER,
		};
		testState.approveAgent.mockResolvedValue({ status: "ok", response: { type: "default" } });
		testState.refetch.mockImplementation(async () => createQueryResult());
		controllerOptions = { createCredential: () => ({ address: AGENT_ADDRESS, privateKey: PRIVATE_KEY }) };
		controller = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(<Probe />));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	function current() {
		if (!controller) throw new Error("Controller was not captured");
		return controller;
	}

	function prepareAuthorization(name = "grid-bot") {
		act(() => current().onNameChange(name));
		act(() => current().onGenerate());
		act(() => current().onAuthorize());
		expect(current().action?.stage).toBe("review");
	}

	function firstAgent() {
		const agent = current().agents[0];
		if (!agent) throw new Error("Expected an API wallet fixture agent");
		return agent;
	}

	it("labels API wallet expiry and a duplicate name in the active language", () => {
		const now = Date.now();
		testState.agents = [
			{ name: "grid-bot", address: AGENT_ADDRESS, validUntil: now + 2.5 * DAY_MS },
			{ name: "hedge-bot", address: OTHER_OWNER, validUntil: now + DAY_MS / 4 },
		];
		act(() => root.render(<Probe />));
		act(() => current().onNameChange("GRID-BOT"));

		expect(current().agents.map((agent) => agent.statusDetail)).toEqual(["3 days left", "Expires today"]);
		expect(current().nameError).toBe(DUPLICATE_NAME);

		act(() => activateChinese());

		expect(current().agents.map((agent) => agent.statusDetail)).toEqual(["剩余 3 天", "今日到期"]);
		expect(current().nameError).toBe(ZH_TRANSLATIONS[DUPLICATE_NAME]);
		expect(current().name).toBe("GRID-BOT");
	});

	it.each([
		["  ", "Enter an API wallet name."],
		["a", "Use 2–16 letters, numbers, underscores, or hyphens."],
	])("explains why the API wallet name %j cannot be used", (name, message) => {
		act(() => current().onNameChange(name));

		expect(current().nameError).toBe(message);
	});

	it("shows the reviewed validity and a stored preflight failure in the active language", async () => {
		prepareAuthorization("Grid-Bot");
		testState.refetch.mockResolvedValueOnce(
			createQueryResult([{ name: "gRID-bOT", address: OTHER_OWNER, validUntil: null }]),
		);
		await act(async () => current().onConfirmAction());
		expect(current().action).toMatchObject({ validityLabel: "90 days", errorMessage: CHANGED_BEFORE_SIGNING });

		act(() => activateChinese());

		expect(current().action).toMatchObject({
			stage: "review",
			validityLabel: "90 天",
			errorMessage: ZH_TRANSLATIONS[CHANGED_BEFORE_SIGNING],
		});
	});

	it("shows an unreported removal validity in the active language", () => {
		testState.agents = [{ name: "grid-bot", address: AGENT_ADDRESS, validUntil: null }];
		act(() => root.render(<Probe />));
		act(() => current().onRemove(firstAgent()));
		expect(current().action?.validityLabel).toBe("Not reported");

		act(() => activateChinese());

		expect(current().action?.validityLabel).toBe("未报告");
	});

	it.each([
		["ValidationError", "invalid agent payload", "The request could not be prepared. Refresh the page and try again."],
		["ApiRequestError", "Agent name is already in use", "Agent name is already in use"],
		["ApiRequestError", "", "The API wallet request was rejected."],
	] as const)("describes a deterministic %s rejection %j", async (errorName, message, expected) => {
		prepareAuthorization();
		testState.refetch.mockResolvedValueOnce(createQueryResult([]));
		const approvalError = new Error(message);
		approvalError.name = errorName;
		testState.approveAgent.mockRejectedValueOnce(approvalError);

		await act(async () => current().onConfirmAction());

		expect(current().action).toMatchObject({ result: "apiError", errorMessage: expected });
	});

	it("authorizes using only the public tuple and reveals the key after exact reconciliation", async () => {
		prepareAuthorization();
		testState.refetch.mockResolvedValueOnce(createQueryResult([])).mockImplementation(async () => {
			const params = testState.approveAgent.mock.calls[0]?.[0] as { agentName: string };
			const validUntil = Number(params.agentName.split(" ").at(-1));
			return createQueryResult([{ name: "grid-bot", address: AGENT_ADDRESS, validUntil }]);
		});

		await act(async () => current().onConfirmAction());

		expect(testState.approveAgent).toHaveBeenCalledOnce();
		const [params, options] = testState.approveAgent.mock.calls[0] ?? [];
		expect(params).toEqual({
			agentAddress: AGENT_ADDRESS,
			agentName: expect.stringMatching(/^grid-bot valid_until \d+$/),
		});
		expect(JSON.stringify(params)).not.toContain(PRIVATE_KEY);
		expect(options.signal).toBeInstanceOf(AbortSignal);
		expect(current().action).toMatchObject({ stage: "done", result: "success", privateKey: PRIVATE_KEY });
	});

	it("refuses a case-insensitive duplicate discovered by fresh authorization preflight", async () => {
		prepareAuthorization("Grid-Bot");
		testState.refetch.mockResolvedValueOnce(
			createQueryResult([{ name: "gRID-bOT", address: OTHER_OWNER, validUntil: null }]),
		);

		await act(async () => current().onConfirmAction());

		expect(testState.approveAgent).not.toHaveBeenCalled();
		expect(current().action).toMatchObject({ stage: "review", locked: false });
		expect(current().action?.errorMessage).toContain("changed before signing");
	});

	it("refuses a stale removal review when the exact name now points to another address", async () => {
		const target = { name: "grid-bot", address: AGENT_ADDRESS, validUntil: Date.now() + 86_400_000 };
		testState.agents = [target];
		act(() => root.render(<Probe />));
		act(() => current().onRemove(firstAgent()));
		testState.refetch.mockResolvedValueOnce(
			createQueryResult([{ ...target, address: "0x3333333333333333333333333333333333333333" }]),
		);

		await act(async () => current().onConfirmAction());

		expect(testState.approveAgent).not.toHaveBeenCalled();
		expect(current().action).toMatchObject({ stage: "review", locked: false });
		expect(current().action?.errorMessage).toContain("changed before signing");
	});

	it.each(["validUntil changes", "multiple agents share the exact name"] as const)(
		"refuses removal when fresh preflight finds that %s",
		async (scenario) => {
			const target = { name: "grid-bot", address: AGENT_ADDRESS, validUntil: Date.now() + 86_400_000 };
			testState.agents = [target];
			act(() => root.render(<Probe />));
			act(() => current().onRemove(firstAgent()));
			const freshAgents =
				scenario === "validUntil changes"
					? [{ ...target, validUntil: target.validUntil + 1 }]
					: [target, { name: target.name, address: OTHER_OWNER, validUntil: target.validUntil }];
			testState.refetch.mockResolvedValueOnce(createQueryResult(freshAgents));

			await act(async () => current().onConfirmAction());

			expect(testState.approveAgent).not.toHaveBeenCalled();
			expect(current().action).toMatchObject({ stage: "review", locked: false });
			expect(current().action?.errorMessage).toContain("changed before signing");
		},
	);

	it("removes with zeroAddress and the unmodified extraAgents name", async () => {
		const target = { name: "Legacy Name", address: AGENT_ADDRESS, validUntil: null };
		testState.agents = [target];
		act(() => root.render(<Probe />));
		act(() => current().onRemove(firstAgent()));
		testState.refetch.mockResolvedValueOnce(createQueryResult([target])).mockResolvedValue(createQueryResult([]));

		await act(async () => current().onConfirmAction());

		expect(testState.approveAgent).toHaveBeenCalledExactlyOnceWith(
			{ agentAddress: API_WALLET_ZERO_ADDRESS, agentName: "Legacy Name" },
			{ signal: expect.any(AbortSignal), applicationReview: "confirmed" },
		);
		expect(current().action).toMatchObject({ stage: "done", result: "success" });
		expect(current().action?.privateKey).toBeUndefined();
	});

	it("keeps an ambiguous request read-only and verify again never signs twice", async () => {
		vi.useFakeTimers();
		prepareAuthorization();
		testState.approveAgent.mockRejectedValueOnce(new Error("network response lost"));
		testState.refetch.mockResolvedValue(createQueryResult([]));

		await act(async () => {
			const submission = current().onConfirmAction();
			await vi.runAllTimersAsync();
			await submission;
		});
		expect(current().action).toMatchObject({ stage: "done", result: "unknown" });
		expect(testState.approveAgent).toHaveBeenCalledOnce();

		await act(async () => {
			const verification = current().onVerifyAgain();
			await vi.runAllTimersAsync();
			await verification;
		});
		expect(testState.approveAgent).toHaveBeenCalledOnce();
	});

	it("classifies wallet code 4001 as a rejected authorization", async () => {
		prepareAuthorization();
		testState.refetch.mockResolvedValueOnce(createQueryResult([]));
		testState.approveAgent.mockRejectedValueOnce({ code: 4001, message: "cancelled" });

		await act(async () => current().onConfirmAction());

		expect(testState.approveAgent).toHaveBeenCalledOnce();
		expect(current().action).toMatchObject({ stage: "done", result: "rejected", locked: false });
		expect(current().action?.privateKey).toBeUndefined();
	});

	it.each(["ApiRequestError", "ValidationError"] as const)(
		"classifies a named %s as a deterministic API error",
		async (errorName) => {
			prepareAuthorization();
			testState.refetch.mockResolvedValueOnce(createQueryResult([]));
			const approvalError = new Error("deterministic failure");
			approvalError.name = errorName;
			testState.approveAgent.mockRejectedValueOnce(approvalError);

			await act(async () => current().onConfirmAction());

			expect(testState.approveAgent).toHaveBeenCalledOnce();
			expect(current().action).toMatchObject({ stage: "done", result: "apiError", locked: false });
			expect(current().action?.privateKey).toBeUndefined();
		},
	);

	it.each(["name", "address", "validUntil"] as const)(
		"keeps the generated key hidden when authorization reconciliation mismatches %s",
		async (mismatch) => {
			vi.useFakeTimers();
			prepareAuthorization();
			testState.refetch.mockResolvedValueOnce(createQueryResult([])).mockImplementation(async () => {
				const params = testState.approveAgent.mock.calls[0]?.[0] as { agentName: string };
				const validUntil = Number(params.agentName.split(" ").at(-1));
				return createQueryResult([
					{
						name: mismatch === "name" ? "other-bot" : "grid-bot",
						address: mismatch === "address" ? OTHER_OWNER : AGENT_ADDRESS,
						validUntil: mismatch === "validUntil" ? validUntil + 1 : validUntil,
					},
				]);
			});

			await act(async () => {
				const submission = current().onConfirmAction();
				await vi.runAllTimersAsync();
				await submission;
			});

			expect(testState.approveAgent).toHaveBeenCalledOnce();
			expect(current().action).toMatchObject({ stage: "done", result: "unknown", locked: false });
			expect(current().action?.privateKey).toBeUndefined();
		},
	);

	it.each([
		{
			label: "a same-name replacement",
			reconciliationAgents: [{ name: "grid-bot", address: OTHER_OWNER, validUntil: null }],
			errorText: "exact name appeared",
		},
		{
			label: "the old address still being present",
			reconciliationAgents: [{ name: "renamed-bot", address: AGENT_ADDRESS, validUntil: null }],
			errorText: undefined,
		},
	] as const)("does not report removal success when reconciliation finds $label", async (scenario) => {
		vi.useFakeTimers();
		const target = { name: "grid-bot", address: AGENT_ADDRESS, validUntil: null };
		testState.agents = [target];
		act(() => root.render(<Probe />));
		act(() => current().onRemove(firstAgent()));
		testState.refetch
			.mockResolvedValueOnce(createQueryResult([target]))
			.mockResolvedValue(createQueryResult(scenario.reconciliationAgents));

		await act(async () => {
			const submission = current().onConfirmAction();
			await vi.runAllTimersAsync();
			await submission;
		});

		expect(testState.approveAgent).toHaveBeenCalledOnce();
		expect(current().action).toMatchObject({ stage: "done", result: "unknown", locked: false });
		expect(current().action?.privateKey).toBeUndefined();
		if (scenario.errorText) expect(current().action?.errorMessage).toContain(scenario.errorText);
		else expect(current().action?.errorMessage).toBeUndefined();
	});

	it("fails closed in review when fresh preflight data rejects", async () => {
		prepareAuthorization();
		testState.refetch.mockRejectedValueOnce(new Error("offline"));

		await act(async () => current().onConfirmAction());

		expect(testState.approveAgent).not.toHaveBeenCalled();
		expect(current().action).toMatchObject({ stage: "review", locked: false });
		expect(current().action?.errorMessage).toContain("could not be verified");
	});

	it("fails closed without rendering or signing a malformed extraAgents snapshot", async () => {
		testState.agents = [{ name: "grid-bot", address: AGENT_ADDRESS, validUntil: Number.NaN }];
		act(() => root.render(<Probe />));

		expect(current().pageState).toBe("error");
		expect(current().agents).toEqual([]);
		expect(current().canGenerate).toBe(false);

		testState.agents = [];
		act(() => root.render(<Probe />));
		prepareAuthorization();
		testState.refetch.mockResolvedValueOnce(
			createQueryResult([{ name: "grid-bot", address: "not-an-address", validUntil: null }]),
		);

		await act(async () => current().onConfirmAction());

		expect(testState.approveAgent).not.toHaveBeenCalled();
		expect(current().action).toMatchObject({ stage: "review", locked: false });
	});

	it("reconciles a current transport AbortError instead of leaving the action locked", async () => {
		prepareAuthorization();
		testState.approveAgent.mockRejectedValueOnce(new DOMException("transport aborted", "AbortError"));
		testState.refetch.mockResolvedValueOnce(createQueryResult([])).mockImplementation(async () => {
			const params = testState.approveAgent.mock.calls[0]?.[0] as { agentName: string };
			const validUntil = Number(params.agentName.split(" ").at(-1));
			return createQueryResult([{ name: "grid-bot", address: AGENT_ADDRESS, validUntil }]);
		});

		await act(async () => current().onConfirmAction());

		expect(testState.approveAgent).toHaveBeenCalledOnce();
		expect(current().action).toMatchObject({ stage: "done", result: "success", locked: false });
	});

	it("requires download and acknowledgement before finishing a successful authorization", async () => {
		prepareAuthorization();
		testState.refetch.mockResolvedValueOnce(createQueryResult([])).mockImplementation(async () => {
			const params = testState.approveAgent.mock.calls[0]?.[0] as { agentName: string };
			const validUntil = Number(params.agentName.split(" ").at(-1));
			return createQueryResult([{ name: "grid-bot", address: AGENT_ADDRESS, validUntil }]);
		});
		await act(async () => current().onConfirmAction());
		const refetchCountAfterSuccess = testState.refetch.mock.calls.length;

		act(() => current().onCredentialSavedChange(true));
		expect(current().action?.credentialSaved).toBe(false);
		act(() => current().onFinishAction());
		expect(current().action).not.toBeNull();

		act(() => current().onDownloadCredential());
		expect(testState.downloadCredential).toHaveBeenCalledExactlyOnceWith({
			accountAddress: OWNER,
			agentAddress: AGENT_ADDRESS,
			agentName: "grid-bot",
			privateKey: PRIVATE_KEY,
		});
		expect(current().action).toMatchObject({ credentialDownloaded: true, credentialSaved: false });

		act(() => current().onCredentialSavedChange(true));
		expect(current().action).toMatchObject({ credentialDownloaded: true, credentialSaved: true });
		act(() => current().onFinishAction());
		expect(current().action).toBeNull();
		expect(current().generatedAddress).toBeUndefined();
		expect(current().name).toBe("");
		expect(testState.refetch).toHaveBeenCalledTimes(refetchCountAfterSuccess + 1);
	});

	it("immediately hides the old credential and ignores a late result after identity changes", async () => {
		prepareAuthorization();
		testState.refetch.mockResolvedValueOnce(createQueryResult([]));
		let resolveApproval!: () => void;
		testState.approveAgent.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				resolveApproval = resolve;
			}),
		);
		let submission!: Promise<void>;
		await act(async () => {
			submission = current().onConfirmAction();
			await vi.waitFor(() => expect(testState.approveAgent).toHaveBeenCalledOnce());
		});

		testState.wallet = { ...testState.wallet, address: OTHER_OWNER, walletAddress: OTHER_OWNER };
		act(() => root.render(<Probe />));
		expect(current().generatedAddress).toBeUndefined();
		expect(current().action).toBeNull();

		await act(async () => {
			resolveApproval();
			await submission;
		});
		expect(current().action).toBeNull();
	});

	it.each([
		{ label: "missing", activeOwner: null },
		{ label: "bound to another environment", activeOwner: { env: "Testnet", address: OTHER_OWNER } },
	] as const)("never queries extraAgents with an agent address when its owner is $label", ({ activeOwner }) => {
		testState.wallet = {
			address: AGENT_ADDRESS,
			hasWalletAccess: false,
			isConnected: true,
			sessionMode: "agent-only",
			walletAddress: undefined,
		};
		testState.activeOwner = activeOwner;
		act(() => root.render(<Probe />));

		expect(testState.infoUser).toBe("");
		expect(testState.infoEnabled).toBe(false);
		expect(current().pageState).toBe("nonMaster");
		expect(current().canAuthorize).toBe(false);
	});
});
