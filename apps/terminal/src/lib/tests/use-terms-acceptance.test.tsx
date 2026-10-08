// @vitest-environment jsdom

import type { AbstractWallet } from "@nktkas/hyperliquid/signing";
import { infoKey } from "@sairn/hl-react/hooks/useInfo";
import type { TermsAcceptanceWalletResolver } from "@sairn/hl-react/signing/use-terms-acceptance";
import { useTermsAcceptance } from "@sairn/hl-react/signing/use-terms-acceptance";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OTHER_OWNER = "0x2222222222222222222222222222222222222222" as const;
const RAW_SIGNATURE = `0x${"11".repeat(64)}1b` as const;
type UseTermsAcceptance = typeof useTermsAcceptance;

const testState = vi.hoisted(() => ({
	clientKey: "0x1111111111111111111111111111111111111111" as string,
	env: "Mainnet" as "Mainnet" | "Testnet",
	legalCheck: vi.fn(),
	request: vi.fn(),
	walletAddress: "0x1111111111111111111111111111111111111111" as `0x${string}`,
	walletSignTypedData: vi.fn(),
}));

vi.mock("@sairn/hl-react/provider", () => ({
	useHyperliquid: () => ({
		clientKey: testState.clientKey,
		env: testState.env,
		info: { legalCheck: testState.legalCheck },
	}),
}));

vi.mock("@sairn/hl-react/hooks/useTransport", () => ({
	useHttpTransport: () => ({ isTestnet: testState.env === "Testnet", request: testState.request }),
}));

vi.mock("wagmi", () => ({
	useConnection: () => ({ chainId: 42161 }),
	useWalletClient: () => ({
		data: {
			account: { address: testState.walletAddress },
			getAddresses: async () => [testState.walletAddress],
			getChainId: async () => 42161,
			signTypedData: testState.walletSignTypedData,
		},
	}),
}));

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve = (_value: T) => {};
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});
	return { promise, resolve };
}

describe("useTermsAcceptance wallet resolution", () => {
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;
	let acceptance: ReturnType<UseTermsAcceptance> | undefined;
	let Probe: (props: { resolveWallet?: TermsAcceptanceWalletResolver }) => null;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
		acceptance = undefined;
		Probe = ({ resolveWallet }) => {
			acceptance = useTermsAcceptance({ resolveWallet });
			return null;
		};
		testState.clientKey = OWNER;
		testState.env = "Mainnet";
		testState.walletAddress = OWNER;
		testState.legalCheck.mockReset();
		testState.legalCheck.mockResolvedValue({ acceptedTerms: true, userAllowed: true, restrictions: "n" });
		testState.request.mockReset();
		testState.request.mockResolvedValue(null);
		testState.walletSignTypedData.mockReset();
		testState.walletSignTypedData.mockResolvedValue(RAW_SIGNATURE);
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
	});

	function renderHook(resolveWallet?: TermsAcceptanceWalletResolver) {
		act(() => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe, { resolveWallet })));
		});
		if (!acceptance) throw new Error("Terms acceptance hook did not render");
		return acceptance;
	}

	it("uses a resolved wallet instead of the default Wagmi client", async () => {
		const resolverSignTypedData = vi.fn(async (_typedData: unknown) => RAW_SIGNATURE);
		const resolvedWallet = {
			getAddresses: async () => [OWNER],
			getChainId: async () => 42161,
			signTypedData: resolverSignTypedData,
		} satisfies AbstractWallet;
		const resolveWallet = vi.fn().mockResolvedValue(resolvedWallet);
		const hook = renderHook(resolveWallet);

		await act(async () => {
			await hook.mutateAsync();
		});

		expect(resolveWallet).toHaveBeenCalledWith({ address: OWNER, env: "Mainnet" });
		expect(resolverSignTypedData).toHaveBeenCalledOnce();
		expect(testState.walletSignTypedData).not.toHaveBeenCalled();
		expect(testState.legalCheck).toHaveBeenCalledTimes(2);
		expect(testState.legalCheck).toHaveBeenCalledWith({ user: OWNER }, expect.any(AbortSignal));
		expect(queryClient.getQueryData(infoKey("legalCheck", { user: OWNER }, "Mainnet"))).toEqual({
			acceptedTerms: true,
			userAllowed: true,
			restrictions: "n",
		});
	});

	it("fails closed when the fresh post-sign legal status becomes restricted", async () => {
		testState.legalCheck.mockResolvedValueOnce({
			acceptedTerms: false,
			userAllowed: false,
			restrictions: "n",
		});
		const hook = renderHook();

		await act(async () => {
			await expect(hook.mutateAsync()).rejects.toThrow(
				"This account is not permitted to perform this Hyperliquid action",
			);
		});

		expect(testState.walletSignTypedData).toHaveBeenCalledOnce();
		expect(testState.request).not.toHaveBeenCalled();
	});

	it.each([null, undefined])("falls back to the exact Wagmi wallet when the resolver returns %s", async (result) => {
		const resolveWallet = vi.fn().mockResolvedValue(result);
		const hook = renderHook(resolveWallet);

		await act(async () => {
			await hook.mutateAsync();
		});

		expect(resolveWallet).toHaveBeenCalledOnce();
		expect(testState.walletSignTypedData).toHaveBeenCalledOnce();
	});

	it("fails closed when a custom wallet resolver rejects", async () => {
		const resolveWallet = vi.fn().mockRejectedValue(new Error("Embedded wallet mismatch"));
		const hook = renderHook(resolveWallet);

		await act(async () => {
			await expect(hook.mutateAsync()).rejects.toThrow("Embedded wallet mismatch");
		});

		expect(testState.walletSignTypedData).not.toHaveBeenCalled();
		expect(testState.request).not.toHaveBeenCalled();
	});

	it("does not submit a signed acceptance after the active owner changes", async () => {
		const signature = createDeferred<typeof RAW_SIGNATURE>();
		const signTypedData = vi.fn(async (_typedData: unknown) => signature.promise);
		const resolveWallet = vi.fn().mockResolvedValue({
			getAddresses: async () => [OWNER],
			getChainId: async () => 42161,
			signTypedData,
		} satisfies AbstractWallet);
		const hook = renderHook(resolveWallet);
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync();
			await vi.waitFor(() => expect(signTypedData).toHaveBeenCalledOnce());
		});
		if (!request) throw new Error("Terms acceptance request did not start");

		testState.clientKey = OTHER_OWNER;
		renderHook(resolveWallet);
		signature.resolve(RAW_SIGNATURE);

		await act(async () => {
			await expect(request).rejects.toThrow("Wallet changed while accepting terms");
		});
		expect(testState.request).not.toHaveBeenCalled();
		expect(testState.legalCheck).not.toHaveBeenCalled();
	});

	it("does not submit after the identity changes during the fresh pre-submit legal check", async () => {
		const preSubmitCheck = createDeferred<{ acceptedTerms: boolean; userAllowed: boolean; restrictions: string }>();
		testState.legalCheck.mockReturnValueOnce(preSubmitCheck.promise);
		const hook = renderHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync();
			await vi.waitFor(() => expect(testState.legalCheck).toHaveBeenCalledOnce());
		});
		if (!request) throw new Error("Terms acceptance request did not start");

		testState.clientKey = OTHER_OWNER;
		renderHook();
		preSubmitCheck.resolve({ acceptedTerms: false, userAllowed: true, restrictions: "n" });

		await act(async () => {
			await expect(request).rejects.toThrow("Wallet changed while accepting terms");
		});
		expect(testState.request).not.toHaveBeenCalled();
		expect(queryClient.getQueryData(infoKey("legalCheck", { user: OWNER }, "Mainnet"))).toBeUndefined();
	});

	it("does not cache a server confirmation after the active identity changes", async () => {
		const confirmation = createDeferred<{ acceptedTerms: boolean; userAllowed: boolean; restrictions: string }>();
		testState.legalCheck
			.mockResolvedValueOnce({ acceptedTerms: false, userAllowed: true, restrictions: "n" })
			.mockReturnValueOnce(confirmation.promise);
		const hook = renderHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync();
			await vi.waitFor(() => expect(testState.legalCheck).toHaveBeenCalledTimes(2));
		});
		if (!request) throw new Error("Terms acceptance request did not start");
		expect(testState.request).toHaveBeenCalledOnce();

		testState.clientKey = OTHER_OWNER;
		renderHook();
		confirmation.resolve({ acceptedTerms: true, userAllowed: true, restrictions: "n" });

		await act(async () => {
			await expect(request).rejects.toThrow("Wallet changed while accepting terms");
		});
		expect(queryClient.getQueryData(infoKey("legalCheck", { user: OWNER }, "Mainnet"))).toBeUndefined();
	});
});
