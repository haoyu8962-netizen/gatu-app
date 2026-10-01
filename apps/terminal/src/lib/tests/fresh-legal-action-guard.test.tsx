// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFreshLegalActionGuard } from "@/hooks/trade/use-fresh-legal-action-guard";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OTHER_OWNER = "0x2222222222222222222222222222222222222222" as const;

const testState = vi.hoisted(() => ({
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	info: { legalCheck: vi.fn() },
	sessionMode: "wallet" as "agent-only" | "disconnected" | "wallet",
	verifyLegalActionAllowed: vi.fn(),
}));

vi.mock("@sairn/hl-react", async (importOriginal) => {
	const original = await importOriginal<typeof import("@sairn/hl-react")>();
	return {
		...original,
		useHyperliquid: () => ({
			clientKey: testState.clientKey,
			env: testState.env,
			info: testState.info,
			sessionMode: testState.sessionMode,
		}),
		verifyLegalActionAllowed: (options: unknown) => testState.verifyLegalActionAllowed(options),
	};
});

describe("fresh funds-write legal action guard", () => {
	let capturedGuard: ReturnType<typeof useFreshLegalActionGuard> | null;
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;

	function Probe() {
		capturedGuard = useFreshLegalActionGuard();
		return null;
	}

	function renderProbe() {
		act(() => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
		});
		if (!capturedGuard) throw new Error("Legal guard was not captured");
		return capturedGuard;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		testState.clientKey = OWNER;
		testState.env = "Mainnet";
		testState.sessionMode = "wallet";
		testState.verifyLegalActionAllowed.mockResolvedValue({ canPerformActions: true });
		capturedGuard = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
	});

	it("forces a fresh request for the exact selected Hyperliquid owner", async () => {
		const guard = renderProbe();

		await expect(guard.verify({ env: "Mainnet" })).resolves.toBeUndefined();

		expect(testState.verifyLegalActionAllowed).toHaveBeenCalledWith({
			queryClient,
			info: testState.info,
			env: "Mainnet",
			owner: OWNER,
			forceFresh: true,
		});
	});

	it("rejects a successful response if the selected owner changes while it is in flight", async () => {
		let resolveRequest: (() => void) | undefined;
		testState.verifyLegalActionAllowed.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveRequest = resolve;
				}),
		);
		const guard = renderProbe();
		const pending = guard.verify({ env: "Mainnet" });
		await vi.waitFor(() => expect(testState.verifyLegalActionAllowed).toHaveBeenCalledOnce());

		testState.clientKey = OTHER_OWNER;
		renderProbe();
		resolveRequest?.();

		await expect(pending).rejects.toMatchObject({ reason: "status_unavailable", statusReason: "unknown" });
	});

	it("fails before requesting when the expected environment does not match", async () => {
		const guard = renderProbe();

		await expect(guard.verify({ env: "Testnet" })).rejects.toMatchObject({ reason: "status_unavailable" });
		expect(testState.verifyLegalActionAllowed).not.toHaveBeenCalled();
	});
});
